import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Next 16 renamed the middleware export convention to "proxy".
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/models/:path*",
    "/playground/:path*",
    "/history/:path*",
    "/keys/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
