// MC validation: topology parsing from a grammar-faithful synthetic fixture,
// Monte Carlo sanity + conditioning, stakes, round windows, crowns, badges.
// Live ESPN feed is used when reachable; otherwise a synthetic schedule.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Engine = require('./engine.js');
const MC = require('./mc.js');
const RATINGS = require('./ratings.js');
const { POOL } = require('./data.js');

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  PASS', msg);
  else { failures++; console.error('  FAIL', msg); }
};
const names = POOL.entries.map(e => e.name);

// ---------- 1. parseTopology on a synthetic ESPN-like fixture ----------
console.log('\n[topology] synthetic fixture (observed placeholder grammar)');
const g1 = g => `Group ${g} Winner`, g2 = g => `Group ${g} 2nd Place`, th = s => `Third Place Group ${s}`;
const R32_DEFS = [
  [760486, g2('A'), g2('B')], [760487, g1('C'), g2('F')], [760488, g1('F'), g2('C')],
  [760489, g1('E'), th('A/B/C/D/F')], [760490, g2('E'), g2('I')], [760491, g1('A'), th('C/E/F/H/I')],
  [760492, g1('I'), th('C/D/F/G/H')], [760493, g1('G'), th('A/E/H/I/J')], [760494, g1('D'), th('B/E/F/I/J')],
  [760495, g1('L'), th('E/H/I/J/K')], [760496, g2('K'), g2('L')], [760497, g1('H'), g2('J')],
  [760498, g1('B'), th('E/F/G/I/J')], [760499, g2('D'), g2('G')], [760500, g1('J'), g2('H')],
  [760501, g1('K'), th('D/E/I/J/L')],
];
const R16_DEFS = [[760502, 1, 3], [760503, 2, 5], [760504, 4, 6], [760505, 7, 8],
  [760506, 11, 12], [760507, 9, 10], [760508, 13, 15], [760509, 14, 16]]
  .map(([id, a, b]) => [id, `Round of 32 ${a} Winner`, `Round of 32 ${b} Winner`]);
const QF_DEFS = [[760510, 1, 2], [760511, 5, 6], [760512, 3, 4], [760513, 7, 8]]
  .map(([id, a, b]) => [id, `Round of 16 ${a} Winner`, `Round of 16 ${b} Winner`]);
const SF_DEFS = [[760514, 1, 2], [760515, 3, 4]]
  .map(([id, a, b]) => [id, `Quarterfinal ${a} Winner`, `Quarterfinal ${b} Winner`]);

function evt(id, slug, homeLabel, awayLabel) {
  return {
    id: String(id), date: '2026-07-01T00:00Z', season: { slug },
    status: { type: { state: 'pre', completed: false } },
    competitions: [{ competitors: [
      { homeAway: 'home', team: { displayName: homeLabel, isActive: false } },
      { homeAway: 'away', team: { displayName: awayLabel, isActive: false } },
    ] }],
  };
}
const fixtureEvents = [
  // a group event the parser must ignore
  evt(760100, 'group-stage', 'Mexico', 'South Africa'),
  ...R32_DEFS.map(d => evt(d[0], 'round-of-32', d[1], d[2])),
  ...R16_DEFS.map(d => evt(d[0], 'round-of-16', d[1], d[2])),
  ...QF_DEFS.map(d => evt(d[0], 'quarterfinals', d[1], d[2])),
  ...SF_DEFS.map(d => evt(d[0], 'semifinals', d[1], d[2])),
  evt(760516, '3rd-place-match', 'Semifinal 1 Loser', 'Semifinal 2 Loser'),
  evt(760517, 'final', 'Semifinal 1 Winner', 'Semifinal 2 Winner'),
];
fixtureEvents.reverse(); // feed order must not matter (parser sorts by event id)
const fixture = { events: fixtureEvents };

const topo = MC.parseTopology(fixture);
assert(topo !== null, 'topology parses (non-null)');
assert(topo.r32.length === 16 && topo.r16.length === 8 && topo.qf.length === 4 && topo.sf.length === 2,
  'round array lengths 16/8/4/2');
