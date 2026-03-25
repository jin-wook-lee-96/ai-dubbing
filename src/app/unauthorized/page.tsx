import Link from "next/link";

export default function Unauthorized() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <div className="text-center max-w-md px-6">
        <div className="text-6xl mb-6">🚫</div>
        <h1 className="text-2xl font-bold mb-3">접근이 제한된 서비스입니다</h1>
        <p className="text-gray-400 mb-4">
          이 서비스는 승인된 사용자만 이용할 수 있습니다.
          <br />
          허용되지 않은 Google 계정으로 로그인을 시도했습니다.
        </p>
        <p className="text-gray-400 mb-8 text-sm">
          사용 등록 문의:{" "}
          <a
            href="mailto:wksdnr4816@gmail.com"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
          >
            wksdnr4816@gmail.com
          </a>
        </p>
        <Link
          href="/"
          className="inline-block bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          돌아가기
        </Link>
      </div>
    </main>
  );
}
