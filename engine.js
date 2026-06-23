// Scoring engine for the WC2026 live leaderboard (Sp Jain Friends + Open pools).
// Mirrors the official pool rules published at fifaprediction.online:
//   Group stage: 3 pts per correct advancing team (any route), +4 per exact group position
//   Third place: 3 pts per correctly predicted third-place group (8 of 12 advance)
//   R32 winners 3 ea (16), R16 winners 4 ea (8), QF winners 5 ea (4), runner-up 8, champion 50
//   Max 470.
//
// LIVE SCORING (recalibrated to match the official site exactly — see BLUEPRINT §10):
//   The official site scores groups LIVE, but ONLY for "active" groups (groups that have kicked
//   off). Inactive/placeholder groups (all teams 0 pts) contribute nothing. Position (+4) is
//   credited per exact slot in active groups; advancing (+3) per predicted top-2 team currently
//   sitting top-2 in an active group. The third-place component stays 0 until all groups are
//   complete (best-thirds qualification is undefined mid-stage), exactly as the site does — its
//   breakdown reads {groups, thirdPlace:0, knockouts:0, champion:0} during the live group stage.
//   This rule was reverse-engineered and verified against the site's own published per-entry
//   scores+standings (open-pool-snapshot.json) — see test-recalibrate.mjs.