assert(JSON.stringify(topo.r32[0]) === JSON.stringify({
  home: { type: 'pos', group: 'A', pos: 2 }, away: { type: 'pos', group: 'B', pos: 2 } }),
  'r32[0] = 2A vs 2B');
assert(topo.r32[3].home.type === 'pos' && topo.r32[3].home.group === 'E' && topo.r32[3].home.pos === 1,
  'r32[3] home = 1E (id order, not date order)');
assert(topo.r32[3].away.type === 'third' && topo.r32[3].away.groups.join('') === 'ABCDF',
  'r32[3] away = third A/B/C/D/F');
assert(topo.r16[6].home.type === 'winner' && topo.r16[6].home.round === 'r32' && topo.r16[6].home.index === 13
  && topo.r16[6].away.index === 15, 'r16[6] (id 760508) = R32 W13 v W15');
assert(topo.r16[7].home.index === 14 && topo.r16[7].away.index === 16, 'r16[7] (id 760509) = R32 W14 v W16');
assert(topo.qf[3].home.round === 'r16' && topo.qf[3].home.index === 7 && topo.qf[3].away.index === 8,
  'qf[3] = R16 W7 v W8');
assert(topo.sf[1].home.round === 'qf' && topo.sf[1].home.index === 3 && topo.sf[1].away.index === 4,
  'sf[1] = QF W3 v W4');
assert(topo.final.home.type === 'winner' && topo.final.home.round === 'sf' && topo.final.home.index === 1,
  'final home = SF1 winner');
assert(topo.third && topo.third.home.type === 'loser' && topo.third.home.round === 'sf', 'third = SF losers');

// all 32 slots covered exactly once (12 winners, 12 runners-up, 8 thirds)
const slotKeys = [];
for (const m of topo.r32) for (const s of [m.home, m.away]) {
  slotKeys.push(s.type === 'pos' ? s.pos + s.group : 'third');
}
assert(slotKeys.filter(k => k === 'third').length === 8 && new Set(slotKeys.filter(k => k !== 'third')).size === 24,
  '32 R32 slots: 24 unique group positions + 8 thirds');

// corruption: >4 unparseable labels -> null
const corrupt = JSON.parse(JSON.stringify(fixture));
let corrupted = 0;
for (const ev of corrupt.events) {
  if (ev.season.slug === 'round-of-32' && corrupted < 5) {
    ev.competitions[0].competitors[0].team.displayName = 'Mystery Slot ' + corrupted;
    corrupted++;
  }
}
assert(MC.parseTopology(corrupt) === null, '>4 unparseable labels returns null');
// mild corruption: <=4 bad labels -> best-effort with type unknown
const mild = JSON.parse(JSON.stringify(fixture));
let mc2 = 0;
for (const ev of mild.events) {
  if (ev.season.slug === 'round-of-32' && mc2 < 2) {
    ev.competitions[0].competitors[0].team.displayName = '???'; mc2++;
  }
}
const mildTopo = MC.parseTopology(mild);
assert(mildTopo !== null && mildTopo.r32.some(m => m.home.type === 'unknown'),
  '<=4 bad labels: best-effort with unknown slots');

// ---------- 2. roundOf / ROUNDS ----------
console.log('\n[roundOf] window classification');
assert(MC.ROUNDS.map(r => r.key).join(',') === 'R1,R2,R3,R32,R16,QF,SF,FINALS', 'ROUNDS ordered 8 keys');
// date-window fallback (no matchday map supplied)
assert(MC.roundOf({ round: 'group', date: '2026-06-18T23:00Z' }) === 'R1', '18 Jun group -> R1 (date fallback)');
assert(MC.roundOf({ round: 'group', date: '2026-06-19T00:00Z' }) === 'R2', '19 Jun group -> R2 (date fallback)');
assert(MC.roundOf({ round: 'group', date: '2026-06-24T20:00Z' }) === 'R2', '24 Jun group -> R2 (date fallback)');
assert(MC.roundOf({ round: 'group', date: '2026-06-25T15:00Z' }) === 'R3', '25 Jun group -> R3 (date fallback)');
assert(MC.roundOf({ round: 'r32', date: '2026-06-28T19:00Z' }) === 'R32', 'r32 -> R32 (date ignored)');
assert(MC.roundOf({ round: 'third', date: '2026-07-18T21:00Z' }) === 'FINALS', 'third -> FINALS');
assert(MC.roundOf({ round: 'final', date: '2026-07-19T19:00Z' }) === 'FINALS', 'final -> FINALS');

