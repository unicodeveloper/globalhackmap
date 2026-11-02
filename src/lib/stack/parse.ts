/**
 * Turns a pasted manifest, lockfile or list of products into packages and products.
 * Client-safe: the check page runs it live to show the detected format as people paste.
 */
import { MAX_PACKAGES, type Ecosystem, type ParsedStack, type StackFormat, type StackPackage, type StackProduct } from "@/lib/stack/types";

const SEMVER_ECOSYSTEMS = new Set<Ecosystem>(["npm", "crates.io"]);
const MAX_PRODUCTS = 40;

/** Human label for the detected format, used in the live status line. */
export const FORMAT_LABEL: Record<StackFormat, string> = {
  "package.json": "package.json",
  "package-lock.json": "package-lock.json",
  "pnpm-lock.yaml": "pnpm-lock.yaml",
  "yarn.lock": "yarn.lock",
  "requirements.txt": "requirements.txt",
  "poetry.lock": "poetry.lock",
  "uv.lock": "uv.lock",
  "pyproject.toml": "pyproject.toml",
  "go.mod": "go.mod",
  "go.sum": "go.sum",
  "Gemfile.lock": "Gemfile.lock",
  "composer.json": "composer.json",
  "composer.lock": "composer.lock",
  "Cargo.toml": "Cargo.toml",
  "Cargo.lock": "Cargo.lock",
  "pom.xml": "pom.xml",
  "build.gradle": "Gradle build file",
  products: "a list of products",
  empty: "nothing yet",
};

/** Formats that pin exact installed versions. */
export const EXACT_FORMATS = new Set<StackFormat>([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "poetry.lock",
  "uv.lock",
  "go.sum",
  "Gemfile.lock",
  "composer.lock",
  "Cargo.lock",
]);

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

const EXACT_VERSION = /^v?\d+(\.\d+)*([-+][0-9A-Za-z.+-]+)?$/;
const FIRST_VERSION = /\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.]+)?/;

function pad(version: string, ecosystem: Ecosystem): string {
  if (!SEMVER_ECOSYSTEMS.has(ecosystem)) return version;
  const [core, ...rest] = version.split("-");
  const parts = core.split(".");
  while (parts.length < 3) parts.push("0");
  return [parts.join("."), ...rest].join("-");
}

