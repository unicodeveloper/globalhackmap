# Global Hack Map design language

Dark, precise, quiet. The globe and the ASCII art carry the drama; the interface is an instrument panel around them. Every surface earns its place; nothing is decorative chrome. The reference standard is the best of 21st.dev, Linear and Vercel: nested surfaces, one crisp hero number per view, small tracked labels, and data drawn as data.

## Palette (cool only)

| Token                               | Value                           | Use                                            |
| ----------------------------------- | ------------------------------- | ---------------------------------------------- |
| `space`                             | `#05070b`                       | Page background, text on primary buttons       |
| `surface`, `surface-2`, `surface-3` | `#0d1117`, `#141a22`, `#1a212b` | Opaque surfaces (popovers, drawers)            |
| `ink`                               | `#edf0f4`                       | Primary text, primary button fill              |
| `ink-2`                             | `#c3c9d1`                       | Secondary text                                 |
| `ink-3`                             | `#8b95a1`                       | Supporting text, labels                        |
| `ink-4`                             | `#76808d`                       | Metadata, eyebrows, counts (4.5:1 on panels)   |
| `confirmed`                         | `#ff4a3d`                       | Confirmed incidents, exploited vulnerabilities |
| `reported`                          | `#ffb547`                       | Press-reported incidents, "in the news"        |
| `claimed`                           | `#dde2ea`                       | Claimed by attackers only (hollow mark)        |
| `outage`                            | `#5ec8ff`                       | Connectivity drops                             |
| `safe`                              | `#6ee7a8`                       | Live indicator, "no match" verdicts            |

Never mix warm greys in. Status colours mean status and nothing else: no decorative red, no accent gradients.

## Type

- **Mona Sans** (`font-sans`, the default) for everything readable.
- **Hubot Sans** (`font-display`, `font-condensed` at wdth 75, `font-semicondensed` at wdth 87.5) for hero numbers, names and page titles. Its mechanical numerals are the product's typographic signature.
- **Martian Mono** (`font-mono`, wdth 87.5) for data: CVE IDs, counts, times, country codes and eyebrows.
- Geist Mono is loaded only as the glyph source for the ASCII art canvases. Never use it in UI.
- Never use Inter, Geist, Space Grotesk or system-ui as a visible face.
- **Eyebrow**: `font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-4`. Every tile and section heading in a data surface is an eyebrow, not bold text.
- Hero number: `font-condensed font-bold leading-[0.86] tracking-[-0.035em]`, animated with `NumberFlow`. Hubot Sans draws its zero with an inner bar (it has no plain alternate); that mechanical zero is part of why the face was chosen.
- Body 14px, secondary 12.5px, metadata 10.5 to 11.5px mono. Tabular numerals wherever numbers can change.

## Surfaces and depth

- **Panel** (`glass-panel`): the one translucent surface per region. Radius 22px.
- **Tile** (inside a panel): `rounded-[18px] bg-white/[0.028] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),inset_0_1px_0_rgb(255_255_255/0.05)]`. Tiles group one idea (a stat with its breakdown, a verdict with its fix). Inner dividers are `border-white/[0.06]`.
- **Row** (lists): `rounded-[14px] px-3 py-2 hover:bg-white/[0.04]`; selected adds `bg-white/[0.06]` and an inset 1px ring at 0.07.
- **Drawer** (`drawer-surface`): opaque, for dossiers. One glass surface per screen is enough.
- Radii nest: panel 22 → tile 18/16 → row 14 → logo 9 → chip full.
- No outer glows, no coloured shadows, no gradient text.

## Components

- **Segmented control** (`components/kit/segmented.tsx`) for tabs and single-choice switches. Inset track, a sliding surface on the active option (spring 520/42), optional mono count.
- **Status mark** (`components/kit/status-mark.tsx`): status by shape and colour. Solid = confirmed, half = reported, hollow = claimed.
- **Org logo** (`components/kit/org-logo.tsx`): real favicon over a monogram, never a guessed logo.
- **Buttons**: primary is `bg-ink text-space rounded-full`; secondary is an inset 1px ring on transparent; tertiary is a text action (`h-7 px-2.5 rounded-full text-ink-3 hover:bg-white/[0.05]`). Every button gets the `press` utility.
- **Icons**: Phosphor only (`@phosphor-icons/react`, or `/ssr` in server components), regular weight, `size-3.5` in text, `size-4` standalone.

## Data

- Draw data as data: bars, ticks and counts. One hero number per view.
- Never show the same legend twice; a stat breakdown can double as its filter.
- Lists group by time ("Today", "Yesterday", weekday) with sticky eyebrow headers.
- Never repeat the row title in its subtitle. Say what happened.
- ASCII is reserved for art (the Atlas, page heroes), never for numbers or charts.

## Motion

- `ease-out-expo` (`cubic-bezier(0.23,1,0.32,1)`) for UI, the drawer curve for panels.
- Numbers roll (NumberFlow). Lists stagger in at most 50ms per item, at most six items.
- Respect `prefers-reduced-motion` everywhere: no stagger, no scramble, no ping.

## Copy

Plain English, short, specific. No em dashes. Status words are exact: confirmed, reported, claimed. Never imply exploitation or a breach the sources do not support.
