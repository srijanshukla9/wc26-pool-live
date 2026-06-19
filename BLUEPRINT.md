# FIFA Prediction Pro — THE BLUEPRINT
**The definitive, world-class build plan. FIFA-realistic. One-glance cockpit. Stunning photo cards. One-stop WC companion.**

> Status: this supersedes the *implementation roadmap* of `DASHBOARD-SPEC.md` and `DESIGN-SPEC.md`. The token palette, type stack, and the 48-cell motif from those specs **stay in force** — this document makes them deeper, photographic, and FIFA-real. Everything below is concrete: hexes, pixels, URLs, function signatures, and exact `engine.js` diffs. Build against the existing primitives (`VIZ.*`, `Engine.*`, `MC.*`) — minimal new surface area, maximal craft.

---

## 1. THE VISION (3 sentences)

A daily-open World Cup 2026 cockpit that looks like a FIFA broadcast graphics package — black-and-gold chrome, national-team color theming, FUT-grade holographic player cards — where your friend group's pool standing, the live tournament, and the human story ("who overtook whom and why") all live on one stunning screen. The headline **Points** number is the single source of truth, computed live and **byte-for-byte identical to fifaprediction.online's official live score** — no more "projected vs official" confusion. It is fast on a phone, runs 100% client-side on GitHub Pages with zero API keys and only free/legal imagery, and gives 94 people across two pools a reason to open it every single day of the tournament.

---

## 2. ASSET PLAN (decisive)

Every image degrades down a chain so a card is **never** empty and **never** shows a broken icon. All four sources below are verified keyless + CORS-open (`Access-Control-Allow-Origin: *`).

| Asset | Source (decided) | URL pattern | License reality |
|---|---|---|---|
| **Flags** | **flagcdn.com** | `https://flagcdn.com/{iso2}.svg` (crisp, vector) · raster `https://flagcdn.com/w320/{iso2}.png` · circular slots `https://hatscripts.github.io/circle-flags/flags/{iso2}.svg` | Public domain (government works). No attribution. Cloudflare-cached. |
| **Federation crests** | **ESPN** (already wired) | harvest `team.logo` from the live scoreboard feed (`engine.parseEspn` already stores `matches.logos[poolName]`); static fallback `https://a.espncdn.com/i/teamlogos/countries/500/{abbr}.png` | Trademarked federation marks → fine for a **private, unmonetized, editorial fan companion**. Keep the "unofficial fan companion" disclaimer. |
| **Kits / jerseys** | **`VIZ.kit()` SVG generator** (keep + upgrade) | n/a — generated from the 48-team `KITS` hex map in `viz.js` | 100% original art, offline, zero risk. **Do not chase kit photos — no clean/legal CDN exists.** |
| **Star-player cut-outs** | **Wikimedia/Wikipedia**, resolved **at build time** | `https://en.wikipedia.org/api/rest_v1/page/summary/{Player}` → `thumbnail.source` / `originalimage.source` on `upload.wikimedia.org` | CC BY-SA / CC BY → **must show a tiny photographer + license credit**. `upload.wikimedia.org` sends `timing-allow-origin: *` (canvas-safe). |

**Rejected sources (do not use):** Sofascore / FotMob / API-Football player images — verified **HTTP 403** from datacenter IPs, ToS-violating hotlinking, will intermittently break for real users. ESPN soccer **headshots** are CORS-clean but **sparse** (most IDs 404 or return the generic dashed-line template) — opportunistic bonus only, never the backbone. **Never** embed the official FIFA WC26 emblem, mascot, or "We Are 26" marks (registered trademarks).

### The honest answer on "stunning cards with main player photos"

The owner's mental image is a FUT card with a face on it. There are **three** ways to get a face, and they answer different questions:

- **(A) Friend photos** — the real people in the pool. There is **no automated source**; the owner (or each friend) must supply a cropped headshot. This is the *most personal and most stunning* outcome but requires manual collection. **This is OPEN QUESTION #1.**
- **(B) Star-player cut-outs of each entry's CHAMPION pick** — legal, keyless, automatic. A Spain-champion card gets a Wikimedia cut-out of a Spain star (e.g. their marquee player) over a Spain-color gradient. This makes the card feel like a *football* card even with zero friend photos. Resolved once at build time into `players.js`, with attribution baked in.
- **(C) Rich generated card (champion HERO treatment)** — the strong, always-available default: large faded country **flag** as the card's background hero + the large ESPN **crest** as the centerpiece + the `VIZ.kit()` jersey motif bottom-right + the `VIZ.avatar()` initials glyph for the player identity. This already looks designed, not empty.

