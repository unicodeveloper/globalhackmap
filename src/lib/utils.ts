export { cn } from "cn";

/** A route param as text. Malformed escapes ("%E0%A4%A") stay as typed, so they reach notFound() instead of throwing a 500. */
export function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
