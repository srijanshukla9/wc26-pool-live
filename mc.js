// Monte Carlo simulation + analytics layer for the WC2026 pool leaderboard.
// UMD, browser-safe, node-testable. Depends on engine.js (frozen) only.
// No wall-clock reads anywhere: group round windows are derived from per-team
// match sequence (matchdayMap; date windows only as a no-schedule fallback),
// and the RNG is a seeded mulberry32 (constant 42) for deterministic output.
//
// Topology notes (from live ESPN feed probe, 12 Jun 2026):
//   - Knockout placeholder labels are parsed from team.displayName (abbrevs are
//     inconsistent: "3RD"/"RD32" collide, "QW4" missing its F, "SF L1" vs "SFW1").
//   - "Round of 32 N Winner" / "Round of 16 N Winner" / "Quarterfinal N Winner" /
//     "Semifinal N" numbering follows ASCENDING EVENT ID within each round
//     (ids contiguous per round: R32 760486-760501, R16 760502-760509, QF
//     760510-760513, SF 760514-760515), which differs from feed/date order in
//     5 places. parseTopology therefore sorts each round's events by id, so a
//     {type:'winner', round:'r32', index:N} slot always refers to topology.r32[N-1].
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory(require('./engine.js'));
  else root.MC = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';

  const GROUP_KEYS = Object.keys(Engine.GROUPS); // ['A'..'L']

  // ---------------- seeded RNG ----------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------- 1. parseTopology ----------------
  const KO_SLUGS = {
    'round-of-32': 'r32', 'round-of-16': 'r16', 'quarterfinals': 'qf',
    'semifinals': 'sf', '3rd-place-match': 'third', 'final': 'final',
  };

  function normalizeTeamName(name) {
    if (!name) return null;
    if (Engine.TEAM_GROUP[name]) return name;
    const m = Engine.ESPN_TO_POOL && Engine.ESPN_TO_POOL[name];
    return m && Engine.TEAM_GROUP[m] ? m : null;
  }

  // Placeholder grammar observed in the live feed (displayName first; the
  // shortDisplayName forms are accepted as a fallback).
  const RE = {
    pos1: /^Group ([A-L]) Winner$/, sPos1: /^1([A-L])$/,
    pos2: /^Group ([A-L]) 2nd Place$/, sPos2: /^2([A-L])$/,
    third: /^Third Place Group ([A-L](?:\/[A-L])+)$/, sThird: /^3RD ([A-L](?:\/[A-L])+)$/,
    r32w: /^Round of 32 (\d{1,2}) Winner$/, sR32: /^RD32 W(\d{1,2})$/,
    r16w: /^Round of 16 (\d{1,2}) Winner$/, sR16: /^RD16 W(\d{1,2})$/,
    qfw: /^Quarterfinal (\d) Winner$/, sQf: /^QF W(\d)$/,
    sfw: /^Semifinal ([12]) Winner$/,
    sfl: /^Semifinal ([12]) Loser$/,
  };

  function parseSlot(teamObj) {
    if (!teamObj) return { type: 'unknown' };
    const real = normalizeTeamName(teamObj.displayName);
    if (real) return { type: 'team', team: real };
    const labels = [teamObj.displayName, teamObj.shortDisplayName];
    for (const name of labels) {
      if (!name) continue;
      let m;
      if ((m = RE.pos1.exec(name)) || (m = RE.sPos1.exec(name))) return { type: 'pos', group: m[1], pos: 1 };
      if ((m = RE.pos2.exec(name)) || (m = RE.sPos2.exec(name))) return { type: 'pos', group: m[1], pos: 2 };
      if ((m = RE.third.exec(name)) || (m = RE.sThird.exec(name))) return { type: 'third', groups: m[1].split('/') };
      if ((m = RE.r32w.exec(name)) || (m = RE.sR32.exec(name))) return { type: 'winner', round: 'r32', index: +m[1] };
      if ((m = RE.r16w.exec(name)) || (m = RE.sR16.exec(name))) return { type: 'winner', round: 'r16', index: +m[1] };
      if ((m = RE.qfw.exec(name)) || (m = RE.sQf.exec(name))) return { type: 'winner', round: 'qf', index: +m[1] };
      if ((m = RE.sfw.exec(name))) return { type: 'winner', round: 'sf', index: +m[1] };
      if ((m = RE.sfl.exec(name))) return { type: 'loser', round: 'sf', index: +m[1] };
    }
    return { type: 'unknown' };
  }

  function parseTopology(json) {
    if (!json || !Array.isArray(json.events)) return null;
    const buckets = { r32: [], r16: [], qf: [], sf: [], third: [], final: [] };
    for (const ev of json.events) {
      const r = KO_SLUGS[ev && ev.season && ev.season.slug];
      if (r) buckets[r].push(ev);
    }
    for (const r of Object.keys(buckets)) buckets[r].sort((a, b) => Number(a.id) - Number(b.id));
    if (buckets.r32.length !== 16 || buckets.r16.length !== 8 ||
        buckets.qf.length !== 4 || buckets.sf.length !== 2 || buckets.final.length !== 1) return null;

    let unparseable = 0;
    const mk = ev => {
      const comps = ((ev.competitions && ev.competitions[0]) || {}).competitors || [];
      const h = comps.find(c => c.homeAway === 'home') || comps[0];
      const a = comps.find(c => c.homeAway === 'away') || comps[1];
      const home = parseSlot(h && h.team), away = parseSlot(a && a.team);
      if (home.type === 'unknown') unparseable++;
      if (away.type === 'unknown') unparseable++;
      return { home, away };
    };
    const topo = {
      r32: buckets.r32.map(mk),
      r16: buckets.r16.map(mk),
      qf: buckets.qf.map(mk),
      sf: buckets.sf.map(mk),
      final: mk(buckets.final[0]),
      third: buckets.third.length ? mk(buckets.third[0]) : null,
    };
    if (unparseable > 4) return null;
    return topo;
  }

  // ---------------- shared sim helpers ----------------
  const DRAW_P = 0.26; // empirical WC group-stage draw rate
  function eloP(ra, rb) { return 1 / (1 + Math.pow(10, (rb - ra) / 400)); }
  function cmpRows(a, b) {
    return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team);
  }
  // Replicates engine.js rankTable (not exported from the frozen engine): after the
  // pts/gd/gf/name sort, any block tied on pts/gd/gf is re-ranked by a head-to-head
  // mini-table over that block's results (transitive), falling back to name.
  // `results` = [{home, away, hs, as}] for this group (real + simulated scorelines).
  function rankSimRows(rows, results) {
    rows.sort(cmpRows);
    for (let i = 0; i < rows.length;) {
      let j = i;
      while (j < rows.length && rows[j].pts === rows[i].pts && rows[j].gd === rows[i].gd && rows[j].gf === rows[i].gf) j++;
      if (j - i > 1) {
        const mini = Object.create(null);
        for (let k = i; k < j; k++) mini[rows[k].team] = { pts: 0, gd: 0, gf: 0 };
        for (const r of results) {
          const h = mini[r.home], a = mini[r.away];
          if (!h || !a) continue;
          h.gf += r.hs; h.gd += r.hs - r.as; a.gf += r.as; a.gd += r.as - r.hs;
          if (r.hs > r.as) h.pts += 3; else if (r.hs < r.as) a.pts += 3; else { h.pts++; a.pts++; }
        }
        const block = rows.slice(i, j).sort((a, b) =>
          mini[b.team].pts - mini[a.team].pts || mini[b.team].gd - mini[a.team].gd ||
          mini[b.team].gf - mini[a.team].gf || a.team.localeCompare(b.team));
        for (let k = i; k < j; k++) rows[k] = block[k - i];
      }
      i = j;
    }
    return rows;
  }
  function sameMatch(a, b) {
    return a === b || (!!a && !!b && a.round === b.round && a.date === b.date &&
      a.home === b.home && a.away === b.away);
  }

  // ---------------- 2. simulate ----------------
  function simulate(opts) {
    const state = opts.state, entries = opts.entries;
    const topology = opts.topology || null;
    const ratings = opts.ratings || {};
    const sims = opts.sims || 3000;
    const rng = opts.rng || mulberry32(42);
    const condition = opts.condition || null;
    const R = t => ratings[t] || 1700;

    const matches = state.matches || [];
    const groupMatches = matches.filter(m => m.round === 'group' && m.home && m.away);

    function applyResult(gs, home, away, hs, as) {
      const h = gs[home], a = gs[away];
      if (!h || !a) return;
      h.gf += hs; h.gd += hs - as; a.gf += as; a.gd += as - hs;
      if (hs > as) h.pts += 3; else if (hs < as) a.pts += 3; else { h.pts++; a.pts++; }
    }

    // Fixed contribution from completed group matches (computed once).
    // realResults keeps per-group scorelines for head-to-head tiebreaks.
    const base = {}, realResults = {};
    for (const g of GROUP_KEYS) {
      base[g] = {};
      realResults[g] = [];
      for (const t of Engine.GROUPS[g]) base[g][t] = { pts: 0, gd: 0, gf: 0 };
    }
    const pending = [];
    for (const m of groupMatches) {
      if (m.completed && !isNaN(m.hs) && !isNaN(m.as)) {
        const g = Engine.TEAM_GROUP[m.home];
        applyResult(base[g], m.home, m.away, m.hs, m.as);
        realResults[g].push({ home: m.home, away: m.away, hs: m.hs, as: m.as });
      } else if (!m.completed) pending.push(m);
    }

    // Real knockout results / live knockout scores, keyed both orientations.
    const koMap = Object.create(null);
    for (const m of matches) {
      if (m.round === 'group' || m.round === 'third' || !m.home || !m.away) continue;
      let rec = null;
      if (m.completed) rec = { winner: m.homeWinner ? m.home : m.awayWinner ? m.away : null };
      else if (m.state === 'in' && !isNaN(m.hs) && !isNaN(m.as)) {
        rec = { live: true, home: m.home, away: m.away, hs: m.hs, as: m.as };
      }
      if (!rec) continue;
      koMap[m.round + '|' + m.home + '|' + m.away] = rec;
      koMap[m.round + '|' + m.away + '|' + m.home] = rec;
    }

    function winScore(homeWins) {
      const r1 = rng(), r2 = rng();
      const margin = r1 < 0.6 ? 1 : r1 < 0.88 ? 2 : 3;
      const lose = r2 < 0.6 ? 0 : r2 < 0.9 ? 1 : 2;
      return homeWins ? [lose + margin, lose] : [lose, lose + margin];
    }
    function forcedScore(m, key) {
      const hs = isNaN(m.hs) ? null : m.hs, as = isNaN(m.as) ? null : m.as;
      if (key === 'draw') { const v = hs != null && as != null ? Math.max(hs, as) : 1; return [v, v]; }
      if (key === 'home') return hs != null && as != null && hs > as ? [hs, as] : [(as || 0) + 1, as || 0];
      return hs != null && as != null && as > hs ? [hs, as] : [hs || 0, (hs || 0) + 1];
    }
    function simScoreline(m) {
      if (condition && condition.match && condition.match.round === 'group' && sameMatch(m, condition.match)) {
        return forcedScore(m, condition.matchKey);
      }
      if (m.state === 'in' && !isNaN(m.hs) && !isNaN(m.as) && rng() < 0.6) return [m.hs, m.as];
      const pH = (1 - DRAW_P) * eloP(R(m.home), R(m.away));
      const r = rng();
      if (r < pH) return winScore(true);
      if (r < pH + DRAW_P) { const d = rng(); return d < 0.35 ? [0, 0] : d < 0.8 ? [1, 1] : [2, 2]; }
      return winScore(false);
    }

    function koWinner(round, home, away) {
      if (!home) return away || null;
      if (!away) return home;
      if (condition && condition.match && condition.match.round === round) {
        const cm = condition.match;
        if ((cm.home === home && cm.away === away) || (cm.home === away && cm.away === home)) {
          if (condition.matchKey === 'home' && cm.home) return cm.home;
          if (condition.matchKey === 'away' && cm.away) return cm.away;
        }
      }
      const rec = koMap[round + '|' + home + '|' + away];
      if (rec) {
        if (rec.winner) return rec.winner;
        if (rec.live) {
          const lead = rec.hs > rec.as ? rec.home : rec.as > rec.hs ? rec.away : null;
          if (lead && rng() < 0.6) return lead;
        }
      }
      return rng() < eloP(R(home), R(away)) ? home : away;
    }

    // Third-place slot assignment: which qualified third goes to which R32 slot.
    // Solved as a tiny bipartite matching (backtracking), memoised by the set of
    // 8 qualified groups — FIFA's allocation table guarantees a perfect matching
    // exists within the candidate-group unions observed in the feed.
    const thirdSlots = [];
    if (topology) {
      topology.r32.forEach((mt, mi) => {
        for (const side of ['home', 'away']) {
          const s = mt[side];
          if (s && s.type === 'third') thirdSlots.push({ mi, side, groups: s.groups });
        }
      });
    }
    const thirdAssignCache = Object.create(null);
    function assignThirds(availGroups) { // 8 qualified group letters (ranking order)
      const key = availGroups.slice().sort().join('');
      if (thirdAssignCache[key] !== undefined) return thirdAssignCache[key];
      const n = thirdSlots.length;
      const assign = new Array(n).fill(null);
      const used = Object.create(null);
      const order = thirdSlots.map((s, i) => i).sort((x, y) =>
        thirdSlots[x].groups.filter(g => availGroups.includes(g)).length -
        thirdSlots[y].groups.filter(g => availGroups.includes(g)).length);
      function bt(k) {
        if (k === n) return true;
        const si = order[k], slot = thirdSlots[si];
        for (const g of availGroups) {
          if (used[g] || slot.groups.indexOf(g) < 0) continue;
          used[g] = 1; assign[si] = g;
          if (bt(k + 1)) return true;
          used[g] = 0; assign[si] = null;
        }
        return false;
      }
      if (!bt(0)) { // best-effort greedy fallback (should not trigger for valid combos)
        const used2 = Object.create(null);
        for (const si of order) {
          const slot = thirdSlots[si];
          const pick = availGroups.find(g => !used2[g] && slot.groups.indexOf(g) >= 0) ||
                       availGroups.find(g => !used2[g]);
          if (pick) { used2[pick] = 1; assign[si] = pick; }
        }
      }
      thirdAssignCache[key] = assign;
      return assign;
    }

    // ---- accumulators ----
    const names = entries.map(e => e.name);
    const winCount = {}, podiumCount = {}, rankSum = {};
    for (const n of names) { winCount[n] = 0; podiumCount[n] = 0; rankSum[n] = 0; }

    for (let s = 0; s < sims; s++) {
      // 1. complete the group stage
      const stats = {};
      for (const g of GROUP_KEYS) {
        stats[g] = {};
        for (const t of Engine.GROUPS[g]) {
          const b = base[g][t];
          stats[g][t] = { pts: b.pts, gd: b.gd, gf: b.gf };
        }
      }
      const simResults = {}; // g -> simulated scorelines (this sim only)
      for (const m of pending) {
        const sc = simScoreline(m);
        const g = Engine.TEAM_GROUP[m.home];
        applyResult(stats[g], m.home, m.away, sc[0], sc[1]);
        (simResults[g] || (simResults[g] = [])).push({ home: m.home, away: m.away, hs: sc[0], as: sc[1] });
      }

      // 2. final tables (engine tiebreaks: pts/gd/gf, head-to-head mini-table among
      // tied blocks, name) + third-place ranking (pts/gd/gf/name — engine thirdTable
      // uses no head-to-head).
      const tables = {};      // g -> [team names in final order]
      const tablesFake = {};  // g -> {order:[{team,...}x4], complete:true} for Engine.scoreEntry
      const thirdRows = [];
      for (const g of GROUP_KEYS) {
        const rows = Engine.GROUPS[g].map(t => ({ team: t, pts: stats[g][t].pts, gd: stats[g][t].gd, gf: stats[g][t].gf }));
        rankSimRows(rows, simResults[g] ? realResults[g].concat(simResults[g]) : realResults[g]);
        tables[g] = [rows[0].team, rows[1].team, rows[2].team, rows[3].team];
        tablesFake[g] = { order: rows, complete: true };
        thirdRows.push({ group: g, team: rows[2].team, pts: rows[2].pts, gd: rows[2].gd, gf: rows[2].gf });
      }
      thirdRows.sort(cmpRows);
      const top8 = thirdRows.slice(0, 8);
      const adv = new Set(), thirdGroupsSet = new Set();
      const thirdByGroup = {}, thirdGroupsRanked = [];
      for (const g of GROUP_KEYS) { adv.add(tables[g][0]); adv.add(tables[g][1]); }
      for (const r of top8) {
        adv.add(r.team); thirdGroupsSet.add(r.group);
        thirdByGroup[r.group] = r.team; thirdGroupsRanked.push(r.group);
      }

      // 3. knockout bracket
      const winners = { r32: [], r16: [], qf: [], sf: [] };
      let champion = null, runnerUp = null;
      if (topology) {
        const thirdAssign = thirdSlots.length ? assignThirds(thirdGroupsRanked) : [];
        const thirdSlotTeam = Object.create(null);
        thirdSlots.forEach((sl, i) => {
          thirdSlotTeam[sl.mi + '|' + sl.side] = thirdAssign[i] ? thirdByGroup[thirdAssign[i]] : null;
        });
        const resolve = (slot, mi, side) => {
          if (!slot) return null;
          switch (slot.type) {
            case 'team': return slot.team;
            case 'pos': return tables[slot.group] ? tables[slot.group][slot.pos - 1] : null;
            case 'third': return thirdSlotTeam[mi + '|' + side] || null;
            case 'winner': return (winners[slot.round] && winners[slot.round][slot.index - 1]) || null;
            default: return null;
          }
        };
        const pairs = topology.r32.map((mt, mi) => [resolve(mt.home, mi, 'home'), resolve(mt.away, mi, 'away')]);
        const assigned = new Set();
        for (const p of pairs) { if (p[0]) assigned.add(p[0]); if (p[1]) assigned.add(p[1]); }
        const leftovers = [...adv].filter(t => !assigned.has(t)); // fills 'unknown' slots
        for (const p of pairs) {
          if (!p[0]) p[0] = leftovers.shift() || null;
          if (!p[1]) p[1] = leftovers.shift() || null;
        }
        pairs.forEach((p, i) => { winners.r32[i] = koWinner('r32', p[0], p[1]); });
        const playRound = (specArr, roundName) => {
          specArr.forEach((mt, i) => {
            winners[roundName][i] = koWinner(roundName, resolve(mt.home, i, 'home'), resolve(mt.away, i, 'away'));
          });
        };
        playRound(topology.r16, 'r16');
        playRound(topology.qf, 'qf');
        playRound(topology.sf, 'sf');
        const fh = resolve(topology.final.home, 0, 'home'), fa = resolve(topology.final.away, 0, 'away');
        champion = koWinner('final', fh, fa);
        runnerUp = champion === fh ? fa : fh;
      } else {
        // best-effort bracket when topology is unavailable
        const Ws = GROUP_KEYS.map(g => tables[g][0]);
        const Rs = GROUP_KEYS.map(g => tables[g][1]);
        const Ts = top8.map(r => r.team);
        const pairs = [];
        for (let i = 0; i < 8; i++) pairs.push([Ws[i], Ts[i]]);
        for (let i = 0; i < 4; i++) pairs.push([Ws[8 + i], Rs[i]]);
        for (let i = 0; i < 4; i++) pairs.push([Rs[4 + 2 * i], Rs[5 + 2 * i]]);
        pairs.forEach((p, i) => { winners.r32[i] = koWinner('r32', p[0], p[1]); });
        for (let i = 0; i < 8; i++) winners.r16[i] = koWinner('r16', winners.r32[2 * i], winners.r32[2 * i + 1]);
        for (let i = 0; i < 4; i++) winners.qf[i] = koWinner('qf', winners.r16[2 * i], winners.r16[2 * i + 1]);
        for (let i = 0; i < 2; i++) winners.sf[i] = koWinner('sf', winners.qf[2 * i], winners.qf[2 * i + 1]);
        champion = koWinner('final', winners.sf[0], winners.sf[1]);
        runnerUp = champion === winners.sf[0] ? winners.sf[1] : winners.sf[0];
      }

      // 4. score all entries against a minimal fake state.
      // Engine.scoreEntry(entry, state, false) reads exactly: state.finalTables
      // ([g].order[i].team), state.allGroupsComplete, state.advFinal{adv,thirdGroups},
      // state.knockout{r16,qf,sf,runnerUp,champion}. liveTables/advLive mirrored for safety.
      const advObj = { adv, thirdGroups: thirdGroupsSet };
      const fake = {
        liveTables: tablesFake, finalTables: tablesFake, allGroupsComplete: true,
        advLive: advObj, advFinal: advObj,
        knockout: {
          r16: new Set(winners.r32.filter(Boolean)),
          qf: new Set(winners.r16.filter(Boolean)),
          sf: new Set(winners.qf.filter(Boolean)),
          champion, runnerUp,
        },
      };
      const rows = entries.map(e => ({ name: e.name, total: Engine.scoreEntry(e, fake, false).total }));
      rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      winCount[rows[0].name]++;
      for (let i = 0; i < rows.length; i++) {
        rankSum[rows[i].name] += i + 1;
        if (i < 3) podiumCount[rows[i].name]++;
      }
    }

    const winProb = {}, podiumProb = {}, expRank = {};
    for (const n of names) {
      winProb[n] = winCount[n] / sims;
      podiumProb[n] = podiumCount[n] / sims;
      expRank[n] = rankSum[n] / sims;
    }
    return { winProb, podiumProb, expRank, sims };
  }

  // ---------------- 3. stakes ----------------
  function stakes(state, entries, match) {
    const isGroup = match.round === 'group';
    const keys = isGroup ? ['home', 'draw', 'away'] : ['home', 'away'];
    const current = {};
    for (const e of entries) current[e.name] = Engine.scoreEntry(e, state, true).total;

    let idx = state.matches.indexOf(match);
    if (idx < 0) idx = state.matches.findIndex(m => sameMatch(m, match));

    function repScore(m, key) {
      const hs = isNaN(m.hs) ? null : m.hs, as = isNaN(m.as) ? null : m.as;
      if (key === 'draw') { const v = hs != null && as != null ? Math.max(hs, as) : 1; return [v, v]; }
      if (key === 'home') return hs != null && as != null && hs > as ? [hs, as] : [(as || 0) + 1, as || 0];
      return hs != null && as != null && as > hs ? [hs, as] : [hs || 0, (hs || 0) + 1];
    }

    const hn = match.home || 'Home', an = match.away || 'Away';
    const outcomes = keys.map(key => {
      const sc = repScore(match, key);
      const sim = {
        ...match, hs: sc[0], as: sc[1], completed: true, state: 'post', clock: '',
        homeWinner: sc[0] > sc[1], awayWinner: sc[1] > sc[0],
      };
      const arr = state.matches.slice();
      if (idx >= 0) arr[idx] = sim; else arr.push(sim);
      const st2 = Engine.buildState(arr); // one buildState per outcome (max 3)
      const deltas = {};
      for (const e of entries) deltas[e.name] = Engine.scoreEntry(e, st2, true).total - current[e.name];
      return {
        key,
        label: key === 'draw' ? 'Draw' : (key === 'home' ? hn : an) + ' win',
        deltas,
      };
    });
    return { outcomes };
  }

  // ---------------- 4. roundOf / ROUNDS ----------------
  const ROUNDS = [
    { key: 'R1', label: 'Group Matchday 1', from: '2026-06-11', to: '2026-06-18' },
    { key: 'R2', label: 'Group Matchday 2', from: '2026-06-19', to: '2026-06-24' },
    { key: 'R3', label: 'Group Matchday 3', from: '2026-06-25', to: '2026-06-28' },
    { key: 'R32', label: 'Round of 32', from: '2026-06-28', to: '2026-07-04' },
    { key: 'R16', label: 'Round of 16', from: '2026-07-04', to: '2026-07-07' },
    { key: 'QF', label: 'Quarterfinals', from: '2026-07-09', to: '2026-07-12' },
    { key: 'SF', label: 'Semifinals', from: '2026-07-14', to: '2026-07-15' },
    { key: 'FINALS', label: 'Finals', from: '2026-07-18', to: '2026-07-19' },
  ];
  const ROUND_KEY = { r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', third: 'FINALS', final: 'FINALS' };

  // True matchday classification. Calendar dates cannot partition matchdays in the
  // real schedule (18 Jun UTC hosts both matchday-1 and matchday-2 games because
  // Groups A/B started 11 Jun; 24 Jun mixes matchday 2 and 3), so a group match is
  // classified by per-team sequence: a team's k-th group match chronologically is
  // matchday k. Home and away sides always agree in a valid round-robin schedule;
  // max() is a defensive fallback, capped at R3.
  function matchdayMap(matches) {
    const seen = Object.create(null); // team -> group matches played so far
    const group = (matches || []).filter(m => m.round === 'group' && m.home && m.away)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const map = new Map();
    for (const m of group) {
      const hk = seen[m.home] = (seen[m.home] || 0) + 1;
      const ak = seen[m.away] = (seen[m.away] || 0) + 1;
      map.set(m, 'R' + Math.min(Math.max(hk, ak), 3));
    }
    return map;
  }

  function roundOf(match, mdays) {
    if (match.round !== 'group') return ROUND_KEY[match.round] || 'FINALS';
    if (mdays) {
      const k = mdays.get(match);
      if (k) return k;
    }
    // Date-window fallback when no matchday map is supplied (approximate: 18 Jun
    // and 24 Jun UTC each mix two matchdays — prefer passing matchdayMap output).
    const d = String(match.date).slice(0, 10); // UTC date of the ISO timestamp
    if (d <= '2026-06-18') return 'R1';
    if (d <= '2026-06-24') return 'R2';
    return 'R3';
  }

  // ---------------- 5. crowns ----------------
  // Points gained in a window = projected score with matches completed up to the
  // window end MINUS projected score with matches completed before window start.
  // One Engine.buildState per boundary: <= 9 builds total.
  function crowns(state, entries) {
    const matches = state.matches || [];
    const mdays = matchdayMap(matches); // true matchday windows, not calendar dates
    const winIdx = {};
    ROUNDS.forEach((r, i) => { winIdx[r.key] = i; });
    const byWindow = ROUNDS.map(() => ({ all: [], completed: [] }));
    for (const m of matches) {
      const k = winIdx[roundOf(m, mdays)];
      if (k === undefined) continue;
      byWindow[k].all.push(m);
      if (m.completed) byWindow[k].completed.push(m);
    }
    let last = -1;
    for (let i = 0; i < ROUNDS.length; i++) if (byWindow[i].completed.length) last = i;
    const out = [];
    if (last < 0) return out;

    function scoreBoundary(ms) {
      const st = Engine.buildState(ms.slice());
      const sc = {};
      for (const e of entries) sc[e.name] = Engine.scoreEntry(e, st, true).total;
      return sc;
    }
    function rankOf(scores) {
      const ns = entries.map(e => e.name).sort((a, b) => scores[b] - scores[a] || a.localeCompare(b));
      const r = {};
      ns.forEach((n, i) => { r[n] = i + 1; });
      return r;
    }

    let prefix = [];
    let prevScores = scoreBoundary(prefix);
    let prevRanks = rankOf(prevScores);
    for (let i = 0; i <= last; i++) {
      const w = byWindow[i];
      if (!w.completed.length) continue; // no rebuild needed; boundary unchanged
      prefix = prefix.concat(w.completed);
      const scores = scoreBoundary(prefix);
      const ranks = rankOf(scores);
      const gains = {};
      let best = -Infinity;
      for (const e of entries) {
        const g = scores[e.name] - prevScores[e.name];
        gains[e.name] = g;
        if (g > best) best = g;
      }
      out.push({
        round: ROUNDS[i].key,
        winners: entries.filter(e => gains[e.name] === best).map(e => e.name),
        pts: best,
        done: w.all.length > 0 && w.all.every(m => m.completed),
        gains, ranksBefore: prevRanks, ranksAfter: ranks, // extra fields for badges/UI
      });
      prevScores = scores;
      prevRanks = ranks;
    }
    return out;
  }

  // ---------------- 6. badges ----------------
  function badges(state, entries, crownRows, leaderboardRows) {
    crownRows = crownRows || [];
    leaderboardRows = leaderboardRows || [];
    const out = {};
    const predAdvByName = {};
    for (const e of entries) predAdvByName[e.name] = Engine.predictedAdvancers(e);
    const advTeamCounts = {};
    for (const e of entries) for (const t of predAdvByName[e.name]) advTeamCounts[t] = (advTeamCounts[t] || 0) + 1;
    const thirdPickCounts = {};
    for (const e of entries) for (const g of (e.thirds || [])) thirdPickCounts[g] = (thirdPickCounts[g] || 0) + 1;
    const lastDone = crownRows.slice().reverse().find(r => r.done && r.ranksBefore && r.ranksAfter) || null;

    for (const e of entries) {
      const list = [];

      // group-oracle: exact 4-team order in a completed group
      const oracle = [];
      for (const [g, t] of Object.entries(state.finalTables || {})) {
        if (!t.complete) continue;
        const pred = e.groups && e.groups[g];
        if (pred && pred.length === 4 && pred.every((tm, i) => t.order[i].team === tm)) oracle.push(g);
      }
      if (oracle.length) list.push({
        id: 'group-oracle', emoji: '\u{1F3AF}', label: 'Group Oracle',
        desc: 'Nailed the exact final order of Group ' + oracle.join(', '), consolation: false,
      });

      if (state.allGroupsComplete) {
        // lone-wolf: an advanced team only this player predicted to advance
        const lone = [...predAdvByName[e.name]].filter(t => state.advFinal.adv.has(t) && advTeamCounts[t] === 1);
        if (lone.length) list.push({
          id: 'lone-wolf', emoji: '\u{1F43A}', label: 'Lone Wolf',
          desc: 'Only player to call ' + lone.join(', ') + ' advancing', consolation: false,
        });
        // crystal-ball: correct third-place group that <=3 players picked
        const cb = (e.thirds || []).filter(g => state.advFinal.thirdGroups.has(g) && thirdPickCounts[g] <= 3);
        if (cb.length) list.push({
          id: 'crystal-ball', emoji: '\u{1F52E}', label: 'Crystal Ball',
          desc: 'Called contrarian third-place group ' + cb.join(', '), consolation: false,
        });
      }

      // crowned: won any matchday crown
      const crowned = crownRows.filter(r => r.winners.indexOf(e.name) >= 0).map(r => r.round);
      if (crowned.length) list.push({
        id: 'crowned', emoji: '\u{1F451}', label: 'Crowned',
        desc: 'Won the matchday crown: ' + crowned.join(', '), consolation: false,
      });

      // top-dog: rank 1 on the current leaderboard
      const lbRow = leaderboardRows.find(r => r.name === e.name);
      if (lbRow && lbRow.rank === 1) list.push({
        id: 'top-dog', emoji: '\u{1F947}', label: 'Top Dog',
        desc: 'Leads the pool right now', consolation: false,
      });

      // dead-by-dawn: champion pick eliminated
      if (e.champion && state.eliminated && state.eliminated.has(e.champion)) list.push({
        id: 'dead-by-dawn', emoji: '⚰️', label: 'Dead by Dawn',
        desc: 'Champion pick ' + e.champion + ' is out of the tournament', consolation: true,
      });

      // duck: no points gained in a completed window
      const ducked = crownRows.filter(r => r.done && r.gains && r.gains[e.name] <= 0).map(r => r.round);
      if (ducked.length) list.push({
        id: 'duck', emoji: '\u{1F986}', label: 'Duck',
        desc: 'No points gained in ' + ducked.join(', '), consolation: true,
      });

      // comeback: gained >=3 ranks across the latest completed window
      if (lastDone) {
        const up = lastDone.ranksBefore[e.name] - lastDone.ranksAfter[e.name];
        if (up >= 3) list.push({
          id: 'comeback', emoji: '\u{1F4C8}', label: 'Comeback',
          desc: 'Climbed ' + up + ' places during ' + lastDone.round, consolation: false,
        });
      }

      out[e.name] = list;
    }
    return out;
  }

  return { parseTopology, simulate, stakes, roundOf, matchdayMap, ROUNDS, crowns, badges, mulberry32 };
});