// matchday map: per-team sequence beats calendar dates (18 Jun and 24 Jun UTC both
// host two different matchdays in the real schedule — Groups A/B started 11 Jun)
const [a1, a2, a3, a4] = Engine.GROUPS.A;
const mdGroup = (date, home, away) => ({ round: 'group', date, home, away,
  hs: NaN, as: NaN, state: 'pre', completed: false, clock: '', detail: '',
  homeWinner: false, awayWinner: false });
const mdMatches = [
  mdGroup('2026-06-11T20:00Z', a1, a2), mdGroup('2026-06-12T00:00Z', a3, a4),     // MD1
  mdGroup('2026-06-18T16:00Z', a1, a3), mdGroup('2026-06-18T22:00Z', a2, a4),     // MD2 on 18 Jun!
  mdGroup('2026-06-24T19:00Z', a1, a4), mdGroup('2026-06-24T19:00Z', a2, a3),     // MD3 on 24 Jun!
];
const mdMap = MC.matchdayMap(mdMatches);
assert(MC.roundOf(mdMatches[0], mdMap) === 'R1', 'matchday map: 11 Jun first match -> R1');
assert(MC.roundOf(mdMatches[2], mdMap) === 'R2', 'matchday map: 18 Jun SECOND match -> R2 (date alone says R1)');
assert(MC.roundOf(mdMatches[2]) === 'R1', '18 Jun second match -> R1 without map (documents fallback lossiness)');
assert(MC.roundOf(mdMatches[4], mdMap) === 'R3', 'matchday map: 24 Jun THIRD match -> R3 (date alone says R2)');
assert(MC.roundOf({ round: 'r32', date: '2026-06-28T19:00Z' }, mdMap) === 'R32', 'matchday map ignored for knockout rounds');

// ---------- live state (with synthetic fallback) ----------
console.log('\n[state] fetching live ESPN scoreboard…');
let state = null, liveTopo = null, usedLive = false;
try {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200');
  const json = await res.json();
  const live = Engine.parseEspn(json);
  if (live.length < 100) throw new Error('short feed');
  state = Engine.buildState(live);
  liveTopo = MC.parseTopology(json);
  usedLive = true;
  console.log('  live feed:', live.length, 'matches,', live.filter(m => m.completed).length, 'completed');
  assert(liveTopo !== null, 'live feed topology parses (non-null)');
} catch (e) {
  console.log('  live fetch unavailable (' + e.message + ') — synthetic schedule fallback');
  const ms = [];
  let gi = 0;
  for (const [g, teams] of Object.entries(Engine.GROUPS)) {
    const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
    pairs.forEach(([i, j], k) => {
      const date = k < 2 ? `2026-06-${13 + (gi % 5)}` : k < 4 ? `2026-06-2${gi % 5}` : `2026-06-2${5 + (gi % 3)}`;
      ms.push({ round: 'group', date: date + 'T18:00Z', home: teams[i], away: teams[j],
        hs: NaN, as: NaN, state: 'pre', completed: false, clock: '', detail: '',
        homeWinner: false, awayWinner: false });
    });
    gi++;
  }
  ms[0] = { ...ms[0], date: '2026-06-11T20:00Z', hs: 2, as: 0, state: 'post', completed: true, homeWinner: true };
  ms[1] = { ...ms[1], date: '2026-06-12T00:00Z', hs: 1, as: 1, state: 'post', completed: true };
  state = Engine.buildState(ms);
  liveTopo = topo; // fixture topology
}

