# GLASS-SPEC.md — FIFA Prediction Pro: Liquid-Glass Overhaul + Road to #1 + Vercel

> Decisive build spec. Reskin only — **no change to data/engine/scoring/IA**. Stack stays vanilla HTML/CSS/JS, one inline `<style>` in `index.html`. All recipes are pixel/hex-exact and reuse the existing token palette (`--gold`, `--surface`, `--win`, `--loss`, `--ink-2`, etc.). Where a recipe contradicts the research, the research loses — this file wins.

---

## 1) THE LOOK (3 sentences)

A black-and-gold broadcast cockpit where the **data sits on solid, trustworthy surfaces** and a small set of **floating glass panels** — nav, dock, drawers, the hero leader card, the YOU tile, and the new Road-to-#1 view — hover above it with refractive bezels, a single top-left light source, and soft contact shadows. As you scroll, those glass panels **rise, settle, and catch a specular sweep** while the 48-cell mesh parallaxes behind them, giving Apple-grade depth without a framework and without ever blurring the 84-row leaderboard into mush. It reads as iOS/macOS-26 Liquid Glass *re-skinned in our gold broadcast chrome* — premium, alive, and still a dense, legible scoreboard at a glance.

---

## 2) GLASS DESIGN SYSTEM

### 2.1 The one rule that governs everything

> **Glass = floating chrome. Solid = data you trust.** Glass never *is* the content; it floats above it. The 84-row board, the scorecard ledger, the bracket matrix, and the FUT card art stay **opaque**. Glass is reserved for the fixed set in §5.

### 2.2 Two material tiers (decision: ship Tier-1 everywhere, Tier-2 on 2 surfaces only)

- **Tier-1 — "Regular" glass (default, all evergreen browsers):** translucent tint + `backdrop-filter: blur+saturate` + the dual-inset specular box-shadow that fakes the bezel. This is the workhorse: nav, dock, drawers, hero, YOU, Road-to-#1 shell, top-5 board rows.
- **Tier-2 — "Clear" refraction (Chromium-only, progressive enhancement):** real SVG `feDisplacementMap` as `backdrop-filter:url(#lg)` so the background literally bends at the edges. Gated behind `@supports` + a JS feature test that adds `.has-refract` to `<html>`. **Reserved for exactly two surfaces:** the **hero leader card** and the **Road-to-#1 odds headline**. Never load-bearing — its absence is invisible.

### 2.3 Tokens — add to `:root` (after line 64, alongside `--grain`/`--cell48`)

```css
:root{
  /* ---- LIQUID GLASS SYSTEM ---- */
  --glass-blur:   20px;   /* panels  */
  --glass-blur-nav: 24px; /* clear chrome blurs harder, tints lighter */
  --glass-blur-sm: 12px;  /* pills, mobile (<=560px drop to this) */
  --glass-sat:    160%;
  --glass-bri:    1.05;

  /* light direction is ALWAYS top-left / 135deg — never vary it */
  --glass-edge:      rgba(255,255,255,.55);  /* bright specular rim */
  --glass-edge-soft: rgba(255,255,255,.12);  /* top catch-light hairline */
  --glass-ring:      rgba(255,255,255,.08);  /* full inner ring */

  /* lift / contact shadow (panel floats above content) */
  --glass-lift: 0 10px 30px -10px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.35);
  --glass-lift-hi: 0 16px 40px -12px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4); /* dock/drawer */
}
:root,:root[data-theme="dark"]{
  --glass-tint:   rgba(20,28,42,.55);  /* ≈ --surface @ 55% */
  --glass-tint-2: rgba(20,28,42,.72);  /* denser, for text-bearing rows */
  --nav-tint-top: rgba(10,14,20,.72);
  --nav-tint-bot: rgba(10,14,20,.50);
}
:root[data-theme="light"]{
  --glass-tint:   rgba(255,255,255,.55);
  --glass-tint-2: rgba(255,255,255,.74);
  --glass-edge:      rgba(255,255,255,.9);
  --glass-edge-soft: rgba(255,255,255,.5);
  --glass-bri:    1.0;
  --glass-lift: 0 10px 30px -10px rgba(15,23,42,.18), 0 2px 6px rgba(15,23,42,.10);
  --glass-lift-hi: 0 16px 40px -12px rgba(15,23,42,.22), 0 2px 8px rgba(15,23,42,.12);
  --nav-tint-top: rgba(246,247,249,.78);
  --nav-tint-bot: rgba(246,247,249,.58);
}
```

