# Sp Jain Friends — WC26 Live Pool Leaderboard

Live, auto-updating leaderboard for our private World Cup 2026 bracket pool.
Unofficial companion to the [official pool](https://www.fifaprediction.online/pools/27007c25-b9ff-4687-97d6-c0781422f3aa) —
the official site settles the pool; this page adds live-synced scoring during the tournament.

**How it works**

- `data.js` — everyone's locked bracket picks (snapshot taken after the pool locked on 11 Jun 2026)
- `engine.js` — scoring engine mirroring the pool's published rules (max 470 pts)
- `index.html` — fetches live results from ESPN's public scoreboard feed in your browser,
  recomputes the leaderboard on load and every 60 seconds

**Scores shown**

- **Projected** — groups scored as if today's live tables were final; moves with every goal
- **Official** — mirrors the pool site's rule (group points settle after all groups complete)
- **Max** — ceiling on each player's final score given results so far

No server, no build step. Run `node test.mjs` to validate the engine
(synthetic perfect bracket must score exactly 470).
