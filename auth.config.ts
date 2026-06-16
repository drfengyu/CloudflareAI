import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

/**
 * LinuxDO OAuth 用户信息
 */
interface LinuxDOProfile {
  id: number;
  username: string;
  name: string;
  trust_level: number;
  avatar_template?: string;
}

/**
 * LinuxDO OAuth Provider
 * 使用 Basic Auth 交换 token，需要自定义 token 请求
 */
function LinuxDO(
  config: OAuthUserConfig<LinuxDOProfile>
): OAuthConfig<LinuxDOProfile> {
  return {
    id: "linuxdo",
    name: "LinuxDO",
    type: "oauth",
    authorization: {
      url: "https://connect.linux.do/oauth2/authorize",
      params: { scope: "read" },
    },
    token: {
      url: "https://connect.linux.do/oauth2/token",
      async request(context: any) {
        // LinuxDO 使用 Basic Auth 交换 token
        const credentials = Buffer.from(
          `${context.provider.clientId}:${context.provider.clientSecret}`
        ).toString("base64");

        const response = await fetch(context.provider.token!.url!, {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: context.params.code!,
            redirect_uri: context.provider.callbackUrl,
          }),
        });

        const tokens = await response.json();
        return { tokens };
      },
    },
    userinfo: "https://connect.linux.do/api/user",
    profile(profile) {
      return {
        id: profile.id.toString(),
        name: profile.name || profile.username,
        email: `linuxdo_${profile.id}@placeholder.local`,
        image: profile.avatar_template?.replace("{size}", "120"),
      };
    },
    style: { brandColor: "#feb005" },
    ...config,
  } as OAuthConfig<LinuxDOProfile>;
}

/**
 * Edge-safe Auth.js config — imported by middleware. Must NOT pull in the
 * Drizzle adapter, bcrypt, or any Node-only modules. The GitHub provider reads
 * AUTH_GITHUB_ID / AUTH_GITHUB_SECRET from the environment automatically.
 */
export default {
  pages: { signIn: "/login" },
  providers: [
    GitHub,
    LinuxDO({
      clientId: process.env.LINUXDO_CLIENT_ID!,
      clientSecret: process.env.LINUXDO_CLIENT_SECRET!,
    }),
  ],
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
