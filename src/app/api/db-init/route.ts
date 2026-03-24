import { NextResponse } from "next/server";
import { getDb, allowedUsers } from "@/lib/db";
import { sql } from "drizzle-orm";

// 개발/초기 배포용 DB 초기화 엔드포인트
// 운영에서는 제거하거나 관리자 인증 추가 필요
export async function GET() {
  try {
    // 테이블 생성
    const db = getDb();
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS allowed_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // 초기 허용 사용자 삽입
    await db.insert(allowedUsers).values([
      { email: "kts123@estsoft.com" },
      { email: "wksdnr4816@gmail.com" },
    ]).onConflictDoNothing();

    return NextResponse.json({ success: true, message: "DB initialized" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
