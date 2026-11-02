import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ImageResponse } from "next/og";

type Fonts = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>;

let fonts: Promise<Fonts> | undefined;

// Literal paths so output file tracing ships the files with the image routes.
function load(): Promise<Fonts> {
  const cwd = process.cwd();
  return Promise.all([
    readFile(join(cwd, "src/assets/fonts/MonaSans-Regular.woff")),
    readFile(join(cwd, "src/assets/fonts/MonaSans-Medium.woff")),
    readFile(join(cwd, "src/assets/fonts/MonaSans-SemiBold.woff")),
    readFile(join(cwd, "src/assets/fonts/HubotSansSemiCondensed-Bold.woff")),
    readFile(join(cwd, "src/assets/fonts/HubotSansCondensed-Bold.woff")),
    readFile(join(cwd, "src/assets/fonts/HubotSansCondensed-ExtraBold.woff")),
    readFile(join(cwd, "src/assets/fonts/MartianMono-Medium.woff")),
  ]).then(([regular, medium, semibold, semiCondensedBold, condensedBold, condensedExtraBold, mono]) => [
    { name: "Mona Sans", data: regular, weight: 400, style: "normal" },
    { name: "Mona Sans", data: medium, weight: 500, style: "normal" },
    { name: "Mona Sans", data: semibold, weight: 600, style: "normal" },
    { name: "Hubot Sans SemiCondensed", data: semiCondensedBold, weight: 700, style: "normal" },
    { name: "Hubot Sans Condensed", data: condensedBold, weight: 700, style: "normal" },
    { name: "Hubot Sans Condensed", data: condensedExtraBold, weight: 800, style: "normal" },
    { name: "Martian Mono", data: mono, weight: 500, style: "normal" },
  ]);
}

/** Static Mona Sans, Hubot Sans and Martian Mono instances for next/og, read once per server instance. */
export function loadFonts(): Promise<Fonts> {
  fonts ??= load().catch((error) => {
    fonts = undefined;
    throw error;
  });
  return fonts;
}
