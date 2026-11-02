"use client";

import { create } from "zustand";

import { AUTH_URL, CLIENT_ID, REDIRECT_URI, oauthConfigured } from "@/lib/auth/config";

export interface ValyuUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

interface AuthState {
  user: ValyuUser | null;
  loaded: boolean;
  setUser: (user: ValyuUser | null) => void;
  load: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loaded: false,
  setUser: (user) => set({ user, loaded: true }),
  load: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const json = (await res.json()) as { user: ValyuUser | null };
      set({ user: json.user, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  signOut: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null });
  },
}));

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** Start "Sign in with Valyu" (OAuth 2.1 authorization code + PKCE). */
export async function startSignIn(returnTo = window.location.pathname + window.location.search) {
  if (!oauthConfigured()) {
    window.open("https://platform.valyu.ai/auth", "_blank", "noopener");
    return;
  }
  const verifier = randomString();
  const state = randomString();
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem("ghm_oauth", JSON.stringify({ verifier, state, returnTo, at: Date.now() }));
  const url = new URL("/auth/v1/oauth/authorize", AUTH_URL);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid profile email offline_access",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  window.location.href = url.toString();
}
