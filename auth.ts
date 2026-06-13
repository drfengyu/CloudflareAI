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
        console.log("[JWT] Raw user object:", JSON.stringify(user));
        console.log("[JWT] Raw account:", JSON.stringify(account));
        console.log("[JWT] Raw profile:", JSON.stringify(profile));

        // user.id 可能不存在（Drizzle Adapter bug），从 account.userId 或 profile.sub 获取
        const userId = user.id || (account as any)?.userId || (profile as any)?.sub;
        const userEmail = user.email || (profile as any)?.email || null;
        const userName = user.name || (profile as any)?.name || (profile as any)?.login || null;
        const userImage = user.image || (profile as any)?.avatar_url || (profile as any)?.picture || null;

        console.log("[JWT] Extracted data:", {
          id: userId,
          email: userEmail || "no-email",
          name: userName,
          image: userImage ? "has-image" : "no-image"
        });

        token.sub = String(userId || "");
        token.email = userEmail ? String(userEmail) : null;
        token.name = userName ? String(userName) : null;
        token.image = userImage ? String(userImage) : null;
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
    async session({ session, token }) {
      console.log("[SESSION] Token data:", {
        sub: token.sub,
        email: token.email || "no-email",
        name: token.name || "no-name"
      });

      // 从 token 恢复用户信息到 session
      if (session.user) {
        let userId = String(token.sub || "");

        // 如果 token.sub 为空但有 email，从数据库查找用户 ID
        if (!userId && token.email) {
          console.log("[SESSION] token.sub missing, fetching user ID by email:", token.email);
          try {
            const dbUser = await db.query.users.findFirst({
              where: (users, { eq }) => eq(users.email, token.email as string),
            });
            if (dbUser) {
              userId = dbUser.id;
              console.log("[SESSION] Found user ID from DB:", userId);
            }
          } catch (err) {
            console.error("[SESSION] DB query failed:", err);
          }
        }

        session.user.id = userId;
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