// ---------- 3. simulate ----------
console.log('\n[simulate] 1500 sims, default seeded rng');
const t0 = Date.now();
const sim = MC.simulate({ state, entries: POOL.entries, topology: liveTopo, ratings: RATINGS, sims: 1500 });
const elapsed = Date.now() - t0;
console.log(`  elapsed ${elapsed}ms; winProb:`, Object.entries(sim.winProb)
  .sort((a, b) => b[1] - a[1]).map(([n, p]) => `${n} ${(p * 100).toFixed(1)}%`).join(' | '));
assert(elapsed < 10000, `1500 sims in ${elapsed}ms < 10s`);
assert(sim.sims === 1500, 'sims echoed');
assert(names.every(n => typeof sim.winProb[n] === 'number'), 'winProb has all 10 names');
const wpSum = names.reduce((a, n) => a + sim.winProb[n], 0);
assert(wpSum > 0.97 && wpSum < 1.03, `winProb sums to ~1 (${wpSum.toFixed(4)})`);
const podSum = names.reduce((a, n) => a + sim.podiumProb[n], 0);
assert(podSum > 2.9 && podSum < 3.1, `podiumProb sums to ~3 (${podSum.toFixed(3)})`);
assert(names.every(n => sim.expRank[n] >= 1 && sim.expRank[n] <= 10), 'expRank within [1,10]');
const expRankSum = names.reduce((a, n) => a + sim.expRank[n], 0);
assert(Math.abs(expRankSum - 55) < 1e-6, `expRank sums to 55 (${expRankSum.toFixed(3)})`);

// determinism: same default seed -> identical output
const simA = MC.simulate({ state, entries: POOL.entries, topology: liveTopo, ratings: RATINGS, sims: 300 });
const simB = MC.simulate({ state, entries: POOL.entries, topology: liveTopo, ratings: RATINGS, sims: 300 });
assert(JSON.stringify(simA.winProb) === JSON.stringify(simB.winProb), 'deterministic with default seed');

// null topology: best-effort pairing still yields a sane distribution
const simNull = MC.simulate({ state, entries: POOL.entries, topology: null, ratings: RATINGS, sims: 500 });
const nullSum = names.reduce((a, n) => a + simNull.winProb[n], 0);
assert(nullSum > 0.97 && nullSum < 1.03, `null-topology winProb sums to ~1 (${nullSum.toFixed(4)})`);

// ---------- 3b. conditioning shifts probability the right way ----------
console.log('\n[simulate] conditioning');
const pendingMatch = state.matches.find(m => m.round === 'group' && !m.completed && m.home && m.away);
if (pendingMatch) {
  const baseRes = MC.simulate({ state, entries: POOL.entries, topology: liveTopo, ratings: RATINGS, sims: 1200 });
  const target = names.reduce((b, n) => baseRes.winProb[n] > baseRes.winProb[b] ? n : b, names[0]);
  let bestCond = -1, bestKey = null;
  for (const key of ['home', 'draw', 'away']) {
    const r = MC.simulate({ state, entries: POOL.entries, topology: liveTopo, ratings: RATINGS, sims: 1200,
      condition: { match: pendingMatch, matchKey: key } });
    const s = names.reduce((a, n) => a + r.winProb[n], 0);
    assert(s > 0.97 && s < 1.03, `conditioned (${key}) winProb sums to ~1 (${s.toFixed(4)})`);
    if (r.winProb[target] > bestCond) { bestCond = r.winProb[target]; bestKey = key; }
  }
  console.log(`  ${pendingMatch.home} v ${pendingMatch.away}: ${target} base=${baseRes.winProb[target].toFixed(3)}, best conditioned (${bestKey})=${bestCond.toFixed(3)}`);
  assert(bestCond >= baseRes.winProb[target] - 0.03,
    `forcing the favourable outcome does not decrease ${target}'s winProb (${bestCond.toFixed(3)} >= ${baseRes.winProb[target].toFixed(3)} - 0.03)`);
} else {
  console.log('  (no pending group match — skipped)');
}

