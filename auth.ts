import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import authConfig from "./auth.config";
import { db } from "@/lib/db/d1-http";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/lib/db/schema";
import { getUserByEmail } from "@/lib/db/queries";

/**
 * Full Auth.js config (Node runtime). Adds the Drizzle/D1 adapter for OAuth
 * persistence and a Credentials provider for email/password. Sessions use JWT
 * (required by the Credentials provider) — the adapter still backs GitHub
 * account/user creation and the quota row.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile, trigger }) {
      // 首次登录时，将用户信息保存到 token
      if (user) {
        console.log("[JWT] Saving user to token:", {
          id: user.id,
          email: user.email || "no-email",
          name: user.name
        });
        token.sub = user.id;
        token.email = user.email || null;
        token.name = user.name || null;
        token.image = user.image || null;
      }
      // 如果 token 中没有 email 但有 sub，从数据库查询
      else if (token.sub && token.email === undefined) {
        console.log("[JWT] Token missing user data, fetching from DB for user:", token.sub);
        try {
          const dbUser = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, token.sub as string),
          });
          if (dbUser) {
            console.log("[JWT] Loaded from DB:", { email: dbUser.email || "no-email", name: dbUser.name });
            token.email = dbUser.email;
            token.name = dbUser.name;
            token.image = dbUser.image;
          } else {
            console.log("[JWT] User not found in DB");
          }
        } catch (err) {
          console.error("[JWT] DB query failed:", err);
        }
      } else {
        console.log("[JWT] Existing token:", { sub: token.sub, email: token.email || "no-email" });
      }
      return token;
    },
    session({ session, token }) {
      console.log("[SESSION] Token data:", {
        sub: token.sub,
        email: token.email || "no-email",
        name: token.name || "no-name"
      });
      // 从 token 恢复用户信息到 session
      if (token.sub && session.user) {
        session.user.id = token.sub;
        // NextAuth 类型定义要求 email 是 string，所以提供默认值
        session.user.email = (token.email as string) || "";
        session.user.name = (token.name as string | null) || null;
        session.user.image = (token.image as string | null) || null;
      }
      console.log("[SESSION] Final user:", {
        id: session.user?.id,
        email: session.user?.email || "no-email",
        name: session.user?.name || "no-name"
      });
      return session;
    },
  },
});
