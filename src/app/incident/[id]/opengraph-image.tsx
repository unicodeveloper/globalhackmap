import { cacheLife } from "next/cache";

import { findIncident } from "@/lib/lookup";
import { cardBytes, pngResponse } from "@/lib/og/card";
import { fallbackCard, incidentCard } from "@/lib/og/cards";
import { incidentParams } from "@/lib/static-params";
import { decodeParam } from "@/lib/utils";

export const alt = "Global Hack Map incident card: the organisation, whether the attack is confirmed or only claimed, the place and the date";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  return incidentParams();
}

async function render(id: string): Promise<ArrayBuffer> {
  "use cache";
  cacheLife("feed");
  const incident = await findIncident(id).catch(() => undefined);
  if (!incident) return cardBytes(fallbackCard("This incident is no longer on the map", "Incidents age out after 30 days. See what is happening now."));
  return cardBytes(incidentCard(incident));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return pngResponse(await render(decodeParam((await params).id)));
}
