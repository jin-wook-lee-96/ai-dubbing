import { getDb, allowedUsers } from "./db";

async function seed() {
  const db = getDb();
  await db.insert(allowedUsers).values({ email: "kts123@estsoft.com" }).onConflictDoNothing();
  console.log("Seeded allowed_users with kts123@estsoft.com");
}

seed().catch(console.error);