**RECOMMENDED PATH (ship this, no blocking on the owner):**
> Build the card so its photo zone resolves in this exact order, each with an `onerror`/fallback so it silently degrades:
> **friend photo (B-tier optional) → champion star cut-out (Wikimedia) → champion HERO (flag + crest + kit) → `VIZ.avatar()` glyph.**

This means Phase 1 ships a **gorgeous card today** (HERO treatment for everyone), Phase 2 layers in champion star cut-outs from the build-time `players.js` map, and friend photos drop in per-player the moment the owner pastes a path into `data.js` (`photo:'assets/players/srijan.jpg'`) — no rebuild of the card system. The headline of each card is the **champion pick's identity** (their headline bet), so a champion star cut-out reads as "this is Srijan's Spain card" — which is more evocative for a *prediction* pool than a selfie anyway.

### Build-time asset pipeline (the decisive mechanism)

Wikimedia filenames are hash-pathed and rename-prone — you **cannot** construct them at runtime. Add a sibling build script (next to the existing `reduce-multi.mjs` / `probe-topology.mjs`):

```
build-players.mjs  →  for each of the 48 teams, take 1 curated marquee player,
                       GET en.wikipedia.org/api/rest_v1/page/summary/{Player},
                       emit players.js: {
                         'Spain': { star:'…', photo:'https://upload.wikimedia.org/.../330px-….jpg',
                                    credit:'Photographer / CC BY-SA 4.0' }, …48 }
```
Run on your machine with a descriptive UA (`FIFAPredictionPro/1.0 (https://srijanshukla9.github.io; srijan@metawareit.com)`), hardcode the resolved immutable URLs, ship the file. **Zero runtime API calls, instant load, survives endpoint hiccups, attribution baked in.** Use only standard thumbnail widths the API returns (220/330/440/500) — arbitrary widths 400 with `Use thumbnail sizes listed`.

Also pre-seed a static **TEAM → {iso2, espnAbbr}** map (48 entries) so flags/crests render before a team's first fixture loads. Note the gotchas: South Korea ESPN abbr = `kors` (not `kor`); subdivision flags England=`gb-eng`, Scotland=`gb-sct`, Wales=`gb-wls`.

---

## 3. THE COCKPIT (single-screen layout)

One vertical scroll, but the **above-the-fold zone answers the glance in <1 second**. Two visual lanes: **ESPN-maximal** (glow, depth, team-color, grain, crest watermark) for the hero + match cards; **NBC-minimal** (whitespace, hairlines, status-only color) for the dense board.

### Layout zones (top → bottom)

```
┌─ STICKY NAV ── brand "26" mark · pool switcher [Friends 10 | Open 94] · LIVE pill · theme ─┐
├─ ZONE 0  STORY BAR ── one Archivo-slab sentence: the day's single biggest fact ───────────┤
├─ ZONE 1  THE COCKPIT (the one-glance hero) ──────────────────────────────────────────────┤
│   ┌──────────────────────────────────┐  ┌───────────────────────────┐                     │
│   │  HERO — POOL LEADER full card     │  │  YOU tile (your standing) │                     │
│   │  champion star cut-out / HERO     │  │  rank ▲▼ · Points · gap   │                     │
│   │  POINTS 152  (display-xl, breaks  │  │  next move needed         │                     │
│   │  the frame) · crown · WIN% gauge  │  └───────────────────────────┘                     │
│   └──────────────────────────────────┘  ┌───────────────────────────┐                     │
│                                          │  MOVE OF THE DAY (mover)  │                     │
│                                          │  ▲2 overtook X because… │                     │
│                                          └───────────────────────────┘                     │
├─ ZONE 2  LIVE MATCH STRIP ── horizontal scroller of live/just-finished match analysis cards┤
├─ ZONE 3  STANDINGS BOARD ── dense card-rows (10 full / 94 virtualized), tier rails, deltas │
├─ ZONE 4  NARRATIVE FEED ── 2–3 surfaced story beats + rivalry watch + streaks ────────────┤
└─ DRAWER DOCK ── Matches · Full Board · Brackets · Title Race (charts) · More ──────────────┘
```

