"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { BrandMark } from "@/components/icons/agents";
import { DecryptText } from "@/components/kit/decrypt-text";
import { StatusMark } from "@/components/kit/status-mark";
import { useMapInstance } from "@/components/map/map-instance";
import { countryName } from "@/lib/countries";
import { STATUS_COLOR, STATUS_LABEL, TYPE_LABEL, placeLabel, recordsLabel, relativeTime } from "@/lib/format";
import type { Incident } from "@/lib/types";
import { useSituation } from "@/stores/situation";

const FLIGHT_MS = 6500;
const DWELL_MS = 6000;

function tourOrder(incidents: Incident[]): Incident[] {
  const now = Date.now();
  const score = (incident: Incident) =>
    incident.severity * 2 +
    (incident.status === "confirmed" ? 2 : incident.status === "reported" ? 1 : 0) +
    (incident.geoBasis === "stated" || incident.geoBasis === "hq" ? 1 : 0) -
    (now - Date.parse(incident.date)) / (3 * 86_400_000);
  const ranked = [...incidents].sort((a, b) => score(b) - score(a)).slice(0, 14);
  // Alternate hemispheres so the camera sweeps the planet instead of hopping between neighbours.
  const out: Incident[] = [];
  const pool = [...ranked];
  let last: Incident | undefined;
  while (pool.length) {
    pool.sort((a, b) => (last ? Math.abs(b.lon - last.lon) - Math.abs(a.lon - last.lon) : 0));
    const next = pool.shift()!;
    out.push(next);
    last = next;
  }
  return out;
}

function Typewriter(props: { text: string; delay?: number }) {
  return <TypewriterText key={props.text} {...props} />;
}

function TypewriterText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let i = 0;
    let timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= text.length) window.clearInterval(timer);
      }, 18);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [text, delay]);
  return (
    <span>
      {text.slice(0, count)}
      <span className="opacity-0">{text.slice(count)}</span>
    </span>
  );
}

export function CinemaMode({ incidents }: { incidents: Incident[] }) {
  const cinema = useSituation((s) => s.cinema);
  const setCinema = useSituation((s) => s.setCinema);
  const select = useSituation((s) => s.select);
  const map = useMapInstance((s) => s.map);
  const [current, setCurrent] = useState<Incident | null>(null);
  const [phase, setPhase] = useState<"flying" | "dwell">("flying");
  const [index, setIndex] = useState(0);
  const tour = useMemo(() => tourOrder(incidents), [incidents]);
  const runRef = useRef(0);

  useEffect(() => {
    if (!cinema || !map || !tour.length) return;
    const run = ++runRef.current;
    select(null);
    let timer = 0;
    const visit = (i: number) => {
      if (runRef.current !== run) return;
      const incident = tour[i % tour.length];
      setIndex(i % tour.length);
      setCurrent(incident);
      setPhase("flying");
      const precise = incident.geoBasis === "stated" || incident.geoBasis === "hq";
      map.flyTo({
        center: [incident.lon, incident.lat],
        zoom: precise ? 10.6 + Math.random() * 1.2 : 4.6,
        pitch: precise ? 62 : 40,
        bearing: (Math.random() - 0.5) * 70,
        duration: FLIGHT_MS,
        curve: 1.75,
        essential: true,
      });
      timer = window.setTimeout(() => {
        if (runRef.current !== run) return;
        setPhase("dwell");
        map.easeTo({ bearing: map.getBearing() + 14, duration: DWELL_MS, easing: (t) => t });
        timer = window.setTimeout(() => visit(i + 1), DWELL_MS);
      }, FLIGHT_MS);
    };
    visit(0);
    return () => {
      runRef.current += 1;
      window.clearTimeout(timer);
      map.stop();
      setCurrent(null);
    };
  }, [cinema, map, tour, select]);

  if (!cinema) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-space/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[46vh] bg-gradient-to-t from-space via-space/70 to-transparent" />
      <div className="absolute left-6 top-6 flex items-center gap-3 sm:left-10">
        <BrandMark className="size-6 text-ink" />
        <span className="font-semicondensed text-[20px] font-bold text-ink">Global Hack Map</span>
        <span className="ml-1 flex items-center gap-2 rounded-full bg-confirmed/15 px-2.5 py-1 text-[12px] font-medium text-confirmed">
          <span className="live-dot size-1.5 rounded-full bg-confirmed" /> Live
        </span>
      </div>
      <div className="absolute right-6 top-7 text-[13px] tabular text-ink-3 sm:right-10">
        {index + 1} of {tour.length}
      </div>

      {current ? (
        <div key={current.id} className="absolute bottom-12 left-6 right-6 max-w-[880px] sm:bottom-14 sm:left-10">
          <div className="flex items-center gap-2.5 text-[14px] text-ink-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <StatusMark status={current.status} size={12} />
            <span style={{ color: STATUS_COLOR[current.status] }} className="font-medium">
              {STATUS_LABEL[current.status]}
            </span>
            <span className="text-ink-4">·</span>
            <span>{TYPE_LABEL[current.type]}</span>
            <span className="text-ink-4">·</span>
            <span>{relativeTime(current.date)}</span>
          </div>
          <h2 className="mt-3 font-condensed text-[clamp(44px,7vw,104px)] font-[780] leading-[0.9] tracking-[-0.02em] text-ink">
            <DecryptText text={current.victim} duration={900} />
          </h2>
          <p className="mt-4 max-w-[680px] text-[clamp(16px,1.6vw,22px)] leading-snug text-ink-2">
            <Typewriter text={current.title} delay={phase === "flying" ? 700 : 0} />
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-[14px] text-ink-3">
            <span>{placeLabel(current, countryName)}</span>
            {recordsLabel(current) ? <span className="text-ink">{recordsLabel(current)}</span> : null}
            {current.actor ? <span>{current.actor}</span> : null}
          </div>
          <div className="mt-6 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
            <div
              key={`${current.id}-${phase}`}
              className="h-full bg-ink"
              style={{
                width: "100%",
                transformOrigin: "left",
                animation: `cinema-progress ${phase === "flying" ? FLIGHT_MS : DWELL_MS}ms linear forwards`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-5 right-6 flex items-center gap-4 text-[12.5px] text-ink-4 sm:right-10">
        <span>Every cyber incident on Earth, live</span>
        <button
          type="button"
          onClick={() => setCinema(false)}
          className="pointer-events-auto rounded-full px-3 py-1.5 text-ink-2 ring-1 ring-white/15 hover:text-ink"
        >
          Esc to exit
        </button>
      </div>
      <style>{`@keyframes cinema-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
    </div>
  );
}
