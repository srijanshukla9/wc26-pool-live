# FIFA Prediction Pro — ONE-SCREEN DASHBOARD SPEC v2.0

**The brief, in one line:** kill the five tabs. Build ONE glanceable broadcast screen that answers **who's winning · where am I · what changed · why · what's next** in under 2 seconds, then hides everything else behind tap-to-open drawers. Ruthless simplification + top-1% polish, not more features.

This supersedes the IA of `DESIGN-SPEC.md`. **The visual language (tokens, type, motifs, motion) in `DESIGN-SPEC.md` stays in force** — same `--gold`/`--accent` palette, Saira Condensed mega-numerals, score-bug, 48-cell mesh, tabular figures, the seven motion rules. We are re-architecting the *layout and IA*, not the look.

**Data is already there.** Every number below already exists in `app.js` / `engine.js` / `mc.js`:
`rows` = `Engine.leaderboard()` → `{name, rank, champion, runnerUp, official, projected, projectedBr, max, championAlive}`; `prevRanks` (one matchday back); `simCache.sim` = `{winProb, podiumProb, expRank, sims}` (4000 Monte Carlo); `crownsCache` rows `{round, winners[], pts, done, gains}`; `MC.stakes(state, entries, match)` → `{outcomes:[{key,label,deltas{name→±pts}}]}`; rooting `dWin` = Δ your title odds per outcome; `whoCalled(match,state)` → `{winner, predicted[]}`. The only NEW persistence required is a **rank-history ring buffer** (see §3) for the bump sparkline.

---

## 1. THE ONE-SCREEN LAYOUT

A single vertical scroll, **no tab bar**, six zones in strict F-pattern priority order. Built on a 12-col grid, 16px gap, 24px container padding (8px base). Hierarchy comes from **SIZE**, never decoration. The litmus test the owner gets: *10 seconds → reads Zone 0+1; 1 minute → Zones 0–3; only investigators open a drawer.*

Desktop column math (12-col): HERO = 7 cols, YOU = 5 cols (Zone 1 is one row of two tiles). Tablet → 2-col. Mobile → 1-col stack in the same order.

```
┌─────────────────────────────────────────────────────────────┐
│ NAV  [26] FIFA Prediction Pro   ‹Friends 10 | Open 84›  ↻ ☾  │  pool switcher + refresh + theme (only persistent chrome)
├─────────────────────────────────────────────────────────────┤
│ ZONE 0 — TODAY'S STORY (full-bleed headline band)            │  ALWAYS. one auto-narrative sentence, the day's single fact.
├──────────────────────────────────┬──────────────────────────┤
│ ZONE 1A — HERO / WHO'S WINNING    │ ZONE 1B — YOU             │  ALWAYS. the two biggest tiles. golden-triangle.
│ leader crown · name · projected   │ your rank ▲▼ · projected  │  HERO dwarfs everything (display-xl number).
│ /470 · WIN% gauge · champion pick │ · GAP to #1 · GAP to next │  YOU hidden if no /TARS/ entry → HERO spans 12 cols.
│ · one-line why                    │ · your WIN%               │
├──────────────────────────────────┴──────────────────────────┤
│ ZONE 2 — WHAT CHANGED & WHY (movement strip, full width)     │  ALWAYS. biggest mover callout + up to 3 narrative lines.
├─────────────────────────────────────────────────────────────┤
│ ZONE 3 — STANDINGS GLANCE (editorial table)                  │  ALWAYS (windowed). 10 pool: all 10. 84 pool: podium +
│ rank │▲▼│ ava │ name │ ███ win% │ proj │ ⌄                   │  YOU±2 neighbors + top-of-field, with search/jump.
├─────────────────────────────────────────────────────────────┤
│ ZONE 4 — WHAT'S NEXT (single biggest-swing card)             │  ALWAYS. the one upcoming match that moves YOUR odds most.
├─────────────────────────────────────────────────────────────┤
│ ZONE 5 — DRAWER DOCK (quiet row of pills)                    │  one-tap drawers: Matches · Full board · Brackets · More
└─────────────────────────────────────────────────────────────┘
```

**Always-visible (no interaction):** Zones 0, 1A, 1B, 2, 4, and the windowed Zone 3. Everything answers the five questions before a single click.

**One-tap drawer (slide-up sheet, never a tab/route):** full fixtures/results, the full 84-row board, brackets (consensus + single-entry + h2h), badges, consensus, similarity. See §6.