### 2.4 The Tier-1 panel mixin (`.glass`)

The **two opposing inset rim shadows** (dim white bottom-right + bright white top-left) are the single most important detail — they fake the bezel lensing. Do not omit them.

```css
.glass{
  position:relative; border-radius:var(--r-lg);
  background: var(--glass-tint);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bri));
          backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bri));
  border:1px solid transparent;
  box-shadow:
    0 1px 0 0 var(--glass-edge-soft) inset,            /* top hairline catch-light */
    0 0 0 1px var(--glass-ring) inset,                 /* full inner ring */
    -1px -1px 6px -2px var(--glass-edge) inset,         /* bottom-right rim (light from TL) */
     2px  2px 10px -6px rgba(255,255,255,.45) inset,    /* opposite-edge refraction glow */
    var(--glass-lift);
  contain: paint;            /* bound repaint, protect INP */
  isolation: isolate;
}
```

### 2.5 The specular ring (rounded gradient rim border) — `::before` mask-composite

`border-image` can't round corners; use the mask trick. 135deg = top-left light, consistent with the inset rims.

```css
.glass::before{
  content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px; pointer-events:none;
  background: linear-gradient(135deg, var(--glass-edge), transparent 45%, var(--glass-edge-soft));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
}
```

### 2.6 Tier-2 refraction — the WOW layer (hero + Road-to-#1 odds only)

Inline once in `<body>` (after `.page-bg`):

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="lg" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise"/>
    <feGaussianBlur in="noise" stdDeviation="2" result="soft"/>
    <feDisplacementMap in="SourceGraphic" in2="soft" scale="24" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
