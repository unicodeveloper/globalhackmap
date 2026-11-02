import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Global Hack Map: every hack, exploit and breach, live",
    short_name: "Hack Map",
    description:
      "Every breach, ransomware attack, exploited vulnerability and malicious package, on one live map with sources. Check if you are affected and fix it in one click.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070b",
    theme_color: "#05070b",
    categories: ["security", "news", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
