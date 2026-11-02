import "server-only";

import { cookies } from "next/headers";

import { ACCESS_COOKIE, AUTH_URL, CLIENT_ID, REDIRECT_URI, REFRESH_COOKIE, VALYU_APP_URL } from "@/lib/auth/config";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

function basicAuth(): string {
  return `Basic ${Buffer.from(`${CLIENT_ID}:${process.env.VALYU_CLIENT_SECRET ?? ""}`).toString("base64")}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse | null> {
  const res = await fetch(`${AUTH_URL}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(code: string, verifier: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
}

export async function setSession(tokens: TokenResponse) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(ACCESS_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, (tokens.expires_in ?? 3600) - 60),
  });
  if (tokens.refresh_token) {
    jar.set(REFRESH_COOKIE, tokens.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** The signed-in user's Valyu access token, refreshed if it has expired. Null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) return access;
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (!tokens) {
    jar.delete(REFRESH_COOKIE);
    return null;
  }
  await setSession(tokens);
  return tokens.access_token;
}

export interface UserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function getUserInfo(token: string): Promise<UserInfo | null> {
  const res = await fetch(`${VALYU_APP_URL}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as UserInfo;
}

export class ValyuProxyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Call the Valyu API as the signed-in user. Usage spends the user's own credits. */
export async function callAsUser<T>(token: string, path: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`${VALYU_APP_URL}/api/oauth/proxy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path, method, body }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      message = json.message ?? json.error ?? message;
    } catch {
      // keep raw text
    }
    throw new ValyuProxyError(message, res.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // Streaming endpoints come back as server-sent events; let the caller parse them.
    return text as T;
  }
}