### The FIFA-realistic visual system

**Palette (brand-constant chrome = black + gold; team color = the live layer).**
- Canvas `--canvas:#0A0E14`; surface ladder `--surface:#10151F` / `--surface-2:#161D2A` / `--surface-3:#1D2636`.
- **Gold is the only champion/winner chroma** (already official-correct): `--gold:#E8B73A` · `--gold-deep:#B98714` · `--gold-soft:#F4D27A`. This matches the WC26 black/white/gold emblem system.
- **Demote azure** `#1FA2FF` from "everything accent" to **win%/info only**.
- Status semantics only: `--live:#FF2D55` · `--win:#2BD66A` · `--loss:#FF5C5C`. Every red/green pairs with a ▲/▼ glyph (passes cover-the-labels test).
- **`--team` CSS var per card** drives its left rail, its glow, and its number accent (from `VIZ.teamColor(champion)`), so the cockpit lights up in national colors like Apple Sports' country-dressed Live Activities — not a uniform dark dashboard.

**Type (one condensed-black numeral face, never two display faces).**
- Numbers/ratings: **Saira Condensed 900**, `font-variant-numeric:tabular-nums`, `letter-spacing:-.02em`. (Optional hero upgrade: **Anton** or **Archivo Black** for even more FWC-stadium impact.)
- Headlines / hero names / Zone-0 slab: **Archivo 800 uppercase**, `letter-spacing:.02em`.
- UI/body: **Inter**. Scale: `display-xl 64px` / `display-l 46px` / `display-m 34px`.

