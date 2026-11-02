import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { SituationRoom } from "@/components/situation-room";
import { getSnapshot, toClientSnapshot } from "@/lib/snapshot";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  // The globe's style and tiles (Mapbox) and night lights (NASA GIBS) are fetched with CORS once the
  // map chunk runs. Opening those connections while the HTML parses takes DNS and TLS off that path.
  preconnect("https://api.mapbox.com", { crossOrigin: "anonymous" });
  preconnect("https://gibs.earthdata.nasa.gov", { crossOrigin: "anonymous" });
  const snapshot = await getSnapshot();
  return <SituationRoom snapshot={toClientSnapshot(snapshot)} />;
}