// ---------- 3c. head-to-head tiebreak regression (Group D scenario) ----------
// Turkey and Australia finish level on pts/gd/gf; the engine ranks Turkey 1st via
// the head-to-head mini-table (Turkey beat Australia), while a plain pts/gd/gf/name
// sort would put Australia 1st alphabetically. simulate() must agree with the engine.
console.log('\n[simulate] head-to-head group tiebreak matches engine');
{
  const done = (date, home, away, hs, as) => ({ round: 'group', date, home, away, hs, as,
    state: 'post', completed: true, clock: '', detail: '',
    homeWinner: hs > as, awayWinner: as > hs });
  const h2hMatches = [];
  let gi = 0;
  for (const [g, teams] of Object.entries(Engine.GROUPS)) {
    if (g === 'D') { gi++; continue; }
    // lower seed beats higher seed by (j - i): strict order, no ties anywhere
    const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
    pairs.forEach(([i, j], k) => {
      const date = k < 2 ? '2026-06-1' + (2 + (gi % 7)) : k < 4 ? '2026-06-2' + (gi % 4) : '2026-06-2' + (5 + (gi % 3));
      h2hMatches.push(done(date + 'T18:00Z', teams[i], teams[j], j - i, 0));
    });
    gi++;
  }
  // Group D: Turkey & Australia both 6 pts, gd +1, gf 4; Turkey won the h2h.
  h2hMatches.push(
    done('2026-06-13T18:00Z', 'Turkey', 'Australia', 2, 1),
    done('2026-06-13T21:00Z', 'Paraguay', 'United States', 0, 1),
    done('2026-06-19T18:00Z', 'Paraguay', 'Turkey', 1, 0),
    done('2026-06-19T21:00Z', 'Australia', 'United States', 2, 1),
    done('2026-06-25T18:00Z', 'Turkey', 'United States', 2, 1),
    done('2026-06-25T18:00Z', 'Australia', 'Paraguay', 1, 0),
  );
  const h2hState = Engine.buildState(h2hMatches);
  const engOrder = h2hState.finalTables.D.order.map(r => r.team);
  assert(engOrder.join(',') === 'Turkey,Australia,United States,Paraguay',
    `engine ranks Group D Turkey first via h2h (${engOrder.join(',')})`);

  const clone = o => JSON.parse(JSON.stringify(o));
  const eT = clone(POOL.entries[0]); eT.name = 'TurkeyFirst';
  eT.groups.D = ['Turkey', 'Australia', 'United States', 'Paraguay'];
  const eA = clone(POOL.entries[0]); eA.name = 'AustraliaFirst';
  eA.groups.D = ['Australia', 'Turkey', 'United States', 'Paraguay'];
  // engine official scoring: identical entries except D top-2 order -> +8 for Turkey-first
  const offT = Engine.scoreEntry(eT, h2hState, false).total;
  const offA = Engine.scoreEntry(eA, h2hState, false).total;
  assert(offT === offA + 8, `engine gives Turkey-first entry +8 (${offT} vs ${offA})`);
  // simulate() on the fully-completed group stage must favor the same entry
  const h2hSim = MC.simulate({ state: h2hState, entries: [eT, eA], topology: topo, ratings: RATINGS, sims: 200 });
  assert(h2hSim.winProb.TurkeyFirst === 1 && h2hSim.winProb.AustraliaFirst === 0,
    `simulate winProb favors engine's h2h order (TurkeyFirst=${h2hSim.winProb.TurkeyFirst}, AustraliaFirst=${h2hSim.winProb.AustraliaFirst})`);
}

