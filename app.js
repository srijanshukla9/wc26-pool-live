/* FIFA Prediction Pro — app.js
   UI logic for the Sp Jain Friends WC26 pool. Loads after data.js, engine.js,
   ratings.js, mc.js. MC and RATINGS are optional: every use is guarded so the
   page degrades gracefully (MC widgets hide) if either is missing or throws. */
(function () {
  'use strict';

  /* ============================ helpers ============================ */
  const FLAGS = {
    'Mexico':'🇲🇽','South Korea':'🇰🇷','Czech Rep.':'🇨🇿','South Africa':'🇿🇦','Canada':'🇨🇦',
    'Bosnia & Herz.':'🇧🇦','Qatar':'🇶🇦','Switzerland':'🇨🇭','Brazil':'🇧🇷','Morocco':'🇲🇦',
    'Haiti':'🇭🇹','Scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','United States':'🇺🇸','Paraguay':'🇵🇾','Australia':'🇦🇺',
    'Turkey':'🇹🇷','Germany':'🇩🇪','Curacao':'🇨🇼','Ivory Coast':'🇨🇮','Ecuador':'🇪🇨',
    'Netherlands':'🇳🇱','Japan':'🇯🇵','Sweden':'🇸🇪','Tunisia':'🇹🇳','Belgium':'🇧🇪',
    'Egypt':'🇪🇬','Iran':'🇮🇷','New Zealand':'🇳🇿','Spain':'🇪🇸','Cape Verde':'🇨🇻',
    'Saudi Arabia':'🇸🇦','Uruguay':'🇺🇾','France':'🇫🇷','Senegal':'🇸🇳','Iraq':'🇮🇶',
    'Norway':'🇳🇴','Argentina':'🇦🇷','Algeria':'🇩🇿','Austria':'🇦🇹','Jordan':'🇯🇴',
    'Portugal':'🇵🇹','DR Congo':'🇨🇩','Uzbekistan':'🇺🇿','Colombia':'🇨🇴','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'Croatia':'🇭🇷','Ghana':'🇬🇭','Panama':'🇵🇦',
  };
  let LOGOS = {};
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const flag = t => {
    const url = LOGOS[t];
    if (url && /^https:\/\/a\.espncdn\.com\/[\w./-]+$/.test(url)) return `<img class="fl" src="${esc(url)}" alt="" loading="lazy">`;
    return `<span class="fl-e">${FLAGS[t] || '🏳️'}</span>`;
  };
  const teamHtml = t => `${flag(t)} ${esc(t)}`;
  const $ = id => document.getElementById(id);

  /* visual identity (viz.js) — optional, degrade to flags/nothing */
  const hasViz = (() => { try { return typeof VIZ !== 'undefined' && !!VIZ; } catch (e) { return false; } })();
  const kit = (t, s) => hasViz ? VIZ.kit(t, s) : flag(t);
  const avatar = (n, s, o) => hasViz ? VIZ.avatar(n, s, o) : '';

  const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200';
  const FIFA_URL = 'https://api.fifa.com/api/v3/calendar/matches?idSeason=285023&idCompetition=17&language=en&count=200';
  const ROUND_LABELS = { group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarterfinals', sf: 'Semifinals', third: '3rd-Place', final: 'Final' };

  const YOU_RE = /TARS/;
  const isYou = n => YOU_RE.test(String(n));
  const firstName = n => isYou(n) ? 'You' : String(n).split(' ')[0];
  const fmtSigned = d => (d > 0 ? '+' : '') + d;
  const fmtPct = p => { const v = p * 100; return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
  const fmtTime = d => new Date(d).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtClock = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const youEntry = POOL.entries.find(e => isYou(e.name)) || null;
  const youName = youEntry ? youEntry.name : null;

  /* MC / RATINGS guards — degrade gracefully if missing or throwing */
  const hasMC = () => { try { return typeof MC !== 'undefined' && !!MC; } catch (e) { return false; } };
  const hasRatings = () => { try { return typeof RATINGS !== 'undefined' && !!RATINGS; } catch (e) { return false; } };
  function mcTry(fn, fallback) {
    if (!hasMC()) return fallback;
    try { return fn(); } catch (e) { return fallback; }
  }

  /* ============================ state ============================ */
  let lastGood = null, lastRows = null, lastRaw = null, lastSource = '';
  let prevRanks = null;
  let openNames = new Set(), openStakes = new Set(), activeRound = 'all';
  let secs = 60, inFlight = false;
  let topology = null;
  let currentHash = null;
  let simCache = { hash: null, sim: null };
  let crownsCache = null, badgesCache = null;
  let rooting = { hash: null, items: [], done: false };

  function resultsHash(matches) {
    let s = '';
    for (const m of matches) {
      if (!m.home || !m.away) continue;
      if (m.completed || m.state === 'in') s += m.round + '|' + m.home + '|' + m.hs + '-' + m.as + '|' + m.away + '|' + m.state + ';';
    }
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h + ':' + s.length;
  }
  const matchKey = m => m.round + '|' + m.home + '|' + m.away;

  /* ============================ theme ============================ */
  const themeBtn = $('themeBtn');
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('wc26-theme', t); } catch (e) {}
  }
  (function initTheme() {
    let t = 'light';
    try { t = localStorage.getItem('wc26-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
    setTheme(t);
  })();
  themeBtn.onclick = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

  /* ============================ tabs (work before first fetch) ============================ */
  $('tabbar').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    const name = t.dataset.tab;
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  });

  /* ============================ data fetch (keeps raw ESPN json for MC) ============================ */
  async function fetchData() {
    const opts = () => ({ cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
    try {
      const r = await fetch(ESPN_URL, opts());
      if (!r.ok) throw new Error('ESPN HTTP ' + r.status);
      const raw = await r.json();
      const m = Engine.parseEspn(raw);
      if (m.length < 50) throw new Error('ESPN returned too few matches');
      return { matches: m, raw, source: 'ESPN' };
    } catch (e1) {
      const r = await fetch(FIFA_URL, opts());
      if (!r.ok) throw new Error('Both feeds failed (FIFA HTTP ' + r.status + ')');
      const m = Engine.parseFifa(await r.json());
      if (m.length < 50) throw new Error('Both feeds failed');
      return { matches: m, raw: null, source: 'FIFA' };
    }
  }

  /* ============================ MC: crowns helpers ============================ */
  function currentCrown() {
    if (!crownsCache || !crownsCache.length) return null;
    let pick = null;
    for (const c of crownsCache) if (c && c.winners && c.winners.length) pick = c;
    return pick;
  }
  function crownCounts() {
    const map = {};
    for (const c of (crownsCache || [])) {
      if (c && c.done && c.winners) for (const w of c.winners) map[w] = (map[w] || 0) + 1;
    }
    return map;
  }

  /* ============================ home: status cards ============================ */
  function renderStatusCards(state, rows) {
    const cards = [];
    const you = rows.find(r => isYou(r.name));
    if (you) {
      cards.push({ i: '🏅', k: 'Your rank', v: '#' + you.rank, s: 'of ' + rows.length, cls: '' });
      cards.push({ i: '📈', k: 'Projected', v: String(you.projected), s: 'max ' + you.max, cls: 'green' });
    }
    const sim = simCache.sim;
    if (sim && sim.winProb && you && typeof sim.winProb[you.name] === 'number') {
      cards.push({ i: '🎲', k: 'Win odds', v: (sim.winProb[you.name] * 100).toFixed(1) + '%', s: (sim.sims || '') + ' sims', cls: 'gold' });
    }
    const cr = currentCrown();
    if (cr) {
      cards.push({
        i: '👑', k: 'Crown', v: cr.winners.map(firstName).join(' & '),
        s: cr.round + (cr.done ? '' : ' · live') + ' · ' + cr.pts + ' pts', cls: 'gold',
      });
    }
    $('statusCards').innerHTML = cards.map(c =>
      `<div class="card stat-card"><div class="ic">${c.i}</div><div><div class="k">${esc(c.k)}</div><div class="v ${c.cls}">${esc(c.v)}</div><div class="s">${esc(c.s)}</div></div></div>`
    ).join('');

    // gold band profile strip (SuperBru-style identity bar)
    const strip = $('profileStrip');
    if (strip && you) {
      const win = (sim && sim.winProb && typeof sim.winProb[you.name] === 'number') ? (sim.winProb[you.name] * 100).toFixed(1) + '%' : '—';
      const crowns = crownCounts()[you.name] || 0;
      strip.innerHTML = `${avatar(you.name, 40, { ring: 'rgba(255,255,255,.65)' })}
        <div class="gb-name">${esc(firstName(you.name) === 'You' ? 'Srijan' : firstName(you.name))}<span>${esc(POOL.poolName)}</span></div>
        <div class="gb-col"><b>#${you.rank}</b><span>Rank</span></div>
        <div class="gb-col"><b>${you.projected}</b><span>Pts</span></div>
        <div class="gb-col"><b>${esc(win)}</b><span>Win%</span></div>
        <div class="gb-col"><b>${crowns ? '👑×' + crowns : '👑 ' + 0}</b><span>Crowns</span></div>`;
    }
  }

  /* ============================ match cards (shared) ============================ */
  function whoCalled(match, state) {
    if (!match.home || !match.away) return null;
    const winner = match.state === 'in'
      ? (isNaN(match.hs) ? null : match.hs > match.as ? match.home : match.hs < match.as ? match.away : null)
      : (match.homeWinner ? match.home : match.awayWinner ? match.away : null);
    if (!winner) return null;
    let predicted;
    if (match.round === 'group') {
      predicted = POOL.entries.filter(e => Engine.predictedAdvancers(e).has(winner)).map(e => e.name);
    } else {
      const key = { r32: 'r16', r16: 'qf', qf: 'sf' }[match.round];
      if (key) predicted = POOL.entries.filter(e => e[key].includes(winner)).map(e => e.name);
      else if (match.round === 'sf') predicted = POOL.entries.filter(e => e.champion === winner || e.runnerUp === winner).map(e => e.name);
      else if (match.round === 'third') return null;
      else if (match.round === 'final') predicted = POOL.entries.filter(e => e.champion === winner).map(e => e.name);
      else predicted = [];
    }
    return { winner, predicted };
  }

  function stakesLineHtml(state, m) {
    const stk = mcTry(() => MC.stakes(state, POOL.entries, m), null);
    if (!stk || !stk.outcomes || !stk.outcomes.length) return '';
    const parts = [];
    if (youName) {
      let best = null;
      for (const o of stk.outcomes) {
        const d = (o.deltas && typeof o.deltas[youName] === 'number') ? o.deltas[youName] : 0;
        if (!best || d > best.d) best = { o, d };
      }
      if (best) parts.push(`You want: <b>${esc(best.o.label)}</b> (${esc(fmtSigned(best.d))})`);
    }
    let big = null;
    for (const e of POOL.entries) {
      let mx = -Infinity, mn = Infinity;
      for (const o of stk.outcomes) {
        const d = (o.deltas && typeof o.deltas[e.name] === 'number') ? o.deltas[e.name] : 0;
        if (d > mx) mx = d; if (d < mn) mn = d;
      }
      const amp = Math.max(Math.abs(mx), Math.abs(mn));
      if (!big || amp > big.amp) big = { name: e.name, amp };
    }
    if (big && big.amp > 0) parts.push(`Biggest swing: ${esc(firstName(big.name))} ±${esc(String(big.amp))}`);
    if (!parts.length) return '';
    return `<div class="stakes-line">⚖️ ${parts.join(' · ')}</div>`;
  }

  function stakesBodyHtml(state, m) {
    const stk = mcTry(() => MC.stakes(state, POOL.entries, m), null);
    if (!stk || !stk.outcomes || !stk.outcomes.length) return '<div class="stk-row"><span>Stakes unavailable.</span></div>';
    return stk.outcomes.map(o => {
      const rows = POOL.entries
        .map(e => ({ n: e.name, d: (o.deltas && typeof o.deltas[e.name] === 'number') ? o.deltas[e.name] : 0 }))
        .filter(r => r.d !== 0)
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
        .slice(0, 8);
      const inner = rows.length
        ? rows.map(r => `<div class="stk-row"><span>${esc(firstName(r.n))}</span><b class="${r.d > 0 ? 'd-pos' : 'd-neg'}">${esc(fmtSigned(r.d))}</b></div>`).join('')
        : '<div class="stk-row"><span>No points move</span><b class="d-zero">±0</b></div>';
      return `<div class="stk-out"><div class="stk-lab">${esc(o.label)}</div>${inner}</div>`;
    }).join('');
  }

  function matchCardHtml(m, state, mode, mi) {
    const grp = m.round === 'group' ? 'Group ' + (Engine.TEAM_GROUP[m.home] || '') : (ROUND_LABELS[m.round] || '');
    let right;
    if (m.state === 'in') right = `<span class="live">● ${esc(m.clock || 'LIVE')}</span>`;
    else if (m.completed) right = '<span class="ft">Full time</span>';
    else right = `<span class="ko">${esc(mode === 'home' ? fmtTime(m.date) : fmtClock(m.date))}</span>`;
    const showSc = !(m.state === 'pre' || isNaN(m.hs));
    const cls = side => !m.completed ? '' : (side === 'h' ? (m.hs > m.as ? 'win' : m.hs < m.as ? 'lose' : '') : (m.as > m.hs ? 'win' : m.as < m.hs ? 'lose' : ''));
    const called = whoCalled(m, state);
    let calledHtml = '';
    if (called && called.predicted.length) {
      const names = called.predicted.map(n => isYou(n) ? 'you' : n.split(' ')[0]);
      const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '');
      calledHtml = `<div class="called"><b>${called.predicted.length}/10</b> backed ${teamHtml(called.winner)} — <span class="av">${esc(shown)}</span></div>`;
    } else if (called) {
      calledHtml = `<div class="called">Nobody backed ${teamHtml(called.winner)} 😬</div>`;
    }
    let stakesHtml = '';
    const upcoming = m.state === 'pre' || m.state === 'in';
    if (upcoming && hasMC()) {
      if (mode === 'home') stakesHtml = stakesLineHtml(state, m);
      else {
        const open = openStakes.has(matchKey(m));
        stakesHtml = `<button class="stakes-toggle" type="button">⚖️ Stakes ${open ? '▴' : '▾'}</button><div class="stakes-body">${open ? stakesBodyHtml(state, m) : ''}</div>`;
      }
    }
    const openCls = (mode !== 'home' && openStakes.has(matchKey(m))) ? 'stk-open' : '';
    const mid = showSc
      ? `<span class="num ${cls('h')}">${m.hs}</span><span class="dash">–</span><span class="num ${cls('a')}">${m.as}</span>`
      : `<span class="vs">vs</span>`;
    return `<div class="match ${openCls}" data-mi="${mi}">
      <div class="mini-banner"><span class="rd">${esc(grp)}</span>${right}</div>
      <div class="duel">
        <div class="side ${cls('h')}">${kit(m.home, 52)}<div class="tnm">${esc(m.home)}</div></div>
        <div class="mid">${mid}</div>
        <div class="side ${cls('a')}">${kit(m.away, 52)}<div class="tnm">${esc(m.away)}</div></div>
      </div>
      ${calledHtml}${stakesHtml}
    </div>`;
  }

  /* ============================ home: today & live ============================ */
  function renderTodayLive(state) {
    const tk = new Date().toDateString();
    const list = state.matches
      .filter(m => m.home && m.away && (m.state === 'in' || new Date(m.date).toDateString() === tk))
      .sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || new Date(a.date) - new Date(b.date));
    $('todayLive').innerHTML = list.map(m => matchCardHtml(m, state, 'home', state.matches.indexOf(m))).join('')
      || '<div class="sec-lead">No matches today — the next kickoffs are in the rooting guide below.</div>';
  }

  /* ============================ home: rooting guide ============================ */
  function nextUpcoming(state, n) {
    return state.matches
      .filter(m => m.home && m.away && m.state === 'pre')
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, n);
  }

  function renderRooting(state) {
    const el = $('rooting');
    if (!youName || !hasMC() || !hasRatings()) {
      el.innerHTML = '<div class="sec-lead">Simulation unavailable — rooting guide is offline.</div>';
      return;
    }
    if (rooting.hash === currentHash && rooting.items.length) { renderRootingItems(); return; }
    const up = nextUpcoming(state, 4);
    if (!up.length) { el.innerHTML = '<div class="sec-lead">No upcoming matches left to root for.</div>'; return; }
    el.innerHTML = up.map(m =>
      `<div class="card root-card"><div class="hd">${teamHtml(m.home)} vs ${teamHtml(m.away)}</div><div class="tm">${esc(fmtTime(m.date))}</div><div class="shimmer"></div><div class="shimmer" style="margin-top:7px;width:70%"></div></div>`
    ).join('');
  }

  function renderRootingItems() {
    const el = $('rooting');
    if (!rooting.items.length) return;
    el.innerHTML = rooting.items.map(job => {
      const m = job.match;
      const useWin = !job.degraded && job.outcomes.some(o => typeof o.dWin === 'number');
      let best = null;
      const rows = job.outcomes.map(o => {
        const v = useWin ? (typeof o.dWin === 'number' ? o.dWin : -Infinity) : o.deltaPts;
        if (best === null || v > best.v) best = { o, v };
        let txt, cls;
        if (useWin) {
          txt = typeof o.dWin === 'number' ? fmtPct(o.dWin) : '…';
          cls = (o.dWin || 0) > 0.0005 ? 'd-pos' : (o.dWin || 0) < -0.0005 ? 'd-neg' : 'd-zero';
        } else {
          txt = fmtSigned(o.deltaPts) + ' pts';
          cls = o.deltaPts > 0 ? 'd-pos' : o.deltaPts < 0 ? 'd-neg' : 'd-zero';
        }
        return `<div class="root-row"><span>${esc(o.label)}</span><b class="${cls}">${esc(txt)}</b></div>`;
      }).join('');
      const verdict = best && best.o ? `<div class="root-verdict">Root for: ${esc(best.o.label)}</div>` : '';
      const note = useWin ? 'Δ your title odds' : 'Δ your points';
      return `<div class="card root-card"><div class="hd">${teamHtml(m.home)} vs ${teamHtml(m.away)}</div><div class="tm">${esc(fmtTime(m.date))} · ${note}</div>${rows}${verdict}</div>`;
    }).join('');
  }

  function startRooting() {
    if (!lastGood || !youName || !hasMC() || !hasRatings()) return;
    if (rooting.hash === currentHash && rooting.done) { renderRootingItems(); return; }
    const state = lastGood;
    const base = simCache.sim;
    const up = nextUpcoming(state, 4);
    if (!up.length) return;
    const jobs = up.map(m => {
      const stk = mcTry(() => MC.stakes(state, POOL.entries, m), null);
      const outs = (stk && stk.outcomes) ? stk.outcomes : [];
      return {
        match: m,
        degraded: !base,
        outcomes: outs.map(o => ({
          key: o.key, label: o.label,
          deltaPts: (o.deltas && typeof o.deltas[youName] === 'number') ? o.deltas[youName] : 0,
          dWin: null,
        })),
      };
    }).filter(j => j.outcomes.length);
    rooting = { hash: currentHash, items: jobs, done: false };
    if (!jobs.length) { $('rooting').innerHTML = '<div class="sec-lead">Stakes unavailable for the next matches.</div>'; rooting.done = true; return; }
    if (!base) { rooting.done = true; renderRootingItems(); return; } // degrade to stakes view
    const t0 = Date.now();
    let mi = 0, oi = 0;
    const baseP = (base.winProb && typeof base.winProb[youName] === 'number') ? base.winProb[youName] : 0;
    function step() {
      if (rooting.hash !== currentHash) return; // stale — a newer refresh took over
      if (mi >= jobs.length) { rooting.done = true; renderRootingItems(); return; }
      if (Date.now() - t0 > 5000) { // too slow: degrade remaining matches to stakes
        for (let i = mi; i < jobs.length; i++) if (jobs[i].outcomes.some(o => o.dWin === null)) jobs[i].degraded = true;
        rooting.done = true; renderRootingItems(); return;
      }
      const job = jobs[mi], out = job.outcomes[oi];
      if (!out) { mi++; oi = 0; renderRootingItems(); setTimeout(step, 15); return; }
      try {
        const cs = MC.simulate({
          state, entries: POOL.entries, topology, ratings: RATINGS, sims: 1200,
          condition: { match: job.match, matchKey: out.key },
        });
        const p = (cs && cs.winProb && typeof cs.winProb[youName] === 'number') ? cs.winProb[youName] : baseP;
        out.dWin = p - baseP;
      } catch (e) { out.dWin = null; job.degraded = true; }
      oi++;
      setTimeout(step, 15);
    }
    setTimeout(step, 15);
  }

  /* ============================ home: recap strip ============================ */
  function renderRecapStrip() {
    const el = $('recapStrip');
    const crowns = crownsCache || [];
    let html = '';
    const doneOnes = crowns.filter(c => c && c.done && c.winners && c.winners.length);
    const lastDone = doneOnes.length ? doneOnes[doneOnes.length - 1] : null;
    const liveOnes = crowns.filter(c => c && !c.done && c.winners && c.winners.length);
    const liveWin = liveOnes.length ? liveOnes[liveOnes.length - 1] : null;
    if (lastDone) html += `🏁 <b>${esc(lastDone.round)}</b> wrapped — 👑 ${esc(lastDone.winners.map(firstName).join(' & '))} took the crown with <b>${esc(String(lastDone.pts))} pts</b>. `;
    if (liveWin) html += `Current window <b>${esc(liveWin.round)}</b>: ${esc(liveWin.winners.map(firstName).join(' & '))} leading on ${esc(String(liveWin.pts))} pts. `;
    if (prevRanks && lastRows) {
      let mover = null;
      for (const r of lastRows) {
        const p = prevRanks[r.name];
        if (p && p > r.rank && (!mover || p - r.rank > mover.d)) mover = { name: r.name, d: p - r.rank };
      }
      if (mover) html += `📈 Biggest mover: ${esc(firstName(mover.name))} ▲${esc(String(mover.d))}.`;
    }
    if (!html) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = html;
  }

  /* ============================ leaderboard ============================ */
  const CATS = [
    ['posBonus', 'Exact group positions', 192], ['advancing', 'Advancing teams', 96],
    ['thirdPlace', '3rd-place groups', 24], ['r32w', 'R32 winners', 48],
    ['r16w', 'R16 winners', 32], ['qfw', 'QF winners', 20],
    ['runnerUp', 'Runner-up', 8], ['champion', 'Champion', 50],
  ];

  function renderPodium(rows) {
    const top = rows.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean); // 2nd, 1st, 3rd
    $('podium').innerHTML = order.map(r => {
      const medal = ['🥇', '🥈', '🥉'][r.rank - 1];
      const ringCol = ['#D3A43B', '#b9c4d4', '#cd8f52'][r.rank - 1];
      return `<div class="card pod ${r.rank === 1 ? 'p1' : ''}">
        <div class="pod-ava">${avatar(r.name, r.rank === 1 ? 62 : 50, { ring: ringCol, crown: r.rank === 1 })}<span class="pod-medal">${medal}</span></div>
        <div>
          <div class="nm">${esc(r.name)}</div>
          <div class="ch">👑 ${teamHtml(r.champion)}</div>
        </div>
        <div class="pts">${r.projected}</div>
      </div>`;
    }).join('');
  }

  function renderLb(rows, state) {
    const byName = Object.fromEntries(POOL.entries.map(e => [e.name, e]));
    const sim = simCache.sim;
    const cc = crownCounts();
    $('lb').innerHTML = rows.map(r => {
      const e = byName[r.name];
      const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank;
      const d = prevRanks && prevRanks[r.name] && prevRanks[r.name] !== r.rank
        ? (prevRanks[r.name] > r.rank ? `<span class="delta up">▲${prevRanks[r.name] - r.rank}</span>` : `<span class="delta dn">▼${r.rank - prevRanks[r.name]}</span>`) : '';
      const crownTag = cc[r.name] ? ` <span class="crowntag" title="Matchday crowns won">👑${cc[r.name] > 1 ? '×' + cc[r.name] : ''}</span>` : '';
      const lockedPct = Math.round(r.official / 470 * 100);
      const projPct = Math.round((r.projected - r.official) / 470 * 100);
      const winCol = (sim && sim.winProb && typeof sim.winProb[r.name] === 'number')
        ? `<div class="col win-col"><div class="small">${(sim.winProb[r.name] * 100).toFixed(1)}%</div><div class="lbl">Win%</div></div>` : '';
      const cats = CATS.map(([k, label, max]) =>
        `<div class="cat"><span>${label}</span><b>${r.projectedBr[k]}<span class="of">/${max}</span></b></div>`).join('');
      const br = r.projectedBr;
      const buckets = `<div class="bucketrow">Groups ${br.posBonus + br.advancing} <span>·</span> Thirds ${br.thirdPlace} <span>·</span> KO ${br.r32w + br.r16w + br.qfw + br.runnerUp + br.champion}</div>`;
      const chips = (list, set) => list.map(t => `<span class="chip2 ${set.has(t) ? 'hit' : state.eliminated.has(t) ? 'out' : ''}">${teamHtml(t)}</span>`).join('');
      const champClass = r.championAlive ? 'alivetag' : 'outtag';
      return `<div class="entry ${isYou(r.name) ? 'you' : ''} ${openNames.has(r.name) ? 'open' : ''}" data-name="${esc(r.name)}">
        <div class="entry-head">
          <div class="rank">${medal}</div>
          <div class="lb-ava">${avatar(r.name, 38, cc[r.name] ? { ring: '#D3A43B' } : null)}</div>
          <div class="who">
            <div class="nm">${esc(r.name)}${isYou(r.name) ? '<span class="youtag">YOU</span>' : ''}${crownTag}${d}</div>
            <div class="ch">👑 <span class="${r.championAlive ? '' : 'dead'}">${teamHtml(r.champion)}</span> · <span class="${champClass}">${r.championAlive ? 'still in' : 'eliminated −50'}</span></div>
          </div>
          <div class="nums">
            <div class="col"><div class="big">${r.projected}</div><div class="lbl">Projected</div></div>
            ${winCol}
            <div class="col"><div class="small">${r.official}</div><div class="lbl">Official</div></div>
            <div class="col max-col"><div class="small">${r.max}</div><div class="lbl">Max</div></div>
            <div class="chev">▼</div>
          </div>
        </div>
        <div class="detail">
          <div class="barwrap">
            <div class="toprow"><span>Points secured vs. projected</span><span>${r.official} locked · ${r.projected} projected · ${r.max} ceiling</span></div>
            <div class="bar"><i class="locked" style="width:${lockedPct}%"></i><i class="proj" style="width:${projPct}%"></i></div>
          </div>
          <div class="cats">${cats}</div>
          ${buckets}
          <div class="picks">
            <span class="lab">Final:</span> ${teamHtml(e.champion)} over ${teamHtml(e.runnerUp)} &nbsp;·&nbsp;
            <span class="lab">Semis:</span> ${chips(e.sf, state.knockout.sf)}<br>
            <span class="lab">Quarters:</span> ${chips(e.qf, state.knockout.qf)}<br>
            <span class="lab">Reaches R16:</span> ${chips(e.r16, state.knockout.r16)}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  /* ============================ matches tab ============================ */
  function renderRoundbar(state) {
    const present = ['all'];
    for (const r of ['group', 'r32', 'r16', 'qf', 'sf', 'third', 'final'])
      if (state.matches.some(m => m.round === r && m.home && m.away)) present.push(r);
    $('roundbar').innerHTML = present.map(r =>
      `<button class="rchip ${activeRound === r ? 'active' : ''}" data-r="${r}" type="button">${r === 'all' ? 'Recent &amp; Live' : ROUND_LABELS[r]}</button>`).join('');
  }

  function renderMatches(state) {
    const now = Date.now(), DAY = 86400e3;
    let list = state.matches.filter(m => m.home && m.away);
    if (activeRound === 'all') {
      list = list.filter(m => m.state === 'in' || (new Date(m.date) > now - 1.3 * DAY && new Date(m.date) < now + 1.6 * DAY));
    } else {
      list = list.filter(m => m.round === activeRound);
    }
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    const groups = [];
    let cur = null;
    for (const m of list) {
      const d = new Date(m.date);
      const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (!cur || cur.key !== key) {
        cur = { key, label: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), items: [] };
        groups.push(cur);
      }
      cur.items.push(m);
    }
    for (const g of groups) g.items.sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || new Date(a.date) - new Date(b.date));
    $('matchwrap').innerHTML = groups.map(g =>
      `<div class="date-head">${esc(g.label)}</div><div class="matchgrid">${g.items.map(m => matchCardHtml(m, state, 'list', state.matches.indexOf(m))).join('')}</div>`
    ).join('') || '<div class="skeleton">No matches in this view.</div>';

    const liveCount = state.matches.filter(m => m.state === 'in').length;
    $('livepill').style.display = liveCount ? '' : 'none';
    $('liveTxt').textContent = liveCount + ' LIVE';
    $('mBadge').textContent = liveCount ? liveCount + ' live' : '';
  }

  /* ============================ brackets: pick matrix ============================ */
  function renderMatrix(state) {
    const entries = POOL.entries, k = state.knockout, elim = state.eliminated;
    const youIdx = entries.findIndex(e => isYou(e.name));

    const stChamp = t => k.champion ? (k.champion === t ? 'ok' : 'dead') : (elim.has(t) ? 'dead' : 'pend');
    const stRunner = t => {
      if (k.runnerUp) return k.runnerUp === t ? 'ok' : 'dead';
      if (k.champion && k.champion === t) return 'dead';
      return elim.has(t) ? 'dead' : 'pend';
    };
    const stSf = t => k.sf.has(t) ? 'ok' : (elim.has(t) ? 'dead' : 'pend');
    const stGw = (g, t) => {
      const tb = state.finalTables[g];
      if (tb && tb.complete) return tb.order[0].team === t ? 'ok' : 'dead';
      return elim.has(t) ? 'dead' : 'pend';
    };

    const majority = vals => {
      const m = {};
      for (const v of vals) m[v] = (m[v] || 0) + 1;
      const top = Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return top ? `${esc(top[0])} ${top[1]}/${vals.length}` : '—';
    };
    const wolf = (v, vals) => vals.filter(x => x === v).length === 1 ? ' 🐺' : '';

    const rowHtml = (label, cells, consensus, extraCls) =>
      `<tr class="${extraCls || ''}"><th class="rowlab">${label}</th><td class="cons">${consensus}</td>` +
      cells.map((c, i) => `<td class="cell-${c.st}${i === youIdx ? ' youcol' : ''}"${c.title ? ` title="${esc(c.title)}"` : ''}>${c.html}</td>`).join('') + '</tr>';

    const head = `<thead><tr><th class="rowlab">Pick</th><th class="cons">Consensus</th>${entries.map((e, i) =>
      `<th class="${i === youIdx ? 'youcol' : ''}">${esc(firstName(e.name))}</th>`).join('')}</tr></thead>`;

    const rows = [];
    { // champion
      const vals = entries.map(e => e.champion);
      rows.push(rowHtml('👑 Champion', entries.map(e => ({ st: stChamp(e.champion), html: esc(e.champion) + wolf(e.champion, vals) })), majority(vals), 'grp-start'));
    }
    { // runner-up
      const vals = entries.map(e => e.runnerUp);
      rows.push(rowHtml('🥈 Runner-up', entries.map(e => ({ st: stRunner(e.runnerUp), html: esc(e.runnerUp) + wolf(e.runnerUp, vals) })), majority(vals)));
    }
    { // semifinalists: 4 slots, each player's picks sorted by pool popularity so rows align
      const cnt = {};
      for (const e of entries) for (const t of e.sf) cnt[t] = (cnt[t] || 0) + 1;
      const sortedAll = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const per = entries.map(e => e.sf.slice().sort((a, b) => (cnt[b] - cnt[a]) || a.localeCompare(b)));
      for (let i = 0; i < 4; i++) {
        const cons = sortedAll[i] ? `${esc(sortedAll[i][0])} ${sortedAll[i][1]}/10` : '—';
        rows.push(rowHtml(i === 0 ? '🚀 Semifinalists' : '&nbsp;', per.map(p => {
          const t = p[i];
          return { st: stSf(t), html: esc(t) + (cnt[t] === 1 ? ' 🐺' : '') };
        }), cons, i === 0 ? 'grp-start' : ''));
      }
    }
    { // reaches-QF summary
      rows.push(rowHtml('🛡️ Reaches QF', entries.map(e => {
        const dead = e.qf.filter(t => elim.has(t) && !k.qf.has(t));
        const banked = e.qf.filter(t => k.qf.has(t)).length;
        const alive = 8 - dead.length;
        const st = dead.length ? 'warn' : (banked === 8 ? 'ok' : 'pend');
        return { st, html: esc(alive + '/8 alive'), title: dead.length ? 'Out: ' + dead.join(', ') : '' };
      }), '—', 'grp-start'));
    }
    Object.keys(Engine.GROUPS).forEach((g, gi) => { // group winners
      const vals = entries.map(e => e.groups[g][0]);
      rows.push(rowHtml('Grp ' + esc(g) + ' winner', entries.map(e => {
        const t = e.groups[g][0];
        return { st: stGw(g, t), html: esc(t) + wolf(t, vals) };
      }), majority(vals), gi === 0 ? 'grp-start' : ''));
    });

    $('matrix').innerHTML = head + '<tbody>' + rows.join('') + '</tbody>';
  }

  /* ============================ brackets: player view ============================ */
  function renderPlayerView(state) {
    if (!state) return;
    const sel = $('pvSel');
    const e = POOL.entries[+sel.value] || POOL.entries[0];
    const k = state.knockout, elim = state.eliminated;
    const minis = Object.keys(Engine.GROUPS).map(g => {
      const pred = e.groups[g], tb = state.finalTables[g];
      const rowsH = pred.map((t, i) => {
        let mk = '';
        if (tb && tb.complete) mk = tb.order[i].team === t ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>';
        return `<div class="pv-row"><span>${i + 1}. ${teamHtml(t)}</span>${mk}</div>`;
      }).join('');
      return `<div class="card pv-g"><h4>Group ${esc(g)}${tb && tb.complete ? ' <span class="done">✓</span>' : ''}</h4>${rowsH}</div>`;
    }).join('');
    const thirdChip = g => {
      let cls = '';
      if (state.allGroupsComplete) cls = state.advFinal.thirdGroups.has(g) ? 'hit' : 'out';
      else if (state.advLive.thirdGroups.has(g)) cls = 'hit';
      return `<span class="chip2 ${cls}">${esc(g)}</span>`;
    };
    const koChip = (t, set) => {
      const cls = set.has(t) ? 'hit' : (elim.has(t) ? 'out' : '');
      return `<span class="chip2 ${cls}">${teamHtml(t)}</span>`;
    };
    let finalNote = 'TBD';
    if (k.champion) finalNote = k.champion === e.champion ? '<span style="color:var(--green);font-weight:700">called it! +50</span>' : '<span style="color:var(--red);font-weight:700">missed</span>';
    else if (elim.has(e.champion)) finalNote = '<span style="color:var(--red);font-weight:700">champion out</span>';
    const final = `<div class="picks"><span class="lab">Final:</span> 🏆 <span class="${elim.has(e.champion) ? 'dead' : ''}" style="${elim.has(e.champion) ? 'color:var(--red);text-decoration:line-through' : ''}">${teamHtml(e.champion)}</span> over <span style="${elim.has(e.runnerUp) ? 'color:var(--red);text-decoration:line-through' : ''}">${teamHtml(e.runnerUp)}</span> · ${finalNote}</div>`;
    $('playerView').innerHTML =
      `<div class="pv-grid">${minis}</div>
      <div class="pv-sec">Third-place groups (8)</div><div>${e.thirds.map(thirdChip).join('')}</div>
      <div class="pv-sec">Reaches R16 — R32 winners (16)</div><div>${e.r16.map(t => koChip(t, k.r16)).join('')}</div>
      <div class="pv-sec">Reaches QF (8)</div><div>${e.qf.map(t => koChip(t, k.qf)).join('')}</div>
      <div class="pv-sec">Semifinalists (4)</div><div>${e.sf.map(t => koChip(t, k.sf)).join('')}</div>
      ${final}`;
  }

  /* ============================ brackets: head-to-head ============================ */
  function fillPickers() {
    const opts = POOL.entries.map((e, i) => `<option value="${i}">${esc(e.name)}</option>`).join('');
    $('h2hA').innerHTML = opts; $('h2hB').innerHTML = opts;
    $('pvSel').innerHTML = opts;
    const me = POOL.entries.findIndex(e => isYou(e.name));
    $('h2hA').value = me >= 0 ? me : 0;
    $('h2hB').value = me === 0 ? 1 : 0;
    $('pvSel').value = me >= 0 ? me : 0;
    $('h2hA').onchange = $('h2hB').onchange = () => renderH2H(lastGood, lastRows);
    $('pvSel').onchange = () => renderPlayerView(lastGood);
  }

  function renderH2H(state, rows) {
    if (!state || !rows) return;
    const a = POOL.entries[+$('h2hA').value], b = POOL.entries[+$('h2hB').value];
    const rowOf = n => rows.find(r => r.name === n) || {};
    const ra = rowOf(a.name), rb = rowOf(b.name);
    let diff = '';
    if (typeof ra.projected === 'number' && typeof rb.projected === 'number') {
      const d = ra.projected - rb.projected;
      diff = d === 0
        ? `Dead level — both on <b>${ra.projected}</b> projected.`
        : `<b>${esc(firstName(d > 0 ? a.name : b.name))}</b> leads by <b>${Math.abs(d)}</b> projected (${ra.projected} vs ${rb.projected}).`;
    }
    $('h2hDiff').innerHTML = diff;
    const col = (e) => {
      const r = rowOf(e.name);
      const fields = [
        ['Champion', teamHtml(e.champion)],
        ['Runner-up', teamHtml(e.runnerUp)],
        ['Semifinalists', e.sf.map(teamHtml).join(', ')],
        ['Reaches QF', e.qf.map(t => t.split(' ')[0]).map(esc).join(', ')],
      ];
      return { e, r, fields };
    };
    const ca = col(a), cb = col(b);
    const mkCol = (c, other) => `<div class="h2h-col ${isYou(c.e.name) ? 'you' : ''}">
      <h4>${esc(c.e.name)}${isYou(c.e.name) ? '<span class="youtag">YOU</span>' : ''}</h4>
      <div class="score-line"><b>${c.r.projected ?? '–'}</b> projected · ${c.r.official ?? 0} official · max ${c.r.max ?? '–'}</div>
      ${c.fields.map((f, i) => {
        const same = f[1] === other.fields[i][1];
        return `<div class="h2h-row ${same ? 'same' : 'diff'}"><span class="k">${esc(f[0])}</span><span class="v">${f[1]}</span></div>`;
      }).join('')}
    </div>`;
    $('h2hGrid').innerHTML = mkCol(ca, cb) + mkCol(cb, ca);
  }

  /* ============================ insights: badges ============================ */
  function renderBadges() {
    const wrap = $('badges'), zone = $('badgesCons');
    if (!badgesCache) {
      wrap.innerHTML = '<div class="sec-lead">Badges unavailable right now.</div>';
      zone.style.display = 'none';
      return;
    }
    const cons = [];
    const cards = POOL.entries.map(e => {
      const list = badgesCache[e.name] || [];
      const norm = list.filter(b => b && !b.consolation);
      for (const b of list) if (b && b.consolation) cons.push({ name: e.name, b });
      if (!norm.length) return '';
      return `<div class="card badge-card"><h4>${esc(e.name)}${isYou(e.name) ? '<span class="youtag">YOU</span>' : ''}</h4>` +
        norm.map(b => `<div class="bdg"><span class="em">${esc(b.emoji)}</span><span><span class="bl">${esc(b.label)}</span><br><span class="bd">${esc(b.desc)}</span></span></div>`).join('') +
        '</div>';
    }).join('');
    wrap.innerHTML = cards || '<div class="sec-lead">No badges earned yet — first crowns land 18 Jun.</div>';
    if (cons.length) {
      zone.style.display = '';
      $('badgesConsList').innerHTML = cons.map(({ name, b }) =>
        `<div class="bdg"><span class="em">${esc(b.emoji)}</span><span><span class="bl">${esc(b.label)}</span> — ${esc(firstName(name))}<br><span class="bd">${esc(b.desc)}</span></span></div>`).join('');
    } else zone.style.display = 'none';
  }

  /* ============================ insights: consensus ============================ */
  function tally(getList) {
    const m = {};
    for (const e of POOL.entries) for (const t of [].concat(getList(e))) (m[t] = m[t] || []).push(e.name);
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }
  function renderConsensus(state) {
    const bar = (entries, showNames) => entries.map(([team, names]) => {
      const pct = Math.round(names.length / POOL.entries.length * 100);
      const dead = state.eliminated.has(team);
      return `<div class="crow">
        <div class="lab"><span>${teamHtml(team)}${dead ? ' <span style="color:var(--red)">(out)</span>' : ''}</span><span class="cnt">${names.length}/10</span></div>
        <div class="track"><i style="width:${Math.max(pct, 6)}%"></i>${showNames ? `<span class="who-list">${pct >= 22 ? esc(names.map(n => isYou(n) ? 'you' : n.split(' ')[0]).slice(0, 3).join(', ')) : ''}</span>` : ''}</div>
      </div>`;
    }).join('');
    $('consChampion').innerHTML = bar(tally(e => e.champion), true);
    $('consRunner').innerHTML = bar(tally(e => e.runnerUp), true);
    $('consSemis').innerHTML = bar(tally(e => e.sf).slice(0, 6), false);
    const bold = tally(e => e.sf).filter(([, names]) => names.length === 1)
      .map(([team, names]) => `<div class="crow"><div class="lab"><span>${teamHtml(team)} to reach semis</span><span class="cnt">only ${esc(names[0].split(' ')[0])}</span></div></div>`).join('')
      || '<div class="sec-lead">Everyone\'s semifinal picks overlap — no lone-wolf calls.</div>';
    $('consBold').innerHTML = bold;
  }

  /* ============================ insights: most similar brackets ============================ */
  function similarity(a, b) {
    const ov = (A, B) => { const s = new Set(B); let n = 0; for (const x of A) if (s.has(x)) n++; return A.length ? n / A.length : 0; };
    let s = 0;
    s += a.champion === b.champion ? 1 : 0;
    s += a.runnerUp === b.runnerUp ? 1 : 0;
    s += ov(a.sf, b.sf);
    s += ov(a.qf, b.qf);
    s += ov(a.r16, b.r16);
    s += ov(a.thirds, b.thirds);
    let gw = 0;
    for (const g of Object.keys(a.groups)) if (a.groups[g][0] === b.groups[g][0]) gw++;
    s += gw / 12;
    return s / 7;
  }
  function renderSimilar() {
    const es = POOL.entries, pairs = [];
    for (let i = 0; i < es.length; i++)
      for (let j = i + 1; j < es.length; j++)
        pairs.push({ a: es[i].name, b: es[j].name, s: similarity(es[i], es[j]) });
    pairs.sort((x, y) => y.s - x.s);
    $('similar').innerHTML = pairs.slice(0, 5).map(p => {
      const pct = Math.round(p.s * 100);
      return `<div class="sim-row"><span class="names">${esc(firstName(p.a))} × ${esc(firstName(p.b))}</span><span class="sim-bar"><i style="width:${pct}%"></i></span><span class="pct">${pct}%</span></div>`;
    }).join('');
  }

  /* ============================ digest + WhatsApp recap ============================ */
  function digest(rows, state) {
    const today = state.matches.filter(m => m.completed && m.home && Date.now() - new Date(m.date) < 1.3 * 86400e3)
      .map(m => `${m.home} ${m.hs}-${m.as} ${m.away}`);
    const d = new Date();
    const sim = simCache.sim;
    const cr = currentCrown();
    return [
      `⚽ *FIFA Prediction Pro — ${POOL.poolName}* (${d.toLocaleDateString([], { day: 'numeric', month: 'short' })})`, '',
      ...rows.map(r => {
        const wp = (sim && sim.winProb && typeof sim.winProb[r.name] === 'number') ? ` · ${(sim.winProb[r.name] * 100).toFixed(1)}%` : '';
        return `${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank + '.'} ${r.name} — *${r.projected}*${wp} (max ${r.max})${r.championAlive ? '' : ' 👑❌'}`;
      }), '',
      cr ? `👑 ${cr.round}${cr.done ? ' crown' : ' (live)'}: ${cr.winners.map(n => n.split(' ')[0]).join(' & ')} — ${cr.pts} pts` : '',
      today.length ? '🔥 ' + today.join(' · ') : '', '',
      '📊 Live board: ' + location.href,
      '_projected pts — official group scoring settles when groups finish_',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  }

  async function copyDigest() {
    if (!lastRows || !lastGood) return;
    const text = digest(lastRows, lastGood);
    try { await navigator.clipboard.writeText(text); flash('✅ Copied!'); }
    catch (e) { prompt('Copy the digest:', text); }
  }
  function flash(msg) {
    const b = $('digestBtn');
    const o = b.dataset.orig || b.innerHTML; b.dataset.orig = o;
    b.innerHTML = msg; setTimeout(() => { b.innerHTML = o; }, 1800);
  }
  function flashRecap(msg) {
    [$('recapBtn'), $('homeRecapBtn')].forEach(b => {
      if (!b) return;
      const o = b.dataset.orig || b.innerHTML; b.dataset.orig = o;
      b.innerHTML = esc(msg); setTimeout(() => { b.innerHTML = o; }, 2400);
    });
  }

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function trimTo(ctx, s, maxW) {
    s = String(s);
    while (s.length > 1 && ctx.measureText(s).width > maxW) s = s.slice(0, -2) + '…';
    return s;
  }
  function drawRecap(rows) {
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1350;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const navy = '#0a1828', gold = '#D3A43B', cream = '#F4F1EA';
    ctx.fillStyle = navy; ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = gold; ctx.fillRect(0, 0, 1080, 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = gold; ctx.font = '800 58px system-ui, sans-serif';
    ctx.fillText('FIFA PREDICTION PRO', 540, 148);
    ctx.fillStyle = cream; ctx.font = '700 42px system-ui, sans-serif';
    ctx.fillText(POOL.poolName, 540, 222);
    ctx.fillStyle = 'rgba(244,241,234,0.55)'; ctx.font = '500 30px system-ui, sans-serif';
    ctx.fillText(new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' · projected standings', 540, 272);
    const sim = simCache.sim;
    const top = rows.slice(0, 5);
    const y0 = 335, rh = 140, gap = 22;
    top.forEach((r, i) => {
      const y = y0 + i * (rh + gap);
      ctx.fillStyle = i === 0 ? 'rgba(211,164,59,0.16)' : 'rgba(255,255,255,0.06)';
      rrect(ctx, 80, y, 920, rh, 20); ctx.fill();
      if (i === 0) { ctx.strokeStyle = 'rgba(211,164,59,0.7)'; ctx.lineWidth = 3; rrect(ctx, 80, y, 920, rh, 20); ctx.stroke(); }
      ctx.textAlign = 'left';
      ctx.font = '400 54px system-ui, sans-serif'; ctx.fillStyle = cream;
      ctx.fillText(['🥇', '🥈', '🥉', '4.', '5.'][i], 110, y + 88);
      ctx.font = '600 42px system-ui, sans-serif'; ctx.fillStyle = cream;
      ctx.fillText(trimTo(ctx, r.name, 520), 210, y + 70);
      ctx.font = '400 27px system-ui, sans-serif'; ctx.fillStyle = 'rgba(244,241,234,0.5)';
      ctx.fillText(trimTo(ctx, '👑 ' + r.champion + (r.championAlive ? '' : ' (out)'), 520), 212, y + 112);
      ctx.textAlign = 'right';
      ctx.font = '800 56px system-ui, sans-serif'; ctx.fillStyle = gold;
      ctx.fillText(String(r.projected), 970, y + 76);
      let wl = 'pts';
      if (sim && sim.winProb && typeof sim.winProb[r.name] === 'number') wl = (sim.winProb[r.name] * 100).toFixed(1) + '% win';
      ctx.font = '500 26px system-ui, sans-serif'; ctx.fillStyle = 'rgba(244,241,234,0.5)';
      ctx.fillText(wl, 970, y + 114);
    });
    const cr = currentCrown();
    ctx.textAlign = 'center';
    ctx.font = '600 32px system-ui, sans-serif'; ctx.fillStyle = '#E6C36B';
    const crTxt = cr
      ? '👑 ' + cr.round + (cr.done ? ' crown: ' : ' leader: ') + cr.winners.map(n => n.split(' ')[0]).join(' & ') + ' (' + cr.pts + ' pts)'
      : 'Group stage in progress — first crown decided 18 Jun';
    ctx.fillText(trimTo(ctx, crTxt, 940), 540, 1218);
    ctx.font = '500 26px system-ui, sans-serif'; ctx.fillStyle = 'rgba(244,241,234,0.45)';
    let url = '';
    try { url = location.host + location.pathname; } catch (e) {}
    ctx.fillText(url, 540, 1292);
    return c;
  }
  function downloadBlob(blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fpp-recap.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function shareRecap() {
    if (!lastRows || !lastGood) { flashRecap('⏳ Still loading…'); return; }
    const text = digest(lastRows, lastGood);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
    let c = null;
    try { c = drawRecap(lastRows); } catch (e) { c = null; }
    if (!c || !c.toBlob) { flashRecap(copied ? '✅ Text copied (no image)' : '⚠️ Recap failed'); return; }
    c.toBlob(blob => {
      if (!blob) { flashRecap(copied ? '✅ Text copied (no image)' : '⚠️ Image failed'); return; }
      let shared = false;
      try {
        if (typeof File !== 'undefined' && navigator.canShare) {
          const f = new File([blob], 'fpp-recap.png', { type: 'image/png' });
          if (navigator.canShare({ files: [f] })) {
            shared = true;
            navigator.share({ files: [f], title: 'FIFA Prediction Pro' }).catch(() => downloadBlob(blob));
          }
        }
      } catch (e) { shared = false; }
      if (!shared) downloadBlob(blob);
      flashRecap('✅ Image ' + (shared ? 'shared' : 'saved') + (copied ? ' · text copied' : ''));
    }, 'image/png');
  }

  /* ============================ MC simulation pipeline ============================ */
  function scheduleSim() {
    if (!lastGood || !lastRows) return;
    if (!hasMC() || !hasRatings()) { renderRooting(lastGood); return; }
    if (simCache.hash === currentHash && simCache.sim) {
      applySim();
      startRooting();
      return;
    }
    setTimeout(() => { // after first paint
      if (!lastGood) return;
      try { topology = lastRaw ? MC.parseTopology(lastRaw) : null; } catch (e) { topology = null; }
      let sim = null;
      try {
        sim = MC.simulate({ state: lastGood, entries: POOL.entries, topology, ratings: RATINGS, sims: 4000 });
      } catch (e) { sim = null; }
      simCache = { hash: currentHash, sim };
      applySim();
      startRooting();
    }, 50);
  }
  function applySim() {
    if (!lastGood || !lastRows) return;
    try {
      renderStatusCards(lastGood, lastRows);
      renderLb(lastRows, lastGood);
    } catch (e) {}
  }

  /* ============================ main refresh ============================ */
  function renderAll(state, rows) {
    renderStatusCards(state, rows);
    renderTodayLive(state);
    renderRooting(state);
    renderRecapStrip();
    renderRoundbar(state);
    renderMatches(state);
    renderPodium(rows);
    renderLb(rows, state);
    renderMatrix(state);
    renderPlayerView(state);
    renderH2H(state, rows);
    renderBadges();
    renderConsensus(state);
  }

  async function refresh() {
    if (inFlight) return;
    inFlight = true; secs = 60;
    try {
      const { matches, raw, source } = await fetchData();
      const state = Engine.buildState(matches);
      if (Object.keys(state.logos).length >= 40) LOGOS = state.logos;
      const rows = Engine.leaderboard(POOL.entries, state);
      prevRanks = lastRows ? Object.fromEntries(lastRows.map(r => [r.name, r.rank])) : null;
      lastGood = state; lastRows = rows; lastRaw = raw; lastSource = source;
      currentHash = resultsHash(matches);
      crownsCache = mcTry(() => MC.crowns(state, POOL.entries), null);
      badgesCache = mcTry(() => MC.badges(state, POOL.entries, crownsCache || [], rows), null);
      renderAll(state, rows);
      $('err').style.display = 'none';
      $('updated').textContent = '✓ Updated ' + new Date().toLocaleTimeString() + ' · ' + source;
      $('countdown').style.display = '';
      scheduleSim();
    } catch (e) {
      $('err').textContent = 'Could not reach the live results feed (' + e.message + '). ' + (lastGood ? 'Showing last good data.' : 'Retrying shortly.');
      $('err').style.display = 'block';
    } finally { inFlight = false; secs = 60; }
  }

  /* ============================ delegated event handlers (bound once) ============================ */
  $('lb').addEventListener('click', e => {
    const head = e.target.closest('.entry-head'); if (!head) return;
    const box = head.parentElement, n = box.dataset.name;
    box.classList.toggle('open');
    if (box.classList.contains('open')) openNames.add(n); else openNames.delete(n);
  });

  $('roundbar').addEventListener('click', e => {
    const c = e.target.closest('.rchip'); if (!c || !lastGood) return;
    activeRound = c.dataset.r;
    renderRoundbar(lastGood);
    renderMatches(lastGood);
  });

  $('matchwrap').addEventListener('click', e => {
    const b = e.target.closest('.stakes-toggle'); if (!b || !lastGood) return;
    const card = b.closest('.match'); if (!card) return;
    const mi = +card.dataset.mi;
    const m = lastGood.matches[mi]; if (!m) return;
    const key = matchKey(m);
    const open = !openStakes.has(key);
    if (open) openStakes.add(key); else openStakes.delete(key);
    card.classList.toggle('stk-open', open);
    b.innerHTML = '⚖️ Stakes ' + (open ? '▴' : '▾');
    const body = card.querySelector('.stakes-body');
    if (open && body && !body.innerHTML) body.innerHTML = stakesBodyHtml(lastGood, m);
  });

  $('refreshBtn').onclick = refresh;
  $('digestBtn').onclick = copyDigest;
  $('recapBtn').onclick = shareRecap;
  $('homeRecapBtn').onclick = shareRecap;

  /* ============================ init ============================ */
  fillPickers();
  renderSimilar();
  setInterval(() => {
    secs--;
    $('countdown').textContent = '↻ ' + Math.max(secs, 0) + 's';
    if (secs <= 0) refresh();
  }, 1000);
  refresh();
})();
