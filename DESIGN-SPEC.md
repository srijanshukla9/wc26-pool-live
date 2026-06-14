# FIFA Prediction Pro — DESIGN SPEC v1.0

**Single source of truth for the visual rebuild.** Build agents (index.html / app.js / viz.js + new css/js assets) follow this EXACTLY. Hex values, font names, and pixel sizes here are decisions, not suggestions. Deviate only where this doc explicitly says "designer's choice."

The look in one line: **broadcast match-center energy (Sky Sports / ESPN FC / Apple Sports) fused with the real FIFA World Cup 26 flat black/white/gold brand language and electric host-city accents, with The Athletic / FiveThirtyEight-grade editorial data tables.** Charged dark canvas, oversized condensed tabular numerals, a persistent live score-bug, team-color accenting, angled parallelogram cuts, inline probability bars. NOT a generic centered-card AI dashboard.

---

## 0. Brand research that drives this (decisions derived from it)

The official **FIFA World Cup 26** identity (unveiled in LA) is deliberately **flat** — gold trophy on the stacked "26" numeral, a **black / white / gold** core palette, **no gradients/shadows/texture on the mark itself** (flat color is mandated in their guidelines). The "26" is built from **48 geometric units** (one per nation) — a modular, grid-of-cells motif. Each host city layers its own **electric, celebratory accent** over the same skeleton: **Dallas = neon yellow + electric blue, Los Angeles = ocean blue + sun-warm orange, Vancouver = deep teal + forest green**. The official display type is a custom **condensed, bold, sporty** face ("FWC 2026").

**What we take from it (and what we deliberately diverge on):**
- Core = **flat black + warm white + a single authoritative GOLD**. Gold is the brand spine, used sparingly as the "trophy/champion/winning" signal — never as wallpaper.
- We adopt the host-city idea as our **celebratory accent set**: an **electric primary (azure/cyan)** plus **WC26-derived secondary (sunset orange) and tertiary (deep teal)**. These power data viz, probability bars, and team accenting.
- The **48-cell grid** becomes our background motif (faint dotted/cell mesh) and the consensus-board cell language.
- FIFA mandates flat *on the logo*. **We are an unofficial fan companion, not the logo** — so we DO use gradients in the broadcast chrome (score-bug, hero, bars). The flatness discipline applies to how we treat the *brand gold* and any literal trophy mark.

---

## 1. COLOR TOKENS

All colors are CSS custom properties on `:root`, themed via `:root[data-theme="light"]` / `[data-theme="dark"]`. **Dark is the default/hero experience** (broadcast canvas); light is a clean editorial daytime mode. Both are first-class and must be fully tested.

### 1.1 Brand-constant tokens (identical in both themes)
```css
:root{
  /* --- FIFA WC26 GOLD (the spine) --- */
  --gold:        #E8B73A;  /* primary trophy gold — winning/champion signal */
  --gold-deep:   #B98714;  /* pressed/darker gold, borders on gold fills */
  --gold-soft:   #F4D27A;  /* light gold, on-dark text + highlights */
  --gold-ink:    #1A1303;  /* near-black ink that sits ON gold fills */

  /* --- ELECTRIC ACCENT SET (host-city language) --- */
  --accent:      #1FA2FF;  /* PRIMARY electric azure — probability, links, focus */
  --accent-deep: #0A6FCC;  /* pressed azure */
  --accent-2:    #FF6B35;  /* SECONDARY sunset orange (LA) — momentum, "hot" */
  --accent-3:    #11B5A4;  /* TERTIARY deep teal (Vancouver) — neutral data series */
  --accent-violet:#7C5CFF; /* quaternary — 4th chart series only */

  /* --- SEMANTIC --- */
  --live:        #FF2D55;  /* LIVE red — pulsing dot, live state ONLY */
  --win:         #2BD66A;  /* banked points / correct / advancing */
  --win-deep:    #149E4B;  /* darker green for text on light */
  --loss:        #FF4D4D;  /* eliminated / dead pick / wrong */
  --warn:        #FFB020;  /* at-risk / on the bubble */

  /* radii, motion, layout */
  --r-xs: 6px; --r-sm: 9px; --r-md: 13px; --r-lg: 18px; --r-xl: 24px;
  --bug-cut: 14px;             /* parallelogram skew offset for score-bug/chips */
  --maxw: 1240px;
  --ease: cubic-bezier(.22,.61,.36,1);
  --ease-out: cubic-bezier(.16,1,.3,1);
}
```

