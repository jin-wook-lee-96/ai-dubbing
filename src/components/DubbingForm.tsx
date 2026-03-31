"use client";

import { useState, useRef } from "react";
import { upload } from "@vercel/blob/client";

const LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

type Status = "idle" | "cropping" | "uploading" | "transcribing" | "translating" | "synthesizing" | "done" | "error";

const STATUS_MESSAGES: Record<Status, string> = {
  idle: "",
  cropping: "1분으로 자동 크롭 중...",
  uploading: "파일 업로드 중...",
  transcribing: "음성을 텍스트로 변환 중...",
  translating: "번역 중...",
  synthesizing: "음성 합성 중...",
  done: "더빙 완료!",
  error: "오류가 발생했습니다",
};

const STEPS: Status[] = ["uploading", "transcribing", "translating", "synthesizing", "done"];

const MAX_DURATION_SEC = 60;

function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frames = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample

  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels and convert float32 → int16
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

async function cropToOneMinute(file: File): Promise<{ file: File; wasCropped: boolean }> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();

  try {
    const arrayBuffer = await file.arrayBuffer();
    let decoded: AudioBuffer;

    try {
      decoded = await ctx.decodeAudioData(arrayBuffer);
    } catch {
      await ctx.close();
      return { file, wasCropped: false };
    }

    if (decoded.duration <= MAX_DURATION_SEC) {
      await ctx.close();
      return { file, wasCropped: false };
    }

    const sr = decoded.sampleRate;
    const channels = decoded.numberOfChannels;
    const frames = Math.floor(MAX_DURATION_SEC * sr);
    const cropped = ctx.createBuffer(channels, frames, sr);

    for (let c = 0; c < channels; c++) {
      cropped.getChannelData(c).set(decoded.getChannelData(c).subarray(0, frames));
    }

    await ctx.close();

    const wavBuffer = encodeWav(cropped);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const croppedFile = new File([wavBuffer], `${baseName}_cropped.wav`, { type: "audio/wav" });

    return { file: croppedFile, wasCropped: true };
  } catch (err) {
    try { await ctx.close(); } catch { /* ignore */ }
    throw err;
  }
}

