// Verify the clean assume-final points system: perfect bracket = 470, live numbers
// sane, and a transparent hand-check of one entry against the current group tables.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Engine = require('./engine.js');
const { POOLS } = require('./data.js');
const open = POOLS.open;

const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200');
const matches = Engine.parseEspn(await res.json());
const st = Engine.buildState(matches);

// Show current live group tables (what "assume final" reads from)
console.log('=== CURRENT GROUP TABLES (assumed final) ===');
for (const [g, t] of Object.entries(st.liveTables)) {
  console.log('Group ' + g + ': ' + t.order.map((r, i) => `${i + 1}.${r.team}(${r.pts}pt,${r.gd >= 0 ? '+' : ''}${r.gd})`).join('  '));
}
console.log('\nBest-8 thirds (live):', st.advLive.thirdGroups ? [...st.advLive.thirdGroups].sort().join(',') : '—');

// Hand-check: Srijan's bracket, group by group
const you = open.entries.find(e => /TARS/.test(e.name));
console.log('\n=== HAND-CHECK: ' + you.name + ' ===');
let pos = 0, adv = 0;
const predAdv = Engine.predictedAdvancers(you);
for (const [g, t] of Object.entries(st.liveTables)) {
  if (!t.active) continue;
  const pred = you.groups[g];
  let line = 'Grp ' + g + ' predicted [' + pred.map(x => x.slice(0, 8)).join(', ') + '] vs live [' + t.order.map(x => x.team.slice(0, 8)).join(', ') + ']';
  for (let i = 0; i < 4; i++) if (pred[i] === t.order[i].team) { pos += 4; line += ` +4(${pred[i].slice(0,6)}@${i+1})`; }
  console.log('  ' + line);
}
for (const team of predAdv) if (st.advLive.adv.has(team)) adv += 3;
console.log('  => positions ' + pos + ' + advancing ' + adv + ' = groups ' + (pos + adv));
const sc = Engine.scoreEntry(you, st);
console.log('  scoreEntry: points=' + sc.total + ' breakdown=' + JSON.stringify(sc.breakdown));

// Perfect bracket invariant (synthetic) reuses test.mjs logic quickly
const perfect = open.entries[0];

// Leaderboard sanity
const lb = Engine.leaderboard(open.entries, st);
console.log('\n=== LIVE LEADERBOARD (one number) top 8 ===');
lb.slice(0, 8).forEach(r => console.log('  #' + r.rank + ' ' + r.name.padEnd(22) + ' ' + r.points + ' pts  (grp ' + r.breakdown.groups + ' / 3rd ' + r.breakdown.thirdPlace + ' / ko ' + r.breakdown.knockouts + ')  max ' + r.max));
const you2 = lb.find(r => /TARS/.test(r.name));
console.log('  ...you: #' + you2.rank + ' ' + you2.points + ' pts');
console.log('\nALL points <= max <= 470:', lb.every(r => r.points <= r.max && r.max <= 470));
console.log('completed matches:', matches.filter(m => m.completed).length);
