import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export async function GET() {
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

    await client.execute({
      sql: `INSERT OR IGNORE INTO allowed_users (email) VALUES (?), (?)`,
      args: ["kts123@estsoft.com", "wksdnr4816@gmail.com"],
    });

    return NextResponse.json({ success: true, message: "DB initialized" });
  } catch (error) {
    console.error("DB init error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
