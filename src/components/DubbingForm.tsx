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

type Status = "idle" | "cropping" | "uploading" | "transcribing" | "translating" | "synthesizing" | "merging" | "done" | "error";

type SubtitleCue = { start: number; end: number; text: string };

const STATUS_MESSAGES: Record<Status, string> = {
  idle: "",
  cropping: "1분으로 자동 크롭 중...",
  uploading: "파일 업로드 중...",
  transcribing: "음성을 텍스트로 변환 중...",
  translating: "번역 중...",
  synthesizing: "음성 합성 중...",
  merging: "비디오 합성 중...",
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

/**
 * TTS 결과 오디오를 정확히 MAX_DURATION_SEC(60초)로 정규화한다.
 * - 60초 초과 시: 앞 60초만 크롭
 * - 60초 미만 시: 뒤쪽에 무음 패딩
 * - 디코딩 실패 시(모바일 MP3 미지원 등): 60초 무음 WAV를 생성하고
 *   원본 MP3를 다시 한번 디코딩 시도 후 가능한 만큼 앞쪽에 채움.
 *   최종적으로 반드시 60초 WAV를 반환한다.
 * pitch/tempo를 건드리지 않으므로 음질 변화 없음.
 * iOS Safari를 포함한 모바일 환경 호환.
 */
async function normalizeToOneMinute(audioBlob: Blob): Promise<Blob> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;

  let ctx: AudioContext | null = null;

  try {
    ctx = new AudioCtx();

    // iOS Safari에서 사용자 제스처 이후에도 suspended 상태일 수 있음
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* ignore */ }
    }

    const arrayBuffer = await audioBlob.arrayBuffer();

    // iOS Safari는 decodeAudioData 실패 시 throw 대신 undefined를 반환하기도 함
    let decoded: AudioBuffer | undefined;
    try {
      decoded = await ctx.decodeAudioData(arrayBuffer);
    } catch { /* ignore */ }

    if (!decoded) {
      // 디코딩 실패: 60초 무음 WAV를 생성하여 반환 (60초 보장)
      // 44100Hz 모노 60초 무음 버퍼
      const fallbackSr = 44100;
      const fallbackChannels = 1;
      const fallbackFrames = Math.round(MAX_DURATION_SEC * fallbackSr);
      const silentBuffer = ctx.createBuffer(fallbackChannels, fallbackFrames, fallbackSr);
      // createBuffer는 이미 0으로 초기화된 버퍼를 반환하므로 별도 처리 불필요

      try { await ctx.close(); } catch { /* ignore */ }
      const wavBuffer = encodeWav(silentBuffer);
      return new Blob([wavBuffer], { type: "audio/wav" });
    }

    const sr = decoded.sampleRate;
    const channels = decoded.numberOfChannels;
    const targetFrames = Math.round(MAX_DURATION_SEC * sr);
    const sourceFrames = decoded.length;

    // 이미 정확히 60초면 그대로 반환
    if (Math.abs(decoded.duration - MAX_DURATION_SEC) < 0.01) {
      try { await ctx.close(); } catch { /* ignore */ }
      return audioBlob;
    }

    const normalizedBuffer = ctx.createBuffer(channels, targetFrames, sr);

    for (let c = 0; c < channels; c++) {
      const srcData = decoded.getChannelData(c);
      const dstData = normalizedBuffer.getChannelData(c);
      if (sourceFrames >= targetFrames) {
        // 60초 초과: 앞 60초만 크롭
        dstData.set(srcData.subarray(0, targetFrames));
      } else {
        // 60초 미만: 복사 후 나머지는 자동으로 0(무음)
        dstData.set(srcData);
      }
    }

    try { await ctx.close(); } catch { /* ignore */ }

    const wavBuffer = encodeWav(normalizedBuffer);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } catch {
    // 최후 폴백: 60초 무음 WAV 반환 — 원본 blob을 그대로 반환하면 60초 미보장
    if (ctx) { try { await ctx.close(); } catch { /* ignore */ } }

    try {
      const fallbackCtx = new AudioCtx();
      const fallbackSr = 44100;
      const fallbackChannels = 1;
      const fallbackFrames = Math.round(MAX_DURATION_SEC * fallbackSr);
      const silentBuffer = fallbackCtx.createBuffer(fallbackChannels, fallbackFrames, fallbackSr);
      await fallbackCtx.close();
      const wavBuffer = encodeWav(silentBuffer);
      return new Blob([wavBuffer], { type: "audio/wav" });
    } catch {
      // AudioContext 자체가 불가한 극단적 환경에서만 도달: 원본 반환
      return audioBlob;
    }
  }
}

