import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb, allowedUsers } from "@/lib/db";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const db = getDb();
      const allowed = await db
        .select()
        .from(allowedUsers)
        .where(eq(allowedUsers.email, user.email))
        .limit(1);
      return allowed.length > 0;
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/unauthorized",
  },
});
