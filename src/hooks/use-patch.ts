"use client";

import { useEffect, useState } from "react";

import type { Explainer, PatchItem } from "@/lib/types";

let patchRequest: Promise<PatchItem[]> | null = null;
const explainerRequests = new Map<string, Promise<Explainer | null>>();

/** The patch-now list, fetched once per page load and shared by every component that asks. */
export function usePatchList(): PatchItem[] | null | undefined {
  const [items, setItems] = useState<PatchItem[] | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    patchRequest ??= fetch("/api/patch")
      .then((res) => (res.ok ? (res.json() as Promise<{ items: PatchItem[] }>) : { items: [] }))
      .then((json) => json.items)
      .catch(() => {
        patchRequest = null;
        return [];
      });
    void patchRequest.then((list) => live && setItems(list.length ? list : null));
    return () => {
      live = false;
    };
  }, []);
  return items;
}

/** The plain-English explainer for one CVE: from the patch list when it is there, otherwise on demand. */
export function useExplainer(cve: string): Explainer | null | undefined {
  const list = usePatchList();
  const fromList = list?.find((item) => item.explained && item.cves[0] === cve);
  const [fetched, setFetched] = useState<{ cve: string; value: Explainer | null } | null>(null);
  useEffect(() => {
    // Fetch straight away rather than waiting on the list: both are cached server-side.
    if (fromList) return;
    let live = true;
    let request = explainerRequests.get(cve);
    if (!request) {
      request = fetch(`/api/explain/${cve}`)
        .then((res) => (res.ok ? (res.json() as Promise<Explainer>) : null))
        .catch(() => null);
      explainerRequests.set(cve, request);
    }
    void request.then((value) => live && setFetched({ cve, value }));
    return () => {
      live = false;
    };
  }, [cve, fromList]);
  if (fromList) return fromList;
  return fetched?.cve === cve ? fetched.value : undefined;
}
