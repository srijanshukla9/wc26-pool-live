/* FIFA Prediction Pro — narrative.js
   The story / quirks engine (BLUEPRINT §5) — the daily-open moat.

   Consumes ONLY data the app already produces (leaderboard rows, rankHistory ring
   buffer, MC crowns, MC sim, Engine state) and emits ranked, human one-liners that
   tie every pool movement to the real match result that caused it. No LLM, fully
   deterministic, every interpolated string HTML-escaped.

   PUBLIC API (UMD; global NARRATIVE):
     NARRATIVE.detect(ctx) -> [ beat, ... ]   // all fired beats, severity-sorted
     NARRATIVE.surface(beats, {youName}) -> { headline: beat|null, feed: [beat,...] }
     NARRATIVE.rivalries(ctx) -> [ {a, b, swaps, gap, hot, pinned}, ... ]
     NARRATIVE.TEAM_STARS                     // team -> marquee player (copy seed)

   ctx (all fields optional except rows — every detector degrades gracefully):
     {
       rows,        // Engine.leaderboard() output: [{name,rank,points,breakdown,max,
                    //   secured,champion,runnerUp,championAlive}, ...] sorted, rank 1..n
       prevRanks,   // { name -> rank } from the previous sync (null on first load)
       prevPoints,  // { name -> points } from the previous sync (null on first load)
       rankHistory, // [{hash,ts,ranks:{name->rank}}, ...] oldest -> newest (24-cap ring)
       state,       // Engine state: { eliminated:Set, knockout, finalTables, matches, ... }
       sim,         // MC.simulate() -> { winProb:{name->p}, podiumProb, expRank } | null
       prevSim,     // previous sim (for title-odds surge) | null
       crowns,      // MC.crowns() -> [{round,winners,pts,done,gains,ranksBefore,ranksAfter}] | []
       entries,     // POOL.entries (raw picks: .groups/.thirds/.r16/.qf/.sf/.champion/.runnerUp/.rivals)
       poolName,    // 'spjain' | 'open' (display label resolved here)
       youName,     // the "you" entry name (TARS) — gets a relevance boost
       count,       // pool size (e.g. 10 / 84)
     }

   Each beat = {
     kind,            // detector id, e.g. 'overtake'
     severity,        // 0..100 (intrinsic importance)
     subjects,        // [names] — drives dedupe + relevance boost
     html,            // rich one-liner, real team names tied in, HTML-safe
     tone,            // 'up' | 'down' | 'neutral'
     teams,           // [team,...] referenced (for crest/flag chips) — optional
     round,           // round key when tied to a knockout window — optional
   }
*/
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.NARRATIVE = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ------------------------------------------------------------------ *
   * small utilities                                                     *
   * ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  // "Srijan [TARS]" -> "Srijan"; strips bracket tags + trailing dup markers for display.
  function display(name) {
    return String(name == null ? '' : name).replace(/\s*\[[^\]]*\]\s*/g, ' ').trim() || String(name || '');
  }
  function teamColor(team) {
    if (typeof VIZ !== 'undefined' && VIZ && VIZ.teamColor) { try { return VIZ.teamColor(team); } catch (e) {} }
    return '#E8B73A';
  }
  // A team chip: name wrapped with its --team color, escaped.
  function tchip(team) {
    if (!team) return '';
    return `<b class="nb-team" style="color:${esc(teamColor(team))}">${esc(team)}</b>`;
  }
  // A person chip (display name, you-aware highlight handled in CSS via .nb-you in surface()).
  function pchip(name) { return `<b class="nb-name">${esc(display(name))}</b>`; }

  // Pick a deterministic template by hashing a key (so copy varies but never randomly).
  function pick(arr, key) {
    let h = 2166136261; const s = String(key);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return arr[(h >>> 0) % arr.length];
  }

  /* ------------------------------------------------------------------ *
   * marquee players — copy seed so beats name a real face, not "a star" *
   * (1 curated player per team; mirrors the players.js build map intent) *
   * ------------------------------------------------------------------ */
  const TEAM_STARS = {
    'Spain': 'Lamine Yamal', 'France': 'Kylian Mbappé', 'England': 'Jude Bellingham',
    'Brazil': 'Vinícius Júnior', 'Argentina': 'Lionel Messi', 'Portugal': 'Cristiano Ronaldo',
    'Germany': 'Jamal Musiala', 'Netherlands': 'Virgil van Dijk', 'Belgium': 'Kevin De Bruyne',
    'Croatia': 'Luka Modrić', 'Uruguay': 'Federico Valverde', 'Colombia': 'James Rodríguez',
    'Morocco': 'Achraf Hakimi', 'Japan': 'Takefusa Kubo', 'United States': 'Christian Pulisic',
    'Mexico': 'Santiago Giménez', 'Switzerland': 'Granit Xhaka', 'Senegal': 'Sadio Mané',
    'Norway': 'Erling Haaland', 'Egypt': 'Mohamed Salah', 'South Korea': 'Son Heung-min',
    'Canada': 'Alphonso Davies', 'Australia': 'Mathew Leckie', 'Ecuador': 'Moisés Caicedo',
    'Ivory Coast': 'Sébastien Haller', 'Sweden': 'Alexander Isak', 'Austria': 'Marcel Sabitzer',
    'Ghana': 'Mohammed Kudus', 'Iran': 'Mehdi Taremi', 'Scotland': 'Scott McTominay',
    'Turkey': 'Arda Güler', 'Paraguay': 'Miguel Almirón', 'Czech Rep.': 'Patrik Schick',
    'Algeria': 'Riyad Mahrez', 'Tunisia': 'Hannibal Mejbri', 'Saudi Arabia': 'Salem Al-Dawsari',
    'Qatar': 'Akram Afif', 'Panama': 'Adalberto Carrasquilla', 'Haiti': 'Frantzdy Pierrot',
    'DR Congo': 'Yoane Wissa', 'Uzbekistan': 'Eldor Shomurodov', 'Iraq': 'Aymen Hussein',
    'Jordan': 'Mousa Al-Tamari', 'New Zealand': 'Chris Wood', 'South Africa': 'Percy Tau',
    'Bosnia & Herz.': 'Edin Džeko', 'Curacao': 'Leandro Bacuna', 'Cape Verde': 'Ryan Mendes',
  };
  function star(team) { return TEAM_STARS[team] || null; }

  /* ------------------------------------------------------------------ *
   * context helpers — derive richer signals from raw ctx                *
   * ------------------------------------------------------------------ */

  // The single most recent crown window that has any movement (the "what just happened").
  function lastCrown(crowns) {
    if (!crowns || !crowns.length) return null;
    for (let i = crowns.length - 1; i >= 0; i--) {
      const c = crowns[i];
      if (c && c.ranksBefore && c.ranksAfter) return c;
    }
    return null;
  }
  // Pretty round label.
  const ROUND_LABEL = {
    group: 'the group stage', md1: 'Matchday 1', md2: 'Matchday 2', md3: 'Matchday 3',
    r32: 'the Round of 32', r16: 'the Round of 16', qf: 'the quarter-finals',
    sf: 'the semi-finals', final: 'the final', third: 'the third-place play-off',
  };
  function roundLabel(k) { return ROUND_LABEL[k] || (k ? esc(k) : 'the latest results'); }

  // rank series for a name, oldest->newest, from rankHistory.
  function series(rankHistory, name, max) {
    const out = [];
    for (const h of (rankHistory || [])) {
      const v = h && h.ranks && h.ranks[name];
      if (typeof v === 'number') out.push(v);
    }
    return max ? out.slice(-max) : out;
  }

  // entries by name (raw picks) for differential / chalk analysis.
  function entryIndex(entries) {
    const idx = {};
    for (const e of (entries || [])) idx[e.name] = e;
    return idx;
  }

  // Which teams "just won/topped" in the most recent completed results — used to attach
  // a concrete cause to a movement ("+12 from Spain topping Group H"). Derived from the
  // group tables + knockout sets in state; cheap, best-effort, never throws.
  function recentCauses(state) {
    const causes = { topped: [], advanced: [], knocked: [], champion: null, runnerUp: null };
    if (!state) return causes;
    const ft = state.finalTables || {};
    for (const [g, t] of Object.entries(ft)) {
      if (t && t.complete && t.order && t.order[0]) {
        causes.topped.push({ team: t.order[0].team, group: g });
        if (t.order[1]) causes.advanced.push({ team: t.order[1].team, group: g });
      }
    }
    const k = state.knockout || {};
    if (k.champion) causes.champion = k.champion;
    if (k.runnerUp) causes.runnerUp = k.runnerUp;
    return causes;
  }

  // For an entry, find the "headline cause" team behind a positive swing: prefer a team they
  // predicted to top its group that actually topped, else a champion/runner-up hit.
  function causeTeamFor(entry, causes) {
    if (!entry || !causes) return null;
    const groups = entry.groups || {};
    for (const c of causes.topped) {
      const g = groups[c.group];
      if (g && g[0] === c.team) return { team: c.team, why: `topping Group ${c.group}` };
    }
    if (causes.champion && entry.champion === causes.champion)
      return { team: causes.champion, why: 'lifting the trophy' };
    if (causes.runnerUp && entry.runnerUp === causes.runnerUp)
      return { team: causes.runnerUp, why: 'reaching the final' };
    for (const c of causes.advanced) {
      const g = groups[c.group];
      if (g && (g[0] === c.team || g[1] === c.team)) return { team: c.team, why: `advancing from Group ${c.group}` };
    }
    return null;
  }

  // " — Spain topping Group H" style tail, or '' if no clean cause.
  function causeTail(entry, causes) {
    const c = causeTeamFor(entry, causes);
    if (!c) return '';
    const st = star(c.team);
    const who = st ? `${tchip(c.team)} (${esc(st)})` : tchip(c.team);
    return ` — credit ${who} ${esc(c.why)}`;
  }

  /* ------------------------------------------------------------------ *
   * THE DETECTORS (BLUEPRINT §5) — each returns 0..n beats              *
   * ------------------------------------------------------------------ */
  // Every detector is pure over ctx and pushes into `beats`. Severities are tuned so the
  // global ordering matches §5's intent (leader-change > champion-eliminated > overtake > …).

  // 2. LEADER CHANGE — #1 changed hands. Highest severity.
  function detLeaderChange(ctx, beats) {
    const { rows, prevRanks } = ctx;
    if (!rows || !rows.length || !prevRanks) return;
    const leader = rows[0];
    const prevLeader = Object.keys(prevRanks).find(n => prevRanks[n] === 1);
    if (!prevLeader || prevLeader === leader.name) return;
    const tail = causeTail(ctx._entryIdx[leader.name], ctx._causes);
    beats.push({
      kind: 'leader-change', severity: 100, subjects: [leader.name, prevLeader], tone: 'up',
      teams: [leader.champion].filter(Boolean), round: ctx._lastCrown && ctx._lastCrown.round,
      html: `${pchip(leader.name)} ${pick(['seizes', 'snatches', 'takes over'], leader.name)} <b>#1</b> ` +
            `from ${pchip(prevLeader)} on <b>${esc(leader.points)} pts</b>${tail}.`,
    });
  }

  // 9. CHAMPION ELIMINATED — a picked champion is out. −50 ceiling event. High severity.
  function detChampionEliminated(ctx, beats) {
    const { rows, state } = ctx;
    if (!rows || !state || !state.eliminated) return;
    const elim = state.eliminated;
    const seen = new Set();
    for (const r of rows) {
      if (r.championAlive) continue;
      if (!r.champion || seen.has(r.name)) continue;
      // only fire if the champion is actually in the eliminated set (defensive)
      if (!elim.has(r.champion)) continue;
      seen.add(r.name);
      const st = star(r.champion);
      const who = st ? `${tchip(r.champion)} (${esc(st)})` : tchip(r.champion);
      // relevance: a recent elimination is hotter; we can't time it, so flat-high here.
      beats.push({
        kind: 'champion-eliminated', severity: 92, subjects: [r.name], tone: 'down',
        teams: [r.champion],
        html: `${pchip(r.name)}'s title pick ${who} is <b>OUT</b> — a <b>−50</b> hole blown in the ceiling, ` +
              `${pick(['the dream is over', 'back to the drawing board', 'that bracket just cracked'], r.name)}.`,
      });
    }
  }

  // 10. CHAMPION SURVIVES SCARE — picked champion won a knockout they could've lost.
  function detChampionSurvives(ctx, beats) {
    const { rows, state, crowns } = ctx;
    if (!rows || !state || !state.knockout) return;
    const c = ctx._lastCrown;
    if (!c || !c.done) return;
    // Only meaningful in knockout windows where a champion-pick advanced this window.
    if (!['r32', 'r16', 'qf', 'sf', 'final'].includes(c.round)) return;
    const k = state.knockout;
    const advanced = new Set([...(k.r16 || []), ...(k.qf || []), ...(k.sf || []), ...(k.finalists || [])]);
    const seen = new Set();
    for (const r of rows) {
      if (!r.championAlive || !r.champion || seen.has(r.champion)) continue;
      if (!advanced.has(r.champion)) continue;
      // gained points this window => their champion did something this round
      if (!(c.gains && c.gains[r.name] > 0)) continue;
      seen.add(r.champion);
      const st = star(r.champion);
      const who = st ? `${tchip(r.champion)} (${esc(st)})` : tchip(r.champion);
      beats.push({
        kind: 'champion-survives', severity: 70, subjects: [r.name], tone: 'up',
        teams: [r.champion], round: c.round,
        html: `${who} survive ${roundLabel(c.round)} — ${pchip(r.name)}'s title bet stays alive, ` +
              `<b>+${esc(c.gains[r.name])}</b> banked and the <b>50</b> still in play.`,
      });
      if (seen.size >= 2) break; // cap noise
    }
  }

  // 1. OVERTAKE — A passed B this sync (ranksBefore/ranksAfter cross). Per the crown window.
  function detOvertake(ctx, beats) {
    const c = ctx._lastCrown;
    if (!c || !c.ranksBefore || !c.ranksAfter) return;
    const before = c.ranksBefore, after = c.ranksAfter;
    const names = Object.keys(after);
    const fired = [];
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue;
        // a was behind b, now ahead of b → a overtook b
        if (before[a] > before[b] && after[a] < after[b]) {
          // only the tightest crossings (adjacent now) to avoid combinatorial spam
          if (Math.abs(after[a] - after[b]) !== 1) continue;
          fired.push({ a, b, newRank: after[a] });
        }
      }
    }
    // keep the highest-stakes overtakes (lowest resulting rank = nearer the top)
    fired.sort((x, y) => x.newRank - y.newRank);
    const used = new Set();
    for (const f of fired) {
      if (used.has(f.a)) continue; // one overtake beat per mover
      used.add(f.a);
      const entry = ctx._entryIdx[f.a];
      const tail = causeTail(entry, ctx._causes);
      const sev = clamp(64 - (f.newRank - 1) * 2, 30, 64) + (f.newRank <= 3 ? 12 : 0);
      beats.push({
        kind: 'overtake', severity: sev, subjects: [f.a, f.b], tone: 'up', round: c.round,
        html: `${pchip(f.a)} ${pick(['overtakes', 'leapfrogs', 'climbs past'], f.a)} ${pchip(f.b)} ` +
              `for <b>${esc(ordinal(f.newRank))}</b>${tail}.`,
      });
      if (used.size >= 4) break;
    }
  }

  // 3 & 4. BIGGEST MOVER (up) / BIGGEST FALLER — max rank delta since last sync.
  function detBiggestMovers(ctx, beats) {
    const { rows, prevRanks } = ctx;
    if (!rows || !prevRanks) return;
    let up = null, down = null;
    for (const r of rows) {
      const p = prevRanks[r.name];
      if (typeof p !== 'number') continue;
      const d = p - r.rank; // +ve = climbed
      if (d > 0 && (!up || d > up.d)) up = { name: r.name, d, rank: r.rank, row: r };
      if (d < 0 && (!down || d < down.d)) down = { name: r.name, d, rank: r.rank, row: r };
    }
    if (up && up.d >= 2) {
      const tail = causeTail(ctx._entryIdx[up.name], ctx._causes);
      beats.push({
        kind: 'biggest-mover-up', severity: clamp(48 + up.d * 4, 48, 80), subjects: [up.name], tone: 'up',
        html: `<b>Move of the day:</b> ${pchip(up.name)} rockets <b>▲${up.d}</b> to ` +
              `<b>${esc(ordinal(up.rank))}</b> on ${esc(up.row.points)} pts${tail}.`,
      });
    }
    if (down && down.d <= -2) {
      const st = star(ctx._entryIdx[down.name] && ctx._entryIdx[down.name].champion);
      beats.push({
        kind: 'biggest-faller', severity: clamp(40 + (-down.d) * 4, 40, 72), subjects: [down.name], tone: 'down',
        html: `${pchip(down.name)} slides <b>▼${-down.d}</b> to <b>${esc(ordinal(down.rank))}</b> — ` +
              `${pick(['a brutal matchday', 'the picks went cold', 'the table turned'], down.name)}.`,
      });
    }
  }

  // 5 & 6. STREAK (rising) / STREAK (cold) — N consecutive syncs climbing / falling.
  function detStreaks(ctx, beats) {
    const { rows, rankHistory } = ctx;
    if (!rows || !rankHistory || rankHistory.length < 3) return;
    function streak(name) {
      const s = series(rankHistory, name, 8);
      if (s.length < 3) return 0;
      let dir = 0, run = 0;
      for (let i = s.length - 1; i > 0; i--) {
        const d = s[i - 1] - s[i]; // +ve = improved at step i
        const sgn = d > 0 ? 1 : d < 0 ? -1 : 0;
        if (sgn === 0) break;
        if (dir === 0) dir = sgn;
        if (sgn !== dir) break;
        run++;
      }
      return dir * run; // +run rising, -run cold
    }
    let bestRise = null, bestCold = null;
    for (const r of rows) {
      const k = streak(r.name);
      if (k >= 3 && (!bestRise || k > bestRise.k)) bestRise = { name: r.name, k, rank: r.rank };
      if (k <= -3 && (!bestCold || k < bestCold.k)) bestCold = { name: r.name, k, rank: r.rank };
    }
    if (bestRise) beats.push({
      kind: 'streak-rising', severity: clamp(44 + bestRise.k * 3, 44, 66), subjects: [bestRise.name], tone: 'up',
      html: `${pchip(bestRise.name)} is <b>on fire</b> — ${esc(bestRise.k)} matchdays climbing straight, ` +
            `now <b>${esc(ordinal(bestRise.rank))}</b> and ${pick(['still rising', 'not slowing down', 'red-hot'], bestRise.name)}.`,
    });
    if (bestCold) beats.push({
      kind: 'streak-cold', severity: clamp(38 + (-bestCold.k) * 3, 38, 60), subjects: [bestCold.name], tone: 'down',
      html: `${pchip(bestCold.name)} is <b>ice cold</b> — sliding ${esc(-bestCold.k)} matchdays running, ` +
            `down to <b>${esc(ordinal(bestCold.rank))}</b>.`,
    });
  }

  // 7. NEAR-MISS — within 1–2 points of the row above (tension flag).
  function detNearMiss(ctx, beats) {
    const { rows } = ctx;
    if (!rows || rows.length < 2) return;
    const fired = [];
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i - 1].points - rows[i].points;
      if (gap >= 1 && gap <= 2) fired.push({ chaser: rows[i], leadRow: rows[i - 1], gap });
    }
    // surface the tightest near-miss closest to the top
    fired.sort((a, b) => a.gap - b.gap || a.chaser.rank - b.chaser.rank);
    const f = fired[0];
    if (!f) return;
    const sev = clamp(50 - (f.chaser.rank - 2) * 2, 28, 50) + (f.chaser.rank <= 3 ? 10 : 0);
    beats.push({
      kind: 'near-miss', severity: sev, subjects: [f.chaser.name, f.leadRow.name], tone: 'neutral',
      html: `${pchip(f.chaser.name)} is breathing down ${pchip(f.leadRow.name)}'s neck — ` +
            `just <b>${esc(f.gap)} pt${f.gap === 1 ? '' : 's'}</b> short of <b>${esc(ordinal(f.leadRow.rank))}</b>.`,
    });
  }

  // 8. DEAD HEAT — two+ entries on identical Points (tiebreak drama).
  function detDeadHeat(ctx, beats) {
    const { rows } = ctx;
    if (!rows || rows.length < 2) return;
    const byPts = {};
    for (const r of rows) (byPts[r.points] = byPts[r.points] || []).push(r);
    let best = null;
    for (const pts of Object.keys(byPts)) {
      const grp = byPts[pts];
      if (grp.length < 2) continue;
      const topRank = Math.min(...grp.map(r => r.rank));
      if (!best || topRank < best.topRank) best = { grp, pts: Number(pts), topRank };
    }
    if (!best) return;
    const names = best.grp.slice(0, 3).map(r => r.name);
    const sev = clamp(46 - (best.topRank - 1) * 2, 26, 46) + (best.topRank <= 3 ? 12 : 0);
    const list = names.length === 2
      ? `${pchip(names[0])} and ${pchip(names[1])}`
      : `${pchip(names[0])}, ${pchip(names[1])} and ${best.grp.length - 2} more`;
    beats.push({
      kind: 'dead-heat', severity: sev, subjects: names, tone: 'neutral',
      html: `Dead heat at <b>${esc(best.pts)} pts</b>: ${list} are level — only the tiebreak ` +
            `(secured pts, then ceiling) splits them right now.`,
    });
  }

  // 11. DIFFERENTIAL HIT — banked points from a pick few others made (rarity-weighted).
  function detDifferential(ctx, beats) {
    const { rows, entries } = ctx;
    if (!rows || !entries || !entries.length || !ctx._causes) return;
    const n = entries.length;
    // popularity of each champion pick across the pool
    const champCount = {};
    for (const e of entries) if (e.champion) champCount[e.champion] = (champCount[e.champion] || 0) + 1;
    // among champion picks still alive AND credited this window, find the rarest one held by a riser.
    const causes = ctx._causes;
    let best = null;
    for (const r of rows) {
      if (!r.championAlive) continue;
      const e = ctx._entryIdx[r.name];
      const cause = causeTeamFor(e, causes);
      if (!cause) continue;
      // rarity = how few in the pool share this champion (only champion-driven causes are "differential")
      const ownByChamp = champCount[r.champion] || n;
      const share = ownByChamp / n;
      if (cause.team !== r.champion) continue; // differential must be on their headline bet
      if (share > 0.34) continue; // not rare enough to be a differential
      const rarity = 1 - share;
      const sev = clamp(40 + rarity * 36, 40, 76);
      if (!best || sev > best.severity) {
        const st = star(r.champion);
        const who = st ? `${tchip(r.champion)} (${esc(st)})` : tchip(r.champion);
        best = {
          kind: 'differential-hit', severity: sev, subjects: [r.name], tone: 'up', teams: [r.champion],
          html: `${pchip(r.name)} cashes a <b>differential</b>: only ${esc(ownByChamp)} of ${esc(n)} backed ` +
                `${who}, and it's paying off ${esc(cause.why)}.`,
        };
      }
    }
    if (best) beats.push(best);
  }

  // 12. CHALK vs CONTRARIAN — entry's bracket diverges most/least from pool consensus.
  function detChalkContrarian(ctx, beats) {
    const { rows, entries } = ctx;
    if (!rows || !entries || entries.length < 4) return;
    const n = entries.length;
    // consensus = most-popular champion + runner-up; a "chalk score" per entry = how much of
    // their headline bracket (champ, runnerUp) matches the crowd.
    const champCount = {}, ruCount = {};
    for (const e of entries) {
      if (e.champion) champCount[e.champion] = (champCount[e.champion] || 0) + 1;
      if (e.runnerUp) ruCount[e.runnerUp] = (ruCount[e.runnerUp] || 0) + 1;
    }
    function chalk(e) {
      return (champCount[e.champion] || 0) / n + (ruCount[e.runnerUp] || 0) / n;
    }
    let mostChalk = null, mostContra = null;
    for (const e of entries) {
      const c = chalk(e);
      if (!mostChalk || c > mostChalk.c) mostChalk = { e, c };
      if (!mostContra || c < mostContra.c) mostContra = { e, c };
    }
    // surface only the contrarian (more interesting); chalk only if it's the leader (validation).
    if (mostContra && mostContra.e) {
      const e = mostContra.e;
      const row = rows.find(r => r.name === e.name);
      const st = star(e.champion);
      const who = st ? `${tchip(e.champion)} (${esc(st)})` : tchip(e.champion);
      beats.push({
        kind: 'contrarian', severity: 40, subjects: [e.name], tone: 'neutral', teams: [e.champion].filter(Boolean),
        html: `${pchip(e.name)} is the pool's biggest <b>contrarian</b> — backing ${who} to win it all ` +
              `while the room piles onto ${tchip(mostChalk && mostChalk.e && mostChalk.e.champion)}` +
              `${row ? ` — currently <b>${esc(ordinal(row.rank))}</b>` : ''}.`,
      });
    }
    if (mostChalk && mostChalk.e && rows[0] && rows[0].name === mostChalk.e.name) {
      const e = mostChalk.e;
      beats.push({
        kind: 'chalk', severity: 36, subjects: [e.name], tone: 'up', teams: [e.champion].filter(Boolean),
        html: `Chalk is paying: pool-favourite pick ${tchip(e.champion)} has ${pchip(e.name)} ` +
              `out front at <b>#1</b>.`,
      });
    }
  }

  // 13. TITLE-ODDS SURGE — MC winProb jumped > threshold since last sim.
  function detTitleOddsSurge(ctx, beats) {
    const { sim, prevSim, rows } = ctx;
    if (!sim || !sim.winProb || !prevSim || !prevSim.winProb || !rows) return;
    let best = null;
    for (const r of rows) {
      const now = sim.winProb[r.name], was = prevSim.winProb[r.name];
      if (typeof now !== 'number' || typeof was !== 'number') continue;
      const d = now - was;
      if (d >= 0.06 && (!best || d > best.d)) best = { name: r.name, now, was, d, rank: r.rank };
    }
    if (!best) return;
    const sev = clamp(46 + best.d * 120, 46, 78);
    beats.push({
      kind: 'title-odds-surge', severity: sev, subjects: [best.name], tone: 'up',
      html: `${pchip(best.name)}'s title odds <b>surge</b> to <b>${Math.round(best.now * 100)}%</b> ` +
            `(up from ${Math.round(best.was * 100)}%) — the model now rates this bracket a real threat.`,
    });
  }

  // 14. CEILING COLLAPSE — max dropped sharply (key picks busted) since last sync.
  function detCeilingCollapse(ctx, beats) {
    const { rows, prevMax } = ctx;
    if (!rows || !prevMax) return;
    let best = null;
    for (const r of rows) {
      const was = prevMax[r.name];
      if (typeof was !== 'number') continue;
      const drop = was - r.max;
      if (drop >= 8 && (!best || drop > best.drop)) best = { name: r.name, drop, max: r.max, rank: r.rank };
    }
    if (!best) return;
    const sev = clamp(42 + best.drop, 42, 80);
    beats.push({
      kind: 'ceiling-collapse', severity: sev, subjects: [best.name], tone: 'down',
      html: `${pchip(best.name)}'s ceiling caves in <b>−${esc(best.drop)}</b> to ` +
            `<b>${esc(best.max)}</b> — key picks are off the board, capping how high this bracket can finish.`,
    });
  }

  // 15. RIVALRY BEAT — the hottest auto/pinned rivalry, who's ahead + swap count.
  function detRivalry(ctx, beats) {
    const rivs = ctx._rivalries || [];
    if (!rivs.length) return;
    const top = rivs[0];
    if (!top || top.swaps < 1 && !top.pinned) return;
    const ra = ctx._rankIdx[top.a], rb = ctx._rankIdx[top.b];
    if (ra == null || rb == null) return;
    const aheadName = ra < rb ? top.a : top.b, behindName = ra < rb ? top.b : top.a;
    const sev = clamp(38 + top.swaps * 5 + (top.pinned ? 8 : 0), 38, 64);
    beats.push({
      kind: 'rivalry', severity: sev, subjects: [top.a, top.b], tone: 'neutral',
      html: `Rivalry watch: ${pchip(aheadName)} leads ${pchip(behindName)} by ` +
            `<b>${esc(Math.abs(top.gap))} pt${Math.abs(top.gap) === 1 ? '' : 's'}</b> — ` +
            `${top.swaps ? `they've swapped places <b>${esc(top.swaps)}×</b> this tournament` : 'a pinned grudge match'}.`,
    });
  }

  // 16. PERFECT GROUP — entry nailed all 4 positions in a COMPLETED group (+16).
  function detPerfectGroup(ctx, beats) {
    const { state, entries } = ctx;
    if (!state || !state.finalTables || !entries) return;
    const completed = Object.entries(state.finalTables).filter(([, t]) => t && t.complete);
    if (!completed.length) return;
    const fired = [];
    for (const e of entries) {
      for (const [g, t] of completed) {
        const pred = e.groups && e.groups[g];
        if (!pred || pred.length !== 4 || !t.order) continue;
        if (pred.every((tm, i) => t.order[i] && t.order[i].team === tm)) {
          fired.push({ name: e.name, group: g, top: t.order[0].team });
        }
      }
    }
    if (!fired.length) return;
    // one beat per (prefer a YOU hit, else first)
    const youHit = fired.find(f => f.name === ctx.youName);
    const f = youHit || fired[0];
    beats.push({
      kind: 'perfect-group', severity: 58, subjects: [f.name], tone: 'up', teams: [f.top],
      html: `${pchip(f.name)} nailed <b>all four</b> of Group ${esc(f.group)} — a perfect ` +
            `<b>+16</b>, ${tchip(f.top)} on top exactly as called.`,
    });
  }

  /* ------------------------------------------------------------------ *
   * RIVALRY MODEL — pairs who swap ranks most in rankHistory (+ pinned) *
   * ------------------------------------------------------------------ */
  function rivalries(ctx) {
    const { rankHistory, rows, entries } = ctx;
    const rankIdx = {};
    for (const r of (rows || [])) rankIdx[r.name] = r.rank;
    const ptsIdx = {};
    for (const r of (rows || [])) ptsIdx[r.name] = r.points;

    // 1) count adjacent-rank swaps across consecutive snapshots
    const swaps = {}; // "a||b" (sorted) -> count
    const hist = rankHistory || [];
    for (let i = 1; i < hist.length; i++) {
      const A = hist[i - 1].ranks || {}, B = hist[i].ranks || {};
      const names = Object.keys(B);
      for (let x = 0; x < names.length; x++) {
        for (let y = x + 1; y < names.length; y++) {
          const a = names[x], b = names[y];
          if (A[a] == null || A[b] == null || B[a] == null || B[b] == null) continue;
          const beforeOrder = A[a] - A[b], afterOrder = B[a] - B[b];
          if (beforeOrder !== 0 && afterOrder !== 0 && Math.sign(beforeOrder) !== Math.sign(afterOrder)) {
            const key = a < b ? a + ' ' + b : b + ' ' + a;
            swaps[key] = (swaps[key] || 0) + 1;
          }
        }
      }
    }

    // 2) pinned rivalries from data.js (pool-level ctx.rivals or per-entry .rivals: [[a,b],...])
    const pinned = new Set();
    function addPin(a, b) { if (a && b && a !== b) pinned.add((a < b ? a + ' ' + b : b + ' ' + a)); }
    if (Array.isArray(ctx.rivals)) for (const pr of ctx.rivals) if (Array.isArray(pr)) addPin(pr[0], pr[1]);
    for (const e of (entries || [])) {
      if (Array.isArray(e.rivals)) for (const opp of e.rivals) {
        if (typeof opp === 'string') addPin(e.name, opp);
        else if (Array.isArray(opp)) addPin(opp[0], opp[1]);
      }
    }

    const keys = new Set([...Object.keys(swaps), ...pinned]);
    const out = [];
    for (const key of keys) {
      const [a, b] = key.split(' ');
      if (rankIdx[a] == null || rankIdx[b] == null) continue; // both must still be in the pool
      const gap = (ptsIdx[a] || 0) - (ptsIdx[b] || 0);
      const aHot = rankIdx[a] < rankIdx[b];
      out.push({
        a, b, swaps: swaps[key] || 0, gap,
        hot: aHot ? a : b, pinned: pinned.has(key),
      });
    }
    // hottest first: most swaps, then tightest gap, then pinned
    out.sort((x, y) => (y.swaps - x.swaps) || (Math.abs(x.gap) - Math.abs(y.gap)) || ((y.pinned ? 1 : 0) - (x.pinned ? 1 : 0)));
    return out;
  }

  /* ------------------------------------------------------------------ *
   * detect() — run all detectors, return severity-sorted beats          *
   * ------------------------------------------------------------------ */
  const DETECTORS = [
    detLeaderChange, detChampionEliminated, detChampionSurvives, detOvertake,
    detBiggestMovers, detStreaks, detNearMiss, detDeadHeat, detDifferential,
    detChalkContrarian, detTitleOddsSurge, detCeilingCollapse, detRivalry, detPerfectGroup,
  ];

  function detect(ctx) {
    ctx = ctx || {};
    if (!ctx.rows || !ctx.rows.length) return [];
    // precompute shared signals once (underscore = internal, not part of the public ctx)
    ctx._entryIdx = entryIndex(ctx.entries);
    ctx._lastCrown = lastCrown(ctx.crowns);
    ctx._causes = recentCauses(ctx.state);
    ctx._rankIdx = {};
    for (const r of ctx.rows) ctx._rankIdx[r.name] = r.rank;
    ctx._rivalries = rivalries(ctx);

    const beats = [];
    for (const det of DETECTORS) {
      try { det(ctx, beats); } catch (e) { /* a single detector must never break the feed */ }
    }
    // attach an integer id + clamp severities; stable sort by severity desc then kind
    beats.forEach((b, i) => {
      b.severity = clamp(Math.round(b.severity || 0), 0, 100);
      b.subjects = (b.subjects || []).filter(Boolean);
      b.tone = b.tone || 'neutral';
      b._i = i;
    });
    beats.sort((a, b) => b.severity - a.severity || a._i - b._i);
    return beats;
  }

  /* ------------------------------------------------------------------ *
   * surface() — choose the day's headline + 2-3 feed beats              *
   *   score = severity × recency × relevance, boost YOU + leader,        *
   *   dedupe by subject (one beat per person per refresh).               *
   * ------------------------------------------------------------------ */
  function surface(beats, opts) {
    opts = opts || {};
    const youName = opts.youName || null;
    const leaderName = opts.leaderName || null;
    const list = (beats || []).slice();
    if (!list.length) return { headline: null, feed: [] };

    // recency: detectors that key off the most-recent sync (overtake/leader-change/movers/
    // champion events/title-surge/perfect-group) are "fresh"; standing-state ones (near-miss/
    // dead-heat/rivalry/chalk) are evergreen → slightly discounted so news leads.
    const FRESH = new Set([
      'leader-change', 'overtake', 'biggest-mover-up', 'biggest-faller', 'champion-eliminated',
      'champion-survives', 'title-odds-surge', 'ceiling-collapse', 'perfect-group',
      'streak-rising', 'streak-cold', 'differential-hit',
    ]);

    function score(b) {
      const recency = FRESH.has(b.kind) ? 1.0 : 0.82;
      let relevance = 1.0;
      if (youName && b.subjects.includes(youName)) relevance += 0.6;     // YOU boost
      if (leaderName && b.subjects.includes(leaderName)) relevance += 0.3; // leader boost
      return (b.severity || 0) * recency * relevance;
    }

    const scored = list.map(b => ({ b, s: score(b) }))
      .sort((x, y) => y.s - x.s || (y.b.severity - x.b.severity));

    // dedupe by subject: one beat per person per refresh.
    const usedSubjects = new Set();
    const chosen = [];
    for (const { b } of scored) {
      if (b.subjects.some(s => usedSubjects.has(s))) continue;
      chosen.push(b);
      b.subjects.forEach(s => usedSubjects.add(s));
      if (chosen.length >= 4) break; // 1 headline + up to 3 feed
    }
    return {
      headline: chosen[0] || null,
      feed: chosen.slice(1, 4),
    };
  }

  return { detect, surface, rivalries, TEAM_STARS, _esc: esc };
});
