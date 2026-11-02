"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import greatCircle from "@turf/great-circle";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import mapboxgl, { type GeoJSONSource, type Map as MapboxMap } from "mapbox-gl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { angularDistance, applyStyle, flyToIncident, globeCircle, tryStyle, useMapInstance } from "@/components/map/map-instance";
import { STATUS_COLOR } from "@/lib/format";
import type { Incident, Outage } from "@/lib/types";
import { useSituation } from "@/stores/situation";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

interface GlobeProps {
  incidents: Incident[];
  outages: Outage[];
  countryCounts: Record<string, number>;
  /** Screen space covered by panels, so the globe centres in what is left. */
  padding: { left: number; right: number; bottom: number; top: number };
  onHover?: (incident: Incident | null, point: { x: number; y: number } | null) => void;
  /** A click landed on several overlapping pins: offer them as a list rather than guessing. */
  onCluster?: (incidents: Incident[], point: { x: number; y: number; lng: number; lat: number }) => void;
}

/**
 * Pins within reach of the pointer, nearest first. The drawn dots are a few pixels wide, so the hit area
 * is a generous circle around the pointer instead: larger on touch screens, where a finger is the cursor.
 * Distances come from projecting the incidents directly: on the globe, Mapbox's box query drops some
 * features that are plainly under the pointer, which made stacked pins impossible to tell apart.
 */
function pinsNear(map: MapboxMap, incidents: Incident[], point: { x: number; y: number }, radius: number): { id: string; distance: number }[] {
  const center = map.getCenter();
  const hits: { id: string; distance: number }[] = [];
  for (const incident of incidents) {
    // Only the hemisphere facing the camera is drawn; a pin behind the limb projects onto the front.
    if (angularDistance(center.lng, center.lat, incident.lon, incident.lat) > 88) continue;
    const at = map.project([incident.lon, incident.lat]);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance <= radius) hits.push({ id: incident.id, distance });
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

function initialCenter(): [number, number] {
  // Face the visitor's side of the planet without asking for location: timezone offset -> longitude.
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  const lon = Math.max(-150, Math.min(150, offsetHours * 15));
  return [lon, 24];
}

/** Circle radius by zoom and severity, optionally scaled by an expression (used for the arrival animation). */
function radiusExpr(base: number, scale: unknown = 1): number {
  const sev = ["+", 0.8, ["*", 0.35, ["get", "severity"]]];
  return ["interpolate", ["linear"], ["zoom"], 1, ["*", base, sev, scale], 6, ["*", base * 2.2, sev, scale]] as unknown as number;
}

const SIZED_LAYERS: [string, number][] = [
  ["incident-halo", 5.5],
  ["incident-core", 2.1],
];

function incidentFeatures(incidents: Incident[], now: number): FeatureCollection<Point> {
  // rank orders the arrival animation: oldest first, so the newest land last.
  const order = new Map([...incidents].sort((a, b) => a.date.localeCompare(b.date)).map((incident, index) => [incident.id, index]));
  const count = Math.max(1, incidents.length - 1);
  return {
    type: "FeatureCollection",
    features: incidents.map((incident) => ({
      type: "Feature",
      id: incident.id,
      geometry: { type: "Point", coordinates: [incident.lon, incident.lat] },
      properties: {
        id: incident.id,
        victim: incident.victim,
        status: incident.status,
        severity: incident.severity,
        color: STATUS_COLOR[incident.status],
        hollow: incident.status === "claimed" ? 1 : 0,
        fresh: now - Date.parse(incident.date) < 36 * 3600_000 ? 1 : 0,
        rank: Number(((order.get(incident.id) ?? 0) / count).toFixed(4)),
      },
    })),
  };
}

function arcFeatures(selected: Incident | undefined, incidents: Incident[]): FeatureCollection<LineString> {
  if (!selected) return EMPTY as FeatureCollection<LineString>;
  const related = incidents.filter(
    (other) =>
      other.id !== selected.id &&
      ((selected.actor && other.actor && other.actor.toLowerCase() === selected.actor.toLowerCase()) ||
        (selected.cves.length > 0 && other.cves.some((cve) => selected.cves.includes(cve)))),
  );
  const features: Feature<LineString>[] = [];
  for (const other of related.slice(0, 40)) {
    try {
      const line = greatCircle([selected.lon, selected.lat], [other.lon, other.lat], { npoints: 64 });
      if (line.geometry.type === "LineString") features.push({ ...line, properties: { id: other.id } } as Feature<LineString>);
    } catch {
      // Antipodal points have no unique great circle; skip them.
    }
  }
  return { type: "FeatureCollection", features };
}

function outageFeatures(outages: Outage[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: outages.map((outage) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [outage.lon, outage.lat] },
      properties: { id: outage.id, country: outage.country ?? "", title: outage.title },
    })),
  };
}