### 1.2 DARK theme (default)
```css
:root,:root[data-theme="dark"]{
  --canvas:    #0A0E14;  /* app canvas — near-black with cool blue undertone */
  --canvas-2:  #070A0F;  /* page bg behind the shell (deepest) */
  --surface:   #11161F;  /* cards, panels */
  --surface-2: #18202B;  /* raised/nested surfaces, table zebra */
  --surface-3: #202A38;  /* hover, active rows */
  --line:      #232E3C;  /* hairlines/borders */
  --line-soft: #1A222E;  /* faint internal dividers */
  --ink:       #F2F5F9;  /* primary text */
  --ink-2:     #AEB9C7;  /* secondary text */
  --dim:       #6E7A8A;  /* tertiary/labels */
  --faint:     #ffffff14;/* track fills, skeleton */
  --hl-bg:     #1A1606;  /* "you" / champion-tint row bg (warm gold wash) */
  --hl-line:   #6E5410;  /* "you" border */
  --score-bug-grad: linear-gradient(100deg,#0E1420 0%,#141C2A 60%,#10243A 100%);
  --hero-grad: radial-gradient(120% 90% at 12% 0%, #14365C 0%, #0B1422 48%, #0A0E14 100%);
  --shadow:   0 1px 2px rgba(0,0,0,.5), 0 12px 34px rgba(0,0,0,.55);
  --shadow-sm:0 1px 2px rgba(0,0,0,.45);
  --mesh:     #ffffff08; /* 48-cell background mesh color */
}
```

### 1.3 LIGHT theme
```css
:root[data-theme="light"]{
  --canvas:    #F6F7F9;  /* cool editorial paper */
  --canvas-2:  #ECEEF2;
  --surface:   #FFFFFF;
  --surface-2: #F4F6F9;
  --surface-3: #ECEFF4;
  --line:      #DFE3EA;
  --line-soft: #EBEEF3;
  --ink:       #0C111A;
  --ink-2:     #41505F;
  --dim:       #76828F;
  --faint:     #0c111a0f;
  --hl-bg:     #FFF8E6;  /* warm gold wash */
  --hl-line:   #E8B73A;
  --score-bug-grad: linear-gradient(100deg,#0C1422 0%,#13233A 100%); /* bug stays dark even in light mode — broadcast device */
  --hero-grad: radial-gradient(120% 90% at 12% 0%, #1B3F66 0%, #122B45 55%, #0C1422 100%); /* hero stays dark */
  --shadow:   0 1px 2px rgba(15,23,42,.05), 0 10px 30px rgba(15,23,42,.08);
  --shadow-sm:0 1px 2px rgba(15,23,42,.06);
  --mesh:     #0c111a06;
  --gold:     #C8951E;   /* gold reads as muddy on white — deepen it for fills/text in light */
  --gold-soft:#9A6F12;   /* on-light gold text */
  --win:      #149E4B;   /* deepen green for AA on white */
  --accent:   #0E72D6;   /* deepen azure for AA on white */
  --live:     #E11D48;
}
```

> **Critical rule:** the **score-bug and the hero stay dark in BOTH themes** — they are "broadcast devices" embedded in the page, like a real TV graphic overlaid on any background. Everything else flips. This is a signature, not a bug.