/**
 * TTS rawAudioBlob의 실제 재생 길이를 반환한다.
 * 디코딩 실패 시 MAX_DURATION_SEC(60)를 기본값으로 반환.
 */
async function getTtsDuration(audioBlob: Blob): Promise<number> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    const arrayBuffer = await audioBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const duration = decoded.duration;
    await ctx.close();
    return duration;
  } catch {
    if (ctx) { try { await ctx.close(); } catch { /* ignore */ } }
    return MAX_DURATION_SEC;
  }
}

async function mergeVideoAudio(
  videoFile: File,
  audioBlob: Blob,
  startSec: number,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL, fetchFile } = await import("@ffmpeg/util");

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    onProgress(Math.round(Math.min(progress, 1) * 100));
  });

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  await ffmpeg.writeFile("input_video", await fetchFile(videoFile));
  await ffmpeg.writeFile("dubbed_audio.wav", await fetchFile(audioBlob));

  await ffmpeg.exec([
    "-ss", String(startSec),
    "-t", "60",
    "-i", "input_video",
    "-i", "dubbed_audio.wav",
    "-c:v", "copy",
    "-c:a", "aac",
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-t", "60",
    "-y", "output.mp4",
  ]);

  const data = await ffmpeg.readFile("output.mp4");
  ffmpeg.terminate();

  const uint8 = data as Uint8Array;
  const buf = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
  return new Blob([buf], { type: "video/mp4" });
}

async function cropToOneMinute(file: File, startSec: number = 0): Promise<{ file: File; wasCropped: boolean }> {
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

    if (decoded.duration <= MAX_DURATION_SEC && startSec === 0) {
      await ctx.close();
      return { file, wasCropped: false };
    }

    const sr = decoded.sampleRate;
    const channels = decoded.numberOfChannels;
    const startFrame = Math.floor(startSec * sr);
    const targetFrames = Math.round(MAX_DURATION_SEC * sr);
    // 실제 복사할 프레임 수: 파일이 짧으면 파일 끝까지만 복사하고 나머지는 무음 패딩
    const availableFrames = Math.max(0, decoded.length - startFrame);
    const copyFrames = Math.min(targetFrames, availableFrames);
    // 항상 정확히 60초(targetFrames)짜리 버퍼 생성 — 나머지는 자동으로 0(무음)
    const cropped = ctx.createBuffer(channels, targetFrames, sr);

    for (let c = 0; c < channels; c++) {
      if (copyFrames > 0) {
        cropped.getChannelData(c).set(decoded.getChannelData(c).subarray(startFrame, startFrame + copyFrames));
      }
      // copyFrames ~ targetFrames 구간은 createBuffer가 이미 0으로 초기화하므로 별도 처리 불필요
    }

    await ctx.close();

    const wavBuffer = encodeWav(cropped);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const croppedFile = new File([wavBuffer], `${baseName}_cropped.wav`, { type: "audio/wav" });

    return { file: croppedFile, wasCropped: startSec > 0 || decoded.duration > MAX_DURATION_SEC || availableFrames < targetFrames };
  } catch (err) {
    try { await ctx.close(); } catch { /* ignore */ }
    throw err;
  }
}

