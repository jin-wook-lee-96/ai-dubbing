import { createClient } from "@libsql/client";
import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const allowedUsers = sqliteTable("allowed_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  createdAt: text("created_at").default(new Date().toISOString()),
});

let _db: LibSQLDatabase | null = null;

export function getDb(): LibSQLDatabase {
  if (!_db) {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    _db = drizzle(client);
  }
  return _db;
}
