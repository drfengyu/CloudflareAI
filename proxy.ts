import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Next 16 renamed the middleware export convention to "proxy".
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api      Business API (handles its own session/API-key auth inline)
     * - v1       OpenAI/Anthropic-compatible gateway (Bearer API-key auth in
     *            route handlers; must NOT be redirected to /login or external
     *            API clients lose access). /v1/models is intentionally public.
     * - _next/static / _next/image
     * - favicon.ico
     * - test     Debug-only page
     */
    "/((?!api|v1|_next/static|_next/image|favicon.ico|test).*)",
  ],
};
