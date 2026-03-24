import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import DubbingForm from "@/components/DubbingForm";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">🎙️ AI Dubbing</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{session.user?.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">AI 더빙 서비스</h2>
          <p className="text-gray-400">
            오디오 또는 비디오 파일을 업로드하고 원하는 언어를 선택하세요
          </p>
        </div>
        <DubbingForm />
      </div>
    </main>
  );
}
