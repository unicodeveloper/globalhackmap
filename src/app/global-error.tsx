"use client";

import "./globals.css";

/** Replaces the root layout when it fails, so it brings its own document and styles. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-dvh items-center justify-center bg-space p-6 text-ink antialiased">
        <title>Global Hack Map failed to load</title>
        <div className="max-w-[480px]">
          <h1 className="text-[28px] font-semibold leading-tight">Global Hack Map failed to load</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Something went wrong before the page could render. Try again in a moment.</p>
          <button type="button" onClick={() => retry()} className="mt-6 rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-space">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
