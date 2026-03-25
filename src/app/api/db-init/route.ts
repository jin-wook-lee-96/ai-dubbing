import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    await client.execute(`
      CREATE TABLE IF NOT EXISTS allowed_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const initialEmails = (process.env.INITIAL_ALLOWED_EMAILS ?? "").split(",").filter(Boolean);
    for (const email of initialEmails) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO allowed_users (email) VALUES (?)`,
        args: [email.trim()],
      });
    }

    return NextResponse.json({ success: true, message: "DB initialized" });
  } catch (error) {
    console.error("DB init error:", error);
    return NextResponse.json({ error: "DB 초기화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