/** Base version of a range: "^4.17.15" becomes 4.17.15. Returns null for tags, paths and git URLs. */
function baseVersion(raw: string, ecosystem: Ecosystem): { version: string; ranged: boolean } | null {
  const spec = raw.trim().replace(/^["']|["']$/g, "");
  if (!spec || spec === "*" || /^(latest|next|x|dev-|workspace:|file:|link:|portal:|patch:|git|github:|http|catalog:)/i.test(spec)) return null;
  if (/^[\w.-]+\/[\w.-]+/.test(spec) && !/^\d/.test(spec)) return null;
  const first = spec.split("||")[0].trim();
  const exact = EXACT_VERSION.test(first.replace(/^=+\s*/, ""));
  const match = FIRST_VERSION.exec(first);
  if (!match) return null;
  return { version: pad(match[0], ecosystem), ranged: !exact };
}

function pypiName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

class Collector {
  private map = new Map<string, StackPackage>();
  skipped = 0;

  add(ecosystem: Ecosystem, name: string, version: string | null | undefined, opts: { ranged?: boolean; direct?: boolean } = {}) {
    const cleanName = name.trim();
    if (!cleanName || !version) {
      if (cleanName) this.skipped += 1;
      return;
    }
    const finalName = ecosystem === "PyPI" ? pypiName(cleanName) : cleanName;
    const key = `${ecosystem}:${finalName}:${version}`;
    const prev = this.map.get(key);
    if (prev) {
      if (opts.direct) prev.direct = true;
      return;
    }
    this.map.set(key, {
      ecosystem,
      name: finalName,
      version,
      ...(opts.ranged ? { ranged: true } : {}),
      ...(opts.direct ? { direct: true } : {}),
    });
  }

  addSpec(ecosystem: Ecosystem, name: string, spec: string, direct = true) {
    const base = baseVersion(spec, ecosystem);
    if (!base) {
      this.skipped += 1;
      return;
    }
    this.add(ecosystem, name, base.version, { ranged: base.ranged, direct });
  }

  markDirect(names: Set<string>) {
    for (const pkg of this.map.values()) if (names.has(pkg.name)) pkg.direct = true;
  }

  result(format: StackFormat, products: StackProduct[] = []): ParsedStack {
    const all = [...this.map.values()];
    // Direct dependencies first so the cap drops deep transitive packages before the ones people chose.
    all.sort((a, b) => Number(Boolean(b.direct)) - Number(Boolean(a.direct)));
    const packages = all.slice(0, MAX_PACKAGES);
    return {
      format,
      packages,
      products,
      total: all.length,
      truncated: all.length > MAX_PACKAGES,
      ranged: packages.some((pkg) => pkg.ranged),
      skipped: this.skipped,
    };
  }
}

// ---------------------------------------------------------------------------
// JSON formats
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function parsePackageJson(json: Json): ParsedStack {
  const c = new Collector();
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const deps = json[field];
    if (!isObj(deps)) continue;
    for (const [name, raw] of Object.entries(deps)) {
      if (typeof raw !== "string") continue;
      const alias = /^npm:(@?[^@]+)@(.+)$/.exec(raw);
      if (alias) c.addSpec("npm", alias[1], alias[2]);
      else c.addSpec("npm", name, raw);
    }
  }
  return c.result("package.json");
}

function parsePackageLock(json: Json): ParsedStack {
  const c = new Collector();
  const packages = json.packages;
  if (isObj(packages)) {
    const root = packages[""];
    const direct = new Set<string>();
    if (isObj(root)) {
      for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
        if (isObj(root[field])) for (const name of Object.keys(root[field] as Json)) direct.add(name);
      }
    }
    for (const [key, entry] of Object.entries(packages)) {
      if (!key.includes("node_modules/") || !isObj(entry) || entry.link) continue;
      const derived = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
      const name = typeof entry.name === "string" ? entry.name : derived;
      const version = typeof entry.version === "string" && EXACT_VERSION.test(entry.version) ? entry.version : null;
      const topLevel = key === `node_modules/${derived}`;
      c.add("npm", name, version, { direct: topLevel && direct.has(derived) });
    }
    return c.result("package-lock.json");
  }
  const walk = (deps: unknown, depth: number) => {
    if (!isObj(deps)) return;
    for (const [name, entry] of Object.entries(deps)) {
      if (!isObj(entry)) continue;
      const version = typeof entry.version === "string" ? entry.version : "";
      const alias = /^npm:(@?[^@]+)@(.+)$/.exec(version);
      if (alias) c.add("npm", alias[1], EXACT_VERSION.test(alias[2]) ? alias[2] : null, { direct: depth === 0 });
      else c.add("npm", name, EXACT_VERSION.test(version) ? version : null, { direct: depth === 0 });
      walk(entry.dependencies, depth + 1);
    }
  };
  walk(json.dependencies, 0);
  return c.result("package-lock.json");
}

function parseComposerJson(json: Json): ParsedStack {
  const c = new Collector();
  for (const field of ["require", "require-dev"]) {
    const deps = json[field];
    if (!isObj(deps)) continue;
    for (const [name, raw] of Object.entries(deps)) {
      if (typeof raw !== "string" || !name.includes("/")) continue;
      c.addSpec("Packagist", name, raw);
    }
  }
  return c.result("composer.json");
}

function parseComposerLock(json: Json): ParsedStack {
  const c = new Collector();
  for (const field of ["packages", "packages-dev"]) {
    const list = json[field];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!isObj(entry) || typeof entry.name !== "string" || typeof entry.version !== "string") continue;
      const version = entry.version.replace(/^v/, "");
      c.add("Packagist", entry.name, EXACT_VERSION.test(version) ? version : null);
    }
  }
  return c.result("composer.lock");
}

// ---------------------------------------------------------------------------
// Text formats
// ---------------------------------------------------------------------------