**Pool-size behavior (one component, two modes):**
- **Sp Jain (10):** Zone 3 shows **all 10 rows**. No search needed; the bump-sparkline column is meaningful for the whole field.
- **Open (84):** Zone 3 shows a **windowed view** — Top 3 (podium-tinted) + a divider + **YOU and your two neighbors (rank−1, YOU, rank+1)** pinned, each with gap-to-next. A sticky toolbar above it carries **search** + **Jump to me** + sort (`Projected · Official · Max`). The full 84 live only inside the "Full board" drawer. Never render 84 fat rows on the main screen.

---

## 2. ZONE 1A — THE HERO ("WHO'S WINNING")

The single most important glance. It must **visually dwarf** every other tile (the #1 generic-dashboard fix). Reserve the page's richest treatment for it only.

**Tile:** 7 cols × 2 rows, `--score-bug-grad` background (stays dark in both themes — broadcast device), a top **gold hairline** (champion accent), 24px padding, `--r-lg`.

**Contents, top-to-bottom:**
- **Kicker** (`micro`, `--gold-soft`): `POOL LEADER · WORLD CUP 26`.
- **Leader identity row:** 56px `avatar(name, {ring:'--gold', crown:true})` + name in `--f-disp` 800, 28px + a gold **crown SVG** roundel. `[YOU]` gold pill if the leader is the `/TARS/` entry.
- **THE hero number:** `rows[0].projected` in `--f-num` 900 at `display-xl` (64px), `--gold`, tabular. Immediately right/under it, muted `--dim`: `/ 470 max · {official} locked`.
- **WIN% gauge** (the emotional hero — NYT-needle lesson): a single horizontal probability bar, `--accent` fill = `winProb[leader]`, with the % as a `--f-num` tabular label at the bar's end (`(wp*100).toFixed(1)+'%'`). Label: `TITLE ODDS · {sim.sims} sims`. If sim not ready, render the track at 0 with `—` (no layout shift).
- **Champion pick line** (`body-sm`): `Backing {crest} {champion} to win it all` — strike-through `--loss` + `OUT` tag if `!championAlive`.
- **The WHY (one line, `--ink-2`):** auto-narrative explaining the lead. Priority cascade, first true wins:
  1. `Took the lead this matchday — up {prevRanks[name]-1} from #{prevRanks[name]}.`
  2. `Holding #1 by {rows[0].projected - rows[1].projected} over {firstName(rows[1].name)}.`  *(default)*
  3. `Tied at the top — separated only by tiebreak.`  *(when margin = 0)*

> **Cover-the-labels test:** size (biggest number) + color (gold = winner) + the crown carry "who's winning" with zero reading. Pass.

---

## 3. ZONE 2 — "WHAT CHANGED & WHY"

The device the owner explicitly asked for ("changes in rankings and the reasons"). Full-width strip directly under the hero. Two parts.

**(A) BIGGEST MOVER callout** — promote the existing `renderRecapStrip` mover logic into a hero chip: avatar + `{firstName} ▲{n}` in `--win`/`--loss` (always pair color with the ▲/▼ glyph + number, for colorblind users). Computed from `prevRanks` vs current `rank` exactly as today, but surfaced as the strip's lead element, not buried prose.

**(B) NARRATIVE ONE-LINERS** — up to 3 cards, newest first, each = colored left-accent bar (team `teamHex` or semantic) + one bold headline. Built from data we already compute (`crownsCache`, `prevRanks`, `whoCalled`, `championAlive`, `MC.stakes`). **Template strings to ship** (fill from live data):

1. `"{name} leapt {n} spots to #{rank} after {team} beat {opp}."`  — rank gain + the result that caused it (cross `prevRanks` delta with the day's completed `whoCalled`).
2. `"{name} took the {round} crown with {pts} pts."`  — from a `crownsCache` row where `done && winners.includes(name)`.
3. `"{team} crashed out — {n} brackets just lost their champion."`  — when `state.eliminated` newly contains a team that is some entries' `champion`; count `entries.filter(e=>e.champion===team && !e.championAlive)`.
4. `"{n} of {COUNT} called {winner} — {firstName(top)} banked the points."`  — from `whoCalled(match)` on a freshly completed match.
5. `"{name} slipped {n} to #{rank} — {team} dropped points."`  — the inverse mover (red ▼), tied to a result that hurt them.
6. `"Nobody backed {winner} — a {pts}-pt swing the whole pool missed."`  — `whoCalled` returned empty predicted set.

Each line ends with a tiny **`auto`** tag (honesty cue, like ESPN's AI byline). Cap at 3; if none fire, show one steady-state line: `"Quiet matchday — standings held. Next swing below."`

> **NEW data dependency (the only one):** persist a rank-history ring buffer in `localStorage`, keyed by `resultsHash`: `[{hash, ts, ranks:{name→rank}}]`, capped ~24 entries. Today the code keeps only `prevRanks` (one step). This buffer powers (a) the richer "leapt N spots" lines and (b) the per-row bump sparkline in §4. Write it in `refresh()` right where `prevRanks` is currently derived.

---

## 4. ZONE 3 — STANDINGS GLANCE (editorial table)

Compact, dense, editorial — The Athletic / F1-timing-tower feel, **not** a stack of fat cards. Collapsed row height ~48px. This is the existing `.entry` row, tightened and re-columned.

**Row grid (desktop):**
`[3px accent bar] [rank 30] [▲▼ delta 26] [avatar 28] [name + champion-tag, flex] [bump-spark 56] [win% bar+num 120] [GAP 52] [projected 60] [⌄ 18]`

| Element | Spec |
|---|---|
| **Accent bar** | 3px left rail. rank 1 = `--gold`; ranks 2–3 = `--gold-soft`; YOU = `--accent`; rest = `--line`. (Reads the podium instantly.) |
| **Rank** | `--f-num` 800, 18px. Top-3 gold-tinted. |
| **Delta arrow** | `prevRanks[name] - rank` → `▲N` (`--win`) / `▼N` (`--loss`) / `–` (`--dim`). Glyph + number always together. |
| **Avatar** | 28px initials chip, deterministic color (`viz.avatar`). Gold ring if holds a matchday crown (`crownCounts`). |
| **Name** | `--f-disp` 700, 15px. `[YOU]` gold micro-pill; `👑×N` crown tag allowed as *secondary* accent. Champion sub-line `body-sm` `--dim`: `Champion: {crest} {team}` → strike-through + `OUT −50` if `!championAlive`. |
| **Bump sparkline** | NEW. word-sized inline SVG of this player's last ~8 ranks (from the §3 ring buffer), y inverted (rank 1 on top), no axes — just the shape. YOU + leader drawn thick/colored, implied. Skip gracefully if <2 history points. |
| **Win% bar** | the §3.3 inline probability device: 6px `--faint` track + `--accent` fill = `winProb`, `--f-num` % right-aligned. Below 0.05% → `In contention` / `Long shot` tag (existing `winCellHtml`). |
| **GAP** | NEW column (F1 timing-tower). `rows[0].projected - row.projected` → `−{gap}` in `--dim` tabular. Leader shows `—`. (84-pool window also shows **INT/gap-to-next-rung** on the YOU row: `+{points to catch rank−1}`.) |
| **Projected** | the row's hero number — `--f-num` 800 `num-l` (28px), `--win`. Tiny `--dim` sub: `{official} official`. |
| **Expand ⌄** | rotates; lazy `detailHtml` (locked-vs-projected stacked bar, category grid, pick chips) — unchanged. |

**Zebra:** even rows `--surface-2` @40%. YOU row always `--hl-bg` + `--accent` rail regardless. **Number-tick** animates projected + win% on change (existing `tickScan`). Sort segmented control + search + Jump-to-me live in the sticky toolbar (84-pool only needs them; 10-pool can hide search).

---

## 5. TOP-1% DESIGN DIRECTION (decisive, one paragraph)

Keep the established **dark broadcast chassis** (`--canvas #0A0E14`, `--surface` ladder) with **gold as the single champion/winner chroma** and **electric azure `--accent`** as the only data-viz color — national-team crests/flags (`state.logos`, `viz.teamColor`) are the *only* other saturated color on screen; everything else is the neutral ladder. Color = status only, every red/green paired with a ▲/▼ glyph (cover-the-labels test passes). Type: **Saira Condensed 900** for every number that is the point (the hero is `display-xl` 64px and must dwarf its 12px UPPERCASE label by 3–5×), **Archivo 800** for headlines and the Zone-0 story sentence (the editorial-slab move), **Inter** for everything else; `font-variant-numeric: tabular-nums` on *all* live digits so nothing jitters on refresh. The **four signature devices**: (1) the **hero WIN% gauge** as the emotional centerpiece (one bar, the leader's title odds, big tabular %); (2) the **parallelogram score-bug** reused for the hero tile, the YOU tile, and the Zone-4 next-match card so the broadcast skew is the throughline; (3) **inline win% probability bars** in every standings row; (4) the **bump sparkline** (rank-over-matchday, inverted-y) that makes "what changed" legible per row. **Motion** is feedback, not decoration, and exactly the seven rules in `DESIGN-SPEC.md §6`: numbers tick-count on change (240ms), bars fill from 0 (500ms), live dot pulses, rank-delta chips flash once on movement, score-bug hairline breathes when live — all gated by `prefers-reduced-motion`. No pies, no rainbow, no stadium photos, no confetti.

---

## 6. PROGRESSIVE DISCLOSURE — what moves into drawers

Everything past the five answers becomes a **tap-to-open slide-up sheet** (NN/g progressive disclosure — never a tab, never a route change). Zone 5 is a quiet row of four pills. Sheets are modal overlays with a back/close affordance; deep-linkable via `#sheet=<name>` if cheap, otherwise pure client state.

| Drawer pill | Opens (reuses existing renderers) | Trigger |
|---|---|---|
| **Matches** | `renderRoundbar` + `renderMatches` (fixtures/results, who-called strips, stakes collapsibles) | pill, or tapping the Zone-4 next card |
| **Full board** | full `renderLb` — all 10 / 84 rows, search, sort, jump | pill, or "View all {COUNT}" link at the foot of Zone 3 |
| **Brackets** | `renderConsensusBoard` (always) + searchable single-entry `renderPlayerView` (default = YOU) + `renderH2H`. Matrix only for `SMALL_POOL`. | pill; also reachable by tapping any standings row's champion sub-line → opens that player's bracket |
| **More** | `renderBadges` + `renderConsensus` columns + `renderSimilar` + the scoring guide | pill |

In-place expand (not a drawer) stays for: a standings row's detail panel (chevron), and a match card's stakes toggle. Tapping the Zone-2 mover chip scroll-flashes that player's standings row (existing `.flash`).

---

## 7. WHAT WE CUT OR DEMOTE (explicit)

**Removed from the always-visible screen entirely (→ drawer or gone):**
- ❌ **The 5-tab bar** (Home / Matches / Leaderboard / Brackets / Insights) — deleted. The single screen replaces Home + Leaderboard; the other three become drawers.
- ❌ **The big hero identity band** (`.hero` 220px with `h1` + sub paragraph + watermark) — demoted to a slim nav strip. The hero zone is now the *leader*, not the product name. Pool name shrinks to the kicker.
- ❌ **Status-card strip** (`renderStatusCards`, 6 cards: rank/projected/title-odds/crown/leader/field) — **deleted as a strip**; its content is absorbed into Zone 1A (leader, odds, crown→Zone 2) and Zone 1B (your rank/projected/win%). Uniform same-size cards were the #1 generic-dashboard tell.
- ❌ **The 4-card Rooting Guide grid** (`renderRooting`) — collapsed to the **single biggest-swing card** in Zone 4 (the one upcoming match with max |`dWin`| for YOU). The other 3 matches move into the Matches drawer.
- ❌ **Insights tab in full** — Badges, Pool Consensus columns, Most-Similar-Brackets, Scoring guide all → the **"More" drawer**. None earn always-visible space.
- ❌ **84-wide anything** on the main screen — the windowed YOU±neighbors + podium replaces a wall of 84; the full board is one tap away.
- ❌ **Two recap buttons** (`recapBtn` in nav + `homeRecapBtn` in body) — keep ONE share action (nav `recapBtn` / `shareRecap`); drop the duplicate.

**Demoted (kept, but no longer competing for the glance):**
- ▽ **Pick matrix** — `SMALL_POOL` only, and only inside the Brackets drawer as a secondary view (never default).
- ▽ **Head-to-head** — inside the Brackets drawer; reachable, not foregrounded.
- ▽ **Consensus board** — inside the Brackets drawer (it's analysis, not a daily glance). The hero's champion line carries the one consensus fact that matters.
- ▽ **Round filter / date grouping** — lives in the Matches drawer, not on the main screen.

**Kept, unchanged, load-bearing:** pool switcher, refresh + countdown, theme toggle, number-tick motion, lazy row detail, `/TARS/` = "you" detection, the scoring/projection engine and Monte Carlo pipeline. The rebuild is **layout + IA + one new rank-history buffer** — zero changes to the scoring or simulation math.
