<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Global Hack Map

- pnpm only. `pnpm dev` serves on port 3000; `pnpm exec tsc --noEmit` and `pnpm exec eslint src` must stay clean.
- Read `DESIGN.md` before touching UI and `PRODUCT.md` for who it is for. Phosphor icons only; no em dashes in copy.
- Honesty rules are product rules: keep confirmed, reported and claimed distinct; never present a claim as a breach or absence of data as safety.
- Secrets live in `.env.local` (git-ignored). Never log tokens or return upstream error messages to clients.
- Shared Valyu spend is cached and rate limited (`src/lib/http/rate-limit.ts`, `"use cache: remote"`); keep new paid calls behind both.

## Caching (Cache Components)

`cacheComponents` and `partialPrefetching` are on. The rules that keep builds green and API spend bounded:

- Cache with `"use cache"` plus an explicit `cacheLife` profile from `next.config.ts` (`snapshot`, `feed`, `lookup`, `answer`, `paid`). Never `unstable_cache`, never `revalidate`/`dynamic`/`runtime` segment exports.
- Paid or rate-limited work (Valyu calls, NVD, Wikidata) and the snapshot use `"use cache: remote"` so every serverless instance shares one entry.
- A cached function must never reject: during prerendering a rejected `use cache` call fails the page even when the caller catches it. Return a `Fetched` result (`src/lib/fetched.ts`) or `null`, and call `cacheLife("minutes")` on the failure path so it retries soon instead of being pinned.
- Pages with params or search params stay synchronous and await them inside a `<Suspense>` child; render date-dependent markup inside a `use cache` scope. `generateStaticParams` must return at least one entry (`src/lib/static-params.ts`).
- No `Date.now()`, `new Date()` or `Math.random()` while rendering anything that prerenders, client components included: use the snapshot's `generatedAt`, `useNow` (`src/lib/perf/use-now.ts`), or move the read into an effect.
- Builds use one worker (`experimental.cpus: 1`) so the pipeline runs once per build; the cold pipeline is time-budgeted to stay under the 50s prerender limit for a cache fill. Every snapshot feed has a ceiling (`beforeDeadline`, `src/lib/fetched.ts`), and a snapshot with three or more feeds down is cached for minutes, not the full refresh.
- The dev server aborts a cache fill that stays silent for 10s (its hang probe), so `snapshot.ts` uses shorter budgets in development. Expect fewer incidents in `next dev` than in a build.
- Article extractions are paid for once and kept for a month. When `ARTICLE_SCHEMA` changes meaning, bump `EXTRACTION_VERSION` in `src/lib/sources/incidents.ts` so cached extractions are read again.
- CVE lookups go to CVE.org first (`getCveRecord`), then NVD. NVD without `NVD_API_KEY` allows 5 requests per 30 seconds, so keep per-CVE calls off NVD.