function parsePnpmLock(text: string): ParsedStack {
  const c = new Collector();
  const direct = new Set<string>();
  let section = "";
  let inDeps = false;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      section = line.replace(/:.*$/, "").trim();
      inDeps = /^(dependencies|devDependencies|optionalDependencies)$/.test(section);
      continue;
    }
    if (section === "importers") {
      if (indent === 4) inDeps = /^\s{4}(dependencies|devDependencies|optionalDependencies):/.test(line);
      else if (indent === 6 && inDeps) direct.add(line.trim().replace(/^['"]|['"]?:.*$/g, ""));
      continue;
    }
    if (inDeps && indent === 2) {
      direct.add(line.trim().replace(/^['"]|['"]?:.*$/g, ""));
      continue;
    }
    if ((section === "packages" || section === "snapshots") && indent === 2 && line.trimEnd().endsWith(":")) {
      let key = line
        .trim()
        .slice(0, -1)
        .replace(/^['"]|['"]$/g, "")
        .replace(/^\//, "");
      key = key.replace(/\(.*$/, "");
      // pnpm v5 keys look like name/1.2.3_peer@x; v6 and later use name@1.2.3.
      const v5 = /^(.+?)\/(\d+\.\d+\.\d+[^/_@()]*)(?:_.*)?$/.exec(key);
      const at = key.lastIndexOf("@");
      const name = v5 ? v5[1] : at > 0 ? key.slice(0, at) : "";
      const version = v5 ? v5[2] : at > 0 ? key.slice(at + 1) : "";
      if (name) c.add("npm", name, EXACT_VERSION.test(version) ? version : null);
    }
  }
  c.markDirect(direct);
  return c.result("pnpm-lock.yaml");
}

function parseYarnLock(text: string): ParsedStack {
  const c = new Collector();
  const lines = text.split("\n");
  let current: string | null = null;
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!line.startsWith(" ") && line.trimEnd().endsWith(":")) {
      const first = line.trim().slice(0, -1).split(/,\s*/)[0].replace(/^"|"$/g, "");
      if (first === "__metadata" || /@(workspace|link|file|portal|exec):/.test(first)) {
        current = null;
        continue;
      }
      const patch = first.indexOf("@patch:");
      if (patch > 0) current = first.slice(0, patch);
      else {
        const at = first.lastIndexOf("@");
        current = at > 0 ? first.slice(0, at) : null;
      }
      continue;
    }
    const version = /^\s{2}version:?\s+"?([^"\s]+)"?/.exec(line);
    if (version && current) {
      c.add("npm", current, EXACT_VERSION.test(version[1]) ? version[1] : null);
      current = null;
    }
  }
  return c.result("yarn.lock");
}

/** PEP 508 requirement: name[extras] (spec) ; markers. */
function parsePep508(c: Collector, raw: string) {
  const line = raw.split(";")[0].split(" #")[0].trim();
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*\(?\s*([^)]*)\)?$/.exec(line);
  if (!match) return;
  const [, name, spec] = match;
  if (!spec.trim()) {
    c.skipped += 1;
    return;
  }
  const pinned = /^===?\s*([^\s,]+)$/.exec(spec.trim());
  if (pinned) c.add("PyPI", name, pinned[1], { direct: true });
  else c.addSpec("PyPI", name, spec.trim());
}

function parseRequirements(text: string): ParsedStack {
  const c = new Collector();
  for (const raw of text.split("\n")) {
    const line = raw
      .replace(/\s+#.*$/, "")
      .replace(/\\$/, "")
      .trim();
    if (!line || line.startsWith("#") || line.startsWith("-") || line.includes("://")) continue;
    parsePep508(c, line.replace(/\s--hash=\S+/g, ""));
  }
  return c.result("requirements.txt");
}

function tomlBlocks(text: string): Record<string, string>[] {
  const blocks: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "[[package]]") {
      current = {};
      blocks.push(current);
      continue;
    }
    if (line.startsWith("[")) {
      current = line === "[[package]]" ? current : null;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (kv && current && !(kv[1] in current)) current[kv[1]] = kv[2].replace(/^"|"$/g, "");
  }
  return blocks;
}

function parseCargoLock(text: string): ParsedStack {
  const c = new Collector();
  for (const block of tomlBlocks(text)) {
    if (!block.source?.includes("crates.io")) continue;
    c.add("crates.io", block.name, block.version);
  }
  return c.result("Cargo.lock");
}

function parsePythonLock(text: string, format: "poetry.lock" | "uv.lock"): ParsedStack {
  const c = new Collector();
  for (const block of tomlBlocks(text)) {
    if (block.source && /editable|virtual|directory|path|git/.test(block.source)) continue;
    c.add("PyPI", block.name, block.version);
  }
  return c.result(format);
}

/** Section-aware walk of a TOML file: yields [section, line]. */
function* tomlLines(text: string): Generator<[string, string]> {
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const header = /^\[+([^\]]+)\]+$/.exec(line);
    if (header) {
      section = header[1].trim();
      continue;
    }
    yield [section, line];
  }
}

/** Quoted strings inside a TOML array that starts at `from`, stopping at the first unquoted "]". */
function arrayStrings(text: string, from: number): string[] {
  const out: string[] = [];
  let quote = "";
  let current = "";
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) {
        out.push(current);
        quote = "";
        current = "";
      } else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "]") break;
  }
  return out;
}

