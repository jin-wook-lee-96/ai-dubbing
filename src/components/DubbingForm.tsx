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

type Status = "idle" | "uploading" | "transcribing" | "translating" | "synthesizing" | "done" | "error";

const STATUS_MESSAGES: Record<Status, string> = {
  idle: "",
  uploading: "파일 업로드 중...",
  transcribing: "음성을 텍스트로 변환 중...",
  translating: "번역 중...",
  synthesizing: "음성 합성 중...",
  done: "더빙 완료!",
  error: "오류가 발생했습니다",
};

export default function DubbingForm() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState("en");
  const [status, setStatus] = useState<Status>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setAudioUrl(null);
    setError("");
    setTranscript("");
    setTranslation("");

    try {
      // Step 1: Vercel Blob에 직접 업로드 (4.5MB 제한 우회)
      const blob = await upload(file.name, file, {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 파일 업로드 */}
      <div className="border-2 border-dashed border-gray-600 rounded-2xl p-8 text-center hover:border-gray-400 transition-colors">
        <input
          type="file"
          accept="audio/*,video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
          id="file-input"
        />
        <label htmlFor="file-input" className="cursor-pointer">
          <div className="text-4xl mb-3">📁</div>
          {file ? (
            <div>
              <p className="font-semibold text-green-400">{file.name}</p>
              <p className="text-gray-400 text-sm mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div>
              <p className="font-semibold">파일을 클릭하여 업로드</p>
              <p className="text-gray-400 text-sm mt-1">오디오 또는 비디오 파일 지원</p>
            </div>
          )}
        </label>
      </div>

      {/* 언어 선택 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          타겟 언어
        </label>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={!file || status !== "idle" && status !== "done" && status !== "error"}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed font-semibold py-3 rounded-xl transition-colors"
      >
        {status !== "idle" && status !== "done" && status !== "error"
          ? STATUS_MESSAGES[status]
          : "더빙 시작"}
      </button>

      {/* 진행 상태 */}
      {status !== "idle" && status !== "error" && (
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            {status !== "done" && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            <span className={status === "done" ? "text-green-400 font-semibold" : "text-blue-400"}>
              {STATUS_MESSAGES[status]}
            </span>
          </div>

          {transcript && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-1">원본 텍스트</p>
              <p className="text-sm text-gray-300 bg-gray-900 rounded-lg p-3">{transcript}</p>
            </div>
          )}
          {translation && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-1">번역된 텍스트</p>
              <p className="text-sm text-gray-300 bg-gray-900 rounded-lg p-3">{translation}</p>
            </div>
          )}
        </div>
      )}

      {/* 에러 */}
      {status === "error" && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-400">
          {error}
        </div>
      )}

      {/* 결과 오디오 */}
      {audioUrl && (
        <div className="bg-gray-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-semibold text-green-400">더빙 결과</h3>
          <audio ref={audioRef} controls src={audioUrl} className="w-full" />
          <a
            href={audioUrl}
            download={`dubbed_${targetLang}.mp3`}
            className="flex items-center justify-center gap-2 w-full bg-green-700 hover:bg-green-600 font-semibold py-2.5 rounded-xl transition-colors"
          >
            ⬇️ 다운로드
          </a>
        </div>
      )}
    </form>
  );
}
