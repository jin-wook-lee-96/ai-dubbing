import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <div className="text-center max-w-md px-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3">🎙️ AI Dubbing</h1>
          <p className="text-gray-300 text-lg">
            오디오/비디오 파일을 원하는 언어로 자동 더빙해드립니다😃
          </p>
        </div>

        <div className="bg-gray-800 rounded-2xl p-6 mb-6 text-left space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎵</span>
            <div>
              <p className="font-semibold">음성 추출</p>
              <p className="text-gray-400 text-sm">ElevenLabs로 음성을 텍스트로 변환</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🌐</span>
            <div>
              <p className="font-semibold">AI 번역</p>
              <p className="text-gray-400 text-sm">OpenAI GPT-4o-mini로 정확한 번역</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔊</span>
            <div>
              <p className="font-semibold">음성 합성</p>
              <p className="text-gray-400 text-sm">ElevenLabs로 자연스러운 더빙 생성</p>
            </div>
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 px-6 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google로 로그인
          </button>
        </form>

        <p className="text-gray-500 text-sm mt-4">
          승인된 사용자만 이용할 수 있습니다
        </p>
      </div>
    </main>
  );
}