(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Real group composition (from the locked pool draw; identical to ESPN's groups).
  const GROUPS = {
    A: ['Czech Rep.', 'Mexico', 'South Korea', 'South Africa'],
    B: ['Qatar', 'Switzerland', 'Canada', 'Bosnia & Herz.'],
    C: ['Brazil', 'Morocco', 'Scotland', 'Haiti'],
    D: ['Turkey', 'Paraguay', 'Australia', 'United States'],
    E: ['Germany', 'Ecuador', 'Ivory Coast', 'Curacao'],
    F: ['Netherlands', 'Sweden', 'Japan', 'Tunisia'],
    G: ['Belgium', 'Iran', 'Egypt', 'New Zealand'],
    H: ['Spain', 'Uruguay', 'Saudi Arabia', 'Cape Verde'],
    I: ['France', 'Senegal', 'Norway', 'Iraq'],
    J: ['Argentina', 'Austria', 'Jordan', 'Algeria'],
    K: ['Portugal', 'Colombia', 'DR Congo', 'Uzbekistan'],
    L: ['England', 'Croatia', 'Ghana', 'Panama'],
  };
  const TEAM_GROUP = {};
  for (const [g, teams] of Object.entries(GROUPS)) teams.forEach(t => { TEAM_GROUP[t] = g; });

  // ESPN displayName -> pool name (identity for the rest)
  const ESPN_TO_POOL = {
    'Czechia': 'Czech Rep.',
    'Bosnia-Herzegovina': 'Bosnia & Herz.',
    'Türkiye': 'Turkey',
    'Curaçao': 'Curacao',
    'Congo DR': 'DR Congo',
    'USA': 'United States',
  };
  // api.fifa.com fallback names -> pool name
  const FIFA_TO_POOL = {
    'Korea Republic': 'South Korea',
    'Bosnia and Herzegovina': 'Bosnia & Herz.',
    'Côte d\'Ivoire': 'Ivory Coast',
    'Cabo Verde': 'Cape Verde',
    'IR Iran': 'Iran',
    'Türkiye': 'Turkey',
    'Czechia': 'Czech Rep.',
    'Congo DR': 'DR Congo',
    'Curaçao': 'Curacao',
    'USA': 'United States',
  };

  function normalizeTeam(name, map) {
    if (TEAM_GROUP[name]) return name;
    const mapped = map[name];
    return mapped && TEAM_GROUP[mapped] ? mapped : null; // null = placeholder/unknown
  }

  const ROUND_SLUGS = {
    'group-stage': 'group', 'round-of-32': 'r32', 'round-of-16': 'r16',
    'quarterfinals': 'qf', 'semifinals': 'sf', '3rd-place-match': 'third', 'final': 'final',
  };

  // ESPN scoreboard events -> normalized matches
  function parseEspn(json) {
    const matches = [];
    matches.logos = {}; // pool team name -> ESPN country logo URL
    for (const ev of json.events || []) {
      const round = ROUND_SLUGS[ev.season && ev.season.slug] || 'group';
      const comp = (ev.competitions && ev.competitions[0]) || {};
      const comps = comp.competitors || [];
      if (comps.length !== 2) continue;
      const homeC = comps.find(c => c.homeAway === 'home') || comps[0];
      const awayC = comps.find(c => c.homeAway === 'away') || comps[1];
      const home = normalizeTeam(homeC.team && homeC.team.displayName, ESPN_TO_POOL);
      const away = normalizeTeam(awayC.team && awayC.team.displayName, ESPN_TO_POOL);
      if (home && homeC.team.logo) matches.logos[home] = homeC.team.logo;
      if (away && awayC.team.logo) matches.logos[away] = awayC.team.logo;
      const st = (ev.status && ev.status.type) || {};
      matches.push({
        round,
        date: ev.date,
        home, away, // null when slot is still a placeholder ("Group A 2nd Place")
        hs: parseInt(homeC.score, 10), as: parseInt(awayC.score, 10),
        state: st.state || 'pre',           // pre | in | post
        completed: !!st.completed,
        clock: st.state === 'in' ? (ev.status.displayClock || '') : '',
        detail: st.detail || st.shortDetail || '',
        homeWinner: homeC.winner === true, awayWinner: awayC.winner === true,
      });
    }
    return matches;
  }

  // api.fifa.com fallback -> normalized matches (group stage focus; knockout via stage name)
  function parseFifa(json) {
    const stageMap = [
      [/round of 32/i, 'r32'], [/round of 16/i, 'r16'], [/quarter/i, 'qf'],
      [/semi/i, 'sf'], [/third|3rd/i, 'third'], [/final/i, 'final'],
    ];
    const matches = [];
    for (const m of json.Results || []) {
      const hn = m.Home && m.Home.TeamName && m.Home.TeamName[0] && m.Home.TeamName[0].Description;
      const an = m.Away && m.Away.TeamName && m.Away.TeamName[0] && m.Away.TeamName[0].Description;
      const home = normalizeTeam(hn, FIFA_TO_POOL);
      const away = normalizeTeam(an, FIFA_TO_POOL);
      let round = 'group';
      const stage = (m.StageName && m.StageName[0] && m.StageName[0].Description) || '';
      if (!(m.GroupName && m.GroupName.length)) {
        for (const [re, r] of stageMap) if (re.test(stage)) { round = r; break; }
      }
      const finished = m.MatchStatus === 0;
      const live = m.MatchStatus === 3;
      const hs = m.Home ? Number(m.Home.Score) : NaN;
      const as = m.Away ? Number(m.Away.Score) : NaN;
      // Pens-decided knockouts: the 120-min score stays level; the shootout result
      // lives in the Winner team id / penalty-score fields, never in Home.Score.
      const hp = Number((m.HomeTeamPenaltyScore != null ? m.HomeTeamPenaltyScore : (m.Home && m.Home.PenaltyScore)) || 0);
      const ap = Number((m.AwayTeamPenaltyScore != null ? m.AwayTeamPenaltyScore : (m.Away && m.Away.PenaltyScore)) || 0);
      const homeId = m.Home && m.Home.IdTeam, awayId = m.Away && m.Away.IdTeam;
      const winId = m.Winner != null ? m.Winner : null;
      matches.push({
        round, date: m.Date, home, away, hs, as,
        state: finished ? 'post' : live ? 'in' : 'pre',
        completed: finished, clock: live ? (m.MatchTime || '') : '', detail: stage,
        homeWinner: finished && (hs > as || (hs === as && ((winId != null && winId === homeId) || hp > ap))),
        awayWinner: finished && (as > hs || (hs === as && ((winId != null && winId === awayId) || ap > hp))),
      });
    }
    return matches;
  }

  // FIFA group tiebreakers (approx): points, GD, GF, then a head-to-head mini-table
  // among the tied block (transitive — a pairwise h2h comparator is not), then name.
  function rankTable(rows, matches) {
    const base = rows.slice().sort((a, b) =>
      b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
    const out = [];
    for (let i = 0; i < base.length;) {
      let j = i;
      while (j < base.length && base[j].pts === base[i].pts && base[j].gd === base[i].gd && base[j].gf === base[i].gf) j++;
      const block = base.slice(i, j);
      if (block.length > 1) {
        const mini = Object.fromEntries(block.map(r => [r.team, { pts: 0, gd: 0, gf: 0 }]));
        for (const m of matches) {
          if (!m.completed || !mini[m.home] || !mini[m.away] || isNaN(m.hs) || isNaN(m.as)) continue;
          const h = mini[m.home], a = mini[m.away];
          h.gf += m.hs; h.gd += m.hs - m.as; a.gf += m.as; a.gd += m.as - m.hs;
          if (m.hs > m.as) h.pts += 3; else if (m.hs < m.as) a.pts += 3; else { h.pts++; a.pts++; }
        }
        block.sort((a, b) =>
          mini[b.team].pts - mini[a.team].pts || mini[b.team].gd - mini[a.team].gd ||
          mini[b.team].gf - mini[a.team].gf || a.team.localeCompare(b.team));
      }
      out.push(...block);
      i = j;
    }
    return out;
  }

  // Build tournament state from normalized matches.
  // includeLive: count in-progress scores into tables (projection view).
  function buildState(matches) {
    const groupMatches = matches.filter(m => m.round === 'group' && m.home && m.away);

    function makeTables(includeLive) {
      const tables = {};
      for (const [g, teams] of Object.entries(GROUPS)) {
        const rows = teams.map(t => ({ team: t, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, live: false }));
        const byTeam = Object.fromEntries(rows.map(r => [r.team, r]));
        const gm = groupMatches.filter(m => TEAM_GROUP[m.home] === g);
        for (const m of gm) {
          const hasScores = !isNaN(m.hs) && !isNaN(m.as);
          const use = hasScores && (m.completed || (includeLive && m.state === 'in'));
          if (!use) continue;
          const h = byTeam[m.home], a = byTeam[m.away];
          if (!h || !a) continue;
          h.played++; a.played++;
          h.gf += m.hs; h.ga += m.as; a.gf += m.as; a.ga += m.hs;
          if (m.hs > m.as) { h.w++; h.pts += 3; a.l++; }
          else if (m.hs < m.as) { a.w++; a.pts += 3; h.l++; }
          else { h.d++; a.d++; h.pts++; a.pts++; }
          if (m.state === 'in') { h.live = true; a.live = true; }
        }
        for (const r of rows) r.gd = r.gf - r.ga;
        const completedCount = gm.filter(m => m.completed && !isNaN(m.hs) && !isNaN(m.as)).length;
        // A group is "active" (live-scorable) once any of its teams has logged a result in
        // these tables. The official site (fifaprediction.online) only banks group points for
        // ACTIVE groups — placeholder/0-pt inactive groups contribute nothing. `played` counts
        // matches reflected in the table (completed always; in-progress only in the live view).
        const played = rows.reduce((a, r) => a + r.played, 0) / 2;
        tables[g] = {
          order: rankTable(rows, gm),
          complete: completedCount === 6,
          playedMatches: completedCount,
          active: played > 0,
        };
      }
      return tables;
    }

    const finalTables = makeTables(false);
    const liveTables = makeTables(true);
    const allGroupsComplete = Object.values(finalTables).every(t => t.complete);

    // Third-place ranking across groups: points, GD, GF, name (FIFA criteria approx).
    // Only ACTIVE groups contribute a meaningful third place; inactive (0-pt placeholder)
    // groups are excluded so they don't pollute the best-thirds ranking during the live
    // group stage. `allComplete` lets callers know the 8-of-12 cut is final.
    function thirdTable(tables, allComplete) {
      const src = allComplete ? Object.entries(tables) : Object.entries(tables).filter(([, t]) => t.active);
      const thirds = src.map(([g, t]) => ({ group: g, ...t.order[2] }));
      thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
      return thirds;
    }

    // Live advancing set. Per the official rule (deduced from fifaprediction.online's own
    // snapshot scores): an "advancer" is a top-2 team in an ACTIVE group. Third-place
    // qualification (8 of 12 best thirds) only RESOLVES — and the separate `thirdPlace`
    // score component only grows — once all groups are complete; until then `thirdGroups`
    // is empty so no provisional third-place points are banked (matches the site, whose
    // breakdown keeps `thirdPlace:0` throughout the live group stage).
    function advancers(tables, allComplete) {
      const adv = new Set(), thirdGroups = new Set();
      for (const t of Object.values(tables)) {
        if (!allComplete && !t.active) continue;
        adv.add(t.order[0].team); adv.add(t.order[1].team);
      }
      // Best-8 third-placed teams, ranked on the CURRENT standings — the assume-final rule:
      // whatever the live table says right now is treated as the final result, live thirds included.
      for (const row of thirdTable(tables, allComplete).slice(0, 8)) { adv.add(row.team); thirdGroups.add(row.group); }
      return { adv, thirdGroups };
    }

    // Knockout progression from completed knockout matches.
    const sets = { r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set(), finalists: new Set() };
    let champion = null, runnerUp = null;
    const eliminated = new Set();
    const nextOf = { r32: 'r16', r16: 'qf', qf: 'sf', sf: 'finalists' };
    for (const m of matches) {
      if (m.round === 'group' || m.round === 'third') continue;
      if (m.home) sets[m.round === 'final' ? 'finalists' : m.round] && sets[m.round === 'final' ? 'finalists' : m.round].add(m.home);
      if (m.away) sets[m.round === 'final' ? 'finalists' : m.round] && sets[m.round === 'final' ? 'finalists' : m.round].add(m.away);
      if (!m.completed || !m.home || !m.away) continue;
      const winner = m.homeWinner ? m.home : m.awayWinner ? m.away : null;
      const loser = m.homeWinner ? m.away : m.awayWinner ? m.home : null;
      if (!winner) continue; // both parsers resolve pens into the winner flags; null only on bad data
      if (m.round === 'final') { champion = winner; runnerUp = loser; eliminated.add(loser); }
      else { if (nextOf[m.round]) sets[nextOf[m.round]].add(winner); eliminated.add(loser); }
    }

    // Group-stage eliminations: 4th place in a completed group is out;
    // 3rd places resolve only when all groups complete.
    for (const t of Object.values(finalTables)) {
      if (t.complete) eliminated.add(t.order[3].team);
    }
    if (allGroupsComplete) {
      const tt = thirdTable(finalTables);
      for (const row of tt.slice(8)) eliminated.add(row.team);
    }

    return {
      logos: matches.logos || {},
      finalTables, liveTables, allGroupsComplete,
      thirdTableLive: thirdTable(liveTables, allGroupsComplete),
      thirdTableFinal: thirdTable(finalTables, allGroupsComplete),
      advFinal: advancers(finalTables, allGroupsComplete),
      advLive: advancers(liveTables, allGroupsComplete),
      knockout: { ...sets, champion, runnerUp },
      eliminated,
      matches,
    };
  }

  // Advancing CANDIDATES = your predicted 1st, 2nd AND 3rd in every group. The official
  // site awards +3 "advancing" for any of your top-3 predicted teams that is currently in a
  // qualifying slot (top-2, or a best-8 third) — regardless of your separate third-place-group
  // pick. Your 4th-row pick never earns advancing. (Verified row-by-row against the official's
  // own scorecard; this includes the 3rd-row pick in groups NOT in entry.thirds.)
  function predictedAdvancers(entry) {
    const adv = new Set();
    for (const order of Object.values(entry.groups)) {
      adv.add(order[0]); adv.add(order[1]); adv.add(order[2]);
    }
    return adv;
  }

  // Score one entry against current tournament state — the ASSUME-FINAL rule:
  // treat the live standings, right now, as if they were the final result, and apply the
  // website's published points. Recomputed on every refresh, so the number moves with each game.
  //   • +3 per predicted advancing team currently in a qualifying slot (top-2 of an active group,
  //     or one of the live best-8 third-placed teams)
  //   • +4 per exact group position (1st/2nd/3rd/4th) in an active group
  //   • +3 per group whose live 3rd-placed team is in the current best-8
  //   • knockouts use real results: R32 win 3, R16 win 4, QF win 5, runner-up 8, champion 50 (max 470)
  // A group is only scored once it is "active" (has logged a result) — an un-started group has no
  // standings to assume. The `opts.snapshot:'final'` flag exists only for callers that want the
  // completed-only view; the leaderboard always uses the live view (the one true number).
  function scoreEntry(entry, state, opts) {
    // Back-compat: a boolean 2nd-positional arg was the old `projected` flag; both live now.
    const useLive = opts === undefined ? true : (typeof opts === 'boolean' ? true : opts.snapshot !== 'final');
    const br = { posBonus: 0, advancing: 0, thirdPlace: 0, r32w: 0, r16w: 0, qfw: 0, runnerUp: 0, champion: 0 };
    const tables = useLive ? state.liveTables : state.finalTables;
    const { adv: actualAdv, thirdGroups: actualThirdGroups } = useLive ? state.advLive : state.advFinal;

    const predAdv = predictedAdvancers(entry);
    for (const t of predAdv) if (actualAdv.has(t)) br.advancing += 3;
    for (const [g, t] of Object.entries(tables)) {
      if (!t.active && !state.allGroupsComplete) continue; // only score positions in active groups
      const pred = entry.groups[g];
      for (let i = 0; i < 4; i++) if (pred[i] === t.order[i].team) br.posBonus += 4;
    }
    for (const g of entry.thirds) if (actualThirdGroups.has(g)) br.thirdPlace += 3;

    const k = state.knockout;
    for (const t of entry.r16) if (k.r16.has(t)) br.r32w += 3;
    for (const t of entry.qf) if (k.qf.has(t)) br.r16w += 4;
    for (const t of entry.sf) if (k.sf.has(t)) br.qfw += 5;
    if (k.runnerUp && k.runnerUp === entry.runnerUp) br.runnerUp = 8;
    if (k.champion && k.champion === entry.champion) br.champion = 50;

    const total = Object.values(br).reduce((a, b) => a + b, 0);
    // Canonical {groups, thirdPlace, knockouts, champion} breakdown matching the official site:
    //   groups   = position bonus + advancing (the live group-stage number)
    //   thirdPlace = best-third qualification points (0 until groups complete)
    //   knockouts  = R32 + R16 + QF + runner-up points
    //   champion   = the 50-pt champion hit
    const breakdown = {
      groups: br.posBonus + br.advancing,
      thirdPlace: br.thirdPlace,
      knockouts: br.r32w + br.r16w + br.qfw + br.runnerUp,
      champion: br.champion,
    };
    return { total, br, breakdown };
  }

  // Upper bound on final score: 470 minus points that are definitively gone.
  function maxPossible(entry, state) {
    let lost = 0;
    const k = state.knockout;

    for (const [g, t] of Object.entries(state.finalTables)) {
      if (!t.complete) continue;
      const pred = entry.groups[g];
      for (let i = 0; i < 4; i++) if (pred[i] !== t.order[i].team) lost += 4;
    }

    const predAdv = predictedAdvancers(entry);
    // ADVANCING (component max 96 = 32 advancing teams x3). A candidate keeps its +3 once its
    // team advances from the group — a later knockout loss does NOT remove it — so use GROUP-only
    // elimination here, not tournament-wide eliminated (which includes KO losers). Cap at 96:
    // a bracket lists up to 36 top-3 candidates, and the surplus that can never all advance must
    // not be counted as "lost" against the 96 ceiling.
    const groupOut = new Set();
    for (const t of Object.values(state.finalTables)) {
      if (t.complete) groupOut.add(t.order[3].team); // 4th in a finished group is out
    }
    if (state.allGroupsComplete) {
      for (const [g, t] of Object.entries(state.finalTables))
        if (!state.advFinal.thirdGroups.has(g)) groupOut.add(t.order[2].team); // non-best-8 thirds out
    }
    let advAlive = 0;
    for (const t of predAdv) if (!groupOut.has(t)) advAlive++;
    lost += 96 - Math.min(96, advAlive * 3);
    // THIRD-PLACE GROUPS (separate max 24): a correct third-place-group pick is only a sure loss
    // once all groups complete and that group isn't in the final best-8.
    if (state.allGroupsComplete) {
      const { thirdGroups } = state.advFinal;
      for (const g of entry.thirds) if (!thirdGroups.has(g)) lost += 3;
    }

    for (const t of entry.r16) if (state.eliminated.has(t) && !k.r16.has(t)) lost += 3;
    for (const t of entry.qf) if (state.eliminated.has(t) && !k.qf.has(t)) lost += 4;
    for (const t of entry.sf) if (state.eliminated.has(t) && !k.sf.has(t)) lost += 5;
    if (k.runnerUp ? k.runnerUp !== entry.runnerUp
        : state.eliminated.has(entry.runnerUp) && !k.finalists.has(entry.runnerUp)) lost += 8;
    if (k.champion ? k.champion !== entry.champion : state.eliminated.has(entry.champion)) lost += 50;

    return 470 - lost;
  }

  // Points that are mathematically LOCKED IN — i.e. can never be lost no matter how the rest
  // of the tournament plays out. This is the floor under the live `points` number, used for the
  // secondary "secured / in-play / ceiling" detail (never the hero number).
  //   • Group positions are secured only once that group is COMPLETE (a live table can still flip).
  //   • Advancing/third points are secured only once all groups are complete (qualification fixed).
  //   • Knockout/runner-up/champion points are secured the moment the deciding match completes.
  function securedPoints(entry, state) {
    let secured = 0;
    const k = state.knockout;

    for (const [g, t] of Object.entries(state.finalTables)) {
      if (!t.complete) continue;
      const pred = entry.groups[g];
      for (let i = 0; i < 4; i++) if (pred[i] === t.order[i].team) secured += 4;
    }
    if (state.allGroupsComplete) {
      const { adv, thirdGroups } = state.advFinal;
      const predAdv = predictedAdvancers(entry);
      for (const t of predAdv) if (adv.has(t)) secured += 3;
      for (const g of entry.thirds) if (thirdGroups.has(g)) secured += 3;
    }

    for (const t of entry.r16) if (k.r16.has(t)) secured += 3;
    for (const t of entry.qf) if (k.qf.has(t)) secured += 4;
    for (const t of entry.sf) if (k.sf.has(t)) secured += 5;
    if (k.runnerUp && k.runnerUp === entry.runnerUp) secured += 8;
    if (k.champion && k.champion === entry.champion) secured += 50;
    return secured;
  }

  // Canonical leaderboard. ONE number — `points` — is the live official score (byte-for-byte
  // equal to fifaprediction.online's live number). Each row:
  //   { name, rank, champion, runnerUp,
  //     points,    // THE number: live official score (= breakdown.groups+thirdPlace+knockouts+champion)
  //     secured,   // mathematically-locked floor
  //     max,       // 470 ceiling minus points now definitively gone
  //     breakdown: { groups, thirdPlace, knockouts, champion },
  //     championAlive }
  // Sorted by points desc, tiebreak secured → max → name.
  function leaderboard(entries, state) {
    const rows = entries.map(e => {
      const sc = scoreEntry(e, state); // live (the one true number)
      return {
        name: e.name, champion: e.champion, runnerUp: e.runnerUp,
        points: sc.total,
        breakdown: sc.breakdown,
        secured: securedPoints(e, state),
        max: maxPossible(e, state),
        championAlive: !state.eliminated.has(e.champion),
      };
    });
    rows.sort((a, b) =>
      b.points - a.points || b.secured - a.secured || b.max - a.max || a.name.localeCompare(b.name));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  return {
    GROUPS, TEAM_GROUP, ESPN_TO_POOL, FIFA_TO_POOL,
    parseEspn, parseFifa, buildState, scoreEntry, maxPossible, securedPoints, leaderboard, predictedAdvancers,
  };
});
