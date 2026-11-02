import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The Global Hack Map mark, warm white on the night-desk ground. iOS rounds the corners itself. */
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#05070b" }}>
      <svg width="124" height="124" viewBox="0 0 24 24" fill="none" stroke="#edf0f4" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.25" />
        <path d="M12 3.75c-2.6 2.3-3.9 5.05-3.9 8.25s1.3 5.95 3.9 8.25M12 3.75c2.6 2.3 3.9 5.05 3.9 8.25s-1.3 5.95-3.9 8.25" opacity="0.55" />
        <path d="M12 0.75v4.5M12 18.75v4.5M0.75 12h4.5M18.75 12h4.5" />
        <circle cx="12" cy="12" r="1.6" fill="#edf0f4" stroke="none" />
      </svg>
    </div>,
    { ...size },
  );
}
