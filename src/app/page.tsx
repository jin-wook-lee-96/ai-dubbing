import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center text-white overflow-hidden">
      {/* 배경 동영상 */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>

      {/* 어두운 오버레이 */}
      <div className="absolute inset-0 bg-black/60 z-10" />

      {/* 콘텐츠 */}
      <div className="relative z-20 text-center max-w-2xl px-6">
        {/* 뱃지 */}
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm mb-6">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          AI-Powered Dubbing Service
        </div>

        {/* 타이틀 */}
        <h1 className="text-5xl md:text-7xl font-extrabold mb-4 tracking-tight">
          AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">Dubbing</span>
        </h1>
        <p className="text-gray-300 text-lg md:text-xl mb-10 leading-relaxed">
          오디오 · 비디오 파일을 업로드하면<br />
          원하는 언어로 자동 더빙해드립니다
        </p>

        {/* 기능 카드 3개 */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          {[
            { icon: "🎙️", title: "음성 인식", desc: "ElevenLabs STT" },
            { icon: "🌐", title: "AI 번역", desc: "GPT-4o-mini" },
            { icon: "🔊", title: "음성 합성", desc: "ElevenLabs TTS" },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-4 text-center"
            >
              <div className="text-3xl mb-2">{item.icon}</div>
              <p className="font-semibold text-sm">{item.title}</p>
              <p className="text-gray-400 text-xs mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* 로그인 버튼 */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3.5 px-8 rounded-2xl hover:bg-gray-100 active:scale-95 transition-all shadow-xl text-base"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google로 시작하기
          </button>
        </form>

        <p className="text-gray-500 text-sm mt-5">
          승인된 사용자만 이용할 수 있습니다
        </p>
      </div>
    </main>
  );
}