function parsePyproject(text: string): ParsedStack {
  const c = new Collector();
  // PEP 621 and PEP 735 arrays: every quoted requirement inside a dependency array.
  const headers = [...text.matchAll(/^\[+([^\]]+)\]+\s*$/gm)].map((m) => ({ at: m.index ?? 0, name: m[1].trim() }));
  for (const match of text.matchAll(/^\s*([A-Za-z0-9_-]+)\s*=\s*\[/gm)) {
    const at = match.index ?? 0;
    const section = headers.filter((h) => h.at < at).pop()?.name ?? "";
    const key = match[1];
    const isDeps =
      (section === "project" && key === "dependencies") ||
      section === "project.optional-dependencies" ||
      section === "dependency-groups" ||
      (section.startsWith("tool.uv") && /dependencies/.test(key));
    if (isDeps) for (const requirement of arrayStrings(text, at + match[0].length)) parsePep508(c, requirement);
  }
  for (const [sec, line] of tomlLines(text)) {
    if (!/^tool\.poetry(\.group\.[^.]+)?\.(dev-)?dependencies$/.test(sec)) continue;
    const kv = /^([A-Za-z0-9._-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv || kv[1].toLowerCase() === "python") continue;
    const value = kv[2].trim();
    const spec = value.startsWith("{") ? /version\s*=\s*["']([^"']+)["']/.exec(value)?.[1] : value.replace(/^["']|["']$/g, "");
    if (spec) c.addSpec("PyPI", kv[1], spec);
    else c.skipped += 1;
  }
  return c.result("pyproject.toml");
}

function parseCargoToml(text: string): ParsedStack {
  const c = new Collector();
  for (const [sec, line] of tomlLines(text)) {
    // Table form: [dependencies.serde] then version = "1.0".
    const table = /(?:^|\.)(?:dev-|build-)?dependencies\.([A-Za-z0-9_-]+)$/.exec(sec);
    if (table) {
      const spec = /^version\s*=\s*"([^"]+)"/.exec(line)?.[1];
      const base = spec ? baseVersion(spec, "crates.io") : null;
      if (base) c.add("crates.io", table[1], base.version, { ranged: !spec!.startsWith("="), direct: true });
      continue;
    }
    if (!/(^|\.)(dev-|build-)?dependencies$/.test(sec)) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const value = kv[2].trim();
    const spec = value.startsWith("{") ? /version\s*=\s*"([^"]+)"/.exec(value)?.[1] : value.replace(/^"|"$/g, "");
    if (!spec) {
      c.skipped += 1;
      continue;
    }
    const base = baseVersion(spec, "crates.io");
    // A bare Cargo requirement like "1.0" is a caret range.
    if (base) c.add("crates.io", kv[1], base.version, { ranged: !spec.startsWith("="), direct: true });
    else c.skipped += 1;
  }
  return c.result("Cargo.toml");
}

function parseGoMod(text: string): ParsedStack {
  const c = new Collector();
  let inRequire = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^require\s*\($/.test(line)) {
      inRequire = true;
      continue;
    }
    if (inRequire && line === ")") {
      inRequire = false;
      continue;
    }
    const single = /^require\s+(\S+)\s+(v\S+)(.*)$/.exec(line);
    const inner = inRequire ? /^(\S+)\s+(v\S+)(.*)$/.exec(line) : null;
    const match = single ?? inner;
    if (match) c.add("Go", match[1], match[2], { direct: !/\/\/\s*indirect/.test(match[3]) });
  }
  return c.result("go.mod");
}