// ---------- 4. stakes ----------
console.log('\n[stakes]');
if (pendingMatch) {
  const sk = MC.stakes(state, POOL.entries, pendingMatch);
  assert(sk.outcomes.length === 3 && sk.outcomes.map(o => o.key).join(',') === 'home,draw,away',
    'group match: 3 outcomes home/draw/away');
  assert(sk.outcomes.every(o => typeof o.label === 'string' && o.label.length > 0), 'labels present');
  assert(sk.outcomes.every(o => names.every(n => Number.isFinite(o.deltas[n]))),
    'all deltas finite for all 10 entries');
  const koStake = MC.stakes(state, POOL.entries,
    { round: 'sf', date: '2026-07-14T19:00Z', home: 'Spain', away: 'France', hs: NaN, as: NaN,
      state: 'pre', completed: false, homeWinner: false, awayWinner: false });
  assert(koStake.outcomes.length === 2 && koStake.outcomes.every(o => names.every(n => Number.isFinite(o.deltas[n]))),
    'knockout match: 2 outcomes, finite deltas');
}

// ---------- 5. crowns ----------
console.log('\n[crowns]');
const cr = MC.crowns(state, POOL.entries);
const mdLive = MC.matchdayMap(state.matches); // same classification crowns() uses
const completedR1 = state.matches.filter(m => m.completed && MC.roundOf(m, mdLive) === 'R1');
console.log('  completed R1 matches:', completedR1.length, '| crown rows:', cr.map(r => `${r.round}:${r.winners.join('/')}+${r.pts}`).join(' '));
if (completedR1.length) {
  const r1 = cr.find(r => r.round === 'R1');
  assert(!!r1, 'R1 crown row exists');
  // independent recomputation straight from the engine
  const s0 = Engine.buildState([]);
  const s1 = Engine.buildState(completedR1.slice());
  const expGains = {};
  for (const e of POOL.entries) {
    expGains[e.name] = Engine.scoreEntry(e, s1, true).total - Engine.scoreEntry(e, s0, true).total;
  }
  const expBest = Math.max(...names.map(n => expGains[n]));
  const expWinners = names.filter(n => expGains[n] === expBest).sort();
  assert(r1.pts === expBest, `R1 pts matches engine recomputation (${r1.pts} vs ${expBest})`);
  assert(r1.winners.slice().sort().join(',') === expWinners.join(','),
    `R1 winners match engine recomputation (${r1.winners.join(',')})`);
  const allR1 = state.matches.filter(m => MC.roundOf(m, mdLive) === 'R1');
  assert(r1.done === allR1.every(m => m.completed), `R1 done flag correct (${r1.done})`);
  assert(names.every(n => Number.isFinite(r1.gains[n])), 'R1 per-entry gains finite');
} else {
  assert(cr.length === 0, 'no completed matches -> no crown rows');
}

// ---------- 6. badges ----------
console.log('\n[badges]');
const lb = Engine.leaderboard(POOL.entries, state);
const bd = MC.badges(state, POOL.entries, cr, lb);
assert(names.every(n => Array.isArray(bd[n])), 'badges object keyed by all 10 names');
const allBadges = names.flatMap(n => bd[n]);
assert(allBadges.every(b => b.id && b.emoji && b.label && typeof b.desc === 'string' && typeof b.consolation === 'boolean'),
  'badge objects have id/emoji/label/desc/consolation');
assert(bd[lb[0].name].some(b => b.id === 'top-dog'), `rank-1 (${lb[0].name}) holds top-dog`);
assert(names.filter(n => bd[n].some(b => b.id === 'top-dog')).length === 1, 'exactly one top-dog');
if (cr.length) {
  const crownWinners = new Set(cr.flatMap(r => r.winners));
  assert(names.every(n => bd[n].some(b => b.id === 'crowned') === crownWinners.has(n)),
    'crowned badge exactly for crown winners');
}
console.log('  badge counts:', names.map(n => `${n.split(' ')[0]}:${bd[n].length}`).join(' '));

console.log(failures ? `\n${failures} FAILURES` : '\nALL TESTS PASSED');
process.exitCode = failures ? 1 : 0;
