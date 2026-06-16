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
import {
  createOrGetLinuxDOUser,
  type LinuxDOProfile,
} from "@/lib/db/queries-linuxdo";

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
    async signIn({ user, account, profile }) {
      // LinuxDO OAuth 登录处理
      if (account?.provider === "linuxdo" && profile) {
        try {
          console.log("[LinuxDO signIn] Raw profile:", JSON.stringify(profile, null, 2));

          const linuxdoProfile = profile as unknown as LinuxDOProfile;

          console.log("[LinuxDO signIn] Parsed profile:", {
            sub: linuxdoProfile.sub,
            id: linuxdoProfile.id,
            username: linuxdoProfile.username,
            trust_level: linuxdoProfile.trust_level,
          });

          const userId = await createOrGetLinuxDOUser(linuxdoProfile);

          console.log("[LinuxDO signIn] Created/found user:", userId);

          // 更新 user.id 供后续 jwt callback 使用
          user.id = userId;
          return true;
        } catch (error) {
          console.error("[LinuxDO OAuth] Failed:", error);
          console.error("[LinuxDO OAuth] Error stack:", error instanceof Error ? error.stack : "");
          // 返回错误信息到登录页
          return `/login?error=${encodeURIComponent(
            error instanceof Error ? error.message : "LinuxDO 登录失败"
          )}`;
        }
      }
      return true;
    },
    async jwt({ token, user, account, profile, trigger }) {
      // 首次登录时，将用户信息保存到 token
      if (user) {
        // LinuxDO OAuth: user.id 是我们在 signIn callback 中设置的 UUID
        // 其他 OAuth: 使用 Drizzle Adapter 创建的 user.id 或 account.userId
        // Credentials: 直接使用 user.id
        let userId = user.id;

        // 如果 user.id 为空，尝试从 account 或 profile 获取
        if (!userId) {
          if (account?.provider === "linuxdo" && profile) {
            // LinuxDO: 从数据库查询（通过 linuxdoId）
            const linuxdoId = (profile as any).sub;
            if (linuxdoId) {
              const dbUser = await db.query.users.findFirst({
                where: (users, { eq }) => eq(users.linuxdoId, String(linuxdoId)),
              });
              userId = dbUser?.id;
            }
          } else {
            // 其他 provider: 从 account.userId 或 profile.sub 获取
            userId = (account as any)?.userId || (profile as any)?.sub;
          }
        }

        const userEmail = user.email || (profile as any)?.email || null;
        const userName = user.name || (profile as any)?.name || (profile as any)?.login || null;
        const userImage = user.image || (profile as any)?.avatar_url || (profile as any)?.picture || null;

        token.sub = String(userId || "");
        token.email = userEmail ? String(userEmail) : null;
        token.name = userName ? String(userName) : null;
        token.image = userImage ? String(userImage) : null;
      }
      // 如果 token 中没有 email 但有 sub，从数据库查询
      else if (token.sub && token.email === undefined) {
        try {
          const dbUser = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, token.sub as string),
          });
          if (dbUser) {
            token.email = dbUser.email;
            token.name = dbUser.name;
            token.image = dbUser.image;
          }
        } catch (err) {
          console.error("[JWT] DB query failed:", err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      // 从 token 恢复用户信息到 session
      if (session.user) {
        let userId = String(token.sub || "");

        // 如果 token.sub 为空但有 email，从数据库查找用户 ID
        if (!userId && token.email) {
          try {
            const dbUser = await db.query.users.findFirst({
              where: (users, { eq }) => eq(users.email, String(token.email).toLowerCase()),
            });
            if (dbUser) {
              userId = dbUser.id;
            }
          } catch (err) {
            console.error("[SESSION] DB query failed:", err);
          }
        }

        session.user.id = userId;
        session.user.email = (token.email as string) || "";
        session.user.name = (token.name as string | null) || null;
        session.user.image = (token.image as string | null) || null;
      }
      return session;
    },
  },
});
