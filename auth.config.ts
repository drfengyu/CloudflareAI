import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

/**
 * LinuxDO OIDC 用户信息
 */
interface LinuxDOProfile {
  sub: string;
  username: string;
  name: string;
  email?: string;
  avatar_url?: string;
  trust_level: number;
}

/**
 * LinuxDO OAuth Provider
 * 使用 client_secret_post 方法交换 token（放在 POST body，不是 Basic Auth）
 */
function LinuxDO(
  config: OAuthUserConfig<LinuxDOProfile>
): OAuthConfig<LinuxDOProfile> {
  return {
    id: "linuxdo",
    name: "LinuxDO",
    type: "oidc",
    issuer: "https://connect.linux.do/",  // 注意：必须带结尾斜杠，匹配 OIDC Discovery
    authorization: {
      params: {
        scope: "openid profile email",
      },
    },
    token: {
      url: "https://connect.linux.do/oauth2/token",
      params: {
        grant_type: "authorization_code",
      },
    },
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name || profile.username,
        email: profile.email || `linuxdo_${profile.sub}@placeholder.local`,
        image: profile.avatar_url,
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
