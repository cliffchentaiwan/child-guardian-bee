// server/_core/cookies.ts

// 1. 定義 Cookie 的名稱
export const COOKIE_NAME = "child-guardian-session";

// 2. 定義取得 Cookie 設定的函式
export const getSessionCookieOptions = (req: any) => {
  const isSecure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
  };
};