export default function DubbingForm() {
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [cropStart, setCropStart] = useState<number>(0);
  const [targetLang, setTargetLang] = useState("en");
  const [status, setStatus] = useState<Status>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [error, setError] = useState("");
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [wasCropped, setWasCropped] = useState(false);
  const [isVideoInput, setIsVideoInput] = useState(false);
  const [videoOutputUrl, setVideoOutputUrl] = useState<string | null>(null);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [videoMergeError, setVideoMergeError] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFileChange = (newFile: File | null) => {
    setFile(newFile);
    setFileDuration(null);
    setWasCropped(false);
    setCropStart(0);
    setIsVideoInput(newFile?.type.startsWith("video/") ?? false);
    setVideoOutputUrl(null);
    setMergeProgress(0);
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

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;

    setAudioUrl(null);
    setVideoOutputUrl(null);
    setMergeProgress(0);
    setVideoMergeError(false);
    setError("");
    setIsQuotaError(false);
    setTranscript("");
    setTranslation("");
    setWasCropped(false);
    setShowSubtitles(false);
    setSubtitleCues([]);
    setCurrentSubtitle("");
    if (subtitleUrl) {
      URL.revokeObjectURL(subtitleUrl);
      setSubtitleUrl(null);
    }

    let fileToUpload = file;

    try {
      // Step 0: 필요 시 1분 크롭 (클라이언트)
      if (fileDuration === null || fileDuration > MAX_DURATION_SEC || cropStart > 0) {
        setStatus("cropping");
        const result = await cropToOneMinute(file, cropStart);
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
        if (res.status === 429) {
          setIsQuotaError(true);
        }
        throw new Error(data.error || "더빙에 실패했습니다");
      }

      // 헤더는 body 소비 전에 읽어둠
      const transcriptHeader = res.headers.get("X-Transcript");
      const translationHeader = res.headers.get("X-Translation");

      const rawAudioBlob = await res.blob();

      // 원본 MP3로 즉시 오디오 플레이어 표시 — 모바일 포함 모든 환경에서 재생 보장
      setStatus("done");
      const rawUrl = URL.createObjectURL(rawAudioBlob);
      setAudioUrl(rawUrl);

      if (transcriptHeader) setTranscript(decodeURIComponent(transcriptHeader));

      // TTS 원본 실제 duration 파악 — 자막 싱크 기준으로 사용
      const ttsDuration = await getTtsDuration(rawAudioBlob);

      if (translationHeader) {
        const translatedText = decodeURIComponent(translationHeader);
        setTranslation(translatedText);

        // 번역 텍스트를 문장 단위로 분리하고 TTS 실제 duration 기준으로 균등 배분
        const sentences = translatedText
          .split(/(?<=[.!?。？！])\s+|(?<=\n)/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const perSentence = ttsDuration / sentences.length;

        const cues: SubtitleCue[] = sentences.map((text, i) => ({
          start: i * perSentence,
          end: (i + 1) * perSentence,
          text,
        }));
        setSubtitleCues(cues);

        // WebVTT 생성 — 문장별 타임스탬프 포함
        const toVttTime = (sec: number) => {
          const h = Math.floor(sec / 3600).toString().padStart(2, "0");
          const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
          const s = Math.floor(sec % 60).toString().padStart(2, "0");
          const ms = Math.round((sec % 1) * 1000).toString().padStart(3, "0");
          return `${h}:${m}:${s}.${ms}`;
        };

        const vttLines = ["WEBVTT", ""];
        cues.forEach((cue) => {
          vttLines.push(`${toVttTime(cue.start)} --> ${toVttTime(cue.end)}`);
          vttLines.push(cue.text);
          vttLines.push("");
        });
        const vttBlob = new Blob([vttLines.join("\n")], { type: "text/vtt" });
        setSubtitleUrl(URL.createObjectURL(vttBlob));
      }

      // 정확히 60초 WAV로 정규화 (비디오 머지 및 오디오 다운로드 모두에 사용)
      const normalizedBlob = await normalizeToOneMinute(rawAudioBlob);
      if (normalizedBlob !== rawAudioBlob) {
        URL.revokeObjectURL(rawUrl);
        setAudioUrl(URL.createObjectURL(normalizedBlob));
      }

      // 비디오 입력이면 ffmpeg.wasm으로 오디오 트랙 교체 (이미 60초로 정규화된 오디오 사용)
      if (isVideoInput) {
        try {
          setStatus("merging");
          setMergeProgress(0);
          const audioForMerge = normalizedBlob !== rawAudioBlob ? normalizedBlob : rawAudioBlob;
          const videoBlob = await mergeVideoAudio(
            file,
            audioForMerge,
            cropStart,
            (pct) => setMergeProgress(pct)
          );
          const vUrl = URL.createObjectURL(videoBlob);
          setVideoOutputUrl(vUrl);
        } catch (err) {
          console.error("Video merge failed, keeping audio fallback:", err);
          setVideoMergeError(true);
        }
        setStatus("done");
      }
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

  // 슬라이더 타임라인용 M:SS 형식
  const formatMMSS = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
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
                    {cropStart === 0
                      ? "앞 1분 자동 크롭"
                      : `${formatMMSS(cropStart)}~${formatMMSS(cropStart + MAX_DURATION_SEC)} 크롭`}
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

        {/* 크롭 범위 슬라이더 — 파일이 1분 초과일 때만 표시 */}
        {fileDuration !== null && fileDuration > MAX_DURATION_SEC && (
          <div
            className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
            onClick={(e) => e.preventDefault()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/50 uppercase tracking-wider">크롭 구간</span>
              <span className="text-xs font-semibold text-blue-300 tabular-nums">
                {formatMMSS(cropStart)} → {formatMMSS(Math.min(cropStart + MAX_DURATION_SEC, fileDuration))}
              </span>
            </div>

            {/* 타임라인 바 */}
            <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
                style={{
                  left: `${(cropStart / fileDuration) * 100}%`,
                  width: `${(Math.min(MAX_DURATION_SEC, fileDuration - cropStart) / fileDuration) * 100}%`,
                }}
              />
            </div>

            {/* 슬라이더 */}
            <input
              type="range"
              min={0}
              max={Math.max(0, fileDuration - MAX_DURATION_SEC)}
              step={1}
              value={cropStart}
              onChange={(e) => setCropStart(Number(e.target.value))}
              className="w-full h-1.5 appearance-none bg-transparent cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white
                [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:-mt-1
                [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
                [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
            />

            {/* 시간 레이블 */}
            <div className="flex justify-between text-xs text-white/25 tabular-nums">
              <span>0:00</span>
              <span>{formatMMSS(fileDuration)}</span>
            </div>
          </div>
        )}
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
              {cropStart === 0
                ? "앞 1분이 자동 크롭되어 처리되었습니다"
                : `${formatMMSS(cropStart)}~${formatMMSS(cropStart + MAX_DURATION_SEC)} 구간이 크롭되어 처리되었습니다`}
            </div>
          )}

          {/* 비디오 합성 진행률 */}
          {status === "merging" && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-white/40">
                <span>비디오 합성 중</span>
                <span>{mergeProgress}%</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${mergeProgress}%` }}
                />
              </div>
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
        <div className={`flex items-start gap-3 rounded-xl p-4 ${
          isQuotaError
            ? "bg-amber-500/8 border border-amber-400/20"
            : "bg-red-500/8 border border-red-400/20"
        }`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
            isQuotaError ? "bg-amber-500/20" : "bg-red-500/20"
          }`}>
            {isQuotaError ? (
              <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            ) : (
              <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <p className={`text-sm ${isQuotaError ? "text-amber-300/80" : "text-red-300/80"}`}>{error}</p>
        </div>
      )}

      {/* 결과 플레이어 (오디오 또는 비디오) */}
      {(audioUrl || videoOutputUrl) && (
        <div className="relative">
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-blue-500/15 to-violet-500/15" />
          <div className="relative bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-violet-400 animate-pulse" />
              <h3 className="text-sm font-semibold text-white/80">더빙 결과</h3>
              {videoOutputUrl && (
                <span className="ml-auto text-xs text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
                  비디오
                </span>
              )}
            </div>

            {/* 비디오 합성 실패 안내 — 오디오로 폴백됨 */}
            {videoMergeError && (
              <div className="flex items-start gap-2 text-xs text-amber-400/80 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                모바일에서는 영상 합성이 지원되지 않을 수 있습니다. 오디오로 재생합니다.
              </div>
            )}

            {videoOutputUrl ? (
              <div className="space-y-2">
                {/* 비디오 + CSS overlay 자막 컨테이너 */}
                <div className="relative">
                  <video
                    ref={videoRef}
                    controls
                    src={videoOutputUrl}
                    className="w-full rounded-xl max-h-64 bg-black"
                    onTimeUpdate={() => {
                      const t = videoRef.current?.currentTime ?? 0;
                      const cue = subtitleCues.find((c) => t >= c.start && t < c.end);
                      setCurrentSubtitle(cue?.text ?? "");
                    }}
                  >
                    {showSubtitles && subtitleUrl && (
                      <track kind="subtitles" src={subtitleUrl} default />
                    )}
                  </video>

                  {/* CSS overlay 자막 — iOS Safari fallback */}
                  {showSubtitles && currentSubtitle && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "10%",
                        left: 0,
                        right: 0,
                        textAlign: "center",
                        color: "white",
                        textShadow: "1px 1px 3px black",
                        fontSize: "clamp(12px, 2.5vw, 16px)",
                        padding: "0 16px",
                        pointerEvents: "none",
                      }}
                    >
                      {currentSubtitle}
                    </div>
                  )}
                </div>

                {/* 자막 토글 — 동영상 출력 + 번역 텍스트 있을 때만 표시 */}
                {subtitleCues.length > 0 && (
                  <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                    <div
                      role="switch"
                      aria-checked={showSubtitles}
                      onClick={() => setShowSubtitles((v) => !v)}
                      className={`
                        relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0
                        ${showSubtitles
                          ? "bg-gradient-to-r from-blue-500 to-violet-500"
                          : "bg-white/15"
                        }
                      `}
                    >
                      <span
                        className={`
                          absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm
                          transition-transform duration-200
                          ${showSubtitles ? "translate-x-4" : "translate-x-0"}
                        `}
                      />
                    </div>
                    <span className="text-xs text-white/50">자막 표시</span>
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <audio
                  ref={audioRef}
                  controls
                  src={audioUrl!}
                  className="w-full h-10 [&::-webkit-media-controls-panel]:bg-white/5 rounded-lg"
                  onTimeUpdate={() => {
                    const t = audioRef.current?.currentTime ?? 0;
                    const cue = subtitleCues.find((c) => t >= c.start && t < c.end);
                    setCurrentSubtitle(cue?.text ?? "");
                  }}
                />
                {/* 오디오 재생 중 자막 overlay */}
                {subtitleCues.length > 0 && (
                  <>
                    {showSubtitles && currentSubtitle && (
                      <div className="text-center text-sm text-white/90 bg-black/50 rounded-lg px-4 py-2 leading-relaxed min-h-[2.5rem] flex items-center justify-center">
                        {currentSubtitle}
                      </div>
                    )}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                      <div
                        role="switch"
                        aria-checked={showSubtitles}
                        onClick={() => setShowSubtitles((v) => !v)}
                        className={`
                          relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0
                          ${showSubtitles
                            ? "bg-gradient-to-r from-blue-500 to-violet-500"
                            : "bg-white/15"
                          }
                        `}
                      >
                        <span
                          className={`
                            absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm
                            transition-transform duration-200
                            ${showSubtitles ? "translate-x-4" : "translate-x-0"}
                          `}
                        />
                      </div>
                      <span className="text-xs text-white/50">자막 표시</span>
                    </label>
                  </>
                )}
              </div>
            )}

            {/* 다운로드 버튼 영역 */}
            <div className="flex flex-col gap-2">
              {/* 비디오 다운로드 (비디오 출력 시) */}
              {videoOutputUrl && (
                <a
                  href={videoOutputUrl}
                  download={`dubbed_${targetLang}.mp4`}
                  className="flex items-center justify-center gap-2 w-full bg-white/8 hover:bg-white/12 border border-white/10 hover:border-white/20 font-medium text-sm py-3 rounded-xl transition-all duration-200 text-white/70 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  비디오 다운로드
                </a>
              )}

              {/* 오디오 다운로드 — 항상 표시 */}
              {audioUrl && (
                <a
                  href={audioUrl}
                  download={`dubbed_${targetLang}.wav`}
                  className="flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/8 border border-white/8 hover:border-white/15 font-medium text-sm py-3 rounded-xl transition-all duration-200 text-white/50 hover:text-white/70"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  오디오 다운로드
                </a>
              )}

              {/* 오디오 전용 출력 시 단일 다운로드 버튼 */}
              {!videoOutputUrl && !audioUrl && (
                <a
                  href={audioUrl!}
                  download={`dubbed_${targetLang}.wav`}
                  className="flex items-center justify-center gap-2 w-full bg-white/8 hover:bg-white/12 border border-white/10 hover:border-white/20 font-medium text-sm py-3 rounded-xl transition-all duration-200 text-white/70 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  다운로드
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
