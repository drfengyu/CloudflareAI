import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Edge-safe Auth.js config — imported by middleware. Must NOT pull in the
 * Drizzle adapter, bcrypt, or any Node-only modules. The GitHub provider reads
 * AUTH_GITHUB_ID / AUTH_GITHUB_SECRET from the environment automatically.
 */
export default {
  pages: { signIn: "/login" },
  providers: [GitHub],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isAuthed = !!auth?.user;
      const onAuthPage =
        nextUrl.pathname === "/login" || nextUrl.pathname === "/register";

      if (onAuthPage) {
        // 如果已登录，重定向到 dashboard
        if (isAuthed) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        // 未登录允许访问登录/注册页
        return true;
      }

      // 其他页面需要登录，未登录重定向到登录页
      if (!isAuthed) {
        return Response.redirect(new URL("/login", nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
