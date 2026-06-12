// Scoring engine for the Sp Jain Friends WC2026 live leaderboard.
// Mirrors the official pool rules published at fifaprediction.online:
//   Group stage: 3 pts per correct advancing team (any route), +4 per exact group position
//   Third place: 3 pts per correctly predicted third-place group (8 of 12 advance)
//   R32 winners 3 ea (16), R16 winners 4 ea (8), QF winners 5 ea (4), runner-up 8, champion 50
//   Max 470. Official group scoring settles only when ALL groups are complete (site behavior);
//   the "projected" mode scores groups as if current live tables were final.

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
        tables[g] = { order: rankTable(rows, gm), complete: completedCount === 6, playedMatches: completedCount };
      }
      return tables;
    }

    const finalTables = makeTables(false);
    const liveTables = makeTables(true);
    const allGroupsComplete = Object.values(finalTables).every(t => t.complete);

    // Third-place ranking across groups: points, GD, GF, name (FIFA criteria approx).
    function thirdTable(tables) {
      const thirds = Object.entries(tables).map(([g, t]) => ({ group: g, ...t.order[2] }));
      thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
      return thirds;
    }

    function advancers(tables) {
      const adv = new Set(), thirdGroups = new Set();
      for (const t of Object.values(tables)) { adv.add(t.order[0].team); adv.add(t.order[1].team); }
      for (const row of thirdTable(tables).slice(0, 8)) { adv.add(row.team); thirdGroups.add(row.group); }
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
      thirdTableLive: thirdTable(liveTables), thirdTableFinal: thirdTable(finalTables),
      advFinal: advancers(finalTables), advLive: advancers(liveTables),
      knockout: { ...sets, champion, runnerUp },
      eliminated,
      matches,
    };
  }

  function predictedAdvancers(entry) {
    const adv = new Set();
    for (const [g, order] of Object.entries(entry.groups)) {
      adv.add(order[0]); adv.add(order[1]);
      if (entry.thirds.includes(g)) adv.add(order[2]);
    }
    return adv;
  }

  // Score one entry. projected=false → official mirror (groups settle only when all complete).
  function scoreEntry(entry, state, projected) {
    const br = { posBonus: 0, advancing: 0, thirdPlace: 0, r32w: 0, r16w: 0, qfw: 0, runnerUp: 0, champion: 0 };
    const tables = projected ? state.liveTables : state.finalTables;
    const scoreGroups = projected || state.allGroupsComplete;

    if (scoreGroups) {
      const { adv: actualAdv, thirdGroups: actualThirdGroups } = projected ? state.advLive : state.advFinal;
      const predAdv = predictedAdvancers(entry);
      for (const t of predAdv) if (actualAdv.has(t)) br.advancing += 3;
      for (const [g, t] of Object.entries(tables)) {
        const pred = entry.groups[g];
        for (let i = 0; i < 4; i++) if (pred[i] === t.order[i].team) br.posBonus += 4;
      }
      for (const g of entry.thirds) if (actualThirdGroups.has(g)) br.thirdPlace += 3;
    }

    const k = state.knockout;
    for (const t of entry.r16) if (k.r16.has(t)) br.r32w += 3;
    for (const t of entry.qf) if (k.qf.has(t)) br.r16w += 4;
    for (const t of entry.sf) if (k.sf.has(t)) br.qfw += 5;
    if (k.runnerUp && k.runnerUp === entry.runnerUp) br.runnerUp = 8;
    if (k.champion && k.champion === entry.champion) br.champion = 50;

    const total = Object.values(br).reduce((a, b) => a + b, 0);
    return { total, br };
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
    if (state.allGroupsComplete) {
      const { adv, thirdGroups } = state.advFinal;
      for (const t of predAdv) if (!adv.has(t)) lost += 3;
      for (const g of entry.thirds) if (!thirdGroups.has(g)) lost += 3;
    } else {
      // before that, only a 4th-place finish in a completed group is a sure loss
      for (const t of predAdv) if (state.eliminated.has(t)) lost += 3;
    }

    for (const t of entry.r16) if (state.eliminated.has(t) && !k.r16.has(t)) lost += 3;
    for (const t of entry.qf) if (state.eliminated.has(t) && !k.qf.has(t)) lost += 4;
    for (const t of entry.sf) if (state.eliminated.has(t) && !k.sf.has(t)) lost += 5;
    if (k.runnerUp ? k.runnerUp !== entry.runnerUp
        : state.eliminated.has(entry.runnerUp) && !k.finalists.has(entry.runnerUp)) lost += 8;
    if (k.champion ? k.champion !== entry.champion : state.eliminated.has(entry.champion)) lost += 50;

    return 470 - lost;
  }

  function leaderboard(entries, state) {
    const rows = entries.map(e => {
      const official = scoreEntry(e, state, false);
      const projected = scoreEntry(e, state, true);
      return {
        name: e.name, champion: e.champion, runnerUp: e.runnerUp,
        official: official.total, officialBr: official.br,
        projected: projected.total, projectedBr: projected.br,
        max: maxPossible(e, state),
        championAlive: !state.eliminated.has(e.champion),
      };
    });
    rows.sort((a, b) => b.projected - a.projected || b.official - a.official || b.max - a.max || a.name.localeCompare(b.name));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  return {
    GROUPS, TEAM_GROUP, ESPN_TO_POOL, FIFA_TO_POOL,
    parseEspn, parseFifa, buildState, scoreEntry, maxPossible, leaderboard, predictedAdvancers,
  };
});