function parseGoSum(text: string): ParsedStack {
  const c = new Collector();
  for (const raw of text.split("\n")) {
    const match = /^(\S+)\s+(v[^\s/]+)\s+h1:/.exec(raw.trim());
    if (match) c.add("Go", match[1], match[2]);
  }
  return c.result("go.sum");
}

function parseGemfileLock(text: string): ParsedStack {
  const c = new Collector();
  const direct = new Set<string>();
  let section = "";
  for (const raw of text.split("\n")) {
    if (/^[A-Z]/.test(raw)) {
      section = raw.trim();
      continue;
    }
    if (section === "GEM" || section === "GIT" || section === "PATH") {
      const match = /^ {4}([A-Za-z0-9_.-]+) \(([^)]+)\)\s*$/.exec(raw);
      if (match && section === "GEM") {
        const version = match[2].replace(/-(x86|x64|arm|aarch|java|universal|mingw|mswin|darwin|linux).*$/, "");
        c.add("RubyGems", match[1], version);
      }
    } else if (section === "DEPENDENCIES") {
      const match = /^ {2}([A-Za-z0-9_.-]+)/.exec(raw);
      if (match) direct.add(match[1]);
    }
  }
  c.markDirect(direct);
  return c.result("Gemfile.lock");
}

function parsePom(text: string): ParsedStack {
  const c = new Collector();
  const props = new Map<string, string>();
  const propsBlock = /<properties>([\s\S]*?)<\/properties>/.exec(text)?.[1] ?? "";
  for (const match of propsBlock.matchAll(/<([\w.-]+)>([^<]+)<\/\1>/g)) props.set(match[1], match[2].trim());
  const resolve = (value: string) => value.replace(/\$\{([^}]+)\}/g, (_, key: string) => props.get(key) ?? "");
  for (const match of text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const body = match[1];
    const group = /<groupId>([^<]+)<\/groupId>/.exec(body)?.[1]?.trim();
    const artifact = /<artifactId>([^<]+)<\/artifactId>/.exec(body)?.[1]?.trim();
    const version = resolve(/<version>([^<]+)<\/version>/.exec(body)?.[1]?.trim() ?? "");
    if (!group || !artifact) continue;
    const base = version ? baseVersion(version, "Maven") : null;
    if (base) c.add("Maven", `${resolve(group)}:${resolve(artifact)}`, base.version, { direct: true, ranged: base.ranged });
    else c.skipped += 1;
  }
  return c.result("pom.xml");
}

function parseGradle(text: string): ParsedStack {
  const c = new Collector();
  for (const match of text.matchAll(/["']([\w.-]+):([\w.-]+):([\w.+-]+)["']/g)) {
    const base = baseVersion(match[3], "Maven");
    if (base) c.add("Maven", `${match[1]}:${match[2]}`, base.version, { direct: true, ranged: base.ranged });
  }
  return c.result("build.gradle");
}

// ---------------------------------------------------------------------------
// Free text: "FortiGate 7.4, GitLab 17.2, Okta"
// ---------------------------------------------------------------------------

function parseProducts(text: string): ParsedStack {
  const c = new Collector();
  const products: StackProduct[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,;]+/)) {
    const item = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!item || item.length > 80 || !/[A-Za-z]/.test(item)) continue;
    const npm = /^(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)@(\d[\w.+-]*)$/.exec(item);
    if (npm) {
      c.add("npm", npm[1], pad(npm[2], "npm"), { direct: true });
      continue;
    }
    const versioned = /^(.*?[A-Za-z].*?)\s+(?:v(?:ersion)?\s*)?(\d[\w.()-]*)$/i.exec(item);
    const name = (versioned ? versioned[1] : item).trim();
    const key = name.toLowerCase();
    if (seen.has(key) || products.length >= MAX_PRODUCTS) continue;
    seen.add(key);
    products.push(versioned ? { name, version: versioned[2] } : { name });
  }
  const parsed = c.result("products", products);
  return parsed.packages.length || products.length ? parsed : empty();
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function parsePartialPackageJson(text: string): ParsedStack {
  const c = new Collector();
  for (const block of text.matchAll(/"(?:dev|peer|optional)?[dD]ependencies"\s*:\s*\{([^}]*)\}?/g)) {
    for (const pair of block[1].matchAll(/"(@?[^"\s]+)"\s*:\s*"([^"]+)"/g)) c.addSpec("npm", pair[1], pair[2]);
  }
  return c.result("package.json");
}

