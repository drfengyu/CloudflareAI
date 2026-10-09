import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** 用户角色：1=普通用户 / 10=管理员 / 100=root，存在 JWT 中避免每次导航查库。 */
      role: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** 用户角色，登录时写入 token，后续导航直接从 token 读取。 */
    role?: number;
  }
}