export default function DubbingForm() {
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [targetLang, setTargetLang] = useState("en");
  const [status, setStatus] = useState<Status>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [error, setError] = useState("");
  const [wasCropped, setWasCropped] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleFileChange = (newFile: File | null) => {
    setFile(newFile);
    setFileDuration(null);
    setWasCropped(false);
    if (!newFile) return;

    const url = URL.createObjectURL(newFile);
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      setFileDuration(audio.duration);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => URL.revokeObjectURL(url);
    audio.src = url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setAudioUrl(null);
    setError("");
    setTranscript("");
    setTranslation("");
    setWasCropped(false);

    let fileToUpload = file;

    try {
      // Step 0: 필요 시 1분 크롭 (클라이언트)
      if (fileDuration === null || fileDuration > MAX_DURATION_SEC) {
        setStatus("cropping");
        const result = await cropToOneMinute(file);
        fileToUpload = result.file;
        if (result.wasCropped) setWasCropped(true);
      }

      // Step 1: Vercel Blob에 직접 업로드 (4.5MB 제한 우회)
      setStatus("uploading");
      const blob = await upload(fileToUpload.name, fileToUpload, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });

      setStatus("transcribing");
      const res = await fetch("/api/dubbing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url, targetLang }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "더빙에 실패했습니다");
      }

      setStatus("done");
      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      const transcriptHeader = res.headers.get("X-Transcript");
      const translationHeader = res.headers.get("X-Translation");
      if (transcriptHeader) setTranscript(decodeURIComponent(transcriptHeader));
      if (translationHeader) setTranslation(decodeURIComponent(translationHeader));
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  };

  const isProcessing = status !== "idle" && status !== "done" && status !== "error";
  const currentStepIndex = STEPS.indexOf(status);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m > 0 ? `${m}분 ${s}초` : `${s}초`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* 파일 업로드 드롭존 */}
      <div className="group relative">
        <input
          type="file"
          accept="audio/*,video/*"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          className="hidden"
          id="file-input"
        />
        <label htmlFor="file-input" className="cursor-pointer block">
          <div className={`
            relative border-2 border-dashed rounded-2xl p-10 text-center
            transition-all duration-300
            ${file
              ? "border-blue-400/50 bg-blue-500/5"
              : "border-white/15 hover:border-white/30 bg-white/3 hover:bg-white/5"
            }
          `}>
            {/* 아이콘 */}
            <div className={`
              w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-2xl
              transition-all duration-300
              ${file
                ? "bg-gradient-to-br from-blue-500/30 to-violet-500/30 shadow-lg shadow-blue-500/10"
                : "bg-white/5 group-hover:bg-white/10"
              }
            `}>
              {file ? "🎵" : "☁️"}
            </div>

            {file ? (
              <div>
                <p className="font-semibold text-blue-300 text-sm mb-1 truncate max-w-xs mx-auto">
                  {file.name}
                </p>
                <p className="text-white/30 text-xs">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                  {fileDuration !== null && ` · ${formatDuration(fileDuration)}`}
                </p>
                {fileDuration !== null && fileDuration > MAX_DURATION_SEC && (
                  <span className="inline-block mt-2 text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
                    앞 1분 자동 크롭
                  </span>
                )}
                <span className="inline-block mt-3 text-xs text-white/40 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                  클릭하여 변경
                </span>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-white/70 text-sm mb-1">
                  파일을 클릭하여 업로드
                </p>
                <p className="text-white/30 text-xs">
                  오디오 또는 비디오 파일 지원
                </p>
                <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                  <span className="text-xs text-amber-400/70 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
                    50MB 이하 권장
                  </span>
                  <span className="text-xs text-blue-400/70 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1">
                    1분 초과 시 자동 크롭
                  </span>
                </div>
              </div>
            )}
          </div>
        </label>
      </div>

      {/* 언어 선택 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-white/40 uppercase tracking-wider">
          타겟 언어
        </label>
        <div className="relative">
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="w-full appearance-none bg-white/5 border border-white/10 hover:border-white/20 focus:border-blue-400/50 focus:bg-white/8 rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all duration-200 cursor-pointer backdrop-blur-sm"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} className="bg-gray-900 text-white">
                {lang.label}
              </option>
            ))}
          </select>
          {/* 커스텀 화살표 */}
          <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
            <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={!file || isProcessing}
        className={`
          relative w-full font-semibold py-3.5 rounded-xl text-sm
          transition-all duration-300 overflow-hidden
          ${!file || isProcessing
            ? "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"
            : "bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-400 hover:to-violet-400 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.01] active:scale-[0.99]"
          }
        `}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {STATUS_MESSAGES[status]}
          </span>
        ) : (
          "더빙 시작"
        )}
      </button>

      {/* 진행 상태 카드 (서버 파이프라인) */}
      {status !== "idle" && status !== "cropping" && status !== "error" && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
          {/* 스텝 인디케이터 */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((step, idx) => {
              const isCompleted = currentStepIndex > idx || status === "done";
              const isActive = currentStepIndex === idx && status !== "done";
              return (
                <div key={step} className="flex items-center gap-1.5 flex-1">
                  <div className={`
                    h-1.5 flex-1 rounded-full transition-all duration-500
                    ${isCompleted ? "bg-gradient-to-r from-blue-400 to-violet-400"
                      : isActive ? "bg-blue-400/50 animate-pulse"
                      : "bg-white/10"
                    }
                  `} />
                </div>
              );
            })}
          </div>

          {/* 상태 텍스트 */}
          <div className="flex items-center gap-2.5">
            {status !== "done" ? (
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <span className={`text-sm font-medium ${status === "done" ? "text-blue-300" : "text-white/60"}`}>
              {STATUS_MESSAGES[status]}
            </span>
          </div>

          {/* 크롭 알림 */}
          {wasCropped && (
            <div className="flex items-center gap-2 text-xs text-amber-400/70">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              앞 1분이 자동 크롭되어 처리되었습니다
            </div>
          )}

          {/* 원본 텍스트 */}
          {transcript && (
            <div className="space-y-1.5">
              <p className="text-xs text-white/30 font-medium uppercase tracking-wider">원본 텍스트</p>
              <p className="text-xs text-white/60 bg-white/5 border border-white/8 rounded-xl p-3 leading-relaxed">
                {transcript}
              </p>
            </div>
          )}

          {/* 번역된 텍스트 */}
          {translation && (
            <div className="space-y-1.5">
              <p className="text-xs text-white/30 font-medium uppercase tracking-wider">번역된 텍스트</p>
              <p className="text-xs text-white/60 bg-white/5 border border-white/8 rounded-xl p-3 leading-relaxed">
                {translation}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 에러 */}
      {status === "error" && (
        <div className="flex items-start gap-3 bg-red-500/8 border border-red-400/20 rounded-xl p-4">
          <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-sm text-red-300/80">{error}</p>
        </div>
      )}

      {/* 결과 오디오 플레이어 */}
      {audioUrl && (
        <div className="relative">
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-blue-500/15 to-violet-500/15" />
          <div className="relative bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-violet-400 animate-pulse" />
              <h3 className="text-sm font-semibold text-white/80">더빙 결과</h3>
            </div>

            <audio
              ref={audioRef}
              controls
              src={audioUrl}
              className="w-full h-10 [&::-webkit-media-controls-panel]:bg-white/5 rounded-lg"
            />

            <a
              href={audioUrl}
              download={`dubbed_${targetLang}.mp3`}
              className="flex items-center justify-center gap-2 w-full bg-white/8 hover:bg-white/12 border border-white/10 hover:border-white/20 font-medium text-sm py-3 rounded-xl transition-all duration-200 text-white/70 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              다운로드
            </a>
          </div>
        </div>
      )}
    </form>
  );
}
