"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/icons/agents";
import { useAuth, type ValyuUser } from "@/lib/auth/client";

export default function ValyuCallback() {
  const router = useRouter();
  const setUser = useAuth((s) => s.setUser);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const stored = JSON.parse(sessionStorage.getItem("ghm_oauth") ?? "null") as {
      verifier: string;
      state: string;
      returnTo: string;
      at: number;
    } | null;
    sessionStorage.removeItem("ghm_oauth");
    const code = params.get("code");
    const complete = async () => {
      if (params.get("error") || !code || !stored || stored.state !== params.get("state") || Date.now() - stored.at > 600_000) {
        throw new Error("Sign in did not complete. Please try again.");
      }
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, verifier: stored.verifier }),
      });
      const json = (await res.json()) as { user?: ValyuUser | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Sign in failed");
      setUser(json.user ?? null);
      router.replace(stored.returnTo?.startsWith("/") ? stored.returnTo : "/");
    };
    complete().catch((err: Error) => setError(err.message));
  }, [router, setUser]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-space text-ink">
      <BrandMark className="size-8 animate-pulse text-ink" />
      <p className="text-[14px] text-ink-2">{error ?? "Connecting your Valyu account"}</p>
      {error ? (
        <Link href="/" className="text-[14px] text-ink underline underline-offset-4">
          Back to the map
        </Link>
      ) : null}
    </main>
  );
}
