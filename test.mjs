// Engine validation: (1) synthetic perfect-bracket tournament must score exactly 470,
// (2) live ESPN smoke test against real June 2026 results.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Engine = require('./engine.js');
const { POOL } = require('./data.js');

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  PASS', msg);
  else { failures++; console.error('  FAIL', msg); }
};

// ---------- 1. Synthetic: Abel's bracket comes 100% true ----------
const perfect = POOL.entries[0]; // Abel Gonsalves
console.log('\n[synthetic] perfect tournament for:', perfect.name);

const matches = [];
const mk = (round, home, away, hs, as) => matches.push({
  round, date: '2026-07-01T00:00Z', home, away, hs, as,
  state: 'post', completed: true, clock: '', detail: 'FT',
  homeWinner: hs > as, awayWinner: as > hs,
});

// Group stage: 6 matches per group producing exactly the predicted order.
// Third-place margins: groups in perfect.thirds get a huge 3rd-place GD so they rank top-8.
for (const [g, order] of Object.entries(perfect.groups)) {
  const bigThird = perfect.thirds.includes(g);
  const [t1, t2, t3, t4] = order;
  mk('group', t1, t2, 2, 1);
  mk('group', t1, t3, 2, 0);
  mk('group', t1, t4, 3, 0);
  mk('group', t2, t3, 2, 1);
  mk('group', t2, t4, 2, 0);
  mk('group', t3, t4, bigThird ? 6 : 1, 0); // 3rd: 3pts, GD +4/-1 vs other thirds' GD -2/-4... ensure separation
}
// R32: predicted r16 teams beat the other 16 predicted advancers.
const predAdv = [...Engine.predictedAdvancers(perfect)];
const r32Losers = predAdv.filter(t => !perfect.r16.includes(t));
perfect.r16.forEach((w, i) => mk('r32', w, r32Losers[i], 1, 0));
// R16: predicted qf teams beat the other 8 of r16.
const r16Losers = perfect.r16.filter(t => !perfect.qf.includes(t));
perfect.qf.forEach((w, i) => mk('r16', w, r16Losers[i], 1, 0));
// QF: predicted sf teams beat the other 4.
const qfLosers = perfect.qf.filter(t => !perfect.sf.includes(t));
perfect.sf.forEach((w, i) => mk('qf', w, qfLosers[i], 1, 0));
// SF: champion + runnerUp reach the final.
const sfOthers = perfect.sf.filter(t => t !== perfect.champion && t !== perfect.runnerUp);
mk('sf', perfect.champion, sfOthers[0], 1, 0);
mk('sf', perfect.runnerUp, sfOthers[1], 1, 0);
mk('final', perfect.champion, perfect.runnerUp, 1, 0);

const st = Engine.buildState(matches);
assert(st.allGroupsComplete, 'all groups complete');
const thirdsPicked = new Set(st.thirdTableFinal.slice(0, 8).map(r => r.group));
assert(perfect.thirds.every(g => thirdsPicked.has(g)),
  `third-place groups resolve to picks (${[...thirdsPicked].sort().join('')} vs ${perfect.thirds.join('')})`);

const sc = Engine.scoreEntry(perfect, st, false);
console.log('  breakdown:', JSON.stringify(sc.br));
assert(sc.total === 470, `perfect official score = 470 (got ${sc.total})`);
assert(Engine.scoreEntry(perfect, st, true).total === 470, 'perfect projected = 470');
assert(Engine.maxPossible(perfect, st) === 470, 'perfect max = 470');

// Sanity for a non-perfect entry: official ≤ max, projected ≤ max
for (const e of POOL.entries.slice(1, 4)) {
  const o = Engine.scoreEntry(e, st, false).total;
  const m = Engine.maxPossible(e, st);
  assert(o <= m && m <= 470, `${e.name}: official ${o} <= max ${m} <= 470`);
}

// ---------- 1b. Regression: FIFA fallback pens-decided knockout ----------
console.log('\n[regression] FIFA parser: penalty shootouts');
const fifaJson = {
  Results: [
    { MatchStatus: 0, Date: '2026-07-19T20:00Z', StageName: [{ Description: 'Final' }],
      Home: { TeamName: [{ Description: 'Spain' }], Score: 1, IdTeam: '1', PenaltyScore: 4 },
      Away: { TeamName: [{ Description: 'Portugal' }], Score: 1, IdTeam: '2', PenaltyScore: 2 },
      Winner: '1' },
    { MatchStatus: 0, Date: '2026-06-29T20:00Z', StageName: [{ Description: 'Round of 32' }],
      Home: { TeamName: [{ Description: 'Brazil' }], Score: 0, IdTeam: '3' },
      Away: { TeamName: [{ Description: 'Morocco' }], Score: 0, IdTeam: '4' },
      Winner: '3' },
  ],
};
const fifaMatches = Engine.parseFifa(fifaJson);
const fifaState = Engine.buildState(fifaMatches);
assert(fifaState.knockout.champion === 'Spain', 'pens final: champion = Spain');
assert(fifaState.knockout.runnerUp === 'Portugal', 'pens final: runner-up = Portugal');
assert(fifaState.eliminated.has('Portugal'), 'pens final: loser eliminated');
assert(fifaState.knockout.r16.has('Brazil'), 'pens R32 (Winner id only): Brazil advances');
assert(fifaState.eliminated.has('Morocco'), 'pens R32: Morocco eliminated');

