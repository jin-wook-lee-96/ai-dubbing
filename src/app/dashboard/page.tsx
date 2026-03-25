import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import DubbingForm from "@/components/DubbingForm";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <main className="min-h-screen text-white relative">
      {/* 배경 동영상 */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="fixed inset-0 w-full h-full object-cover -z-10"
      >
        <source src="/2page_vedio.mp4" type="video/mp4" />
      </video>
      {/* 어두운 오버레이 */}
      <div className="fixed inset-0 bg-black/60 -z-10" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm bg-black/20">
        <h1 className="text-xl font-bold">🎙️ AI Dubbing</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-300 text-sm">{session.user?.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-sm bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-lg transition-colors backdrop-blur-sm"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">AI 더빙 서비스</h2>
          <p className="text-gray-300">
            오디오 또는 비디오 파일을 업로드하고 원하는 언어를 선택하세요
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
          <DubbingForm />
        </div>
      </div>
    </main>
  );
}
