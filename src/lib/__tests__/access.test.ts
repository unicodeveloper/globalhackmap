import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/lib/auth/client";
import { FREE_OPENS, useAccess } from "@/stores/access";

// The deployment mode is fixed at build time; the tests flip it per case.
const mode = vi.hoisted(() => ({ ACCOUNTS: true }));
vi.mock("@/lib/mode", () => mode);

describe("free allowance and sign-in", () => {
  beforeEach(() => {
    mode.ACCOUNTS = true;
    useAccess.setState({ day: "", opened: [], prompt: null, reason: "dossiers" });
    useAuth.setState({ user: null, loaded: true });
  });

  it("lets a signed-out visitor open a few dossiers a day, then asks them to sign in", () => {
    const { allowOpen } = useAccess.getState();
    for (let i = 0; i < FREE_OPENS; i++) expect(allowOpen(`i:${i}`)).toBe(true);
    expect(useAccess.getState().prompt).toBeNull();
    expect(allowOpen("i:extra")).toBe(false);
    expect(useAccess.getState().prompt).toBe("dossiers");
  });

  it("does not charge for reopening a dossier already opened today", () => {
    const { allowOpen } = useAccess.getState();
    for (let i = 0; i < FREE_OPENS; i++) allowOpen(`i:${i}`);
    expect(allowOpen("i:0")).toBe(true);
    expect(useAccess.getState().prompt).toBeNull();
  });

  it("never prompts a signed-in visitor, or one whose sign-in state is still loading", () => {
    useAuth.setState({ user: { id: "u", email: "a@b.c" }, loaded: true });
    for (let i = 0; i < FREE_OPENS + 5; i++) expect(useAccess.getState().allowOpen(`i:${i}`)).toBe(true);
    useAuth.setState({ user: null, loaded: false });
    expect(useAccess.getState().allowOpen("i:late")).toBe(true);
  });

  it("asks for an account outright for answers, checks and research", () => {
    expect(useAccess.getState().requireAccount("answers")).toBe(false);
    expect(useAccess.getState().prompt).toBe("answers");
    useAuth.setState({ user: { id: "u", email: "a@b.c" }, loaded: true });
    expect(useAccess.getState().requireAccount("research")).toBe(true);
  });

  it("opens everything without asking on a self-hosted deployment", () => {
    mode.ACCOUNTS = false;
    const { allowOpen, requireAccount } = useAccess.getState();
    for (let i = 0; i < FREE_OPENS + 5; i++) expect(allowOpen(`i:${i}`)).toBe(true);
    expect(requireAccount("research")).toBe(true);
    expect(useAccess.getState().prompt).toBeNull();
  });
});
