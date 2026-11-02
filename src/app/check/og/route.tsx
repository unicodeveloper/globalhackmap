import { readShared, sharedHeadline, sharedLevel } from "@/app/check/share/verdict";
import { BLOCK_BOTTOM, C, CONTENT_WIDTH, CardFrame, Lines, PAD_X, StatusRow, Text, linesHeight, linesWidth, renderCard } from "@/lib/og/card";
import { plural } from "@/lib/og/copy";
import { MARK_COLOR, dotMapSvg, worldView } from "@/lib/og/map";
import { fitText, textWidth } from "@/lib/og/text";

const TRACKING = -0.012;
const SAFE = "#6ee7a8";

function SafeRow({ text, size }: { text: string; size: number }) {
  const icon = Math.round(size * 0.8);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke={SAFE} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <div
        style={{ display: "flex", whiteSpace: "nowrap", fontSize: size, lineHeight: 1.1, color: SAFE, fontFamily: "Hubot Sans SemiCondensed", fontWeight: 700 }}
      >
        {text}
      </div>
    </div>
  );
}

/** Share card for /check and /check/share. Reads counts only: e exploited, m malicious, l likely soon, c critical, n checked, t=products. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const result = readShared(params);

  const headline = result ? sharedHeadline(result) : "Are you affected?";
  const head = fitText(headline, {
    font: "condensedExtraBold",
    maxWidth: CONTENT_WIDTH,
    maxLines: 3,
    max: result ? 84 : 120,
    min: 52,
    oneLineMin: result ? 84 : 96,
    tracking: TRACKING,
  });
  const level = result ? sharedLevel(result) : "safe";
  const found = level !== "safe";
  const status = result
    ? found
      ? [
          result.exploited ? (result.products ? `${plural(result.exploited, "product")} to check` : `${result.exploited} exploited`) : null,
          result.malicious ? `${result.malicious} malicious` : null,
          result.likely ? `${result.likely} likely soon` : null,
          result.critical ? `${result.critical} critical` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "Nothing known to be exploited"
    : null;
  const sub = result ? "Check yours in seconds. Nothing you paste is stored." : "Check the companies you use and the code you run, free.";
  const subSize = 29;
  const statusSize = 34;

  const height = (status ? statusSize * 1.1 + 24 : 0) + linesHeight(head, 0.98) + 24 + subSize;
  const width = Math.max(linesWidth(head, "condensedExtraBold", TRACKING), textWidth(sub, "medium", subSize));
  const map = dotMapSvg(worldView({ width: 1200, height: 630, scale: 3.2, top: 34 }), {
    keepOut: { x: 0, y: BLOCK_BOTTOM - height, w: PAD_X + width, h: height + 160 },
  });

  try {
    return await renderCard(
      <CardFrame map={map}>
        {status ? (
          <div style={{ display: "flex", marginBottom: 24 }}>
            {found ? (
              <StatusRow
                kind={level === "confirmed" ? "confirmed" : "reported"}
                text={status}
                color={level === "confirmed" ? MARK_COLOR.confirmed : MARK_COLOR.reported}
                size={statusSize}
              />
            ) : (
              <SafeRow text={status} size={statusSize} />
            )}
          </div>
        ) : null}
        <Lines fit={head} font="condensedExtraBold" lineHeight={0.98} tracking={TRACKING} />
        <Text size={subSize} color={C.ink2} style={{ marginTop: 24 }}>
          {sub}
        </Text>
      </CardFrame>,
    );
  } catch {
    return new Response("Could not draw the card", { status: 500 });
  }
}
