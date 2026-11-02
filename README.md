# Global Hack Map

Every hack, exploit and breach, live. Every publicly reported breach, ransomware claim, exploited vulnerability, malicious package and connectivity drop on one globe, each with its sources and an honest status. Check whether you are affected, then fix it in one click.

- **Map**: incidents placed at the city named in reporting, the organisation's headquarters, or the country, never more precisely than the sources allow.
- **New CVEs**: a live ticker and an index at `/cve` of critical CVEs published in the last 72 hours and flaws CISA confirmed exploited this week, minutes after they appear.
- **Patch now**: the software attackers are using today, one card per product, saying in plain English what can happen, who is affected and what fixes it.
- **Am I affected?**: pick the apps, products and companies you use and see what attackers are exploiting in them and which have been breached, then get a DeepResearch brief on all of it. Nothing to upload; developers check a repository with their own coding agent.
- **One-click fixes**: open Claude Code (terminal or web), Codex or Cursor with a runbook for the CVE, or have a coding agent check your systems after a vendor breach. Ask Claude or ChatGPT with the sources attached. Every link only pre-fills the prompt.
- **For agents**: a read-only MCP server, `llms.txt` and plain-text fix runbooks at `/fix/<CVE>`.

## Status, honestly

| Status        | Means                                                       |
| ------------- | ----------------------------------------------------------- |
| Confirmed     | Acknowledged by the organisation, a regulator or a filing   |
| Reported      | Covered by the press, not yet confirmed by the organisation |
| Claimed       | Asserted by attackers on a leak site, unverified            |
| Precautionary | Systems taken offline as a precaution, no compromise stated |
| Disputed      | Reported, and denied by the organisation                    |

An absent result is never proof that you are safe.

## Run it locally

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values you have
pnpm dev
```

Open http://localhost:3000. Without a Valyu API key the map still runs on the public feeds; the news layer, AI answers, research reports and plain-English explainers need one.

For the production build locally: `pnpm build && pnpm start`. The first build runs the live data pipeline once (about a minute); every page is then served from the prerendered cache.

### Environment

See [`.env.example`](.env.example). In short:

| Variable                   | Needed for                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | The globe (a public, URL-restricted Mapbox token)                                                          |
| `VALYU_API_KEY`            | News extraction, the daily brief, AI answers, research reports and explainers                              |
| `CRON_SECRET`              | Authenticating the scheduled sweep and brief routes                                                        |
| `GITHUB_TOKEN`             | Higher rate limits for the GitHub Advisory Database                                                        |
| `NVD_API_KEY`              | Recommended: without it NVD allows 5 requests per 30s and the new-CVE feed falls back to CVE.org and CIRCL |
| `NEXT_PUBLIC_SITE_URL`     | Absolute links in share cards and runbooks                                                                 |

## Deploy

Built for Vercel: `vercel.json` schedules the news sweep every six hours and the daily brief each morning. Set the environment variables above in the project settings.

## How it works

- `src/lib/sources/*` fetch and normalise each feed; `src/lib/pipeline.ts` geolocates, deduplicates and scores incidents; `src/lib/snapshot.ts` assembles the cached picture the UI and the MCP server read.
- Next.js 16 with Cache Components and Partial Prerendering: pages are static shells served from the CDN, data is cached per function with `use cache` (paid and rate-limited calls with `use cache: remote`, shared across instances), and any URL that was not prerendered gets its shell instantly while its content streams in. See the caching rules in [`AGENTS.md`](AGENTS.md).
- `src/components/map/*` draws the globe with native Mapbox GL layers, the data tags and the ASCII Atlas.
- `src/lib/stack/*` parses manifests and checks them against OSV.
- `src/app/api/mcp` serves the MCP tools; `src/app/fix/[id]` renders the agent runbooks.
- Design rules live in [`DESIGN.md`](DESIGN.md).

## Data sources

| Source                                                                                               | Used for                                            | Terms                                                                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [CISA Known Exploited Vulnerabilities](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Confirmed exploitation, ransomware use              | Public domain                                                                             |
| [CVE.org](https://www.cve.org/)                                                                      | CVE records, affected products, CNA and CISA scores | [CVE Terms of Use](https://www.cve.org/Legal/TermsOfUse)                                  |
| [CIRCL Vulnerability-Lookup](https://vulnerability.circl.lu/)                                        | Newest CVE records, minutes after publication       | Public service by CIRCL; CVE records under the CVE Terms of Use                           |
| [NVD](https://nvd.nist.gov/)                                                                         | Recent critical CVEs, CVSS                          | Public domain. This product uses the NVD API but is not endorsed or certified by the NVD. |
| [FIRST EPSS](https://www.first.org/epss/)                                                            | Exploitation probability                            | Free to use with attribution                                                              |
| [GitHub Advisory Database](https://github.com/advisories)                                            | Critical advisories, malicious packages             | CC BY 4.0                                                                                 |
| [OSV](https://osv.dev/)                                                                              | Package vulnerability checks                        | CC BY 4.0 (per-source terms apply)                                                        |
| [RansomLook](https://www.ransomlook.io/)                                                             | Leak-site claims                                    | CC BY 4.0                                                                                 |
| [SEC EDGAR](https://www.sec.gov/edgar)                                                               | 8-K cyber disclosures                               | Public                                                                                    |
| [IODA](https://ioda.inetintel.cc.gatech.edu/)                                                        | Country connectivity drops                          | Georgia Tech IODA                                                                         |
| [Wikidata](https://www.wikidata.org/)                                                                | Headquarters locations                              | CC0                                                                                       |
| [GeoNames](https://www.geonames.org/), [Natural Earth](https://www.naturalearthdata.com/)            | Place names and boundaries                          | CC BY 4.0, public domain                                                                  |
| [NASA Blue Marble and Black Marble](https://earthdata.nasa.gov/) via GIBS                            | Globe relief and night lights                       | Public                                                                                    |
| [Valyu](https://www.valyu.ai/)                                                                       | News search and extraction, answers, DeepResearch   | Valyu terms                                                                               |

Spotted a mistake? [Open an issue](https://github.com/yorkeccak/globalhackmap/issues/new) with a source and it will be corrected.

## Licence

Code: MIT, see [LICENSE](LICENSE). Fonts in `src/assets/fonts` are under the SIL Open Font License.
