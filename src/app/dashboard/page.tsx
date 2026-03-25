import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import DubbingForm from "@/components/DubbingForm";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <main className="min-h-screen text-white relative overflow-x-hidden">
      {/* 배경 동영상 */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="fixed inset-0 w-full h-full object-cover -z-10"
      >
        <source src="/9255102-hd_1920_1080_24fps.mp4" type="video/mp4" />
      </video>

      {/* 어두운 오버레이 + 그라디언트 오버레이 */}
      <div className="fixed inset-0 bg-black/60 -z-10" />
      <div className="fixed inset-0 bg-gradient-to-br from-blue-950/30 via-transparent to-violet-950/30 -z-10" />

      {/* 플로팅 헤더 */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 backdrop-blur-xl bg-white/5 border-b border-white/10 shadow-lg shadow-black/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/25">
            AI
          </div>
          <h1 className="text-lg font-semibold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            AI Dubbing
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-white/40 text-xs font-mono hidden sm:block">
            {session.user?.email}
          </span>
          <div className="w-px h-4 bg-white/10 hidden sm:block" />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-xs font-medium text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="max-w-2xl mx-auto px-6 py-14">
        {/* 페이지 타이틀 섹션 */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-white/50 font-medium tracking-wider uppercase mb-5 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Powered by AI
          </div>
          <h2 className="text-4xl font-bold tracking-tight mb-3 bg-gradient-to-br from-white via-white/90 to-white/50 bg-clip-text text-transparent">
            AI 더빙 서비스
          </h2>
          <p className="text-white/40 text-sm leading-relaxed max-w-sm mx-auto">
            오디오 또는 비디오 파일을 업로드하고<br />원하는 언어를 선택하세요
          </p>
        </div>

        {/* 폼 카드 */}
        <div className="relative">
          {/* 카드 글로우 효과 */}
          <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-blue-500/20 via-transparent to-violet-500/20 blur-sm" />
          <div className="relative bg-white/8 backdrop-blur-2xl border border-white/15 rounded-3xl p-8 shadow-2xl shadow-black/30">
            <DubbingForm />
          </div>
        </div>

        {/* 하단 안내 텍스트 */}
        <p className="text-center text-white/20 text-xs mt-8 tracking-wide">
          지원 형식: MP3, MP4, WAV, M4A, WebM 등
        </p>
      </div>
    </main>
  );
}
