"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { SECONDARY } from "@/components/pages/styles";

/** Copies the brief as numbered posts, each short enough for X, separated by blank lines. */
export function CopyThread({ posts }: { posts: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={SECONDARY}
      onClick={async () => {
        await navigator.clipboard.writeText(posts.join("\n\n"));
        setCopied(true);
        toast(`Thread copied: ${posts.length} posts. Post the first, then add the rest as replies.`);
        window.setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check className="size-3.5 text-safe" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy as a thread"}
    </button>
  );
}
