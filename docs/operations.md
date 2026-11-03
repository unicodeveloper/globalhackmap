# Production protection and upstream API audit

Reviewed 3 November 2026. This audit covers runtime integrations in the repository. Local environment checks confirmed Mapbox is configured; NVD, GitHub, Valyu, Redis and account-mode OAuth settings were absent locally. Production environment settings were not inspected or changed. The supplied Vercel Firewall dashboard screenshot shows **System Mitigations active, zero custom rules, Bot Protection inactive and no enforced rules**. Baseline protection is running; the route-specific edge rules below remain to be configured.

## Rate limiting

The application uses the official `@upstash/redis` and `@upstash/ratelimit` packages. One Redis database must be shared across all serving instances and regions. Use its primary endpoint, rather than independent regional databases. Keys are HMAC-hashed; raw IP addresses, questions and pasted manifests are not stored by the limiter. Analytics and process-local allow/block caches are disabled for the distributed counters.

On Vercel, identity comes from `x-vercel-forwarded-for`, which the platform supplies. Alternate incoming IP headers are ignored. IPv6 spellings are canonicalised. Missing/invalid identity shares an `unknown` bucket rather than receiving unlimited access. Outside Vercel, the reverse proxy must overwrite the forwarded IP headers and prevent direct access to the origin.

Limits use fixed windows. Two adjacent windows can admit a boundary burst; these are not exact rolling-window limits. Separate minute/hour limits reduce sustained abuse. Corporate NATs share an allowance, and multiple IPs can bypass any per-IP policy; deployment-wide shared-key budgets address that separately.

| Operation                                      | Per-IP application limit                                            |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| All API requests, including logo requests      | 180/minute                                                          |
| Brief requests                                 | 6/minute and 30/hour                                                |
| Anonymous shared-key briefs, additional limit  | 12/hour                                                             |
| Create research                                | 2/minute and 3/hour                                                 |
| Stack checks                                   | 10/minute and 60/hour, shared between the web endpoint and MCP tool |
| MCP transport requests                         | 30/minute and 300/hour                                              |
| Research status polling                        | 30/minute                                                           |
| CVE explainers                                 | 30/minute, shared across CVE IDs                                    |
| OAuth token exchanges                          | 10/minute                                                           |
| Dynamic CVE, incident, country and fix lookups | 30/minute and 180/hour, shared across IDs and route types           |

Quotas reject before upstream work. Changing query strings or resource IDs does not create a new allowance. Authenticated users are also limited. The homepage and static assets do not make a Redis request through Proxy. Cron routes retain their secret authentication and are excluded from visitor quotas.

Request-quota exhaustion returns 429 with `Retry-After` and `Cache-Control: private, no-store`. Limiter failure, timeout or missing production configuration returns 503 with the same non-cacheable retry guidance. The Upstash library's timeout result normally permits the request; the application explicitly rejects `reason: "timeout"`. Development alone has bounded in-memory counters. If a shared-key operation budget is exhausted inside a cache fill, that feature follows its normal source-unavailable path instead of making the paid call.

### Shared-key operation budgets

Reservations run immediately before a shared-key operation, inside cache-fill work, so cached results do not consume another reservation. Scheduled research also reserves capacity. Signed-in users' own-credit requests are separately protected by visitor request limits.

| Shared-key operation          | Per fixed hour | Per fixed day |
| ----------------------------- | -------------: | ------------: |
| Answers, including explainers |            400 |         1,500 |
| Searches                      |            120 |           600 |
| Article extraction calls      |            300 |         2,000 |
| Research task creation        |             30 |            60 |

These are operation counts, **not dollar caps**. Prices and work vary, in-flight work may finish after rejection starts, and SDK retries can create extra upstream attempts. Configure provider billing controls too. Defaults live in `src/lib/http/paid-budget.ts`; review them against the actual daily budget before enabling shared paid features. Reservations are not refunded after upstream failure, which conservatively bounds retries.

### Required Vercel setup

