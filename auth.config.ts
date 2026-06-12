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
        return isAuthed
          ? Response.redirect(new URL("/dashboard", nextUrl))
          : true;
      }
      return isAuthed;
    },
  },
} satisfies NextAuthConfig;
