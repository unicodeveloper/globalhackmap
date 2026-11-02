#!/usr/bin/env python3
"""Build the compact geo tables Global Hack Map uses for offline geocoding.

Usage: python3 scripts/build_geo.py <download-dir>

<download-dir> must contain GeoNames cities15000.txt, admin1CodesASCII.txt,
countryInfo.txt (https://download.geonames.org/export/dump/, CC BY 4.0) and
Natural Earth ne_50m.geojson + ne_110m.geojson (public domain).
"""
import json
import os
import sys

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "geo")


def load_cities(path):
  rows = []
  with open(path, encoding="utf-8") as f:
    for line in f:
      p = line.rstrip("\n").split("\t")
      name, ascii_name, country, admin1 = p[1], p[2], p[8], p[10]
      lat, lon, pop = float(p[4]), float(p[5]), int(p[14] or 0)
      rows.append([name, ascii_name if ascii_name != name else "", country, admin1, round(lat, 4), round(lon, 4), pop])
  rows.sort(key=lambda r: -r[6])
  return rows


def load_admin1(path):
  out = {}
  with open(path, encoding="utf-8") as f:
    for line in f:
      code, name, ascii_name, _ = line.rstrip("\n").split("\t")
      out[code] = ascii_name or name
  return out


def load_country_info(path):
  info = {}
  with open(path, encoding="utf-8") as f:
    for line in f:
      if line.startswith("#"):
        continue
      p = line.rstrip("\n").split("\t")
      info[p[0]] = {"name": p[4], "capital": p[5], "continent": p[8], "tld": p[9]}
  return info


def ring_contains(ring, x, y):
  inside = False
  j = len(ring) - 1
  for i in range(len(ring)):
    xi, yi = ring[i]
    xj, yj = ring[j]
    if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
      inside = not inside
    j = i
  return inside


def polygons(geom):
  if geom["type"] == "Polygon":
    return [geom["coordinates"]]
  if geom["type"] == "MultiPolygon":
    return geom["coordinates"]
  return []


def main():
  src = sys.argv[1]
  cities = load_cities(os.path.join(src, "cities15000.txt"))
  admin1 = load_admin1(os.path.join(src, "admin1CodesASCII.txt"))
  info = load_country_info(os.path.join(src, "countryInfo.txt"))

  ne50 = json.load(open(os.path.join(src, "ne_50m.geojson")))
  countries = {}
  sovereign = set()
  for feat in ne50["features"]:
    pr = feat["properties"]
    iso = pr.get("ISO_A2_EH") or pr.get("ISO_A2")
    if not iso or iso == "-99":
      continue
    # Dependencies share their sovereign's code (Ashmore and Cartier Is. is "AU"): the country itself wins.
    main = pr.get("TYPE") in ("Sovereign country", "Country")
    if iso in countries and (iso in sovereign or not main):
      continue
    if main:
      sovereign.add(iso)
    countries[iso] = {
      "name": pr.get("NAME_LONG") or pr.get("NAME") or info.get(iso, {}).get("name", iso),
      "lat": round(pr["LABEL_Y"], 3),
      "lon": round(pr["LABEL_X"], 3),
    }
  # Fill countries Natural Earth lacks with their capital's coordinates.
  by_country_capital = {}
  for r in cities:
    by_country_capital.setdefault((r[2], r[0]), r)
  for iso, ci in info.items():
    if iso in countries:
      continue
    cap = by_country_capital.get((iso, ci["capital"]))
    if cap:
      countries[iso] = {"name": ci["name"], "lat": cap[4], "lon": cap[5]}
  for iso, c in countries.items():
    ci = info.get(iso, {})
    c["continent"] = ci.get("continent", "")
    c["tld"] = ci.get("tld", "")

  # Land dots on a 2.5 degree grid, for share cards and the loading globe.
  ne110 = json.load(open(os.path.join(src, "ne_110m.geojson")))
  polys = [poly for feat in ne110["features"] for poly in polygons(feat["geometry"])]
  dots = []
  step = 2.5
  lat = -57.5
  while lat <= 80:
    lon = -180 + step / 2
    while lon < 180:
      for poly in polys:
        if ring_contains(poly[0], lon, lat) and not any(ring_contains(h, lon, lat) for h in poly[1:]):
          dots.append([round(lon, 2), round(lat, 2)])
          break
      lon += step
    lat += step

  us_states = {k.split(".")[1]: v for k, v in admin1.items() if k.startswith("US.")}

  os.makedirs(OUT, exist_ok=True)
  json.dump(cities, open(os.path.join(OUT, "cities.json"), "w"), separators=(",", ":"), ensure_ascii=False)
  json.dump(countries, open(os.path.join(OUT, "countries.json"), "w"), separators=(",", ":"), ensure_ascii=False, sort_keys=True)
  json.dump(dots, open(os.path.join(OUT, "land-dots.json"), "w"), separators=(",", ":"))
  json.dump(us_states, open(os.path.join(OUT, "us-states.json"), "w"), separators=(",", ":"), sort_keys=True)
  print(f"cities={len(cities)} countries={len(countries)} land_dots={len(dots)} us_states={len(us_states)}")


if __name__ == "__main__":
  main()
