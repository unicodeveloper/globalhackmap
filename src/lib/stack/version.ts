/** Client-safe version helpers shared by the OSV matcher and the results UI. */

function tokens(version: string): string[] {
  return version
    .replace(/^v/i, "")
    .toLowerCase()
    .split(/[.\-+_]/)
    .flatMap((part) => part.match(/\d+|[a-z]+/g) ?? []);
}

/** Loose version comparison that is right for semver and PEP 440 release numbers. */
export function compareVersions(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
    const x = ta[i];
    const y = tb[i];
    if (x === undefined) return /^\d/.test(y) ? -1 : 1;
    if (y === undefined) return /^\d/.test(x) ? 1 : -1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const diff = Number(x) - Number(y);
      if (diff) return Math.sign(diff);
    } else if (nx) return 1;
    else if (ny) return -1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** The highest of several versions, or undefined. */
export function maxVersion(versions: (string | undefined)[]): string | undefined {
  return versions
    .filter((v): v is string => Boolean(v))
    .sort(compareVersions)
    .pop();
}
