"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MapControls } from "@/components/hud/controls";
import { MapSidebar } from "@/components/hud/map-sidebar";
import { SIDEBAR_DEFAULT, clampSidebarWidth, sidebarMaximum } from "@/components/hud/sidebar-layout";
import { type Cluster, ClusterMenu } from "@/components/hud/cluster-menu";
import { HoverCard } from "@/components/hud/hover-card";
import type { OmniboxHandle } from "@/components/hud/omnibox";
import { CveTicker } from "@/components/hud/cve-ticker";
import { PATCH_DOCK_MIN_WIDTH, PatchStrip } from "@/components/hud/patch-strip";
import { Story } from "@/components/hud/story";
import { TopBar } from "@/components/hud/top-bar";
import { AsciiAtlas } from "@/components/map/ascii-atlas";
import { DataTags } from "@/components/map/data-tags";
import type { Incident, Snapshot, Vuln } from "@/lib/types";
import { incidentView } from "@/lib/incident-view";
import { cn } from "@/lib/utils";
import { WINDOW_MS, useSituation } from "@/stores/situation";
import { useStack } from "@/stores/stack";

const Globe = dynamic(() => import("@/components/map/globe").then((mod) => mod.Globe), {
  ssr: false,
  loading: () => <GlobePlaceholder />,
});
// Only needed once something is selected or cinema starts, so they stay out of the first load.
const IncidentPanel = dynamic(() => import("@/components/hud/detail-panel").then((mod) => mod.IncidentPanel));
const CvePanel = dynamic(() => import("@/components/hud/detail-panel").then((mod) => mod.CvePanel));
const CinemaMode = dynamic(() => import("@/components/hud/cinema").then((mod) => mod.CinemaMode));

const PANEL = 460;
/** Space the patch dock takes from the bottom edge on desktop. */
const DOCK = 216;

function GlobePlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center md:pl-[var(--map-inset-left)]">
      <div className="aspect-square w-[min(62vh,62vw)] rounded-full bg-surface ring-1 ring-hairline" />
    </div>
  );
}

/**
 * True once the browser is first idle after hydration. Mapbox GL is about 1.8 MB of script whose start-up
 * runs as long tasks; mounting it after the panel hydrates lets search and the lists respond first.
 */
function useIdle(timeout = 1200) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback !== "function") {
      const id = window.setTimeout(() => setIdle(true), 1);
      return () => window.clearTimeout(id);
    }
    const id = window.requestIdleCallback(() => setIdle(true), { timeout });
    return () => window.cancelIdleCallback(id);
  }, [timeout]);
  return idle;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

/**
 * Keeps one query param and one selection in sync both ways. Opening a dossier adds a history entry, so
 * Back closes it instead of leaving the site; moving between dossiers replaces it.
 */
