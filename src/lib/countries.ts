import countriesData from "@/data/geo/countries.json";

interface CountryLite {
  name: string;
  lat: number;
  lon: number;
}

const countries = countriesData as Record<string, CountryLite>;

export function countryName(iso?: string | null): string {
  if (!iso) return "Unknown";
  return countries[iso]?.name ?? iso;
}

export function countryCentroid(iso: string): [number, number] | null {
  const c = countries[iso];
  return c ? [c.lon, c.lat] : null;
}

export function allCountries(): { iso: string; name: string }[] {
  return Object.entries(countries)
    .map(([iso, c]) => ({ iso, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