**The signature material devices (hero + match cards ONLY — not the dense board):**
1. **SVG `feTurbulence` grain** at 3–5% opacity over hero surfaces (data-URI, zero network cost) — "smooth gradient + fine grain = premium depth."
2. **Specular top-edge highlight:** `box-shadow: inset 0 1px 0 rgba(255,255,255,.08)` + the existing gold/team top-rule → reads as lit glass.
3. **3-step layered elevation** (rest / raised / hero), not one flat shadow: tight contact `0 1px 2px rgba(0,0,0,.5)` + soft ambient `0 12px 34px rgba(0,0,0,.55)`.
4. **Crest watermark:** every player + match card gets its team crest at **6–8% opacity**, large, bleeding off a corner.
5. **The 48-cell motif** (squares + quarter-circles, from the official emblem's 48-unit construction) replaces the generic grid mesh — faint corner watermark on the hero + masked bg texture. Free, legal, unmistakably WC26.

**Glassmorphism for OVERLAYS only** (drawers + sticky nav already use `backdrop-filter: blur(14px) saturate(140%)`) — never the base cards (kills contrast).

**Light + dark** are both first-class (tokens already define both). Dark is default. Keep both ramps; the gold + team-color system reads in both.

---

## 4. THE CARD SYSTEM (FUT-grade)

Two tiers for performance at 94 players: **dense card-rows** for the board, **full holo cards** only on click/expand.

### 4A. The full card (FUT anatomy, 300×420, aspect-ratio 5/7)

Map the canonical EA FC card to pool meaning:

| FUT element | Our mapping |
|---|---|
| **OVERALL RATING** (huge, top-left, ~68px) | the official **Points** number — Saira Condensed 800, tabular, the single dominant element |
| Position abbr under rating | `MGR` / `GAFFER`, or the champion team's 3-letter code; **👑 crown chip** swaps in for the rank-#1 leader |
| **Cut-out photo** (breaks the top frame) | the resolution chain from §2: friend photo → champion star cut-out → champion HERO → avatar. `mask-image: linear-gradient(to bottom,#000 70%,transparent)` fades the lower edge like a FUT cut-out; head crosses the top border ("break the frame" — THE signature move) |
| Nation flag / league / club crests | **champion crest** (largest, the headline bet) + **runner-up crest** + a **pool badge** roundel (`SP JAIN` / `OPEN`), with a flagcdn flag ribbon behind the champion crest |
| Name plate (lower third, uppercase) | player name, Archivo 800 uppercase |
| 6 stats row (PAC/SHO/…) | our breakdown row: **GRP · 3RD · KO · CHAMP** = exactly `{groups, thirdPlace, knockouts, champion}` |
| Corner ribbon | **"CHAMPION PICK"** diagonal corner ribbon (`transform: rotate(45deg)`) in the champion's primary color via `VIZ.teamColor(champion)` |
| **Back face** (flip on tap) | the narrative payload: group-by-group hits, champion/runner-up, current streak, head-to-head vs rivals, near-miss notes |

**Tier by RANK, not absolute points** (luminance-driven ink via existing `inkOn()` so the rating always reads):
- **#1 — SPECIAL "champion"** (reserved for the leader only): deep navy→gold radial + **full color-dodge holo foil** + idle "breathing" foil drift + 👑 crown. `palette base #1A1303→gold`.
- **#2–3 — GOLD:** `#B8860B→#FFD86E→#8A6A12` vertical, rim `#FFE9A8`, ink `#2A1E05`.
- **top-third — SILVER:** `#9AA3AD→#E8EDF2→#6B7480`, rim `#DCE3EA`, ink `#1B2733`.
- **rest — BRONZE:** `#7A4A2B→#C8854E→#5A3417`, rim `#E0A877`, ink `#2A1709`.
- **4th accent (movers):** green left-rail glow for climbers ≥2 spots since last sync, red for droppers — powers the "who overtook whom" narrative.

**Holographic interaction (exact pokemon-cards-css math, MIT — lift directly):** one rAF-throttled `pointermove` on the card sets CSS custom props: `--pointer-x/y` (0–100%), `--pointer-from-center` (`clamp(sqrt((y-50)²+(x-50)²)/50,0,1)`), `--rotate-x = -(centerY/3.5)`, `--rotate-y = centerX/3.5` (≈ ±15°), `--background-x/y` remapped into a narrow **37–63% / 33–67%** range. Parent gets `perspective:600px`; card uses only `transform`/`opacity` + `will-change:transform`.
- **Glare layer:** `radial-gradient(farthest-corner circle at var(--pointer-x) var(--pointer-y), hsla(0,0%,100%,.8) 10%, …0 90%)`, `mix-blend-mode:overlay` (gold/champion) or `soft-light` (silver/bronze).
- **Foil layer:** `repeating-linear-gradient` rainbow + conic, `mix-blend-mode:color-dodge`, opacity tied to `--pointer-from-center`. **Reserve full color-dodge foil for #1 + gold tier only**; silver/bronze get glare-only (phone perf).
- **Gyroscope** (`deviceorientation`) on the expanded card only, fine-pointer only.

### 4B. The card-row (dense, 56–64px, the board workhorse)

Left→right: `[rank, tabular Saira ~28px] [tier 4px left rail] [40px avatar/photo thumb + champion-crest micro-badge] [name + champion 3-letter code + tiny crest] [VIZ.probBar: Points as % of leader] [the Points number, big, right-aligned tabular] [delta chip ▲2/▼1/–]`. Tier gradient as a subtle 6–10% left-edge wash + tier rail → tier reads instantly. Hover = lift + single linear-gradient glare sweep (cheap; no 3D). **Click expands the row into the full holo card** (modal/flip). Reuse `VIZ.probBar()` for the inline bar.

### Photo handling, restated as the non-breaking chain
`<img>` with `onerror` cascade: `friend photo → Wikimedia champion-star → champion HERO (flagcdn flag bg + ESPN crest + VIZ.kit) → VIZ.avatar(name,{crown,teamColor})`. A card NEVER looks empty. All sources lazy-load (`loading="lazy"`). Unify mismatched friend selfies with a consistent CSS grade (subtle `contrast/saturate`, optional team-color duotone) + team-color ring; gold ring + crown for the leader.

---

## 5. NARRATIVE & QUIRKS ENGINE

This is mandate #2 — the daily-open moat. Build a **story-beat detector library** that consumes the data the app already produces and emits ranked, human one-liners.

**Substrate already in the codebase:**
- `rankHistory` ring buffer (`localStorage wc26-rankhist-<pool>`, 24 snaps, `{hash,ts,ranks:{name→rank}}`) — keyed by `resultsHash` so x-axis = matchdays. `rankSeries(name,max)` returns oldest→newest ranks.
- `MC.crowns()` per-window `{round, winners[], pts, done, gains{name→delta}, ranksBefore, ranksAfter}` — `ranksBefore` vs `ranksAfter` **is literally the overtake event**.
- leaderboard rows `{name,rank,points,breakdown,max,championAlive,…}`, MC `{winProb,podiumProb,expRank}`.

**The ~15 detectors** (each returns `{kind, severity, subjects[], html, bar?}`):

1. **Overtake** — A passed B this sync (`ranksBefore`/`ranksAfter` cross). "Naomi overtook Wayne for #2 after Spain's win."
2. **Leader change** — #1 changed hands. Highest severity.
3. **Biggest mover (up)** — max positive rank delta since last sync (existing `biggestMover`).
4. **Biggest faller** — max negative delta.
5. **Streak (rising)** — N consecutive syncs climbing (from `rankSeries`).
6. **Streak (cold)** — N consecutive syncs falling.
7. **Near-miss** — within 1–2 points of the row above (tension flag).
8. **Dead heat** — two+ entries on identical Points (tiebreak drama).
9. **Champion eliminated** — `!championAlive` flips true → −50 ceiling event. High severity.
10. **Champion survives scare** — picked champion won a knockout they could've lost.
11. **Differential hit** — an entry banked points from a pick few others made (rarity weighted across the pool).
12. **Chalk vs contrarian** — entry's bracket diverges most/least from pool consensus.
13. **Title-odds surge** — MC `winProb` jumped > X since last sim.
14. **Ceiling collapse** — `max` dropped sharply (key picks busted).
15. **Rivalry beat** — see rivalry model below.
16. **Group lockout / perfect group** — an entry nailed all 4 positions in a completed group (+16).

**Surfacing logic (2–3 best stories daily):** score each fired beat by `severity × recency × subject-relevance` (YOU and the leader get a relevance boost). Dedupe by subject (one beat per person per refresh). Cap the Zone-0 slab at the single top beat; Zone-4 feed shows the next 2–3. Each beat ties to the **real match result** that caused it + a one-line analysis (e.g. "+12 from Spain topping Group H").

**Rivalry model:** auto-detect rivalries as **pairs who have swapped ranks most often** in `rankHistory` OR sit within a small Points band all tournament; let the owner also pin manual rivalries in `data.js` (`rivals:[['Srijan','Kane']]`). Render a "Rivalry Watch" strip: head-to-head Points, current gap, swap count, and who's hot. This is the Sleeper-style social energy.

---

## 6. DATA VIZ

**Library decision: hand-rolled inline SVG, optionally + two D3 micro-modules.** Do **not** add Chart.js (~92KB, canvas, weak at bump charts + per-point photo labels, can't read CSS vars/theme), full D3, or ECharts. The page already hand-writes SVG paths (`bumpHtml`, `VIZ.kit/avatar`) with zero deps and renders crisp on phones; charts here are low-cardinality (≤24 x-points, 3–12 highlighted series of 94) and need per-series avatars/crowns/team-colors at line ends — trivial in SVG, awkward in canvas.
- **Tier 1 (preferred):** zero-dependency hand-rolled SVG.
- **Tier 2 (if you want correct scales):** ESM-import ONLY `d3-scale` (~3KB, `scaleLinear`/`scalePoint`) + `d3-shape` (~12KB, `line().curve(curveBumpX)`, `area()`) from a pinned CDN ESM build. Nothing else.

**The three charts (live in the "Title Race" drawer; one teaser in the cockpit):**
1. **RANK-RACE / BUMP** (the hero chart) — x = matchday (from `rankHistory`), y = rank **inverted** (#1 on top), `curveBumpX`. Highlight 3–6 series (leader + YOU + biggest movers); ghost the rest at low opacity. Line-end labels = `VIZ.avatar` glyph + 3-letter champion code; 👑 on the leader. Scale up the proven inline `bumpHtml` sparkline (already 56×22, inverted-y, `.hot` for YOU) into a full-size chart.
2. **TITLE-RACE AREA/LINE** — x = knockout window (`MC.crowns` 8 ticks: R1…FINALS), y = `winProb` (or smoother `expRank`). Stacked/overlaid title-odds over time.
3. **MOMENTUM** — per-row points-accumulation step chart from `crowns().gains`, + the inline `VIZ.probBar` striped "momentum" variant already in the board rows.

All charts: `currentColor`/CSS-var fills so they theme-switch and respect `prefers-reduced-motion`. Bars/lines draw from 0 on first paint (500ms), no jitter (`tabular-nums`).

---

## 7. MATCH ANALYSIS

A **per-match analysis card** in Zone 2 (horizontal scroller, newest/live first), built on the existing `VIZ.scoreBug` parallelogram so the broadcast skew is the throughline.

**Card contents:** the score-bug (team kits + team-color rails + LIVE pulse) · status/clock · a **one-line auto-analysis** · **pool impact** ("this result moved 3 of your entries").

**Auto-analysis generators** (templated from feed data, no LLM): upset flag (lower-Elo team beat higher via `ratings.js`) · clean sheet · late winner · group-decider ("Spain top Group H, advancing as winners") · knockout drama (pens — engine already resolves shootouts into winner flags) · "X is now eliminated / through."

**Exact ESPN data paths** (`engine.parseEspn` already reads most):
- Feed: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200` (fallback `api.fifa.com/api/v3/calendar/matches?idSeason=285023&idCompetition=17`).
- Per event: `events[].competitions[0].competitors[]` → `.team.displayName`, `.team.logo` (crest!), `.score`, `.winner`, `.homeAway`; `events[].status.type` → `.state` (pre/in/post), `.completed`, `.displayClock`, `.detail`; `events[].season.slug` → round (`ROUND_SLUGS`).
- For richer analysis pull (not yet read): `competitions[0].details[]` (goals/cards with `.clock`, `.athletesInvolved`), `.venue.fullName`, `.headlines[].shortLinkText`. Add these to `parseEspn` behind a flag so the existing scoring path stays frozen.

---

## 8. ONE-STOP CONTENT MODEL

"The tournament" and "our pool" coexist by **interleaving, not separating**: every tournament fact is rendered through its **pool consequence**.

- **Zone 0** = the day's single biggest fact (could be a tournament result OR a pool overtake — the narrative engine decides which is most severe).
- **Zone 1** = pool standing (hero leader + YOU + move of the day).
- **Zone 2** = tournament live matches, each annotated with *"how this moved your pool."*
- **Zone 4** = the story feed binds the two: "Spain 2–0 → Srijan +12, climbs to #4, overtakes Kane."
- **Drawer dock** (Apple-Sports "layered sequencing" — never show everything at once): **Matches** (full fixtures/results) · **Full Board** (all 94) · **Brackets** (crest-tree, not prose) · **Title Race** (the charts) · **More** (rules, export/share image, disclaimer, photo credits).

The above-the-fold answer is always: *your standing + the single most important story + what's live right now.* That's the reason to open it daily.

---

## 9. MOTION SYSTEM

Motion is **feedback, not decoration** — the seven rules from `DESIGN-SPEC.md §6`, all gated by `@media (prefers-reduced-motion: reduce)` (which drops tilt/foil/FLIP to static):

1. **Number tick-count** on change (240ms) — Points + Win% (existing `tickScan`).
2. **Bars fill from 0** (500ms, `cubic-bezier(.22,.61,.36,1)`).
3. **Live dot pulse** (1.4s).
4. **Rank-delta chip flash** once on movement.
5. **Score-bug hairline breathe** when live.
6. **Card holo:** rAF-throttled tilt + glare/foil (§4A); idle "breathing" foil drift on the leader card only.
7. **Card FLIP** to back face: `transform-style:preserve-3d`, `backface-visibility:hidden`, back `rotateY(180deg)`.

**The leaderboard FLIP reorder (the signature "things changed" moment):** when ranks change on sync, animate rows to new positions with the **FLIP technique** (First-Last-Invert-Play): measure each row's `getBoundingClientRect()` before re-render (First), apply the new DOM order (Last), set an inverting `transform: translateY(Δ)` (Invert), then transition to `transform:none` over ~420ms (Play). Overtaking rows briefly flash their mover glow (green/red rail) as they cross. GPU-only (`transform`/`opacity`, `will-change:transform`). This is what makes "who overtook whom" *visible*, not just stated.

No pies, no rainbow confetti, no stadium photos. Restraint everywhere except the hero card and the reorder.

---

## 10. SCORING RECALIBRATION (the precise fix)

**The diagnosis (confirmed against `official-scores.json`):** the official site now scores **groups LIVE** (3 Lions = 152, Naomi = 144, Srijan = 137 — all `{groups:N, thirdPlace:0, knockouts:0, champion:0}`). Our `engine.scoreEntry(entry,state,projected=false)` ("official" mode) gates group scoring behind `state.allGroupsComplete`, so it returns **0 for groups** until every group finishes — that's why the UI shows "0 official." Our **`projected` number (which scores live group tables) is the one that already mirrors the official live Points.** So the fix is a **relabel + reconcile**, not new math.

**The change in `engine.js`:**

1. **Make group scoring live by default.** In `scoreEntry`, replace
   `const scoreGroups = projected || state.allGroupsComplete;`
   with `const scoreGroups = true;` and always use the **live** tables/advancers for the group component (`state.liveTables`, `state.advLive`). The official site evidently scores the *current standings projection* of who's advancing/positioned, banked live. (Verify direction — see plan below.)
2. **Collapse to ONE number.** `leaderboard()` returns a single canonical **`points`** (= the live-group score), plus keep `max` (470 ceiling) and a NEW `secured` (points that are mathematically locked — from completed groups + decided knockouts) for the secondary detail line. Drop the public `projected`/`official` split from the glance surface. Sort by `points` (tiebreak `secured`, then `max`, then name).
3. **Breakdown shape** stays `{groups, thirdPlace, knockouts, champion}` to match the official site's breakdown exactly (so the card stat-row maps 1:1).
4. **Keep `maxPossible` and the `secured/in-play/ceiling` stacked bar** — but as *secondary detail inside the expanded card*, never competing with the hero number.

**Verification plan (must pass before shipping):**
- Write `test-recalibrate.mjs`: load the **same live results** the official scores were captured from, run the new `leaderboard()`, and assert **every entry's `points` === its `official-scores.json` score** (e.g. 3 Lions 152, Naomi 144, Srijan 137, Trevor 136…). This is the ground-truth oracle — 84 exact equalities.
- If any row is off by a constant or a multiple of 3/4, that pins which sub-rule (advancing 3-pt vs position 4-pt vs which tables snapshot) the official site uses — tune `scoreGroups` to match, re-run until **100% exact**.
- Add a CI assertion in `test.mjs` so the engine can never silently drift from the official number again.
- **Open data question:** confirm whether the official site scores on **live in-progress** scores or only **completed matches** within the group stage (affects whether `includeLive` should be `state==='in'`-inclusive). The oracle test will reveal this; if 152 only reconciles with completed-only, gate the group component on `m.completed`.

---

## 11. ARCHITECTURE

- **Static site, client-only, GitHub Pages.** No backend, no secrets, no build server required at runtime. Keep the current file set (`index.html`, `app.js`, `engine.js`, `mc.js`, `viz.js`, `ratings.js`, `data.js`) + new `players.js` (build-time photo map) + `cards.js` (card builder + holo controller) + `narrative.js` (beat detectors).
- **Data:** live ESPN feed (keyless, CORS-open) with FIFA fallback, both already wired. `resultsHash` gates rank-history snapshots. All compute (scoring, MC, narrative) runs in the browser; MC is seeded `mulberry32(42)` for deterministic output.
- **Perf budget (phone-first):** virtualize the 94-row board (render visible rows only); mount the color-dodge holo foil + gyroscope **only on the expanded card**; throttle `pointermove` via rAF (one CSS-var write/frame); lazy-load all crests/flags/photos; disable foil + gyro on `(hover:none)` coarse pointers (glare-only). GPU-only transforms with `will-change`. Target: hero answers the glance <1s, interactions sub-100ms.
- **Assets:** flags (flagcdn SVG, cached), crests (ESPN feed + static fallback map), photos (build-time `players.js` immutable Wikimedia URLs), kits (generated). Hash-pathed URLs are immutable — no cache-busting.
- **PWA:** keep/extend `manifest.json` + add a service worker that caches the app shell (HTML/JS/CSS) + the flag/crest/photo set for **offline + instant repeat loads**; network-first for the live feed, cache-first for assets. Installable to phone home screen → the "open it every day" affordance.
- **Accessibility:** `prefers-reduced-motion` honored everywhere; ink-on-fill contrast via `inkOn()`; status never color-only (always paired glyph); `aria-label`s on bars/cards (already in `VIZ.probBar`).

---

## 12. PHASED BUILD PLAN

**Phase 1 — TRUTH + COCKPIT (ship first, highest value).**
- `engine.js` recalibration (§10) + `test-recalibrate.mjs` passing 100% against `official-scores.json`. **One true Points number everywhere; kill projected/official confusion.**
- Rebuild Zone 1 cockpit: single dominant HERO leader card (HERO treatment — flag + crest + kit, no photos needed yet), display-xl Points that breaks the frame, WIN% gauge, YOU tile, Move-of-the-Day tile. Black+gold chrome, `--team` theming, the 4 material devices, 48-cell motif.
- Card-row board (§4B) with tier rails + delta chips. Leaderboard FLIP reorder (§9).
- *Outcome: a stunning, truthful, one-glance cockpit on day one — zero new asset dependencies.*

**Phase 2 — PHOTOS + FULL CARDS.**
- `build-players.mjs` → `players.js` (champion-star Wikimedia cut-outs + credits).
- Full FUT holo card (§4A) with the pokemon-cards-css tilt/glare/foil, tier system, flip-to-back narrative face, click-to-expand from rows.
- Photo resolution chain wired (`friend → star → HERO → avatar`); friend-photo `photo:` key honored in `data.js`.
- *Outcome: the "stunning cards with main player photos" mandate, legally and keylessly.*

**Phase 3 — NARRATIVE + LIVE COMPANION.**
- `narrative.js`: the 15 beat detectors + surfacing + rivalry model (§5). Wire Zone 0 + Zone 4.
- Zone 2 match-analysis cards with auto-analysis + pool-impact (§7); extend `parseEspn` (behind a flag) for goals/cards/venue.
- *Outcome: the daily-open reason — story, rivalries, "who overtook whom and why."*

**Phase 4 — CHARTS + PWA + POLISH.**
- Title-Race drawer: bump / win-prob / momentum charts (§6, hand-rolled SVG, optional d3-scale/shape).
- Service worker + offline + installable PWA (§11). Share-image export polish.
- *Outcome: depth on demand, installable, offline-fast.*

---

## 13. OPEN QUESTIONS FOR THE OWNER

1. **The "main player photos" reality — friend photos vs star imagery.** The recommended path ships gorgeous cards *without* friend photos (champion star cut-outs + HERO treatment). But if you want actual **friend faces** on the cards (most personal), there's no automated source — you'd need to collect ~10 (Friends pool) and/or ~84 (Open pool) cropped headshots and drop paths into `data.js`. **Decision: (a) star/HERO cards only [ship now], (b) friend photos for the 10-person Friends pool only [realistic], or (c) friend photos for all 94 [heavy lift]?** Recommend (a) now, (b) as a fast follow.

2. **Licensing comfort on crests + star cut-outs.** Federation crests (ESPN) and CC-licensed Wikimedia player photos are low-risk for a **private, unmonetized fan companion** with the disclaimer + photo credits. Are you comfortable shipping these as-is, or do you want crests-and-flags-only (no player photos at all)? This decides whether Phase 2 runs.

3. **Confirm the official scoring direction (one quick check).** Does fifaprediction.online's live group score use **in-progress** match scores or **only completed** matches? The oracle test in §10 will tell us, but if you already know (e.g. you watched a score tick mid-match on the official site), say so — it saves a calibration loop.

4. **Open pool count: 84 entries but the brief says 84/94 — and `official-scores.json` has visible duplicates** ("Akagami Shanks", "Ken Adams", "My bracket" ×4, "Kane Gonsalves" twice with different scores). Do you want duplicates **merged, kept as distinct entries, or pruned**? This affects the board count and the "94" label. Recommend keeping distinct (they're real separate brackets) but flagging exact-duplicate names in the UI.

---

*Build against the existing primitives. The codebase already has the bones (token system, type scale, score-bug, kits, avatars, prob-bars, rank-history, MC engine). This blueprint is about CRAFT, DEPTH, PHOTOGRAPHY, TRUTH, and STORY — not re-architecture.*