function empty(): ParsedStack {
  return { format: "empty", packages: [], products: [], total: 0, truncated: false, ranged: false, skipped: 0 };
}

function fromJson(json: Json): ParsedStack | null {
  if ("lockfileVersion" in json && ("packages" in json || "dependencies" in json)) return parsePackageLock(json);
  if (Array.isArray(json.packages) && ("content-hash" in json || "packages-dev" in json)) return parseComposerLock(json);
  if (isObj(json.require) || isObj(json["require-dev"])) return parseComposerJson(json);
  if (isObj(json.dependencies) || isObj(json.devDependencies) || "name" in json) return parsePackageJson(json);
  return null;
}

const REQUIREMENT_LINE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[^\]]*\])?\s*(===|==|>=|~=|<=|!=|<|>)\s*\d/;

/** Detect the format from content (and the file name when a file was dropped), then parse it. */
export function parseStack(input: string, filename?: string): ParsedStack {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const trimmed = text.trim();
  if (!trimmed) return empty();
  const file = filename?.split(/[\\/]/).pop()?.toLowerCase() ?? "";

  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as unknown;
      if (isObj(json)) {
        const parsed = fromJson(json);
        if (parsed) return parsed;
      }
      return empty();
    } catch {
      // Not valid JSON, often a partial paste of package.json: read the dependency blocks we can see.
      if (/"(dev|peer|optional)?[dD]ependencies"\s*:/.test(trimmed)) return parsePartialPackageJson(trimmed);
    }
  }

  if (file === "pnpm-lock.yaml" || (/^lockfileVersion:/m.test(text) && /^(packages|importers):/m.test(text))) return parsePnpmLock(text);
  if (file === "yarn.lock" || /^# yarn lockfile v1/m.test(text) || (/^__metadata:/m.test(text) && /^\s+resolution:/m.test(text))) return parseYarnLock(text);
  if (file === "go.sum" || /^\S+ v\S+(\/go\.mod)? h1:/m.test(text)) return parseGoSum(text);
  if (file === "go.mod" || /^module\s+\S+/m.test(text) || /^require\s+(\(|\S+\s+v\d)/m.test(text)) return parseGoMod(text);
  if (file === "gemfile.lock" || (/^GEM$/m.test(text) && /^\s+specs:/m.test(text))) return parseGemfileLock(text);
  if (/^\[\[package\]\]/m.test(text)) {
    if (file === "cargo.lock" || /crates\.io-index|@generated by Cargo/.test(text)) return parseCargoLock(text);
    if (file === "uv.lock" || /^requires-python\s*=/m.test(text) || /pypi\.org\/simple/.test(text)) return parsePythonLock(text, "uv.lock");
    return parsePythonLock(text, "poetry.lock");
  }
  if (file === "pyproject.toml" || /^\[(project|tool\.poetry)[\].]/m.test(text)) return parsePyproject(text);
  if (file === "cargo.toml" || (/^\[(package|workspace)\]/m.test(text) && /^\[[\w.'"()-]*dependencies\]/m.test(text))) return parseCargoToml(text);
  if (file === "pom.xml" || (/<project[\s>]/.test(text) && /<dependency>/.test(text))) return parsePom(text);
  if (/\.gradle(\.kts)?$/.test(file) || /^\s*(implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(?\s*["'][\w.-]+:[\w.-]+:/m.test(text))
    return parseGradle(text);

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("-"));
  const reqLines = lines.filter((line) => REQUIREMENT_LINE.test(line)).length;
  if (file.endsWith(".txt") || (reqLines > 0 && reqLines >= lines.length * 0.6)) return parseRequirements(text);

  return parseProducts(trimmed);
}

/** Short "214 packages" or "5 products" summary for buttons and status lines. */
export function stackSize(parsed: ParsedStack): string {
  const parts: string[] = [];
  if (parsed.packages.length) parts.push(`${parsed.packages.length.toLocaleString("en")} ${parsed.packages.length === 1 ? "package" : "packages"}`);
  if (parsed.products.length) parts.push(`${parsed.products.length} ${parsed.products.length === 1 ? "product" : "products"}`);
  return parts.join(" and ");
}
