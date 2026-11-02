import { NextResponse } from "next/server";

import { getAccessToken, getUserInfo } from "@/lib/auth/server";

export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ user: null });
  const info = await getUserInfo(token);
  return NextResponse.json({
    user: info ? { id: info.sub, email: info.email, name: info.name, picture: info.picture } : null,
  });
}