1. Connect an Upstash Redis database through Vercel Marketplace, or create one in Upstash. The code accepts `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or the integration-provided `KV_REST_API_URL` + `KV_REST_API_TOKEN`. No duplicate variables are needed. If either explicit `UPSTASH_*` variable exists, that complete pair takes precedence, with no mixing between databases. Do not use a read-only Redis token: the official limiter uses scripts and writes.
2. Ensure the deployment supplies the remote cache used by `use cache: remote`. Redis rate limiting does not itself configure Next's remote cache.
3. In the project's **Firewall**, add per-IP edge rules. Suggested initial ceilings, intentionally above the application quotas:
   - `/api/` requests: 600/minute.
   - POST `/api/brief`: 10/minute.
   - POST `/api/research`: 3/minute.
   - POST `/api/check`: 20/minute.
   - `/api/mcp`: 60/minute.
   - CVE/incident/country/fix lookup pages: 60/minute.
4. Keep authenticated `/api/cron/` jobs outside visitor rules. Handlers still verify `CRON_SECRET`; never bypass based on a User-Agent string.
5. Apply managed bot protection to suspicious **browser page** traffic where appropriate. Do not put browser challenges on MCP or JSON API routes: legitimate server-to-server clients cannot solve them. Use rate-limit/deny responses there. Do not blanket-block the agent clients this product is intended to support.
6. Review and publish the rules, then inspect 429 rates and real mobile/NAT usage. Firewall rate limiting and rule counts depend on the Vercel plan and can incur charges. Vercel's regional counters are an edge shield, not a globally exact budget. Redis is the cross-instance quota source.
7. Set Vercel spending controls/alerts and provider billing alerts, and URL-restrict the Mapbox public token. Check a production canary for ordinary browsing, OAuth, stack checks, MCP and Retry-After behavior before directing launch traffic to it.

### Dashboard rule settings

Open **Project → Firewall → Configure / Add New → New Rule**. For each rate rule, choose **Rate Limit**, **Fixed Window**, counting key **IP**, time window **60 seconds**, and action **Default (429)**. Save the rule, review changes and publish them. Log mode can be used initially to inspect matching traffic, but it does not enforce the limit.

Current documented plan limits allow **one rate-limit rule on Hobby** and **40 on Pro**. On Hobby, use the single general rule: path starts with `/api/`, excluding `/api/cron/`, at **600 requests per IP per minute**. The application still applies its stricter Redis-backed endpoint quotas.

On Pro, add the endpoint-specific rules listed above. Exclude those specialized paths from the general API rule so overlapping rules do not depend on evaluation order. Match the research creation rule to the exact `/api/research` path with method POST, so it does not throttle `/api/research/<id>` polling as task creation.

For **Bot Management → Bot Protection**, begin with **Log** to inspect false positives. A global JavaScript challenge can break legitimate non-browser API and MCP clients. Only enable Challenge after confirming an appropriate browser-page scope or narrowly targeted managed-rule exception; do not use an indiscriminate bypass that also skips the rate-limit rules. Keep intended agent clients usable rather than blanket-blocking automated clients. Baseline system mitigations remain enabled.

The user has since connected Upstash through Vercel; the supplied environment-variable screenshot shows `KV_REST_API_URL` and `KV_REST_API_TOKEN` configured for Production and Preview. The code accepts those names. Credential values and a live database connection have not been verified from this workspace. Firewall custom rules still require configuration, and a deployment is needed to activate the new application code.

## Upstream API inventory

| Service                    | Authentication and limits                                                                                                                                                                               | Recommendation / current safeguards                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NVD                        | Published baseline: 5 requests/30 seconds without a key, 50/30 seconds with a key. `NVD_API_KEY` is supported.                                                                                          | Add the key. Shared application allowances are conservatively 4 or 45 per fixed 30-second window. CVE.org remains the first single-CVE lookup; NVD is fallback. Adjacent-window bursts can still receive upstream 429s. Source functions settle failures and retry later. |
| GitHub Advisory Database   | Public unauthenticated REST typically 60/hour/IP; authenticated user requests typically 5,000/hour, with secondary limits. `GITHUB_TOKEN` supported.                                                    | Strongly recommended. Use a dedicated least-privilege token. Shared cache and conservative 50/4,500-per-hour application allowances reduce quota collisions. The provider's own budget may also be used by other applications sharing a token/IP.                         |
| CIRCL Vulnerability-Lookup | The instance's machine-readable policy advertises 20/minute anonymously, 40/minute with `X-API-KEY`.                                                                                                    | Optional `CIRCL_API_KEY` support added. Only two discovery pages per shared feed fill are requested; a key is lower priority than NVD/GitHub. Respect Retry-After.                                                                                                        |
| CVE.org / CVE Services     | The public record GET used here currently works without a key. Public-read higher-limit key provisioning was not established. CNA write credentials are a separate use case.                            | Retain primary-record reads and shared caching. Do not describe public access as unlimited. Runbooks and CVE detail views read the record for different purposes.                                                                                                         |
| FIRST EPSS                 | Official API overview advertises 1,000 requests/minute and no authentication. FIRST members may request increases through support. The CVE-list parameter allows 2,000 characters.                      | Existing batches of 80 fit normal CVE IDs. A key is not the upgrade path. Shared snapshot fills and bounded checks keep traffic down.                                                                                                                                     |
| OSV                        | Official API overview currently states there are no API limits. No API-key upgrade was identified for these reads.                                                                                      | Advisory detail cache is shared across instances; checks batch up to 1,000 packages and limit detail expansion/concurrency. Do not interpret the lack of a published limit as an availability guarantee.                                                                  |
| CISA KEV                   | Public JSON feed; no key required for this endpoint. No documented higher-limit key was identified.                                                                                                     | Fetch the whole catalogue into a shared hourly cache, rather than per CVE or per visitor.                                                                                                                                                                                 |
| SEC EDGAR / EFTS           | SEC guidance limits automated access to 10 requests/second per user across machines and requires identifiable automation. No key upgrade for this public feed was identified.                           | Existing descriptive contact User-Agent retained; disclosures now share their feed cache. Do not scale per-visitor filing retrieval.                                                                                                                                      |
| Wikidata search and WDQS   | Public services. WDQS documents a 60-second query deadline, processing allowance by User-Agent/IP, 30 erroneous queries/minute and five parallel queries/IP. No higher-limit public API key identified. | Keep month-scale shared HQ caching, descriptive User-Agent and bounded concurrency. Respond to 429/backoff; a paid key is not the fix.                                                                                                                                    |
| RansomLook                 | `/api/recent` is publicly read without a key. Published read quota/higher-limit tier not established from the available documentation.                                                                  | Shared feed cache and fallback data. Contact the operator before increasing polling; do not assume unlimited access.                                                                                                                                                      |
| IODA                       | Public v2 outage reads currently use no key. A documented quota or higher-limit key was not established.                                                                                                | Shared, time-budgeted feed cache. Coordinate with the operator if sustained demand increases.                                                                                                                                                                             |
| Valyu                      | Deployment key for shared discovery/answers/extraction; OAuth token for a visitor's own-credit work. Rates and cost depend on account/endpoint.                                                         | Shared operation budgets, cache fills, bounded visitor requests, and provider billing controls. Higher limits should follow measured demand and an explicit spending budget.                                                                                              |
| Mapbox                     | A public access token is required. Endpoint-specific rate limits and usage billing; 429 responses carry rate-limit headers. Higher limits require provider coordination.                                | URL-restrict the token and monitor map-load billing. These browser requests go directly to Mapbox, outside the application's Redis limiter.                                                                                                                               |
| NASA GIBS                  | Public standards-based imagery used by the map; no key is used for these layers. No higher-limit key requirement was established.                                                                       | Keep public tile/CDN use and avoid needless map remounts. These are direct browser requests.                                                                                                                                                                              |
| Google favicon service     | The app uses a public favicon endpoint with no key; no quota/SLA or key-based upgrade established.                                                                                                      | Proxy/cache favicons and keep the monogram fallback. Do not make this service a dependency for core functionality.                                                                                                                                                        |
| Upstash Redis              | REST URL and token required. Provider command/storage/throughput quotas depend on plan.                                                                                                                 | Monitor operation counts. Each application quota check can perform multiple Redis operations; edge rejection saves function and Redis load. Redis failure is fail-closed.                                                                                                 |
| GeoNames / Natural Earth   | Used to build local geographic data, not a per-visitor live lookup in this code.                                                                                                                        | No runtime key upgrade needed for those bundled datasets.                                                                                                                                                                                                                 |

### Sources and verification limits

- [NVD developer guidance](https://nvd.nist.gov/developers/start-here): the live page returned an empty body during this audit, so its currently advertised numeric limits could not be freshly extracted. The baseline above matches the repository's existing NVD guidance; recheck when requesting a key.
- [GitHub REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [CIRCL live API policy](https://vulnerability.circl.lu/.well-known/api-policy.json)
- [FIRST API overview and rate limits](https://api.first.org/), [EPSS batching](https://api.first.org/epss/)
- [OSV API overview](https://google.github.io/osv.dev/api/)
- [SEC developer resources](https://www.sec.gov/about/developer-resources)
- [Wikidata query limits](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#Query_limits)
- [Mapbox API overview](https://docs.mapbox.com/api/overview/), [NASA GIBS access](https://nasa-gibs.github.io/gibs-api-docs/access-basics/)
- [Vercel rate-limit SDK behavior](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk), [trusted request headers](https://vercel.com/docs/headers/request-headers), [Upstash timeout behavior](https://upstash.com/docs/redis/sdks/ratelimit-ts/features)

Unknown limits are deliberately marked unknown. Provider policies can change. No production provider dashboards, billing tiers or live API keys were inspected.

## Dependency check

Adding the official limiter libraries prompted a dependency audit. The affected `follow-redirects` dependency was updated to 1.16.2. Two existing advisories remain in the `shadcn` dependency chain: [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) and [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). The latter had no published fix in the audit response. Passing the application checks does not mean the dependency audit is clean.