// ---------- 1c. Regression: NaN scores must not score or complete groups ----------
console.log('\n[regression] NaN score guards');
const nanState = Engine.buildState([
  { round: 'group', date: '2026-06-12T00:00Z', home: 'Brazil', away: 'Morocco',
    hs: 2, as: NaN, state: 'in', completed: false, homeWinner: false, awayWinner: false },
]);
const brRow = nanState.liveTables.C.order.find(r => r.team === 'Brazil');
assert(brRow.pts === 0 && brRow.played === 0, 'live match with NaN away score is ignored');

// ---------- 1d. Regression: 3-way tie cycle is deterministic (h2h mini-table) ----------
console.log('\n[regression] tiebreak transitivity');
const cyc = [];
const cm = (h, a, hs, as) => cyc.push({ round: 'group', date: '2026-06-12T00:00Z', home: h, away: a, hs, as, state: 'post', completed: true, homeWinner: hs > as, awayWinner: as > hs });
// Group C: Haiti beats everyone; Brazil>Morocco>Scotland>Brazil 1-0 cycle
cm('Haiti', 'Brazil', 1, 0); cm('Haiti', 'Morocco', 1, 0); cm('Haiti', 'Scotland', 1, 0);
cm('Brazil', 'Morocco', 1, 0); cm('Morocco', 'Scotland', 1, 0); cm('Scotland', 'Brazil', 1, 0);
const t1 = Engine.buildState(cyc).finalTables.C.order.map(r => r.team).join(',');
const t2 = Engine.buildState(cyc.slice().reverse()).finalTables.C.order.map(r => r.team).join(',');
assert(t1 === t2, `cycle order deterministic regardless of match order (${t1})`);
assert(t1.startsWith('Haiti'), 'group winner unaffected by tie cycle');

// ---------- 2. Live ESPN smoke test ----------
console.log('\n[live] fetching ESPN scoreboard…');
try {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200');
  const json = await res.json();
  const live = Engine.parseEspn(json);
  console.log('  events:', json.events.length, '| parsed:', live.length,
    '| completed:', live.filter(m => m.completed).length,
    '| unknown-team matches:', live.filter(m => m.round === 'group' && (!m.home || !m.away)).length);
  assert(live.length >= 100, '>=100 matches parsed');
  const ls = Engine.buildState(live);
  const a = ls.liveTables.A.order.map(r => `${r.team} ${r.pts}pts ${r.gd >= 0 ? '+' : ''}${r.gd}`);
  console.log('  Group A live:', a.join(' | '));
  assert(ls.liveTables.A.order[0].team === 'Mexico', 'Mexico tops Group A after 2-0 win');
  const lb = Engine.leaderboard(POOL.entries, ls);
  console.log('\n  Live leaderboard now (one canonical points number):');
  for (const r of lb) console.log(`   ${String(r.rank).padStart(2)}. ${r.name.padEnd(22)} pts=${String(r.points).padStart(3)} secured=${String(r.secured).padStart(3)} max=${r.max} grp=${r.breakdown.groups} champ=${r.champion}${r.championAlive ? '' : ' (OUT)'}`);
  // Clean assume-final rule: the current group tables are treated as final, so BOTH group
  // points and best-8 third-place points are scored LIVE; knockouts/champion grow as those
  // rounds resolve. Validate component ranges, not a frozen zero.
  assert(lb.every(r => r.points === r.breakdown.groups + r.breakdown.thirdPlace + r.breakdown.knockouts + r.breakdown.champion),
    'points === sum of breakdown components (one true number)');
  assert(lb.some(r => r.breakdown.groups > 0), 'groups scored LIVE off the current tables');
  assert(lb.every(r => r.breakdown.thirdPlace >= 0 && r.breakdown.thirdPlace <= 24), 'third-place component scored live, within [0,24]');
  assert(lb.every(r => r.breakdown.champion === 0 || r.breakdown.champion === 50), 'champion component is 0 or 50');
  assert(lb.every(r => r.secured <= r.points && r.points <= r.max), 'secured <= points <= max for every row');
  assert(lb.every(r => r.max <= 470 && r.max > 300), 'max bounds sane');
  assert(lb.every((r, i) => i === 0 || lb[i - 1].points >= r.points), 'rows sorted by points desc');
} catch (e) {
  failures++;
  console.error('  FAIL live fetch:', e.message);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL TESTS PASSED');
process.exitCode = failures ? 1 : 0;