```
```css
@supports ((backdrop-filter:url(#lg)) or (-webkit-backdrop-filter:url(#lg))){
  .has-refract .glass--refract{
    -webkit-backdrop-filter: blur(8px) url(#lg) saturate(160%);
            backdrop-filter: blur(8px) url(#lg) saturate(160%);
  }
}
```
JS feature test (in `app.js` boot, before first render):
```js
(function(){
  var t=document.createElement('div');
  t.style.backdropFilter='url(#lg)';
  if((t.style.backdropFilter||'').indexOf('url')>=0
     && !matchMedia('(max-width:560px)').matches
     && (navigator.hardwareConcurrency||4) >= 4){
    document.documentElement.classList.add('has-refract');
  }
})();
```
Use the **cheap fractalNoise** map above (organic ripple, no baked PNG) — the physically-correct bezel PNG is not worth the maintenance for 2 surfaces. Disable on coarse pointer / ≤560px / <4 cores.

### 2.7 The glass pill (`.glass-pill`) — interactive light response

For pool-switch, navbtn, share-alts, Road-to-#1 verdict chips. **Keep the gold share CTA solid** (`.navbtn.share` stays as-is) — Apple keeps the one prominent control opaque.

```css
.glass-pill{
  position:relative; border-radius:999px; padding:8px 14px;
  background: rgba(255,255,255,.10);
  -webkit-backdrop-filter: blur(var(--glass-blur-sm)) saturate(160%);
          backdrop-filter: blur(var(--glass-blur-sm)) saturate(160%);
  box-shadow:
    0 1px 0 rgba(255,255,255,.35) inset,
    0 -2px 6px -3px rgba(255,255,255,.4) inset,
    0 4px 12px -6px rgba(0,0,0,.5);
  transition: transform .18s var(--ease-out), box-shadow .18s, background .18s;
}
.glass-pill:hover{ background:rgba(255,255,255,.16); transform:translateY(-1px); }
.glass-pill:active{ transform:translateY(0) scale(.98);
  box-shadow:0 1px 0 rgba(255,255,255,.25) inset, 0 2px 6px -4px rgba(0,0,0,.6); }
/* cursor-tracked catch-light: app.js sets --mx/--my on pointermove (no-preference only) */
.glass-pill::after{ content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background: radial-gradient(120px 60px at var(--mx,50%) var(--my,0%), rgba(255,255,255,.35), transparent 60%);
  opacity:0; transition:opacity .2s; }
.glass-pill:hover::after{ opacity:1; }
```

### 2.8 Shadow / elevation tiers (map to existing z-index ladder)

| Tier | Token | Used by | z-index |
|---|---|---|---|
| flat data | `--shadow-sm` | board rows, cards | 1 |
| floating panel | `--glass-lift` | hero, YOU, top-5 rows | 1–10 |
| chrome | `--glass-lift` + nav hairline | nav | 60 |
| overlay | `--glass-lift-hi` | dock, drawers, Road-to-#1 | 90–120 |

### 2.9 Readability discipline (non-negotiable)

- **Glass:** nav, dock, drawer head + scrim, hero leader card, YOU tile, Road-to-#1 shell + odds, **at most the top ~5 board rows**, modal scrim.
- **Solid (keep `--surface`):** the other ~79 `.card-row`s, `.mtx` matrix + sticky `.rowlab`, scorecard ledger, FUT card art, `.beat` feed items.
- **Text on glass:** never on raw blur. Either the surface tint is ≥65% opaque (`--glass-tint-2`), or add `text-shadow:0 1px 2px rgba(0,0,0,.4)`. Target **4.5:1 against the worst-case composited backdrop**, not the token in isolation. Re-verify `--ink-2` (#AEB9C7) over `--glass-tint`; if it dips, **raise tint opacity, do not darken text**.
- **84-row rule:** ONE shared blurred backdrop behind the `.lb` list; rows are translucent tint cards **without their own `backdrop-filter`**. Row recipe: `background: color-mix(in srgb, var(--surface) 72%, transparent); border:1px solid rgba(255,255,255,.06);` + a single top inset hairline. Reserve true blur for `data-tier=champion` + the sticky YOU row only.

---

## 3) SIGNATURE MOTIFS + WOW MOMENTS

Keep the existing brand motifs (48-cell mesh `--cell48`, feTurbulence `--grain`, gold rim on hero/you `::before`). Layer glass on top. **4 wow moments:**

1. **The floating leader card** — the hero leader's FUT card sits on a Tier-2 refractive glass slab; on win-prob update the `%` runs a **specular sweep** left→right (`--spec-x` via `@property`). This is the "broadcast cold-open" beat.
2. **The rising board** — on scroll, each glass panel/zone does `glass-rise` (opacity 0→1, translateY 40→0, scale .96→1) staggered by row index; the 48-cell mesh parallaxes slower behind. The page *assembles itself*.
3. **The Road-to-#1 reveal** — entering the drawer, the live title-odds gauge counts up and a clear-glass headline refracts the gold mesh behind it; verdict cards stack-and-settle (§4) with green/red rails igniting.
4. **The floating dock** — the bottom dock detaches from the edge, floats on `--glass-lift-hi`, and its pills do a restrained `:hover scale(1.06)` catch-light — the always-present "cockpit controls hovering over the field."

`@property` for the animatable sweep:
```css
@property --spec-x{ syntax:'<percentage>'; inherits:false; initial-value:-20%; }
```

---

## 4) SCROLL & MOTION

**All scroll WOW is native CSS `animation-timeline` — zero scroll JS.** Off-main-thread, degrades to static on Firefox/Safari (the `both` fill + no timeline = final state shown). **Animate transform/opacity only — never animate `backdrop-filter` blur radius** (forces re-raster every frame; animate the opacity of a glass layer instead).

### 4.1 Replace the reduced-motion strategy

The current blunt global at `index.html:890` (`animation-duration:.001ms`) still *plays* zero-duration animations. Switch to **no-preference gating**: animations only *exist* when motion is allowed, and keep the existing block as a backstop.

```css
@media (prefers-reduced-motion: no-preference){
  .zone, .zone0, .zone1, .dock, .matchstrip .ma-card, .road-card{
    animation: glass-rise linear both;
    animation-timeline: view();
    animation-range: entry 0% entry 60%;   /* snappy; 'cover' over-animates */
  }
  @keyframes glass-rise{ from{opacity:0; transform:translateY(40px) scale(.96);} to{opacity:1; transform:none;} }
}
```
> **Gotcha:** the `animation` shorthand resets `animation-timeline` to `auto` — always set `animation-timeline` on the *next* line (as above), never inside the shorthand.

### 4.2 Where each effect applies

| Section | Effect | Recipe |
|---|---|---|
| All zones (`.zone`, `.zone0`, `.zone1`) | rise + fade on entry | `glass-rise`, `view()`, `entry 0% entry 60%` |
| Match strip (`.ma-card`) — horizontal | per-card pop as it snaps in | `animation-timeline: view(inline); animation-range: entry 10% cover 35%;` `@keyframes cardpop{from{opacity:.3;transform:scale(.92);}}` |
| Board rows (`.card-row`) | staggered reveal | set `--i` on each row in the existing FLIP loop; `animation-range: entry calc(var(--i)*2%) entry calc(40% + var(--i)*2%)` |
| Top progress bar | tournament-progress scrub | `.scroll-prog{position:fixed;top:0;left:0;right:0;height:3px;background:var(--gold);transform-origin:left;animation:grow linear;animation-timeline:scroll(root);z-index:200;} @keyframes grow{from{transform:scaleX(0);}}` |
| Page-bg mesh | parallax depth | second layer, `animation-timeline: scroll(root)`, slower translateY |
| Hero / Road odds `%` | specular sweep on update | JS toggles a `.sweep` class that transitions `--spec-x` -20%→120% |
| Road-to-#1 verdict cards | sticky-stack settle | `.road-card__content{position:sticky;top:0;animation:scale linear forwards;animation-timeline:--cards;animation-range:exit-crossing var(--start) exit-crossing var(--end);}` |

### 4.3 Reduced-transparency + forced-colors (ship both, non-negotiable)

```css
@media (prefers-reduced-transparency: reduce){
  .glass,.glass-pill,nav,.dock,.drawer-head,.glass--refract{
    -webkit-backdrop-filter:none; backdrop-filter:none;
    background: var(--surface); border-color: var(--line);
  }
}
@media (forced-colors: active){
  .glass,.glass-pill,nav,.dock,.drawer{ background:Canvas; border:1px solid CanvasText; box-shadow:none; }
  .glass::before{ display:none; }
}
```

### 4.4 Performance guardrails

- Cap live `backdrop-filter` to the fixed set in §2.9 — never every card.
- `content-visibility:auto; contain-intrinsic-size:0 56px;` on off-screen `.card-row` and `.beat` items.
- `will-change` stays **scoped to the one FUT card** (already at `index.html:781`); do NOT add to rows. If you add it for an animation, remove it after.
- `transform: translateZ(0)` only on the 1–2 Tier-2 surfaces to promote them.
- ≤560px: `--glass-blur` → `--glass-blur-sm` (12px), Tier-2 disabled, dock icon-only.

---

## 5) FLOATING WINDOWS (dock / panels / overlays)

### 5.1 Nav → clear-glass chrome (upgrade `index.html:159`)

```css
nav{ position:sticky; top:0; z-index:60; height:var(--nav-h);
  background: linear-gradient(to bottom, var(--nav-tint-top), var(--nav-tint-bot));
  -webkit-backdrop-filter: blur(var(--glass-blur-nav)) saturate(180%) brightness(1.1);
          backdrop-filter: blur(var(--glass-blur-nav)) saturate(180%) brightness(1.1);
  border-bottom:1px solid rgba(255,255,255,.10);
  box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, 0 8px 24px -12px rgba(0,0,0,.6); }
```
`.pool-switch` and `.navbtn` (except `.share`) adopt `.glass-pill`.

### 5.2 Dock → floating glass command bar (upgrade `.dock` `index.html:458`)

Detach from the page; float it. Desktop = centered pill; mobile = sticky bottom bar.
```css
.dock{ position:sticky; bottom:14px; margin:0 auto; width:max-content; max-width:calc(100% - 28px);
  display:flex; gap:6px; padding:8px; border-radius:999px; /* + .glass mixin */
  box-shadow: var(--glass-lift-hi); }
```
- Keep dock buttons as `<button>` (already keyboard-focusable); add `aria-current="page"` on the open drawer's pill.
- `:hover scale(1.06)` only, gated `@media (prefers-reduced-motion: no-preference)` — **no JS mouse-magnification**.
- **Grid goes 5→6** to fit the Road-to-#1 entry (mobile already wraps).
- Optional cmd-K spotlight reuses existing `lbSearch` + jump-to-me logic; not required for v1.

### 5.3 Drawers → floating glass sheets (upgrade `.drawer` `index.html:477`)

- `.drawer-head` becomes glass (bump its `color-mix` to `--glass-tint-2` + `backdrop-filter: blur(var(--glass-blur)) saturate(140%)`) so the header floats over the scrolling body.
- **`.drawer-body` stays opaque** (`--surface`) — it holds data.
- `.scrim` gains blur: `backdrop-filter: blur(8px) saturate(120%)` (currently `index.html:475` is a flat dark rgba — add blur). Modal scrim at `index.html:682` already blurs(4px) — bump to 8px for parity.
- **Desktop ≥1024px:** render drawers as a **centered floating glass card** (max-width 760px, all corners `var(--r-xl)`, `translateY+scale` entrance), Tier-2 edge under `.has-refract`. Mobile keeps the slide-up sheet (`translateY(100%)→0`).

---

## 6) SCREEN-BY-SCREEN RESKIN (the one cockpit)

> Glassify the chrome and the 2 signature tiles; keep every data surface solid. Each item below = the surgical change.

- **Zone-0 story bar (`.zone0` :228):** wrap in `.glass` (Tier-1), keep the gold `--cell48` overlay. It's chrome/headline, not data — glass is correct. Add `glass-rise` on entry.

- **Zone-1 hero leader card (`.hero-tile` :248):** this is **wow #1**. Apply `.glass .glass--refract` over the existing `--score-bug-grad` (refraction sits on top; keep grain + gold rim). The FUT card inside stays its opaque holo art. The `.hero-gauge .track i` win-prob fill keeps its `width .5s` transition; on update add `.sweep` → specular sweep across the `%` (`.hero-gauge .glab .v`). `transform:translateZ(0)` to promote.

- **Zone-1 YOU tile (`.you-tile` :281):** apply `.glass` (Tier-1). Keep the gold top rim, the rank big-number, the 3-cell grid. The `.you-sc-btn` **stays solid gold** (it's the primary CTA, like share). Add an entry to open Road-to-#1 here too (see §7.6).

- **Zone-2 match strip (`.matchstrip` / `.ma-card` :314):** cards stay **solid `--surface`** (they're dense match data) but gain `cardpop` on horizontal snap (§4.2) and the `.glass::before` specular *ring only* (no backdrop blur — too many cards). Stakes dropdown inside is unchanged.

- **84-row standings (`.lb` / `.card-row` :352/:357):** the hardest case. Put ONE `.glass` backdrop behind the `.lb` list. Rows become translucent tint cards per §2.9 — **no per-row `backdrop-filter`**. Only `data-tier=champion` and the sticky YOU row get true blur + the full `.glass` shadow. Keep tier washes, mover rails, `data-you` highlight, tabular nums. Add `content-visibility:auto` + `--i` stagger. **Readability is the priority — if blur ever hurts the 4.5:1, drop it and keep tint.**

- **Narrative feed (`.beat` :443):** stays **solid** with its colored left rail (`--b-bar`). Add `content-visibility:auto`. No glass — it's a scannable log.

- **Drawers (matches / board / brackets / titlerace / more):** glass head + scrim per §5.3; bodies (matrix `.mtx`, podiums, h2h, scorecard) stay opaque. The `.mtx` sticky `.rowlab` (`index.html:712`) **must stay solid `--surface`** or the table becomes unreadable.

- **Scorecard sheet (`.scorecard` :566):** reuses `.drawer` chrome → inherits the glass head automatically; the ledger body stays solid. No other change.

- **FUT card (`.fut-card` :781):** unchanged — already opaque holo art with scoped `will-change:transform` and pointer tilt. Do NOT glassify; it's the jewel that glass *frames*.

---

## 7) ROAD TO #1 (the signature feature)

> **Promote, don't rebuild.** A `titlerace` drawer scaffold already exists (`renderTitleRaceDrawer`, `drawersBuilt.titlerace`, `index.html` dock + `app.js:1594/1642`) and a conditional-odds pipeline already runs (`startRooting()` at `app.js:1603`, using `MC.simulate({…, condition:{match, matchKey}})` to get per-outcome `dWin` deltas vs the base sim). Road-to-#1 is the **beautiful, full-screen-glass promotion** of that drawer for the `/TARS/` viewer. **No engine/scoring/MC change** — one thin helper at most.

### 7.1 Gating

- Render the full leverage view **only for the signed-in `/TARS/` entry** (`YOU_RE = /TARS/`, `app.js:66`).
- For everyone else (when sharing a non-TARS view), show the existing "In contention" framing — same layout, headline reads "Title odds" with no rival-leverage board.

### 7.2 Data (all already present)

| Need | Source | Notes |
|---|---|---|
| Live title odds | `MC.simulate(...).winProb[youName]` | base sim already cached in `simCache.sim` (4000 sims, `app.js:1576`) |
| Podium / exp rank | `.podiumProb`, `.expRank` | same call |
| Per-outcome points swing for *every* entry | `MC.stakes(state, entries, match).outcomes[i].deltas[name]` | already used in stakes UI |
| Conditional title odds under a forced result | `MC.simulate({…, condition:{match, matchKey}}).winProb[youName]` | already computed in `startRooting()` as `dWin` |
| Upcoming matches | `nextUpcoming(state, n)` (`app.js:1600`) | `state==='pre'`, date-sorted |
| Rivals ahead | `lastRows` (leaderboard) filtered to `rank < myRank` | |

### 7.3 Component layout (clear-glass + Tier-2)

```
┌─ ROAD TO #1 (drawer / desktop floating card) ───────────────┐
│  [A] ODDS HEADLINE   .glass--refract   ← wow #1 + #3         │
│      "TITLE ODDS"  →  12.4%  (champion-star FUT number)      │
│      podium 31% · exp rank 4.2 · gap to #1: 8 pts            │
│      specular sweep animates the % on every sim update       │
├─────────────────────────────────────────────────────────────┤
│  [B] LEVERAGE-RANKED UPCOMING MATCHES  (sticky-stack list)   │
│      each = .road-card (glass-pill verdict)                  │
│      ▸ BRA vs ARG · R16 · today                              │
│        HELPS  +1.8% odds  ·  net vs rivals ahead             │
│        "A Brazil win closes 4 pts on Rahul (#3),             │
│         loses 2 to Aakash (#2)"  [green left rail]           │
├─────────────────────────────────────────────────────────────┤
│  [C] RIVALS-AHEAD BOARD                                       │
│      mini-rows: #2 Aakash  +8 pts  ·  #3 Rahul  +4 pts       │
│      (gap, their champion pick alive/dead, h2h winProb)      │
├─────────────────────────────────────────────────────────────┤
│  [D] WHAT HAS TO HAPPEN                                       │
│      bullet list of the highest-leverage HELP outcomes        │
│      "Root for: Brazil, Spain, France to advance"            │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 The HELP/HURT computation (exact)

For viewer `me = youName` and each upcoming match `m`:
```
rivalsAhead = lastRows.filter(r => r.rank < myRank).map(r => r.name)   // or within striking gap (≤ topGap pts)
stk = MC.stakes(state, POOL.entries, m)
for each outcome o in stk.outcomes:                 // home / draw / away
   myDelta = o.deltas[me]
   for each rival r in rivalsAhead:
      net_r = myDelta - o.deltas[r]                  // >0 closes the gap on r
   matchVerdict(o) = sign( aggregate over rivalsAhead )  // sum or worst-case
verdict(m) = the outcome's net direction:
   HELPS  → net>0 vs the rivals ahead  (green, --win, up chevron)
   HURTS  → net<0                       (red, --loss, down chevron)
   MIXED  → helps vs some, hurts vs others (gold, --gold)
leverage(m) = max |net| across outcomes × |dWin|   // sort B descending by this
```
- **Odds delta** (`dWin`) comes straight from the existing `startRooting()` conditional-sim loop — surface it instead of only feeding the move tile.
- **Specific-rival copy** is built from `o.deltas[rival]` so each card literally names who it closes/loses ground to. Reuse the `.stk-out` team-rail language already built.

### 7.5 Styling (reuse tokens)

- `.road-card` = `.glass` shell + left rail colored by verdict: `--win` / `--loss` / `--gold` (3px, like `.stk-out::before`).
- Verdict pill = `.glass-pill` tinted with `color-mix(in srgb, var(--win) 18%, transparent)` (HELPS) etc.
- "This match matters most" (top-leverage) card gets the `.glass::before` conic specular ring glow.
- Odds number uses `--f-num` + `font-variant-numeric:tabular-nums` (champion-star style, like the FUT card).
- Highest-leverage card animates its rank-delta arrow with the specular sweep on scroll.

### 7.6 Wiring (minimal)

- Promote the **dock to 6 cells** (§5.2); 6th pill = "Road to #1" (gold-accented when it's the viewer's; live `dWin` badge optional).
- Add a **"Road to #1 →" button on the YOU tile** (next to `.you-sc-btn`) for the `/TARS/` viewer.
- `renderTitleRaceDrawer()` already re-runs in `applySim()` (`app.js:1594`) — extend it to render A–D. The conditional `dWin` values are already populated lazily by `startRooting()`; read from `rooting.items`.
- One optional thin helper (if you want odds-under-forced-result outside the rooting loop): `MC.conditionalWinProb(state, entries, match, key, you)` = wrapper over the existing `MC.simulate({…, condition})`. Not strictly needed — `startRooting()` already does it.

---

## 8) VERCEL

### 8.1 `vercel.json` (repo root — zero build, output dir = `wc26-leaderboard/` or repo root)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    { "source": "/sw.js",        "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/index.html",   "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/",             "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/manifest.json","headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/(.*)\\.js",    "headers": [{ "key": "Cache-Control", "value": "public, max-age=300, must-revalidate" }] },
    { "source": "/(.*)\\.(css|svg|png|woff2)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}
```
> **Critical:** the app's JS (`data.js`, `app.js`, `engine.js`, `mc.js`, …) is **unhashed**, so it is `max-age=300, must-revalidate` — **NOT** `immutable`. Only truly static assets (css/svg/png/woff2 — note we have none of our own hashed JS) get `immutable`. `cleanUrls:true` serves `index.html` at `/`.

### 8.2 Connect steps

1. `git remote -v` confirms `srijanshukla9/wc26-pool-live`.
2. Commit `vercel.json` at repo root.
3. Vercel dashboard → **Add New → Project → Import** the GitHub repo. Framework preset: **Other**. Build command: **none**. Output dir: repo root (or set Root Directory to `wc26-leaderboard/` if the site lives in that subfolder).
4. Deploy. Vercel **auto-purges its CDN on every deploy** — this is what actually cures the GitHub-Pages "one reload behind" staleness.

### 8.3 Service-worker decision

**Keep the existing network-first SW** (`sw.js`) — it is already correct: network-first shell, cache-first immutable assets, network-first feed. Two required edits:
1. **Bump `VERSION`** `'fpp-v2'` → `'fpp-v3'` when shipping the reskin (purges old shell caches).
2. The `scoped()` helper uses `self.registration.scope` — on Vercel the scope is `/` (root), so it **just works**; no code change needed (it was the GH-Pages subpath that needed it).
3. The `vercel.json` `/sw.js` `max-age=0, must-revalidate` (Vercel's own documented SW recipe) ensures the SW file itself is never stale.

> If offline is *not* a requirement, the SW could be dropped entirely and rely on Vercel's CDN — but **keep it**: it's already battle-tested and network-first means deploys land immediately anyway.

---

## 9) PHASED BUILD PLAN

**Phase 0 — Vercel + SW (decouples hosting from the reskin; ship first).**
`vercel.json` at root, import repo, bump SW `VERSION`. Confirm a deploy lands instantly. ~½ day.

**Phase 1 — Glass token system + mixins.**
Add §2.3 tokens, `.glass`, `.glass::before`, `.glass-pill`, `--property --spec-x`, the `<svg id=lg>` + `.has-refract` feature test. No surfaces changed yet — pure infrastructure. ~½ day.

**Phase 2 — Chrome glassification.**
Nav (§5.1), dock floating bar + 5→6 grid (§5.2), drawer heads + scrims (§5.3), pool-switch/navbtn → `.glass-pill`. Verify nothing data-bearing turned translucent. ~1 day.

**Phase 3 — Signature tiles.**
Hero leader card Tier-2 refraction + specular sweep (wow #1), YOU tile Tier-1. ~1 day.

**Phase 4 — Scroll motion.**
`glass-rise` zone reveals, `cardpop` strip, row `--i` stagger, scroll-progress bar, mesh parallax. Replace reduced-motion block with no-preference gating; add reduced-transparency + forced-colors. ~1 day.

**Phase 5 — 84-row board glass (careful pass).**
ONE shared backdrop, translucent tint rows, blur only on champion + YOU row, `content-visibility`. **Contrast audit here** — measure `--ink-2` on the worst row. ~1 day.

**Phase 6 — Road to #1.**
Promote `renderTitleRaceDrawer` to the A–D layout, surface `startRooting()` `dWin`, build HELP/HURT + rivals-ahead board, dock + YOU-tile entries. ~1.5–2 days.

**Phase 7 — Accessibility + perf QA.**
Reduced-motion/transparency/forced-colors verified; Lighthouse INP on a mid phone; cap simultaneous backdrop-filters; 360px blur drop. ~½ day.

---

## 10) OPEN QUESTIONS FOR THE OWNER

1. **Tier-2 scope:** confirm refraction is limited to the **hero card + Road-to-#1 odds headline** only (the recommendation), or do you want it on the dock too (more wow, more Chromium-only GPU cost)?
2. **Dock 5→6:** OK to add a 6th dock pill for Road-to-#1, or should it live *only* on the YOU tile to keep the dock at 5?
3. **"Rivals ahead" threshold:** strictly everyone with `rank < myRank`, or only those within a striking gap (e.g. ≤ X points / top N)? Affects how busy the leverage board gets in the 84-pool.
4. **Verdict aggregation:** when a result helps vs one rival but hurts vs another (MIXED), do you want a single net verdict (sum) or to show the split explicitly per rival (richer, longer cards)?
5. **Light theme priority:** is the dark broadcast theme the only one that must look flawless, or does light theme need equal glass polish for v1?
6. **Root directory on Vercel:** is the deployable site the repo root, or the `wc26-leaderboard/` subfolder? (Sets the Vercel "Root Directory" and the `vercel.json` location.)
7. **cmd-K spotlight:** in-scope for v1 dock, or defer? (Reuses existing search; small but not free.)
8. **SW:** keep the service worker (offline support + instant deploys) or drop it entirely now that Vercel's CDN handles freshness?