function useParamSync(name: "i" | "cve", value: string | null, apply: (next: string | null) => void) {
  const [param, setParam] = useQueryState(name);
  const lastValue = useRef(value);
  const lastParam = useRef<string | null | undefined>(undefined);

  // URL to state: first load, Back and Forward.
  useEffect(() => {
    if (lastParam.current === param) return;
    lastParam.current = param;
    if (param !== value) apply(name === "cve" && param ? param.toUpperCase() : param);
    // Only when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  // State to URL.
  useEffect(() => {
    if (lastValue.current === value) return;
    const opening = lastValue.current === null;
    lastValue.current = value;
    if (value !== param) void setParam(value, { history: opening ? "push" : "replace" });
  }, [value, param, setParam]);
}

/**
 * Deep links: ?i=<incident> and ?cve=<id> open the dossier on load and follow the selection. Reading the
 * query string opts out of static rendering, so this lives in its own Suspense boundary and the rest of
 * the room still prerenders.
 */
function DeepLinks() {
  const selectedId = useSituation((s) => s.selectedId);
  const selectedCve = useSituation((s) => s.selectedCve);
  const select = useSituation((s) => s.select);
  const selectCve = useSituation((s) => s.selectCve);
  useParamSync("i", selectedId, select);
  useParamSync("cve", selectedCve, selectCve);
  return null;
}

export function SituationRoom({ snapshot }: { snapshot: Snapshot }) {
  const router = useRouter();
  const omnibox = useRef<OmniboxHandle>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const [navHeight, setNavHeight] = useState(112);
  const mobile = useIsMobile();
  const mapReady = useIdle();
  const [hovered, setHovered] = useState<{ incident: Incident; x: number; y: number } | null>(null);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [now] = useState(() => Date.parse(snapshot.generatedAt));
  const [viewport, setViewport] = useState({ h: 800, w: 1280 });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [preferredSidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [patchDockOpen, setPatchDockOpen] = useState(true);

  const window_ = useSituation((s) => s.window);
  const statuses = useSituation((s) => s.statuses);
  const country = useSituation((s) => s.country);
  const selectedId = useSituation((s) => s.selectedId);
  const selectedCve = useSituation((s) => s.selectedCve);
  const select = useSituation((s) => s.select);
  const selectCve = useSituation((s) => s.selectCve);
  const cinema = useSituation((s) => s.cinema);
  const setCinema = useSituation((s) => s.setCinema);

  // The visitor's stack lives in localStorage; load it after hydration so server and client HTML agree.
  useEffect(() => {
    void useStack.persist.rehydrate();
  }, []);

  useEffect(() => {
    const update = () => setViewport({ h: window.innerHeight, w: window.innerWidth });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const element = topBar.current;
    if (!element) return;
    const update = () => setNavHeight(element.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const incidentData = useMemo(
    () => incidentView(snapshot.incidents, { now, windowMs: WINDOW_MS[window_], country, statuses }),
    [snapshot.incidents, statuses, window_, now, country],
  );
  const filtered = incidentData.incidents;

  const countryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const incident of filtered) counts[incident.country] = (counts[incident.country] ?? 0) + 1;
    return counts;
  }, [filtered]);

  const selected = useMemo(
    () => (selectedId ? snapshot.incidents.find((incident) => incident.id === selectedId) : undefined),
    [selectedId, snapshot.incidents],
  );
  const related = useMemo(() => {
    if (!selected) return [];
    return snapshot.incidents.filter(
      (other) =>
        other.id !== selected.id &&
        ((selected.actor && other.actor?.toLowerCase() === selected.actor.toLowerCase()) || other.cves.some((cve) => selected.cves.includes(cve))),
    );
  }, [selected, snapshot.incidents]);

  const vulnIndex = useMemo(() => {
    const map = new Map<string, Vuln>();
    for (const vuln of [...snapshot.fresh, ...snapshot.kev, ...snapshot.trending]) map.set(vuln.cve, vuln);
    return map;
  }, [snapshot.fresh, snapshot.kev, snapshot.trending]);
  const vulns = useMemo(() => [...vulnIndex.values()], [vulnIndex]);
  const selectedVuln = selectedCve ? vulnIndex.get(selectedCve) : undefined;

  useEffect(() => {
    // A CVE that is not in the live snapshot gets its own page.
    if (selectedCve && !selectedVuln) router.push(`/cve/${selectedCve}`);
  }, [selectedCve, selectedVuln, router]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!filtered.length) return;
      const index = filtered.findIndex((incident) => incident.id === selectedId);
      const next = filtered[(index + dir + filtered.length) % filtered.length];
      select(next.id);
    },
    [filtered, selectedId, select],
  );

  useEffect(() => {
    const focusSearch = () => {
      setSidebarOpen(true);
      requestAnimationFrame(() => omnibox.current?.focus());
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        focusSearch();
      } else if (event.key === "Escape") {
        if (cinema) setCinema(false);
        else {
          select(null);
          selectCve(null);
        }
      } else if (event.key.toLowerCase() === "c") {
        setCinema(!cinema);
      } else if (event.key.toLowerCase() === "j") {
        step(1);
      } else if (event.key.toLowerCase() === "k") {
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cinema, setCinema, select, selectCve, step]);

  const onHover = useCallback((incident: Incident | null, point: { x: number; y: number } | null) => {
    setHovered(incident && point ? { incident, x: point.x, y: point.y } : null);
  }, []);
  const onCluster = useCallback((incidents: Incident[], point: { x: number; y: number; lng: number; lat: number }) => {
    setHovered(null);
    setCluster({ incidents, ...point });
  }, []);
  const closeCluster = useCallback(() => setCluster(null), []);

  const panelOpen = Boolean(selected || selectedVuln);
  const sidebarMax = sidebarMaximum(viewport.w - (panelOpen ? PANEL : 0));
  const sidebarWidth = clampSidebarWidth(preferredSidebarWidth, sidebarMax);
  const sidebarInset = sidebarOpen ? sidebarWidth + 32 : 0;
  const patchInsetLeft = sidebarOpen ? sidebarInset : 16;
  const patchInsetRight = panelOpen ? PANEL : 0;
  const patchAvailableWidth = viewport.w - patchInsetLeft - patchInsetRight - 16;
  const patchDockFits = !mobile && !cinema && patchAvailableWidth >= PATCH_DOCK_MIN_WIDTH;
  // Keep the existing camera framing stable. Only tags reclaim the lower area when the dock folds.
  // A folded dock needs 40px for its restore pill, the 16px outer gutter and 16px breathing room.
  const tagBottom = patchDockFits ? (patchDockOpen ? DOCK : 72) : 16;
  // Space the panels cover, so the globe is framed in what is left (below the 68px nav).
  const padding = mobile
    ? {
        left: 0,
        right: 0,
        top: navHeight,
        bottom:
          panelOpen || sidebarOpen ? Math.max(0, Math.min(viewport.h - navHeight - 8, Math.round(viewport.h * (panelOpen || sheetOpen ? 0.8 : 0.52)))) : 0,
      }
    : {
        left: cinema ? 0 : sidebarInset,
        right: panelOpen && !cinema ? Math.min(PANEL, Math.max(0, viewport.w - sidebarInset - 160)) : 0,
        top: cinema ? 0 : navHeight,
        bottom: cinema ? 0 : 96,
      };

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-space"
      style={{ "--map-inset-left": `${sidebarInset}px`, "--map-top": `${navHeight + 8}px` } as React.CSSProperties}
    >
      <Suspense fallback={null}>
        <DeepLinks />
      </Suspense>
      {mapReady ? (
        <Globe incidents={filtered} outages={snapshot.outages} countryCounts={countryCounts} padding={padding} onHover={onHover} onCluster={onCluster} />
      ) : (
        <GlobePlaceholder />
      )}
      <AsciiAtlas />
      {/* Tags are desktop-only; on phones they were still laid out on every frame while hidden. */}
      {!mobile ? (
        <DataTags incidents={filtered} now={now} insetLeft={sidebarInset} insetRight={selectedId || selectedCve ? PANEL + 16 : 0} insetBottom={tagBottom} />
      ) : null}

      <div className={cn("pointer-events-none transition-opacity duration-500", cinema && "opacity-0")}>
        <div ref={topBar} className="absolute inset-x-0 top-0 z-30">
          <TopBar ticker={<CveTicker items={snapshot.fresh} generatedAt={snapshot.generatedAt} onSelect={selectCve} />} />
        </div>

        <MapSidebar
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          width={sidebarWidth}
          maximum={sidebarMax}
          onWidthChange={setSidebarWidth}
          sheetOpen={sheetOpen}
          onSheetToggle={() => setSheetOpen((open) => !open)}
          cinema={cinema}
        >
          <Story
            ref={omnibox}
            incidents={filtered}
            allIncidents={snapshot.incidents}
            incidentSummary={incidentData.summary}
            incidentDays={incidentData.days}
            vulns={vulns}
            trending={snapshot.trending}
            kev={snapshot.kev}
            fresh={snapshot.fresh}
            malware={snapshot.malware}
            outages={snapshot.outages}
            generatedAt={snapshot.generatedAt}
            onClose={() => setSidebarOpen(false)}
            onSearchFocus={(focused) => {
              if (focused && mobile) setSheetOpen(true);
            }}
          />
        </MapSidebar>

        {selected ? <IncidentPanel incident={selected} related={related} /> : null}
        {!selected && selectedVuln ? <CvePanel vuln={selectedVuln} /> : null}
        <PatchStrip
          insetLeft={patchInsetLeft}
          insetRight={patchInsetRight}
          availableWidth={patchAvailableWidth}
          onShowSidebar={() => setSidebarOpen(true)}
          open={patchDockOpen}
          onOpenChange={setPatchDockOpen}
          inactive={mobile || cinema}
        />
        <MapControls generatedAt={snapshot.generatedAt} feeds={snapshot.feeds} shiftForPanel={panelOpen} />
      </div>

      {hovered && !cinema && !cluster ? <HoverCard incident={hovered.incident} x={hovered.x} y={hovered.y} /> : null}
      {cluster && !cinema ? <ClusterMenu cluster={cluster} now={now} onClose={closeCluster} /> : null}
      {cinema ? <CinemaMode incidents={filtered} /> : null}
    </main>
  );
}