### 1.4 Team-color accenting
Engine gives `state.logos = {team -> logoUrl}` only — no team hex. Build a small static map `TEAM_HEX = { 'Brazil':'#F7DC2E', 'Argentina':'#6CACE4', ... }` in a new `theme.js` (designer's choice of values, primary jersey color). Where a team hex is unknown, fall back to `--accent`. Team color is used ONLY as: (a) a 3px **left-accent bar** on match-card sides and (b) the fill of momentum/possession bars. Never as a full background.

---

## 2. TYPOGRAPHY

Three Google families. Load with one stylesheet link, `display=swap`, preconnect already present.

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Saira+Condensed:wght@500;600;700;800;900&family=Archivo:wght@600;700;800;900&display=swap" rel="stylesheet">
```

| Role | Family | Why |
|---|---|---|
| **Mega numerals / scores / ranks / countdown** | **Saira Condensed** (700–900) | The closest free analog to FWC 2026: condensed, sporty, tall, tabular. This is the broadcast voice. |
| **Display headlines / section kickers / score-bug team names** | **Archivo** (700–900, slightly expanded) | Grotesque with athletic weight; for `h1`, hero, card titles. |
| **UI / body / table text / labels** | **Inter** (400–800) | Keep. Neutral, dense, legible at 11–14px. |

```css
:root{
  --f-num:   'Saira Condensed', 'Archivo', system-ui, sans-serif;
  --f-disp:  'Archivo', 'Saira Condensed', system-ui, sans-serif;
  --f-ui:    'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
body{ font-family: var(--f-ui); }
/* ALL numerals that change live use tabular figures so they don't jitter */
.num, .score, .rank, .stat-v, .pts, [data-tnum]{ font-variant-numeric: tabular-nums; }
```

### 2.1 Type scale (px, with weight)
| Token | Size / line | Weight | Family | Use |
|---|---|---|---|---|
| `display-xl` | 64 / 0.92 | 900 | num | Score-bug mega score, hero stat |
| `display-l`  | 46 / 0.96 | 800 | disp | Hero `h1` (clamp 34→58) |
| `display-m`  | 34 / 1.0  | 800 | num | Podium points, big projected pts |
| `num-l`      | 28 / 1.0  | 800 | num | Leaderboard projected score, match score |
| `num-m`      | 20 / 1.05 | 700 | num | Stat-card value, rank |
| `title`      | 17 / 1.2  | 800 | disp | Card titles, player names |
| `body`       | 14 / 1.5  | 400/500 | ui | Default text |
| `body-sm`    | 12.5 / 1.5| 500 | ui | Secondary, table cells |
| `kicker`     | 11 / 1.3  | 800 | ui | UPPERCASE section eyebrow, letter-spacing .12em |
| `micro`      | 10 / 1.2  | 700 | ui | Tags, pills, axis labels, letter-spacing .06em |

**Headline tracking:** display/num headings use `letter-spacing: -0.01em` (tight, broadcast). Kickers/micro use **positive** tracking. Body = normal.

---

## 3. SIGNATURE MOTIFS (the 4 devices that define the look)

Implement all four. They are what stop this from looking like a template.

### 3.1 The angled SCORE-BUG
A persistent, broadcast-style score graphic. Used in: (a) match cards, (b) a sticky **live mini-bug** in the header when any match is in play, (c) hero "live now."
- Container `background: var(--score-bug-grad)`, **stays dark in both themes**, `border-radius: var(--r-md)`, a **1px top hairline of `--accent` at 40% opacity** (the "broadcast glow line").
- **Parallelogram cut:** the two team blocks are skewed. Left block `clip-path: polygon(0 0, 100% 0, calc(100% - var(--bug-cut)) 100%, 0 100%)`, right block mirrored. The center score panel sits upright between them.
- Each team block carries a **3px team-color left/right edge** (`box-shadow: inset 3px 0 0 var(--team)`).
- Score in `--f-num` 900, `display-xl`/`num-l`; the dash is a thin `--dim` hyphen with 8px gap. Winner side full white; loser side `--ink-2` at ~60%.
- A small status tab top-center: `LIVE 67'` (red, pulsing dot) / `FT` (green) / kickoff time (dim).

### 3.2 Team-color LEFT-ACCENT bars (editorial rows)
Every leaderboard row, every consensus row, every fixture list item gets a **3px solid left accent** (the rank/standing color or team color) flush to the card's left edge, via a pseudo-element, not a border (so it can be full-bleed and colored). For leaderboard: rank 1 = `--gold`, ranks 2–3 = `--gold-soft`, the "you" row = `--accent`, the rest = `--line` (so the eye reads the podium instantly). This is the FiveThirtyEight/Athletic "colored sidebar" tell.

### 3.3 Condensed MEGA-NUMERALS + inline probability bars
- Any number that is the *point* of a component is rendered in `--f-num` at `display-*`/`num-*` scale — scores, ranks, projected points, win%. They are big, condensed, tabular, and they **tick-animate** when they change (§6).
- **Inline win% probability bar** in every leaderboard row: a slim 6px track (`--faint`) with a fill in `--accent` whose width = win%. The number (e.g. `34%`) sits right-aligned in `--f-num` next to it. This is the editorial "probability inline" device — it must scale cleanly to 84 rows (lightweight, no per-row chart lib).

### 3.4 The 48-cell brand mesh + WC26 hero gradient
- **Background mesh:** a fixed, very faint **cell grid** behind the shell echoing the 48-unit "26" — a CSS background of `--mesh`-colored 1px lines on a ~28px grid, masked to fade toward edges (`radial-gradient` mask). Barely visible; it gives the canvas texture without noise. (Replaces the photographic stadium blur currently used.)
- **Hero:** `background: var(--hero-grad)` (deep WC26 blue→black radial), with the mesh on top at higher contrast and a single **gold "26"-style numeral watermark** bleeding off the right edge at ~6% opacity. No stock stadium photo.

---

## 4. COMPONENT SPECS

> DOM note: keep the existing IDs/`data-tab`/`data-panel` hooks where listed so app.js keeps working; restyle freely. New structural elements are called out.

### 4.1 Top nav + POOL SWITCHER
- Sticky, `height 56px`, `background: color-mix(in srgb, var(--canvas) 86%, transparent)` + `backdrop-filter: blur(14px) saturate(140%)`, bottom hairline `--line`.
- Left: **brand lockup** — a small flat **gold "26" monogram tile** (not the ⚽ emoji): 30px rounded-9px tile, `background: var(--gold)`, `color: var(--gold-ink)`, `--f-num` 900 "26". Wordmark "FIFA Prediction Pro" in `--f-disp` 800, 15px.
- **POOL SWITCHER** (new, required): a segmented pill control immediately right of the brand, driven by `POOLS`/`POOL_ORDER`. Two segments — `Sp Jain` (10) and `Open` (84) — each showing `pool.short` + a count badge. Active segment = `--gold` fill, `--gold-ink` text; inactive = transparent, `--ink-2`. On click: set `location.hash = '#pool=<key>'` then `location.reload()` (per data layer contract). On mobile (<560px) collapse to a single dropdown `<select>` styled as a pill.
- Right cluster: `Official pool ↗` text link, theme toggle (sun/moon — use an inline SVG, NOT an emoji), Recap button (label "Recap", small share glyph SVG). Buttons are 32px pill-height, `--surface-2` on hover.

### 4.2 Identity band + HERO
Merge today's `.goldband` + `.hero` into one cohesive **hero device**:
- Full-bleed `--hero-grad`, mesh overlay, gold "26" watermark (§3.4). Min-height ~220px desktop / ~180px mobile.
- **Kicker** (`kicker` style, `--gold-soft`): `{POOL.poolName} · WORLD CUP 26`.
- **`h1`** = pool name in `display-l` Archivo 800, white, tight tracking. Keep `id`-free but render from `POOL.poolName`.
- **Sub** line in `--ink-2`-on-dark (rgba white .8): the companion description + a `--gold-soft` link to `POOL.poolUrl`.
- **Status bar** (keep `#updated #livepill #countdown #refreshBtn #digestBtn`): broadcast **pills** — each a slightly skewed-corner chip (subtle `--bug-cut`/2). LIVE pill uses `--live` + pulsing dot. Refresh = `--gold` fill button. "Copy digest" = ghost (white outline on dark).
- **"You" mini-scoreboard** (was `#profileStrip`): right-aligned trio of stat cells — your **RANK**, **projected PTS**, **win%** — each value in `--f-num` 800, label in `micro`. This is the personal score-bug. Hidden if no `/TARS/` entry in the active pool.

### 4.3 Tabs
- Sticky under hero at `top:56px`. 5 tabs, unchanged hooks: **Home / Matches / Leaderboard / Brackets / Insights** (`data-tab`, badge `#mBadge` on Matches).
- Style: `--f-ui` 700, 14px. Active tab: `--ink` text + a **3px `--gold` underline that animates its x-position** (a sliding indicator element, not per-tab border) for a broadcast feel. Inactive `--dim`. Horizontal scroll on mobile, no scrollbar.

### 4.4 Status / stat cards (Home)
- Grid `repeat(auto-fit,minmax(168px,1fr))`, gap 10px.
- Each: `--surface`, `--r-md`, `--shadow-sm`, **left-accent bar** (§3.2) colored by meaning (gold for "leader", accent for neutral, live-red for "matches live").
- Layout: a 40px rounded icon chip (inline SVG line icon, NOT emoji) left; right column = `kicker` label, then value in `--f-num` `num-m`/`display-m`, then a `body-sm` `--dim` sub. Deltas: `--win`/`--loss` with ▲/▼ SVG.

### 4.5 MATCH CARD (broadcast score-bug)
The hero component. Anatomy:
```
┌─────────────────────────────────────────────┐
│  GROUP C · MATCHDAY 2          [LIVE 67']    │  ← banner: dim caps + status tab
│ ┌──────────┐   ┌────────┐   ┌──────────┐     │
│ │ [crest]  │   │  2 - 1 │   │  [crest] │     │  ← score-bug: skewed team blocks
│ │ BRAZIL   │   │ display│   │  SERBIA  │     │     + upright mega score panel
│ └──────────┘   └────────┘   └──────────┘     │
│ ───────────────────────────────────────────  │
│ Pool called it: 7/10 took Brazil ·  ✓ banked │  ← "called" strip
│ ▸ Stakes for the pool                         │  ← collapsible (keep #stk hooks)
└─────────────────────────────────────────────┘
```
- Outer card `--surface`, `--r-md`. The **score region uses the score-bug device** (§3.1): dark grad, parallelogram cuts, team-color edges, crest images (`state.logos`) at 30px, team names in `--f-disp` 800 12.5px (truncate), score in `--f-num` 900 `num-l`.
- **Banner** (replaces `.mini-banner`): left = `GROUP X · MATCHDAY n` or `ROUND OF 16` in `micro` `--dim`; right = status tab — `LIVE 67'` (`--live`, pulsing), `FT` (`--win`), or kickoff in local time (`--dim`).
- **Called strip:** how many in the pool picked the (projected) winner, and whether it's banked — `--win` check / `--loss` cross SVG. Keep `.called` data wiring.
- **Stakes** stays a collapsible (keep `.stakes-toggle`/`.stakes-body`/`#stk*`), styled as a `--surface-2` inset with per-outcome delta rows; positive deltas `--win`, negative `--loss`, in `--f-num`.
- Grid `repeat(auto-fill,minmax(300px,1fr))`, gap 12px.

### 4.6 LEADERBOARD ROW (editorial table — must scale to 84)
This is the make-or-break for the open pool. Treat it as a **dense editorial table**, not a stack of fat cards.
- **Collapsed row height ~52px.** Grid columns:
  `[3px accent bar] [rank 34px] [avatar 30px] [name + champion flex] [win% bar+num 132px] [projected pts 64px] [chevron 20px]`.
  On <560px drop the win% bar to just the number, and hide `max`.
- **Rank**: `--f-num` 800, 18px. Top-3 ranks tinted gold; show a tiny rank-delta (▲2 / ▼1) in `micro` `--win`/`--loss` beside it when movement data exists.
- **Avatar**: circular initials chip (deterministic color from name hash, on `--surface-2`) — viz.js can supply; no photos.
- **Name**: `--f-disp` 700, 15px. `[YOU]` tag = `--gold` micro pill for the `/TARS/` entry; crown emoji allowed here as a *secondary* accent only (matchday crown), not as the primary icon system.
- **Champion line** (`body-sm` `--dim`): "Champion: Brazil" with crest; if eliminated, strike-through in `--loss` + `OUT` tag.
- **Inline win% bar** (§3.3): 6px track + `--accent` fill + `--f-num` number. This is the editorial probability device.
- **Projected pts**: the row's hero number — `--f-num` 800 `num-l`, `--win`. A second tiny line shows `official` pts in `--dim`.
- **Expand**: chevron rotates; detail panel (`--surface-2`) holds the locked-vs-projected stacked bar (keep `.bar`/`.barwrap`), the category breakdown grid (keep `.cats`/`.cat`), and the pick chips (keep `.chip2` with `.hit`/`.out`).
- **SEARCH + JUMP-TO-ME (required for 84):** above the list, a sticky toolbar — a search `<input>` (filter by name, `--surface-2`, `--r-sm`, magnifier SVG) and a **"Jump to me"** button (`--accent` outline) that scroll-into-views and briefly flashes the `/TARS/` row (`--hl-bg` pulse). Also a small sort segmented control: `Projected · Official · Max` (default Projected, matching `leaderboard()` order).
- **Zebra:** even rows `--surface-2` at 40% — subtle. "You" row always `--hl-bg` + `--accent` left bar regardless of zebra.

### 4.7 PODIUM
- Three-up, center pedestal taller (`1fr 1.18fr 1fr`, `align-items:end`). Each pedestal `--surface`, top edge a **2px medal-colored bar** (gold `--gold` / silver `#C7CDD6` / bronze `#CD8E5A`).
- Avatar (44px) with a medal glyph (SVG, not emoji) bottom-right. Name `--f-disp` 800 16px. Points in `--f-num` 900 `display-m`, `--win`. Champion pick crest + name in `body-sm`.
- P1 pedestal gets the `--hl-bg` gold wash + a faint top **gold glow** (`box-shadow: 0 -1px 24px -8px var(--gold)`).
- Mobile (<560px): collapse to three horizontal rows (medal · avatar · name · pts), still ranked.

### 4.8 BRACKETS — CONSENSUS BOARD + searchable single entry (NOT an 84-col matrix)
The 10-column matrix is fine for `spjain` but **must not** render for `open` (84). DOM contract:
- **Detect pool size.** If `POOL.count <= ~12`: keep the existing pick-matrix table (`#matrix`) as an optional view. If `> 12`: **hide the matrix entirely** and lead with the consensus board.
- **CONSENSUS BOARD (primary, all pools):** for each meaningful slot — Champion, Runner-up, the 4 SF spots, group winners (A–L), the 8 thirds — render a **distribution bar list**: each candidate team as a row with a horizontal bar (% of entries that picked it), count, crest, and the bar fill in `--accent` (or team color). This is the "where does the field stand" view. Reuse `.crow`/`.track` styling, upgraded. Cap each slot to top ~8 + "others".
- **SINGLE-ENTRY VIEW (searchable):** a search/`<select>` picker (`#pvSel` retained) to pull up **one** bracket, rendered group-by-group (keep `.pv-*`), with each pick colored by live status (`--win` banked / `--loss` dead / `--ink` pending) using `predictedAdvancers(entry)` + `state`. Default to the `/TARS/` entry.
- **Head-to-head** (keep `#h2hA/#h2hB/#h2hGrid`) stays for both pools — compare any two brackets.

### 4.9 BADGES (Insights)
- Grid of `--surface` cards, left-accent bar in `--gold`. Card title = badge owner (`--f-disp` 800). Each badge row: a **24px badge medallion** (a small SVG roundel tinted by `--gold`/`--accent`/`--accent-2`; the MC `emoji` may sit INSIDE it as a glyph but the roundel is the icon, not a bare emoji floating in text). Label `--f-ui` 700, desc `body-sm` `--dim`.
- Consolation/"wooden spoon" badges go in the `.cons-zone` at reduced opacity with an italic header.

### 4.10 CHARTS / data viz (viz.js)
- **Palette order** for any multi-series chart: `--accent, --accent-2, --accent-3, --accent-violet, --gold`. Win = `--win`, loss = `--loss`, live = `--live`.
- All viz are **lightweight inline SVG/CSS** (no chart lib) given the 84-row scale. Bars/sparklines only; no 3D, no pie charts.
- Axis/labels in `micro` `--dim`. Gridlines `--line-soft`. Tooltips `--surface-3`, `--r-sm`, `--shadow`.
- **Win% over time** (if data) = thin `--accent` sparkline. **Consensus** = horizontal bars. **Score breakdown** = stacked horizontal bar (locked `--win` + projected `--gold`).

---

## 5. SPACING, GRID, RADII
- 4px base unit. Card padding 14–18px. Section gap 26–32px. Inter-card gap 10–12px.
- Content `--maxw: 1240px`, gutters 20px desktop / 14px mobile. Shell is centered with `--canvas` on a `--canvas-2` page bg.
- Radii: pills 999px, chips `--r-sm`, cards `--r-md`, hero/large `--r-lg`. Score-bug `--r-md`.
- Hairlines always `1px var(--line)`; never thicker borders except the 2–3px colored accent bars.

---

## 6. MOTION (subtle, tasteful — this exact short list only)
| Animation | Where | Spec |
|---|---|---|
| **Number tick** | any live numeral that changes (scores, projected pts, win%, countdown) | old value slides up/out, new slides up/in over **240ms `--ease-out`**; tabular figures prevent reflow. Respect `prefers-reduced-motion` → instant swap. |
| **Live pulse** | `--live` dots only | 1.8s expanding ring (keep current `@keyframes ping`, recolor to `--live`). |
| **Bar fill** | probability/consensus/score bars | width transitions **500ms `--ease`** on data update; on first paint, fill from 0. |
| **Tab slide** | tab underline indicator | transform x **220ms `--ease`**. |
| **Row flash** | "Jump to me" + rank changes | `--hl-bg` background pulse **900ms** once. |
| **Panel fade** | tab switch | opacity+4px translateY **220ms** (keep current `fade`). |
| **Score-bug glow** | live match only | the top `--accent` hairline gently breathes opacity .25↔.5, 3s. |

No parallax, no bounce, no confetti, no entrance animations on lists, nothing over 600ms except the one-shot flash. All gated by `prefers-reduced-motion: reduce`.

---

## 7. ANTI-PATTERNS (do NOT do these)
- ❌ **Generic centered single-column card stack** / "AI dashboard" look. We are editorial + broadcast: dense tables, left-aligned, full-width rows.
- ❌ **Flat undifferentiated gray** everywhere. Use the canvas/surface/surface-2/3 ladder for real depth; reserve color for meaning.
- ❌ **Tiny-uppercase-label soup** — do not put a micro UPPERCASE label above every single value. Kickers are for section heads and stat labels only.
- ❌ **Emoji as the primary icon system.** Icons are inline SVG line/solid icons. Emoji (👑🥈🐺) are allowed ONLY as secondary semantic accents (matchday crown, medals, lone-wolf), never as nav/section/status icons.
- ❌ **Weak hierarchy** — every screen must have ONE dominant number/headline in `--f-num`/`--f-disp`. If everything is 14px, it's wrong.
- ❌ **Gold as wallpaper.** Gold = winning/champion/brand spine only. Large gold fills cheapen it.
- ❌ **84-column matrices, horizontal mega-scroll tables**, or rendering all 84 brackets at once. Use consensus + search.
- ❌ **Rainbow charts / pie charts / gratuitous gradients on data.** Follow the §4.10 palette order.
- ❌ **Photographic stadium backgrounds.** Replaced by the WC26 gradient + 48-cell mesh.
- ❌ Pure-black `#000` or pure-white `#FFF` text/canvas — use `--ink`/`--canvas` tokens (eased).

---

## 8. DOM CONTRACT (confirmed)
- **5 tabs, unchanged:** `Home` / `Matches` / `Leaderboard` / `Brackets` / `Insights` (keep `data-tab`, `data-panel`, `#mBadge`).
- **Pool switcher** is added to the nav, driven by `POOLS` + `POOL_ORDER`; switching = `location.hash='#pool=<key>'` + `location.reload()`. "You" = the `/TARS/` entry in the active pool.
- **Leaderboard** is searchable, has a **Jump-to-me** control and a Projected/Official/Max sort toggle, and renders as a dense editorial table that scales to **84 rows**.
- **Brackets** for large pools (`count > ~12`) uses a **CONSENSUS BOARD** (distribution of picks per slot) + a **searchable single-entry view** — NOT an 84-column matrix. Small pools (`spjain`) may keep the pick-matrix as a secondary view.
- Keep all existing element IDs referenced by app.js (`#statusCards #todayLive #rooting #recapStrip #roundbar #matchwrap #podium #lb #matrix #pvSel #playerView #h2hA #h2hB #h2hGrid #h2hDiff #badges #badgesCons #consChampion #consRunner #consSemis #consBold #similar #updated #livepill #liveTxt #countdown #refreshBtn #digestBtn #recapBtn #themeBtn #homeRecapBtn #profileStrip #err`) so app.js wiring survives the restyle; restructure their internals freely.
- **Themes:** `data-theme` on `<html>` toggles light/dark; both fully supported; score-bug + hero remain dark in both.

---

## 9. Build order (suggested)
1. Tokens + fonts + mesh/hero canvas (this section globally changes the feel).
2. Nav + pool switcher + hero/identity band + "you" mini-scoreboard.
3. Score-bug + match card (the signature) → Matches + Home live.
4. Editorial leaderboard row + search/jump/sort (the 84-scale workhorse).
5. Consensus board + single-entry brackets.
6. Podium, badges, charts, motion polish, light-mode QA, reduced-motion QA.

---

### Sources
- [FIFA — World Cup 26 official brand unveiled](https://www.fifa.com/en/articles/world-cup-2026-official-brand-unveiled-canada-mexico-usa-celebration-football-diversity)
- [Saltech — FIFA World Cup 2026 logo design & branding analysis](https://saltechsystems.com/fifa-world-cup-2026-logo/)
- [1000logos — World Cup 2026 logo, colors, meaning](https://1000logos.net/world-cup-2026-logo/)
- [Sensatype — what font is the World Cup 2026](https://sensatype.com/what-font-is-the-world-cup-2026)
- [Secret Dallas — official FIFA WC26 host-city colors & branding](https://secretdallas.com/dallas-fifa-world-cup-colors/)
- [Apple Newsroom — introducing Apple Sports](https://www.apple.com/newsroom/2024/02/introducing-apple-sports-a-new-app-for-sports-fans/)
- [Creative Boom — Apple Sports data visualization critique](https://www.creativeboom.com/inspiration/this-new-app-from-apple-has-something-important-to-teach-us-about-designing-data/)
