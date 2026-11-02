export const AUTH_URL = process.env.NEXT_PUBLIC_VALYU_AUTH_URL ?? "https://auth.valyu.ai";
export const CLIENT_ID = process.env.NEXT_PUBLIC_VALYU_CLIENT_ID ?? "";
export const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI ?? "";
export const VALYU_APP_URL = process.env.VALYU_APP_URL ?? "https://platform.valyu.ai";

export function oauthConfigured(): boolean {
  return Boolean(CLIENT_ID && REDIRECT_URI);
}

export const ACCESS_COOKIE = "ghm_at";
export const REFRESH_COOKIE = "ghm_rt";
