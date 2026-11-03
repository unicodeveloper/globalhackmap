"use client";

import { create } from "zustand";

import type { IncidentStatus, IncidentType } from "@/lib/types";
import { useAccess } from "@/stores/access";
import { INCIDENT_STATUSES } from "@/lib/incident-view";

export type TimeWindow = "24h" | "7d" | "30d";
export type RailTab = "incidents" | "exploited" | "malware" | "outages";

interface SituationState {
  selectedId: string | null;
  selectedCve: string | null;
  hoveredId: string | null;
  window: TimeWindow;
  statuses: Set<IncidentStatus>;
  types: Set<IncidentType> | null;
  country: string | null;
  tab: RailTab;
  cinema: boolean;
  layers: { incidents: boolean; countries: boolean; outages: boolean; arcs: boolean };
  railOpen: boolean;
  select: (id: string | null) => void;
  selectCve: (cve: string | null) => void;
  hover: (id: string | null) => void;
  setWindow: (window: TimeWindow) => void;
  toggleStatus: (status: IncidentStatus) => void;
  setCountry: (country: string | null) => void;
  setTab: (tab: RailTab) => void;
  setCinema: (on: boolean) => void;
  toggleLayer: (layer: keyof SituationState["layers"]) => void;
  setRailOpen: (open: boolean) => void;
}

export const useSituation = create<SituationState>((set, get) => ({
  selectedId: null,
  selectedCve: null,
  hoveredId: null,
  window: "7d",
  statuses: new Set<IncidentStatus>(INCIDENT_STATUSES),
  types: null,
  country: null,
  // Vulnerabilities first: what to patch is the question most visitors arrive with.
  tab: "exploited",
  cinema: false,
  layers: { incidents: true, countries: true, outages: true, arcs: true },
  railOpen: true,
  // Opening a dossier checks the free allowance: a few a day without an account, then Global Hack Map asks for a Valyu sign-in.
  select: (id) => {
    if (id && id !== get().selectedId && !useAccess.getState().allowOpen(`i:${id}`)) return;
    set({ selectedId: id, selectedCve: null });
  },
  selectCve: (cve) => {
    if (cve && cve !== get().selectedCve && !useAccess.getState().allowOpen(`cve:${cve}`)) return;
    set({ selectedCve: cve, selectedId: null });
  },
  hover: (id) => set({ hoveredId: id }),
  setWindow: (window) => set({ window }),
  toggleStatus: (status) =>
    set((state) => {
      const next = new Set(state.statuses);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return { statuses: next };
    }),
  setCountry: (country) => set({ country }),
  setTab: (tab) => set({ tab }),
  setCinema: (cinema) => set({ cinema, selectedCve: null }),
  toggleLayer: (layer) => set((state) => ({ layers: { ...state.layers, [layer]: !state.layers[layer] } })),
  setRailOpen: (railOpen) => set({ railOpen }),
}));

export const WINDOW_MS: Record<TimeWindow, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};
