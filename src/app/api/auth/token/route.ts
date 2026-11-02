import { NextResponse } from "next/server";

import { exchangeCode, getUserInfo, setSession } from "@/lib/auth/server";

export async function POST(request: Request) {
  const { code, verifier } = (await request.json().catch(() => ({}))) as { code?: string; verifier?: string };
  if (!code || !verifier) return NextResponse.json({ error: "missing code" }, { status: 400 });
  const tokens = await exchangeCode(code, verifier);
  if (!tokens) return NextResponse.json({ error: "Sign in failed. Please try again." }, { status: 401 });
  await setSession(tokens);
  const info = await getUserInfo(tokens.access_token);
  return NextResponse.json({
    user: info ? { id: info.sub, email: info.email, name: info.name, picture: info.picture } : null,
  });
}
