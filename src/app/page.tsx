import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import GoogleLoginButton from "@/components/GoogleLoginButton";

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
        <source src="/2page_vedio.mp4" type="video/mp4" />
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
          <GoogleLoginButton />
        </form>

        <p className="text-gray-500 text-sm mt-5">
          승인된 사용자만 이용할 수 있습니다
        </p>
      </div>
    </main>
  );
}