// Opaque through mid zoom, where it hides Standard's pale desert landcover, then hands over to streets.
const GLOBE_RASTER_OPACITY = ["interpolate", ["linear"], ["zoom"], 0, 1, 5.8, 0.96, 7.6, 0] as unknown as number;

function addLayers(map: MapboxMap) {
  // Neutral relief leaves colour to incident status while keeping terrain readable.
  map.addSource("relief", {
    type: "raster",
    tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg"],
    tileSize: 256,
    maxzoom: 8,
    attribution: "Imagery: NASA Blue Marble, Black Marble",
  });
  map.addLayer({
    id: "relief",
    type: "raster",
    source: "relief",
    slot: "bottom",
    paint: {
      "raster-opacity": GLOBE_RASTER_OPACITY,
      "raster-emissive-strength": 1,
      "raster-brightness-min": 0.04,
      "raster-brightness-max": 0.6,
      "raster-saturation": -1,
      "raster-contrast": 0.05,
    },
  });
  // NASA Black Marble city lights on top. Dark pixels map to transparent, so only the lights land on the relief.
  map.addSource("night-lights", {
    type: "raster",
    tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"],
    tileSize: 256,
    maxzoom: 8,
  });
  map.addLayer({
    id: "night-lights",
    type: "raster",
    source: "night-lights",
    slot: "bottom",
    paint: {
      "raster-opacity": GLOBE_RASTER_OPACITY,
      "raster-emissive-strength": 1,
      "raster-color-mix": [0.2126, 0.7152, 0.0722, 0],
      "raster-color-range": [0, 1],
      "raster-color": [
        "interpolate",
        ["linear"],
        ["raster-value"],
        0,
        "rgba(0,0,0,0)",
        0.1,
        "rgba(240,240,240,0)",
        0.3,
        "rgba(240,240,240,0.35)",
        0.6,
        "rgba(240,240,240,0.6)",
        1,
        "rgba(250,250,250,0.8)",
      ],
    },
  });

  map.addSource("countries", { type: "vector", url: "mapbox://mapbox.country-boundaries-v1" });
  map.addLayer({
    id: "country-heat",
    type: "fill",
    source: "countries",
    "source-layer": "country_boundaries",
    slot: "bottom",
    filter: ["any", ["==", ["get", "worldview"], "all"], ["in", "US", ["get", "worldview"]]],
    paint: { "fill-color": "#ff4a3d", "fill-opacity": 0, "fill-emissive-strength": 1 },
  });
  // A red hairline carries the heat; a strong fill would muddy the terrain beneath it.
  map.addLayer({
    id: "country-heat-line",
    type: "line",
    source: "countries",
    "source-layer": "country_boundaries",
    slot: "bottom",
    filter: ["any", ["==", ["get", "worldview"], "all"], ["in", "US", ["get", "worldview"]]],
    paint: { "line-color": "#ff6a5c", "line-width": 0.8, "line-opacity": 0, "line-emissive-strength": 1 },
  });
  map.addLayer({
    id: "country-outage",
    type: "line",
    source: "countries",
    "source-layer": "country_boundaries",
    slot: "middle",
    filter: ["in", ["get", "iso_3166_1"], ["literal", []]],
    paint: {
      "line-color": "#5ec8ff",
      "line-width": 1.2,
      "line-dasharray": [2, 2],
      "line-opacity": 0.8,
      "line-emissive-strength": 1,
    },
  });

  map.addSource("arcs", { type: "geojson", data: EMPTY, lineMetrics: true });
  map.addLayer({
    id: "arcs",
    type: "line",
    source: "arcs",
    slot: "top",
    layout: { "line-cap": "round" },
    paint: {
      "line-width": 1.6,
      "line-emissive-strength": 1,
      "line-color": "#dedede",
      "line-opacity": 0.65,
      "line-trim-offset": [0, 0],
    },
  });

  map.addSource("outages", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "outage-ring",
    type: "circle",
    source: "outages",
    slot: "top",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 7, 5, 14],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": "#5ec8ff",
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0.7,
      "circle-emissive-strength": 1,
      "circle-pitch-alignment": "map",
    },
  });

  map.addSource("incidents", { type: "geojson", data: EMPTY, promoteId: "id" });
  const sizeBySeverity = (base: number) => radiusExpr(base);

  map.addLayer({
    id: "incident-halo",
    type: "circle",
    source: "incidents",
    slot: "top",
    paint: {
      "circle-radius": sizeBySeverity(5.5),
      "circle-color": ["get", "color"],
      "circle-opacity": ["case", ["==", ["get", "hollow"], 1], 0.05, 0.16],
      "circle-blur": 0.9,
      "circle-emissive-strength": 1,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "incident-pulse",
    type: "circle",
    source: "incidents",
    slot: "top",
    filter: ["==", ["get", "fresh"], 1],
    paint: {
      "circle-radius": sizeBySeverity(4),
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.2,
      "circle-stroke-opacity": 0.6,
      "circle-emissive-strength": 1,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "incident-core",
    type: "circle",
    source: "incidents",
    slot: "top",
    paint: {
      "circle-radius": sizeBySeverity(2.1),
      "circle-color": ["case", ["==", ["get", "hollow"], 1], "rgba(5,5,5,0.6)", ["get", "color"]],
      "circle-stroke-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#ffffff",
        ["boolean", ["feature-state", "hover"], false],
        "#ffffff",
        ["==", ["get", "hollow"], 1],
        ["get", "color"],
        "rgba(5,5,5,0.85)",
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        2,
        ["boolean", ["feature-state", "hover"], false],
        2.2,
        ["==", ["get", "hollow"], 1],
        1.2,
        0.8,
      ],
      "circle-emissive-strength": 1,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "incident-selected",
    type: "circle",
    source: "incidents",
    slot: "top",
    filter: ["==", ["get", "id"], ""],
    paint: {
      "circle-radius": sizeBySeverity(7),
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": "#f2f2f2",
      "circle-stroke-width": 1.4,
      "circle-emissive-strength": 1,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "incident-labels",
    type: "symbol",
    source: "incidents",
    slot: "top",
    minzoom: 4.2,
    layout: {
      "text-field": ["get", "victim"],
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 2.2, 10, 6, 13],
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-max-width": 10,
      "text-optional": true,
      "text-letter-spacing": 0.02,
    },
    paint: {
      "text-color": "#f2f2f2",
      "text-halo-color": "rgba(7,8,10,0.92)",
      "text-halo-width": 1.4,
      "text-emissive-strength": 1,
    },
  });
}

export function Globe({ incidents, outages, countryCounts, padding, onHover, onCluster }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const readyRef = useRef(false);
  const interactingRef = useRef(false);
  const lastSelectedRef = useRef<string | null>(null);
  const setMap = useMapInstance((s) => s.setMap);
  const setReady = useMapInstance((s) => s.setReady);
  const ready = useMapInstance((s) => s.ready);
  const selectedId = useSituation((s) => s.selectedId);
  const select = useSituation((s) => s.select);
  const cinema = useSituation((s) => s.cinema);
  const layers = useSituation((s) => s.layers);
  const hoverRef = useRef(onHover);
  const clusterRef = useRef(onCluster);
  const incidentsRef = useRef(incidents);
  const layersRef = useRef(layers);
  const byId = useMemo(() => new Map(incidents.map((incident) => [incident.id, incident])), [incidents]);
  const byIdRef = useRef(byId);
  // Map event handlers read the latest props through refs, synced after each commit.
  useLayoutEffect(() => {
    hoverRef.current = onHover;
    clusterRef.current = onCluster;
    incidentsRef.current = incidents;
    layersRef.current = layers;
    byIdRef.current = byId;
  });

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      config: {
        basemap: {
          lightPreset: "night",
          theme: "faded",
          showPointOfInterestLabels: false,
          showTransitLabels: false,
          showRoadLabels: false,
          showPlaceLabels: true,
          show3dObjects: true,
          colorLand: "#191919",
          colorWater: "#080808",
          colorAdminBoundaries: "#454545",
          colorPlaceLabels: "#a3a3a3",
          colorGreenspace: "#151515",
        },
      },
      projection: "globe",
      center: initialCenter(),
      zoom: mobile ? 0.85 : 1.32,
      minZoom: 0.6,
      maxZoom: 16,
      attributionControl: false,
      logoPosition: "top-left",
      antialias: true,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "top-left");
    mapRef.current = map;
    setMap(map);
    // Observe the actual container as well as window resize events, including breakpoint changes.
    const resizeObserver = new ResizeObserver(() => {
      const container = containerRef.current;
      const canvas = map.getCanvas();
      if (container && (canvas.clientWidth !== container.clientWidth || canvas.clientHeight !== container.clientHeight)) map.resize();
    });
    resizeObserver.observe(containerRef.current);
    // Exposed for development and for the ?still screenshot mode, which browser tests drive.
    if (process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("still")) {
      (window as unknown as { __map: MapboxMap }).__map = map;
    }

    map.on("style.load", () => {
      // The faded theme keeps true blacks; monochrome's colour grade lifts space to grey.
      map.setFog({
        color: "#131313",
        "high-color": "#252525",
        "horizon-blend": 0.04,
        "space-color": "#050505",
        "star-intensity": 0.12,
      });
      addLayers(map);
      readyRef.current = true;
      setReady(true);
    });

    const reach = window.matchMedia("(pointer: coarse)").matches ? 24 : 14;
    let hoveredPin: string | null = null;
    const setHovered = (id: string | null) => {
      if (hoveredPin === id) return;
      tryStyle(() => {
        if (hoveredPin) map.setFeatureState({ source: "incidents", id: hoveredPin }, { hover: false });
        if (id) map.setFeatureState({ source: "incidents", id }, { hover: true });
      });
      hoveredPin = id;
    };
    map.on("click", (event) => {
      const hits = layersRef.current.incidents ? pinsNear(map, incidentsRef.current, event.point, reach) : [];
      // Pins stacked within a few pixels of each other cannot be told apart by aim: list them.
      const stacked = hits.filter((hit) => hit.distance - (hits[0]?.distance ?? 0) <= 8);
      if (stacked.length > 1 && clusterRef.current) {
        const found = stacked.map((hit) => byIdRef.current.get(hit.id)).filter((incident): incident is Incident => Boolean(incident));
        clusterRef.current(found, { x: event.point.x, y: event.point.y, lng: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      select(hits[0]?.id ?? null);
    });
    map.on("mousemove", (event) => {
      const id = layersRef.current.incidents ? (pinsNear(map, incidentsRef.current, event.point, reach)[0]?.id ?? null) : null;
      map.getCanvas().style.cursor = id ? "pointer" : "";
      setHovered(id);
      const incident = id ? byIdRef.current.get(id) : undefined;
      hoverRef.current?.(incident ?? null, incident ? { x: event.point.x, y: event.point.y } : null);
    });
    map.on("mouseout", () => {
      setHovered(null);
      hoverRef.current?.(null, null);
    });

    const markInteracting = () => {
      interactingRef.current = true;
    };
    const release = () => {
      window.setTimeout(() => {
        interactingRef.current = false;
      }, 4000);
    };
    map.on("mousedown", markInteracting);
    map.on("touchstart", markInteracting);
    map.on("wheel", markInteracting);
    map.on("mouseup", release);
    map.on("touchend", release);
    map.on("wheel", release);

    return () => {
      resizeObserver.disconnect();
      readyRef.current = false;
      setReady(false);
      setMap(null);
      map.remove();
      mapRef.current = null;
    };
  }, [select, setMap, setReady]);

  // Hero framing: the globe is fitted to the free space (right of the panel, below the nav) and
  // returns there when a dossier closes. Once the visitor zooms by hand we leave the camera alone.
  const userZoomedRef = useRef(false);
  const calibrationRef = useRef<number | null>(null);
  const paddingRef = useRef(padding);
  useLayoutEffect(() => {
    paddingRef.current = padding;
  });

  const fittedZoom = useCallback((map: MapboxMap) => {
    const canvas = map.getCanvas();
    const p = paddingRef.current;
    const availW = canvas.clientWidth - p.left - p.right;
    const availH = canvas.clientHeight - p.top - p.bottom;
    const target = Math.max(110, Math.min(440, availH * 0.37, availW * 0.4));
    if (calibrationRef.current === null && map.getPitch() < 1) {
      const { r } = globeCircle(map);
      if (r > 0) calibrationRef.current = r / 2 ** map.getZoom();
    }
    const k = calibrationRef.current;
    return k ? Math.log2(target / k) : map.getZoom();
  }, []);

  const previousLeftPadding = useRef(padding.left);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // Leaving cinema also changes the padding; the fly-home below replaces this ease a frame later.
    const sidebarChanged = previousLeftPadding.current !== padding.left;
    previousLeftPadding.current = padding.left;
    // Mapbox owns this element, so keep its credits clear of the sidebar and its reopen control.
    const credits = map.getContainer().querySelector<HTMLElement>(".mapboxgl-ctrl-top-left");
    if (credits) {
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      credits.style.left = `${mobile ? 0 : Math.max(0, padding.left - 8)}px`;
      credits.style.top = `${mobile ? 112 : padding.left ? 66 : 116}px`;
    }
    const state = useSituation.getState();
    const hero = !state.selectedId && !state.selectedCve && !state.cinema && !userZoomedRef.current;
    map.easeTo({
      padding: { left: padding.left, right: padding.right, bottom: padding.bottom, top: padding.top },
      ...(hero ? { zoom: fittedZoom(map), pitch: 0 } : {}),
      // Follow the resize handle immediately instead of repeatedly restarting a camera animation.
      duration: sidebarChanged || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700,
    });
  }, [padding.left, padding.right, padding.bottom, padding.top, ready, fittedZoom]);

  // Leaving cinema mode always returns to the hero framing, whatever the visitor did before.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let frame = 0;
    const unsubscribe = useSituation.subscribe((state, prev) => {
      if (!prev.cinema || state.cinema) return;
      // Next frame: the store notifies before React commits, and cinema's cleanup stops the camera.
      frame = requestAnimationFrame(() => {
        userZoomedRef.current = false;
        map.stop();
        const p = paddingRef.current;
        map.flyTo({
          padding: { left: p.left, right: p.right, bottom: p.bottom, top: p.top },
          zoom: fittedZoom(map),
          pitch: 0,
          bearing: 0,
          duration: 2200,
          curve: 1.4,
          essential: true,
        });
      });
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [ready, fittedZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const onZoomStart = (event: object) => {
      if ("originalEvent" in event && event.originalEvent) userZoomedRef.current = true;
    };
    const onResize = () => {
      const state = useSituation.getState();
      if (!userZoomedRef.current && !state.selectedId && !state.cinema) map.jumpTo({ zoom: fittedZoom(map) });
    };
    map.on("zoomstart", onZoomStart);
    window.addEventListener("resize", onResize);
    return () => {
      map.off("zoomstart", onZoomStart);
      window.removeEventListener("resize", onResize);
    };
  }, [ready, fittedZoom]);

  // Push incident data whenever the filtered set changes. The first load drops the pins in, oldest first.
  const arrivedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("incidents") as GeoJSONSource | undefined)?.setData(incidentFeatures(incidents, Date.now()));
    if (arrivedRef.current || !incidents.length) return;
    arrivedRef.current = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(window.location.search).has("still");
    if (reduced) return;
    const start = performance.now();
    const duration = 2200;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      // Each pin grows over the last 30% of its own slot; rank spreads the slots over the run.
      const scale = ["min", 1, ["max", 0, ["/", ["-", t * 1.3, ["*", ["get", "rank"], 1]], 0.3]]];
      tryStyle(() => {
        for (const [id, base] of SIZED_LAYERS)
          if (map.getLayer(id)) map.setPaintProperty(id, "circle-radius", t < 1 ? radiusExpr(base, scale) : radiusExpr(base));
      });
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [incidents, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("outages") as GeoJSONSource | undefined)?.setData(outageFeatures(outages));
    const isos = outages.map((outage) => outage.country).filter(Boolean);
    return applyStyle(map, () => map.setFilter("country-outage", ["in", ["get", "iso_3166_1"], ["literal", isos]]));
  }, [outages, ready]);

  // Country heat: share of incidents, capped so one country does not wash out the rest.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const entries = Object.entries(countryCounts).filter(([, count]) => count > 0);
    if (!entries.length)
      return applyStyle(map, () => {
        map.setPaintProperty("country-heat", "fill-opacity", 0);
        map.setPaintProperty("country-heat-line", "line-opacity", 0);
      });
    const max = Math.max(...entries.map(([, count]) => count));
    const byCount = (base: number, range: number) => {
      const match: unknown[] = ["match", ["get", "iso_3166_1"]];
      for (const [iso, count] of entries) match.push(iso, Number((base + range * Math.sqrt(count / max)).toFixed(3)));
      match.push(0);
      return match as unknown as number;
    };
    return applyStyle(map, () => {
      map.setPaintProperty("country-heat", "fill-opacity", byCount(0.03, 0.09));
      map.setPaintProperty("country-heat-line", "line-opacity", byCount(0.3, 0.5));
    });
  }, [countryCounts, ready]);

  // Layer toggles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const set = (ids: string[], on: boolean) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
    return applyStyle(map, () => {
      set(["incident-halo", "incident-pulse", "incident-core", "incident-selected", "incident-labels"], layers.incidents);
      set(["country-heat", "country-heat-line"], layers.countries);
      set(["country-outage", "outage-ring"], layers.outages);
      set(["arcs"], layers.arcs);
    });
  }, [layers, ready]);

  // Selection: highlight, fly, and draw related arcs (same actor or same CVE).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const previous = lastSelectedRef.current;
    if (previous && previous !== selectedId) map.setFeatureState({ source: "incidents", id: previous }, { selected: false });
    lastSelectedRef.current = selectedId;
    const cancelFilter = applyStyle(map, () => map.setFilter("incident-selected", ["==", ["get", "id"], selectedId ?? ""]));
    const selected = selectedId ? byIdRef.current.get(selectedId) : undefined;
    if (selectedId) map.setFeatureState({ source: "incidents", id: selectedId }, { selected: true });
    (map.getSource("arcs") as GeoJSONSource | undefined)?.setData(arcFeatures(selected, incidentsRef.current));
    if (selected && !cinema) flyToIncident(map, selected.lon, selected.lat, { zoom: Math.max(map.getZoom(), 3.4), pitch: 25 });
    if (!selected && previous && !cinema) {
      userZoomedRef.current = false;
      map.flyTo({ zoom: fittedZoom(map), pitch: 0, bearing: 0, duration: 1800, curve: 1.3, essential: true });
    }
    if (selected) {
      // Draw the arcs in.
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - start) / 1400));
        if (!map.getLayer("arcs")) return;
        tryStyle(() => map.setPaintProperty("arcs", "line-trim-offset", [easeOut(t), 1]));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    return cancelFilter;
  }, [selectedId, ready, cinema, fittedZoom]);

  // Pulse fresh incidents and slowly spin the globe when nobody is touching it.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    // ?still=1 freezes motion: for screenshots, share-card capture and anyone who prefers it.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(window.location.search).has("still");
    // Nothing pulses or spins under reduced motion, so do not run a loop every frame.
    if (reduced) return;
    let frame = 0;
    let last = performance.now();
    let lastPaint = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(100, now - last);
      last = now;
      if (document.hidden) return;
      if (now - lastPaint > 40 && map.getLayer("incident-pulse")) {
        lastPaint = now;
        const phase = (now % 2200) / 2200;
        tryStyle(() => {
          map.setPaintProperty("incident-pulse", "circle-stroke-opacity", 0.75 * (1 - phase));
          map.setPaintProperty("incident-pulse", "circle-radius", [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            ["*", 4 + phase * 9, ["+", 0.8, ["*", 0.35, ["get", "severity"]]]],
            6,
            ["*", 9 + phase * 18, ["+", 0.8, ["*", 0.35, ["get", "severity"]]]],
          ] as unknown as number);
        });
      }
      const selected = useSituation.getState().selectedId;
      const cinemaOn = useSituation.getState().cinema;
      if (!interactingRef.current && !selected && !cinemaOn && map.getZoom() < 3 && !map.isMoving()) {
        const center = map.getCenter();
        center.lng -= (dt / 1000) * 2.2;
        map.setCenter(center);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-label="Globe of cyber incidents" role="application" />;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
