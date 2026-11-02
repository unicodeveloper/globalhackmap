import "server-only";

import { z } from "zod";

import { aliasHint, linkedAliases } from "@/lib/runbook/facts";

const osvSchema = z.object({
  id: z.string(),
  aliases: z.array(z.string()).default([]),
  withdrawn: z.string().optional(),
  affected: z
    .array(
      z.object({
        package: z.object({ ecosystem: z.string(), name: z.string() }).optional(),
        versions: z.array(z.string()).default([]),
        ranges: z
          .array(
            z.object({
              type: z.string(),
              repo: z.string().optional(),
              events: z.array(
                z.object({
                  introduced: z.string().optional(),
                  fixed: z.string().optional(),
                  last_affected: z.string().optional(),
                  limit: z.string().optional(),
                }),
              ),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  references: z.array(z.object({ type: z.string(), url: z.string() })).default([]),
});

export type OsvRecord = z.infer<typeof osvSchema>;
/** `linked` lists the ecosystem advisories merged into `record`. */
export type OsvLookup = { status: "found"; record: OsvRecord; linked: string[] } | { status: "not-found" | "unavailable" | "withdrawn" };

const osvUrl = (id: string) => `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`;

/** Linked advisories that really are this CVE (they alias it back) and are not withdrawn. Failures are skipped. */
async function linkedRecords(cve: string, ids: string[]): Promise<OsvRecord[]> {
  const records = await Promise.all(
    linkedAliases(cve, ids).map(async (alias) => {
      try {
        const response = await fetch(osvUrl(alias), { signal: AbortSignal.timeout(8_000) });
        if (!response.ok) return null;
        const parsed = osvSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.withdrawn || parsed.data.id !== alias || !parsed.data.aliases.includes(cve)) return null;
        return parsed.data;
      } catch {
        return null;
      }
    }),
  );
  return records.filter((record) => record !== null);
}

function merged(base: OsvRecord, records: OsvRecord[]): OsvRecord {
  return {
    ...base,
    affected: [...new Map(records.flatMap((value) => value.affected).map((value) => [JSON.stringify(value), value])).values()],
    references: [...new Map(records.flatMap((value) => value.references).map((value) => [value.url, value])).values()],
  };
}

export async function lookupOsv(cve: string): Promise<OsvLookup> {
  try {
    const response = await fetch(osvUrl(cve), { signal: AbortSignal.timeout(12_000) });
    if (response.status === 404) {
      // Many CVEs have no OSV record under the CVE ID, only downstream ones (Bitnami, GHSA). OSV's 404
      // names those aliases, and they carry the release-version ranges the runbook would otherwise lack.
      const linked = await linkedRecords(cve, aliasHint(await response.json().catch(() => null)));
      return linked.length ? { status: "found", record: merged(linked[0], linked), linked: linked.map((record) => record.id) } : { status: "not-found" };
    }
    if (!response.ok) return { status: "unavailable" };
    const parsed = osvSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "unavailable" };
    const record = parsed.data;
    if (record.id !== cve && !record.aliases.includes(cve)) return { status: "unavailable" };
    if (record.withdrawn) return { status: "withdrawn" };

    // Converted CVE records often contain only Git ranges. Linked ecosystem
    // advisories supply the actual package names and release-version boundaries.
    const linked = await linkedRecords(cve, record.aliases);
    return { status: "found", record: merged(record, [record, ...linked]), linked: linked.map((value) => value.id) };
  } catch {
    return { status: "unavailable" };
  }
}
