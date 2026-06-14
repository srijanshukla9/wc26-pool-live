/* FIFA Prediction Pro — app.js
   UI logic for the multi-pool WC26 companion (broadcast design v1.0).
   Loads after data.js, engine.js, ratings.js, viz.js, mc.js.

   data.js exposes globals: POOLS, POOL_ORDER, POOL (active, chosen from
   location.hash '#pool=<key>', defaults to spjain). VIZ (viz.js) is optional;
   MC + RATINGS (mc.js / ratings.js) are optional. Every use of VIZ/MC/RATINGS
   is guarded so the page degrades gracefully if any is missing or throws.

   Scales to the 84-entry Open pool: leaderboard renders all rows but builds
   each expanded detail lazily on first open; brackets use a consensus board
   plus a searchable single-bracket view (matrix kept only for <=12-entry pools). */
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
  const escA = esc; // attribute escaping uses same map
  const flag = t => {
    const url = LOGOS[t];
    if (url && /^https:\/\/a\.espncdn\.com\/[\w./-]+$/.test(url)) return `<img class="fl" src="${esc(url)}" alt="" loading="lazy">`;
    return `<span class="fl-e">${FLAGS[t] || '🏳️'}</span>`;
  };
  // small crest used inside the score-bug (img or emoji span)
  const crest = t => {
    const url = LOGOS[t];
    if (url && /^https:\/\/a\.espncdn\.com\/[\w./-]+$/.test(url)) return `<img class="crest" src="${esc(url)}" alt="" loading="lazy">`;
    return `<span class="crest-e">${FLAGS[t] || '🏳️'}</span>`;
  };
  const teamHtml = t => `${flag(t)} ${esc(t)}`;
  const $ = id => document.getElementById(id);

  /* visual identity (viz.js) — optional, degrade to flags/nothing */
  const hasViz = (() => { try { return typeof VIZ !== 'undefined' && !!VIZ; } catch (e) { return false; } })();
  const kit = (t, s, o) => hasViz ? VIZ.kit(t, s, o) : crest(t);
  const avatar = (n, s, o) => hasViz ? VIZ.avatar(n, s, o) : `<span class="ava" style="width:${s}px;height:${s}px">${esc((String(n)[0] || '?').toUpperCase())}</span>`;
  // team accent hex for left-bars / score-bug rails
  const teamHex = t => {
    if (hasViz) { try { return VIZ.teamColor(t); } catch (e) {} }
    return 'var(--accent)';
  };
  const probBarHtml = (pct, opts) => hasViz ? VIZ.probBar(pct, opts) : '';

  const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200';
  const FIFA_URL = 'https://api.fifa.com/api/v3/calendar/matches?idSeason=285023&idCompetition=17&language=en&count=200';
  const ROUND_LABELS = { group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarterfinals', sf: 'Semifinals', third: '3rd-Place', final: 'Final' };

  const YOU_RE = /TARS/;
  const isYou = n => YOU_RE.test(String(n));
  // strip [TARS] / (parens) for display; "You" label only used in compact contexts
  const cleanName = n => String(n).replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim() || String(n);
  const firstName = n => isYou(n) ? 'You' : (cleanName(n).split(/\s+/)[0] || String(n));
  const fmtSigned = d => (d > 0 ? '+' : '') + d;
  const fmtPct = p => { const v = p * 100; return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
  const fmtTime = d => new Date(d).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtClock = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const COUNT = POOL.entries.length;
  const SMALL_POOL = COUNT <= 12; // matrix view only for small pools

  /* ============================ number-tick animation ============================
     Spec signature motion: when a live numeral changes, the new value slides in
     (@keyframes tickIn + .tick in index.html). The numerals live inside innerHTML
     strings that are fully rebuilt every refresh, so we can't add .tick at build
     time (it would fire on every render, including the first paint). Instead we run
     a post-render reconciliation pass: each tracked numeral carries a stable key,
     we diff its text against the value last seen for that key, and fire .tick only
     on a real change. First-seen keys are recorded silently (no animation on load). */
  const REDUCE_MOTION = (() => {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  })();
  let tickPrev = Object.create(null); // key -> last-rendered text
  // restart the CSS animation: remove, force reflow, re-add
  function fireTick(el) {
    el.classList.remove('tick');
    void el.offsetWidth; // eslint-disable-line no-unused-expressions
    el.classList.add('tick');
  }
  // compare el's current text to the value stored under `key`; animate if it changed
  function tickIf(key, el) {
    if (!el) return;
    const val = el.textContent;
    const had = Object.prototype.hasOwnProperty.call(tickPrev, key);
    const prev = tickPrev[key];
    tickPrev[key] = val;
    if (REDUCE_MOTION) return;        // CSS also neutralizes the animation, but skip work
    if (!had || prev === val) return; // first paint or unchanged → no animation
    fireTick(el);
  }
  // walk every tracked live numeral after a render and tick the ones that changed.
  // keys are derived from stable DOM identity (match index, entry name, cell role)
  // so values survive the innerHTML rebuilds that happen on each refresh.
  function tickScan() {
    // match score-bug numerals: keyed by match index + position (home/away)
    document.querySelectorAll('.match').forEach(card => {
      const mi = card.dataset.mi;
      if (mi == null) return;
      const ns = card.querySelectorAll('.sb-score .n');
      ns.forEach((n, i) => tickIf('sb:' + mi + ':' + i, n));
    });
    // leaderboard rows: projected pts + win% per entry
    document.querySelectorAll('#lb .entry').forEach(row => {
      const n = row.dataset.name; if (n == null) return;
      tickIf('proj:' + n, row.querySelector('.proj .big'));
      tickIf('win:' + n, row.querySelector('.win-num'));
    });
    // personal "you-bug": rank / projected / win% cells (keyed by column order)
    document.querySelectorAll('#profileStrip .you-cell .v').forEach((v, i) => tickIf('you:' + i, v));
    // refresh countdown
    tickIf('countdown', $('countdown'));
  }

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
  let lbSort = 'projected', lbFilter = '';
  let brView = 'consensus', brFilter = '';

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
  const SUN = 'M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 100 8 4 4 0 000-8z';
  const MOON = 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z';
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const ic = $('themeIcon');
    if (ic) ic.innerHTML = `<path d="${t === 'dark' ? SUN : MOON}"/>`;
    try { localStorage.setItem('wc26-theme', t); } catch (e) {}
  }
  (function initTheme() {
    let t = 'dark';
    try { t = localStorage.getItem('wc26-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
    setTheme(t);
  })();
  if (themeBtn) themeBtn.onclick = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

  /* ============================ pool switcher + identity ============================ */
  function switchPool(key) {
    if (!POOLS[key] || key === POOL.key) return;
    try { location.hash = '#pool=' + key; } catch (e) {}
    location.reload();
  }
  function renderPoolSwitch() {
    const sw = $('poolSwitch'), sel = $('poolSelect');
    if (sw) {
      sw.innerHTML = POOL_ORDER.map(key => {
        const p = POOLS[key]; if (!p) return '';
        const active = key === POOL.key;
        return `<button class="pool-seg ${active ? 'active' : ''}" data-pool="${esc(key)}" role="tab" aria-selected="${active}" type="button">${esc(p.short)} <span class="cnt">${p.count}</span></button>`;
      }).join('');
      sw.addEventListener('click', e => {
        const b = e.target.closest('.pool-seg'); if (!b) return;
        switchPool(b.dataset.pool);
      });
    }
    if (sel) {
      sel.innerHTML = POOL_ORDER.map(key => {
        const p = POOLS[key]; if (!p) return '';
        return `<option value="${esc(key)}" ${key === POOL.key ? 'selected' : ''}>${esc(p.short)} (${p.count})</option>`;
      }).join('');
      sel.value = POOL.key;
      sel.onchange = () => switchPool(sel.value);
    }
  }
  function renderIdentity() {
    const link = $('officialLink');
    if (link) link.href = POOL.poolUrl || '#';
    const k = $('heroKicker');
    if (k) k.innerHTML = `<span class="live-dot"></span> ${esc(POOL.poolName)} · World Cup 26`;
    const ht = $('heroTitle');
    if (ht) ht.textContent = POOL.poolName;
    const hs = $('heroSub');
    if (hs) hs.innerHTML = `The live World Cup 2026 companion for the <b>${esc(POOL.poolName)}</b> bracket pool — ${COUNT} locked entries, synced with real match results. <a href="${esc(POOL.poolUrl || '#')}" target="_blank" rel="noopener">Official pool ↗</a>`;
  }

  /* ============================ tabs (work before first fetch) ============================ */
  function moveTabInd(tabEl) {
    const ind = $('tabInd');
    if (!ind || !tabEl) return;
    ind.style.width = tabEl.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + tabEl.offsetLeft + 'px)';
  }
  $('tabbar').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    const name = t.dataset.tab;
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    moveTabInd(t);
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
  // win probability for a name, or null
  function winProbOf(name) {
    const sim = simCache.sim;
    return (sim && sim.winProb && typeof sim.winProb[name] === 'number') ? sim.winProb[name] : null;
  }

  /* ============================ SVG icon set (status cards) ============================ */
  const ICO = {
    medal: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
    crown: '<path d="M3 8l3.5 9h11L21 8l-5 4-4-7-4 7z"/>',
    flame: '<path d="M12 3c1 4 4 5 4 9a4 4 0 01-8 0c0-2 1-3 2-4 0 2 1 2 2 2 0-3-2-4-2-7z"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0114 0M17 8a4 4 0 010 8M22 21a7 7 0 00-4-6.3"/>',
  };
  const ic = name => `<svg class="ico" viewBox="0 0 24 24">${ICO[name] || ''}</svg>`;

  /* ============================ home: status cards + you-bug ============================ */
  function renderStatusCards(state, rows) {
    const cards = [];
    const you = rows.find(r => isYou(r.name));
    if (you) {
      cards.push({ ic: 'medal', k: 'Your rank', v: '#' + you.rank, s: 'of ' + rows.length, cls: '', bar: 'var(--gold)' });
      cards.push({ ic: 'chart', k: 'Projected', v: String(you.projected), s: 'ceiling ' + you.max, cls: 'green', bar: 'var(--win)' });
    }
    const wp = you ? winProbOf(you.name) : null;
    if (wp != null) cards.push({ ic: 'dice', k: 'Title odds', v: (wp * 100).toFixed(1) + '%', s: (simCache.sim && simCache.sim.sims ? simCache.sim.sims + ' sims' : 'Monte Carlo'), cls: 'gold', bar: 'var(--accent)' });
    const cr = currentCrown();
    if (cr) cards.push({ ic: 'crown', k: 'Matchday crown', v: cr.winners.map(firstName).join(' & '), s: cr.round + (cr.done ? '' : ' · live') + ' · ' + cr.pts + ' pts', cls: 'gold', bar: 'var(--gold)' });
    // leader (always useful, esp. for big pools without a you-entry)
    if (rows[0]) cards.push({ ic: 'flame', k: 'Pool leader', v: firstName(rows[0].name), s: rows[0].projected + ' projected', cls: '', bar: 'var(--accent-2)' });
    cards.push({ ic: 'users', k: 'Field', v: String(COUNT), s: POOL.poolName, cls: '', bar: 'var(--accent-3)' });

    $('statusCards').innerHTML = cards.map(c =>
      `<div class="stat-card" style="--accent-bar:${c.bar}">
        <div class="ic">${ic(c.ic)}</div>
        <div class="body"><div class="k">${esc(c.k)}</div><div class="v num ${c.cls}">${esc(c.v)}</div><div class="s">${esc(c.s)}</div></div>
      </div>`
    ).join('');

    // "you" mini-scoreboard (personal broadcast score-bug)
    const strip = $('profileStrip');
    if (strip) {
      if (you) {
        const winTxt = wp != null ? (wp * 100).toFixed(1) + '%' : '—';
        strip.innerHTML = `<div class="you-bug">
          <div class="you-cell"><div class="v num gold">#${you.rank}</div><div class="l">Rank</div></div>
          <div class="you-cell"><div class="v num">${you.projected}</div><div class="l">Projected</div></div>
          <div class="you-cell"><div class="v num win">${esc(winTxt)}</div><div class="l">Win%</div></div>
        </div>`;
      } else strip.innerHTML = '';
    }
  }

  /* ============================ match cards (broadcast score-bug) ============================ */
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

  function stakesBodyHtml(state, m) {
    const stk = mcTry(() => MC.stakes(state, POOL.entries, m), null);
    if (!stk || !stk.outcomes || !stk.outcomes.length) return '<div class="stk-out"><div class="stk-row"><span>Stakes unavailable.</span></div></div>';
    return stk.outcomes.map(o => {
      const rows = POOL.entries
        .map(e => ({ n: e.name, d: (o.deltas && typeof o.deltas[e.name] === 'number') ? o.deltas[e.name] : 0 }))
        .filter(r => r.d !== 0)
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
        .slice(0, 8);
      const inner = rows.length
        ? rows.map(r => `<div class="stk-row"><span>${esc(firstName(r.n))}</span><b class="${r.d > 0 ? 'up' : 'dn'}">${esc(fmtSigned(r.d))}</b></div>`).join('')
        : '<div class="stk-row"><span>No points move</span><b>±0</b></div>';
      return `<div class="stk-out"><div class="stk-lab">${esc(o.label)}</div>${inner}</div>`;
    }).join('');
  }

  // mode: 'home' (compact, no toggle) | 'list' (collapsible stakes)
  function matchCardHtml(m, state, mode, mi) {
    const grp = m.round === 'group'
      ? 'Group ' + (Engine.TEAM_GROUP[m.home] || '') + (m.detail ? ' · ' + esc(m.detail) : '')
      : (ROUND_LABELS[m.round] || '');
    // status pill
    let status, scls;
    if (m.state === 'in') { status = '● ' + (m.clock || 'LIVE'); scls = 'live'; }
    else if (m.completed) { status = 'FT'; scls = 'ft'; }
    else { status = mode === 'home' ? fmtTime(m.date) : fmtClock(m.date); scls = 'sched'; }

    const showSc = !(m.state === 'pre' || isNaN(m.hs));
    const isLive = m.state === 'in';
    // win/lose styling per side (only when completed)
    const sideCls = side => !m.completed ? '' : (side === 'h'
      ? (m.hs > m.as ? '' : m.hs < m.as ? 'lose' : '')
      : (m.as > m.hs ? '' : m.as < m.hs ? 'lose' : ''));
    const scoreCls = side => sideCls(side);

    const left = `<div class="sb-team left ${sideCls('h')}" style="--team:${teamHex(m.home)}">${crest(m.home)}<span class="tnm">${esc(m.home)}</span></div>`;
    const right = `<div class="sb-team right ${sideCls('a')}" style="--team:${teamHex(m.away)}">${crest(m.away)}<span class="tnm">${esc(m.away)}</span></div>`;
    const mid = showSc
      ? `<span class="n ${scoreCls('h')}">${m.hs}</span><span class="dash">–</span><span class="n ${scoreCls('a')}">${m.as}</span>`
      : `<span class="vs">VS</span>`;

    // who-called strip
    const called = whoCalled(m, state);
    let calledHtml = '';
    if (called && called.predicted.length) {
      const names = called.predicted.map(firstName);
      const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '');
      const okBad = m.completed ? 'ok' : 'ok';
      calledHtml = `<div class="m-called"><span class="pin ${okBad}">✓</span> <b>${called.predicted.length}/${COUNT}</b> took ${esc(called.winner)} · <span>${esc(shown)}</span></div>`;
    } else if (called) {
      calledHtml = `<div class="m-called"><span class="pin bad">✗</span> Nobody backed ${esc(called.winner)}</div>`;
    }

    // stakes (upcoming/live, list mode only — gives broadcast cards room)
    let stakesHtml = '';
    const upcoming = m.state === 'pre' || m.state === 'in';
    const openStk = openStakes.has(matchKey(m));
    if (upcoming && hasMC() && mode === 'list') {
      stakesHtml = `<button class="stakes-toggle" type="button">Stakes for the pool <svg class="ico chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="stakes-body">${openStk ? stakesBodyHtml(state, m) : ''}</div>`;
    }
    const openCls = (mode === 'list' && openStk) ? 'stk-open' : '';

    return `<div class="match ${openCls}" data-mi="${mi}">
      <div class="m-banner"><span class="rd">${grp}</span><span class="m-status ${scls}">${esc(status)}</span></div>
      <div class="score-bug ${isLive ? 'is-live' : ''}">
        ${left}
        <div class="sb-score">${mid}</div>
        ${right}
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
      el.innerHTML = '<div class="sec-lead">Rooting guide needs your entry plus the simulator — currently offline for this pool.</div>';
      return;
    }
    if (rooting.hash === currentHash && rooting.items.length) { renderRootingItems(); return; }
    const up = nextUpcoming(state, 4);
    if (!up.length) { el.innerHTML = '<div class="sec-lead">No upcoming matches left to root for.</div>'; return; }
    el.innerHTML = up.map(m =>
      `<div class="root-card" style="--accent-bar:${teamHex(m.home)}"><div class="hd">${esc(m.home)} vs ${esc(m.away)}</div><div class="tm">${esc(fmtTime(m.date))} · simulating…</div></div>`
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
      const verdict = best && best.o ? `<div class="root-verdict">⚑ Root for: ${esc(best.o.label)}</div>` : '';
      const note = useWin ? 'Δ your title odds' : 'Δ your points';
      return `<div class="root-card" style="--accent-bar:${teamHex(m.home)}"><div class="hd">${esc(m.home)} vs ${esc(m.away)}</div><div class="tm">${esc(fmtTime(m.date))} · ${note}</div>${rows}${verdict}</div>`;
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
      const medalSvg = `<svg class="ico" viewBox="0 0 24 24" style="width:22px;height:22px;color:var(--medal)"><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></svg>`;
      const medalCol = ['#E8B73A', '#C7CDD6', '#CD8E5A'][r.rank - 1];
      const ringCol = ['#E8B73A', '#C7CDD6', '#CD8E5A'][r.rank - 1];
      return `<div class="pod ${r.rank === 1 ? 'p1' : ''}" style="--medal:${medalCol}">
        <div class="pod-ava">${avatar(r.name, r.rank === 1 ? 62 : 50, { ring: ringCol, crown: r.rank === 1 })}<span class="pod-medal">${medalSvg}</span></div>
        <div class="nm">${esc(cleanName(r.name))}${isYou(r.name) ? ' <span class="youtag">YOU</span>' : ''}</div>
        <div class="ch">👑 ${teamHtml(r.champion)}</div>
        <div class="pts num">${r.projected}</div>
      </div>`;
    }).join('');
  }

  // build the (lazy) detail panel for a single entry
  function detailHtml(r, e, state) {
    const lockedPct = Math.round(r.official / 470 * 100);
    const projPct = Math.max(0, Math.round((r.projected - r.official) / 470 * 100));
    const cats = CATS.map(([k, label, max]) =>
      `<div class="cat"><span>${label}</span><b>${r.projectedBr[k]}<span class="of">/${max}</span></b></div>`).join('');
    const chips = (list, set) => list.map(t => `<span class="chip2 ${set.has(t) ? 'hit' : state.eliminated.has(t) ? 'out' : ''}">${teamHtml(t)}</span>`).join('');
    return `<div class="detail">
      <div class="barwrap">
        <div class="toprow"><span>Points secured vs. projected</span><b>${r.official} locked · ${r.projected} projected · ${r.max} ceiling</b></div>
        <div class="bar"><i class="locked" style="width:${lockedPct}%"></i><i class="proj" style="width:${projPct}%"></i></div>
      </div>
      <div class="cats">${cats}</div>
      <div class="picks">
        <span class="lab">Final:</span> ${teamHtml(e.champion)} over ${teamHtml(e.runnerUp)}<br>
        <span class="lab">Semis:</span> ${chips(e.sf, state.knockout.sf)}<br>
        <span class="lab">Quarters:</span> ${chips(e.qf, state.knockout.qf)}<br>
        <span class="lab">Reaches R16:</span> ${chips(e.r16, state.knockout.r16)}
      </div>
    </div>`;
  }

  // win% column content. For big fields most are tiny: show bar+% if >=0.05%, else an "In contention" / "Out" tag.
  function winCellHtml(r) {
    const wp = winProbOf(r.name);
    if (wp == null) {
      // sim not ready — show a neutral placeholder so layout is stable
      return `<div class="winwrap"><div class="win-bar"><i style="width:0%"></i></div><span class="win-num num">—</span></div>`;
    }
    const pctNum = wp * 100;
    if (pctNum >= 0.05) {
      const shown = pctNum >= 9.95 ? Math.round(pctNum) + '%' : pctNum.toFixed(1) + '%';
      return `<div class="winwrap"><div class="win-bar"><i style="width:${Math.min(100, Math.max(2, pctNum))}%"></i></div><span class="win-num num">${shown}</span></div>`;
    }
    // tiny but alive vs eliminated champion path
    const tag = r.championAlive ? '<span class="alivetag">In contention</span>' : '<span class="outtag">Long shot</span>';
    return `<div class="winwrap" style="justify-content:flex-end">${tag}</div>`;
  }

  function entryHeadHtml(r, e, state, cc) {
    const rankCls = r.rank === 1 ? 'r1' : (r.rank <= 3 ? 'r' + r.rank : '');
    const accentBar = r.rank === 1 ? 'var(--gold)' : (r.rank <= 3 ? 'var(--gold-soft)' : (isYou(r.name) ? 'var(--accent)' : 'var(--line)'));
    let mv = '';
    if (prevRanks && prevRanks[r.name] && prevRanks[r.name] !== r.rank) {
      mv = prevRanks[r.name] > r.rank
        ? `<span class="mv up">▲${prevRanks[r.name] - r.rank}</span>`
        : `<span class="mv dn">▼${r.rank - prevRanks[r.name]}</span>`;
    }
    const crownTag = cc[r.name] ? `<span class="crowntag" title="Matchday crowns">👑${cc[r.name] > 1 ? '×' + cc[r.name] : ''}</span>` : '';
    const champState = r.championAlive ? '<span class="alivetag">alive</span>' : '<span class="outtag">OUT −50</span>';
    const champName = r.championAlive ? teamHtml(r.champion) : `<span class="dead">${teamHtml(r.champion)}</span>`;
    return `<div class="entry-head">
      <div class="rank ${rankCls} num">${r.rank}${mv}</div>
      <div class="lb-ava">${avatar(r.name, 30, cc[r.name] ? { ring: 'var(--gold)' } : null)}</div>
      <div class="who">
        <div class="nm">${esc(cleanName(r.name))}${isYou(r.name) ? '<span class="youtag">YOU</span>' : ''}${crownTag}</div>
        <div class="ch">Champion: ${champName} ${champState}</div>
      </div>
      ${winCellHtml(r)}
      <div class="proj"><div class="big num">${r.projected}</div><div class="off num">${r.official} official</div></div>
      <div class="chev"><svg class="ico" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>`;
  }

  function sortedRows() {
    const rows = (lastRows || []).slice();
    if (lbSort === 'official') rows.sort((a, b) => b.official - a.official || a.rank - b.rank);
    else if (lbSort === 'max') rows.sort((a, b) => b.max - a.max || a.rank - b.rank);
    // 'projected' keeps engine order (already projected-desc)
    return rows;
  }

  function renderLb(rows, state) {
    const byName = Object.fromEntries(POOL.entries.map(e => [e.name, e]));
    const cc = crownCounts();
    const display = sortedRows();
    const f = lbFilter.trim().toLowerCase();
    let shown = 0;
    const html = display.map(r => {
      const e = byName[r.name];
      const rankCls = r.rank === 1 ? 'r1' : (r.rank <= 3 ? 'r' + r.rank : '');
      const accentBar = r.rank === 1 ? 'var(--gold)' : (r.rank <= 3 ? 'var(--gold-soft)' : (isYou(r.name) ? 'var(--accent)' : 'var(--line)'));
      const open = openNames.has(r.name);
      const hidden = f && !r.name.toLowerCase().includes(f);
      if (!hidden) shown++;
      // detail built lazily — only when open (perf for 84 rows)
      const detail = open ? detailHtml(r, e, state) : '';
      return `<div class="entry ${isYou(r.name) ? 'you' : ''} ${open ? 'open' : ''}" data-name="${esc(r.name)}" style="--accent-bar:${accentBar}${hidden ? ';display:none' : ''}">
        ${entryHeadHtml(r, e, state, cc)}
        ${detail}
      </div>`;
    }).join('');
    $('lb').innerHTML = html;
    const cnt = $('lbCount');
    if (cnt) cnt.textContent = f ? `Showing ${shown} of ${COUNT}` : `${COUNT} entries`;
  }

  // re-filter without re-rendering (cheap show/hide for the search box)
  function applyLbFilter() {
    const f = lbFilter.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#lb .entry').forEach(row => {
      const n = (row.dataset.name || '').toLowerCase();
      const hide = f && !n.includes(f);
      row.style.display = hide ? 'none' : '';
      if (!hide) shown++;
    });
    const cnt = $('lbCount');
    if (cnt) cnt.textContent = f ? `Showing ${shown} of ${COUNT}` : `${COUNT} entries`;
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

  /* ============================ brackets: consensus board ============================ */
  // tally a getter over entries -> sorted [[team, names[]], ...] desc
  function tallyList(getList) {
    const m = {};
    for (const e of POOL.entries) for (const t of [].concat(getList(e))) (m[t] = m[t] || []).push(e.name);
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }

  // one consensus slot card. rows: sorted [[team,names]]. deadSet optional.
  function consensusSlot(title, entriesArr, state, opts) {
    const o = opts || {};
    const cap = o.cap || 8;
    const totalEntries = COUNT;
    const top = entriesArr.slice(0, cap);
    const others = entriesArr.slice(cap);
    const othersCount = others.reduce((s, [, n]) => s + n.length, 0);
    const maxN = entriesArr.length ? entriesArr[0][1].length : 1;
    const crow = ([team, names]) => {
      const n = names.length;
      const pct = Math.round(n / maxN * 100);
      const lone = n === 1;
      const dead = state && state.eliminated && state.eliminated.has(team);
      return `<div class="crow ${lone ? 'lone' : ''}">
        <div class="lab">
          <span class="nm-line">${flag(team)}<span ${dead ? 'style="text-decoration:line-through;opacity:.7"' : ''}>${esc(team)}</span>${lone ? ' 🐺' : ''}</span>
          <span class="cnt"><b>${n}</b>/${totalEntries}</span>
        </div>
        <div class="track"><i style="width:${Math.max(pct, 4)}%;background:${teamHex(team)}"></i></div>
      </div>`;
    };
    const rows = top.map(crow).join('')
      + (othersCount ? `<div class="crow"><div class="lab"><span class="nm-line"><span style="color:var(--dim)">+ ${others.length} others</span></span><span class="cnt"><b>${othersCount}</b>/${totalEntries}</span></div></div>` : '');
    return `<div class="cb-slot card">
      <h3>${esc(title)}<span class="tag">${entriesArr.length} pick${entriesArr.length === 1 ? '' : 's'}</span></h3>
      ${rows || '<div class="sec-lead">No picks.</div>'}
    </div>`;
  }

  function renderConsensusBoard(state) {
    const slots = [];
    slots.push(consensusSlot('👑 Champion', tallyList(e => e.champion), state));
    slots.push(consensusSlot('🥈 Runner-up', tallyList(e => e.runnerUp), state));
    slots.push(consensusSlot('🚀 Semifinalists (any slot)', tallyList(e => e.sf), state, { cap: 8 }));
    // group winners A..L
    Object.keys(Engine.GROUPS).forEach(g => {
      slots.push(consensusSlot('Group ' + g + ' winner', tallyList(e => e.groups[g][0]), state, { cap: 6 }));
    });
    // thirds (which groups' third-place teams advance)
    slots.push(consensusSlot('3rd-place groups backed', tallyGroups(e => e.thirds), state, { cap: 8, isGroup: true }));
    $('consensusBoard').innerHTML = slots.join('');
  }

  // thirds are group letters, not teams — render with a simple letter chip instead of a flag
  function tallyGroups(getList) {
    const m = {};
    for (const e of POOL.entries) for (const g of [].concat(getList(e))) (m[g] = m[g] || []).push(e.name);
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }

  /* ============================ brackets: pick matrix (small pools only) ============================ */
  function renderMatrix(state) {
    if (!SMALL_POOL) return;
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
    const N = entries.length;

    const rowHtml = (label, cells, consensus, extraCls) =>
      `<tr class="${extraCls || ''}"><th class="rowlab">${label}</th><td class="cons">${consensus}</td>` +
      cells.map((c, i) => `<td class="cell-${c.st}${i === youIdx ? ' youcol' : ''}"${c.title ? ` title="${esc(c.title)}"` : ''}>${c.html}</td>`).join('') + '</tr>';

    const head = `<thead><tr><th class="rowlab">Pick</th><th class="cons">Consensus</th>${entries.map((e, i) =>
      `<th class="${i === youIdx ? 'youcol' : ''}">${esc(firstName(e.name))}</th>`).join('')}</tr></thead>`;

    const rows = [];
    { const vals = entries.map(e => e.champion);
      rows.push(rowHtml('👑 Champion', entries.map(e => ({ st: stChamp(e.champion), html: esc(e.champion) + wolf(e.champion, vals) })), majority(vals), 'grp-start')); }
    { const vals = entries.map(e => e.runnerUp);
      rows.push(rowHtml('🥈 Runner-up', entries.map(e => ({ st: stRunner(e.runnerUp), html: esc(e.runnerUp) + wolf(e.runnerUp, vals) })), majority(vals))); }
    { const cnt = {};
      for (const e of entries) for (const t of e.sf) cnt[t] = (cnt[t] || 0) + 1;
      const sortedAll = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const per = entries.map(e => e.sf.slice().sort((a, b) => (cnt[b] - cnt[a]) || a.localeCompare(b)));
      for (let i = 0; i < 4; i++) {
        const cons = sortedAll[i] ? `${esc(sortedAll[i][0])} ${sortedAll[i][1]}/${N}` : '—';
        rows.push(rowHtml(i === 0 ? '🚀 Semifinalists' : '&nbsp;', per.map(p => {
          const t = p[i];
          return { st: stSf(t), html: esc(t) + (cnt[t] === 1 ? ' 🐺' : '') };
        }), cons, i === 0 ? 'grp-start' : ''));
      }
    }
    { rows.push(rowHtml('🛡️ Reaches QF', entries.map(e => {
        const dead = e.qf.filter(t => elim.has(t) && !k.qf.has(t));
        const banked = e.qf.filter(t => k.qf.has(t)).length;
        const alive = 8 - dead.length;
        const st = dead.length ? 'warn' : (banked === 8 ? 'ok' : 'pend');
        return { st, html: esc(alive + '/8 alive'), title: dead.length ? 'Out: ' + dead.join(', ') : '' };
      }), '—', 'grp-start')); }
    Object.keys(Engine.GROUPS).forEach((g, gi) => {
      const vals = entries.map(e => e.groups[g][0]);
      rows.push(rowHtml('Grp ' + esc(g) + ' winner', entries.map(e => {
        const t = e.groups[g][0];
        return { st: stGw(g, t), html: esc(t) + wolf(t, vals) };
      }), majority(vals), gi === 0 ? 'grp-start' : ''));
    });

    $('matrix').innerHTML = head + '<tbody>' + rows.join('') + '</tbody>';
  }

  function renderBrViewToggle() {
    const tg = $('brViewToggle');
    if (!tg) return;
    if (SMALL_POOL) {
      tg.style.display = '';
      tg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === brView));
      $('consensusBoard').style.display = brView === 'consensus' ? '' : 'none';
      $('matrixWrap').style.display = brView === 'matrix' ? '' : 'none';
    } else {
      tg.style.display = 'none';
      $('consensusBoard').style.display = '';
      $('matrixWrap').style.display = 'none';
    }
  }

  /* ============================ brackets: single player view ============================ */
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
    if (k.champion) finalNote = k.champion === e.champion ? '<span style="color:var(--win);font-weight:700">called it! +50</span>' : '<span style="color:var(--loss);font-weight:700">missed</span>';
    else if (elim.has(e.champion)) finalNote = '<span style="color:var(--loss);font-weight:700">champion out</span>';
    const champDead = elim.has(e.champion), runnerDead = elim.has(e.runnerUp);
    const final = `<div class="picks"><span class="lab">Final:</span> 🏆 <span class="${champDead ? 'chip2 out' : ''}" style="${champDead ? 'color:var(--loss);text-decoration:line-through' : ''}">${teamHtml(e.champion)}</span> over <span style="${runnerDead ? 'color:var(--loss);text-decoration:line-through' : ''}">${teamHtml(e.runnerUp)}</span> · ${finalNote}</div>`;
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
    const opts = POOL.entries.map((e, i) => `<option value="${i}">${esc(cleanName(e.name))}</option>`).join('');
    $('h2hA').innerHTML = opts; $('h2hB').innerHTML = opts;
    $('pvSel').innerHTML = opts;
    const me = POOL.entries.findIndex(e => isYou(e.name));
    $('h2hA').value = me >= 0 ? me : 0;
    $('h2hB').value = me === 0 ? 1 : 0;
    $('pvSel').value = me >= 0 ? me : 0;
    $('h2hA').onchange = $('h2hB').onchange = () => renderH2H(lastGood, lastRows);
    $('pvSel').onchange = () => renderPlayerView(lastGood);
  }

  // filter the player-view <select> via the brSearch box
  function applyBrFilter() {
    const sel = $('pvSel'), f = brFilter.trim().toLowerCase();
    if (!sel) return;
    let firstMatch = -1;
    Array.from(sel.options).forEach((opt, i) => {
      const name = (POOL.entries[+opt.value] || {}).name || opt.textContent;
      const hit = !f || String(name).toLowerCase().includes(f);
      opt.hidden = !hit;
      if (hit && firstMatch < 0) firstMatch = i;
    });
    if (f && firstMatch >= 0 && (sel.options[sel.selectedIndex] || {}).hidden) {
      sel.selectedIndex = firstMatch;
      renderPlayerView(lastGood);
    }
  }

  function renderH2H(state, rows) {
    if (!state || !rows) return;
    const a = POOL.entries[+$('h2hA').value], b = POOL.entries[+$('h2hB').value];
    if (!a || !b) return;
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
        ['Reaches QF', e.qf.map(t => esc(t.split(' ')[0])).join(', ')],
      ];
      return { e, r, fields };
    };
    const ca = col(a), cb = col(b);
    const mkCol = (c, other) => `<div class="h2h-col ${isYou(c.e.name) ? 'you' : ''}">
      <h4>${esc(cleanName(c.e.name))}${isYou(c.e.name) ? '<span class="youtag">YOU</span>' : ''}</h4>
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
      wrap.innerHTML = '<div class="sec-lead">Badges unavailable right now — they land once matchday crowns are decided.</div>';
      zone.style.display = 'none';
      return;
    }
    const cons = [];
    const cards = POOL.entries.map(e => {
      const list = badgesCache[e.name] || [];
      const norm = list.filter(b => b && !b.consolation);
      for (const b of list) if (b && b.consolation) cons.push({ name: e.name, b });
      if (!norm.length) return '';
      return `<div class="badge-card"><h4>${esc(cleanName(e.name))}${isYou(e.name) ? '<span class="youtag">YOU</span>' : ''}</h4>` +
        norm.map(b => `<div class="bdg ${b.accent ? 'accent' : ''}"><span class="roundel">${esc(b.emoji)}</span><span><span class="bl">${esc(b.label)}</span><br><span class="bd">${esc(b.desc)}</span></span></div>`).join('') +
        '</div>';
    }).join('');
    wrap.innerHTML = cards || '<div class="sec-lead">No badges earned yet — first crowns land 18 Jun.</div>';
    if (cons.length) {
      zone.style.display = '';
      $('badgesConsList').innerHTML = cons.map(({ name, b }) =>
        `<div class="bdg"><span class="roundel">${esc(b.emoji)}</span><span><span class="bl">${esc(b.label)}</span> — ${esc(firstName(name))}<br><span class="bd">${esc(b.desc)}</span></span></div>`).join('');
    } else zone.style.display = 'none';
  }

  /* ============================ insights: consensus columns ============================ */
  function renderConsensus(state) {
    const N = POOL.entries.length;
    const bar = (entries, showNames, limit) => entries.slice(0, limit || entries.length).map(([team, names]) => {
      const pct = Math.round(names.length / N * 100);
      const dead = state.eliminated.has(team);
      return `<div class="crow">
        <div class="lab"><span class="nm-line">${flag(team)}<span ${dead ? 'style="text-decoration:line-through;opacity:.7"' : ''}>${esc(team)}</span></span><span class="cnt"><b>${names.length}</b>/${N}</span></div>
        <div class="track"><i style="width:${Math.max(pct, 4)}%;background:${teamHex(team)}"></i></div>
      </div>`;
    }).join('');
    $('consChampion').innerHTML = bar(tallyList(e => e.champion), true, 8);
    $('consRunner').innerHTML = bar(tallyList(e => e.runnerUp), true, 8);
    $('consSemis').innerHTML = bar(tallyList(e => e.sf), false, 8);
    const bold = tallyList(e => e.sf).filter(([, names]) => names.length === 1)
      .slice(0, 10)
      .map(([team, names]) => `<div class="crow lone"><div class="lab"><span class="nm-line">${flag(team)}<span>${esc(team)}</span> 🐺</span><span class="cnt">only ${esc(firstName(names[0]))}</span></div></div>`).join('')
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
    $('similar').innerHTML = pairs.slice(0, 6).map(p => {
      const pct = Math.round(p.s * 100);
      return `<div class="sim-row"><span class="names">${esc(firstName(p.a))} × ${esc(firstName(p.b))}</span><span class="sim-bar"><i style="width:${pct}%"></i></span><span class="pct num">${pct}%</span></div>`;
    }).join('') || '<div class="sec-lead">Not enough entries to compare.</div>';
  }

  /* ============================ digest + WhatsApp recap ============================ */
  function digest(rows, state) {
    const today = state.matches.filter(m => m.completed && m.home && Date.now() - new Date(m.date) < 1.3 * 86400e3)
      .map(m => `${m.home} ${m.hs}-${m.as} ${m.away}`);
    const d = new Date();
    const sim = simCache.sim;
    const cr = currentCrown();
    const top = rows.slice(0, Math.min(rows.length, COUNT > 12 ? 10 : rows.length));
    return [
      `⚽ *FIFA Prediction Pro — ${POOL.poolName}* (${d.toLocaleDateString([], { day: 'numeric', month: 'short' })})`, '',
      ...top.map(r => {
        const wp = (sim && sim.winProb && typeof sim.winProb[r.name] === 'number' && sim.winProb[r.name] * 100 >= 0.05) ? ` · ${(sim.winProb[r.name] * 100).toFixed(1)}%` : '';
        return `${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank + '.'} ${cleanName(r.name)} — *${r.projected}*${wp} (max ${r.max})${r.championAlive ? '' : ' 👑❌'}`;
      }),
      COUNT > top.length ? `…and ${COUNT - top.length} more in the field` : '', '',
      cr ? `👑 ${cr.round}${cr.done ? ' crown' : ' (live)'}: ${cr.winners.map(firstName).join(' & ')} — ${cr.pts} pts` : '',
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
    b.innerHTML = esc(msg); setTimeout(() => { b.innerHTML = o; }, 1800);
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
    // broadcast canvas: near-black with gold spine
    const canvas = '#0A0E14', gold = '#E8B73A', cream = '#F2F5F9', accent = '#1FA2FF';
    ctx.fillStyle = canvas; ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = gold; ctx.fillRect(0, 0, 1080, 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = gold; ctx.font = '800 58px system-ui, sans-serif';
    ctx.fillText('FIFA PREDICTION PRO', 540, 148);
    ctx.fillStyle = cream; ctx.font = '700 42px system-ui, sans-serif';
    ctx.fillText(trimTo(ctx, POOL.poolName, 920), 540, 222);
    ctx.fillStyle = 'rgba(174,185,199,0.85)'; ctx.font = '500 30px system-ui, sans-serif';
    ctx.fillText(new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' · projected standings · ' + COUNT + ' entries', 540, 272);
    const sim = simCache.sim;
    const top = rows.slice(0, 5);
    const y0 = 335, rh = 140, gap = 22;
    top.forEach((r, i) => {
      const y = y0 + i * (rh + gap);
      ctx.fillStyle = i === 0 ? 'rgba(232,183,58,0.16)' : 'rgba(255,255,255,0.06)';
      rrect(ctx, 80, y, 920, rh, 20); ctx.fill();
      if (i === 0) { ctx.strokeStyle = 'rgba(232,183,58,0.7)'; ctx.lineWidth = 3; rrect(ctx, 80, y, 920, rh, 20); ctx.stroke(); }
      ctx.textAlign = 'left';
      ctx.font = '400 54px system-ui, sans-serif'; ctx.fillStyle = cream;
      ctx.fillText(['🥇', '🥈', '🥉', '4.', '5.'][i], 110, y + 88);
      ctx.font = '600 42px system-ui, sans-serif'; ctx.fillStyle = cream;
      ctx.fillText(trimTo(ctx, cleanName(r.name), 520), 210, y + 70);
      ctx.font = '400 27px system-ui, sans-serif'; ctx.fillStyle = 'rgba(174,185,199,0.8)';
      ctx.fillText(trimTo(ctx, '👑 ' + r.champion + (r.championAlive ? '' : ' (out)'), 520), 212, y + 112);
      ctx.textAlign = 'right';
      ctx.font = '800 56px system-ui, sans-serif'; ctx.fillStyle = gold;
      ctx.fillText(String(r.projected), 970, y + 76);
      let wl = 'pts';
      if (sim && sim.winProb && typeof sim.winProb[r.name] === 'number' && sim.winProb[r.name] * 100 >= 0.05) wl = (sim.winProb[r.name] * 100).toFixed(1) + '% win';
      ctx.font = '500 26px system-ui, sans-serif'; ctx.fillStyle = 'rgba(174,185,199,0.8)';
      ctx.fillText(wl, 970, y + 114);
    });
    const cr = currentCrown();
    ctx.textAlign = 'center';
    ctx.font = '600 32px system-ui, sans-serif'; ctx.fillStyle = '#F4D27A';
    const crTxt = cr
      ? '👑 ' + cr.round + (cr.done ? ' crown: ' : ' leader: ') + cr.winners.map(firstName).join(' & ') + ' (' + cr.pts + ' pts)'
      : 'Group stage in progress — first crown decided 18 Jun';
    ctx.fillText(trimTo(ctx, crTxt, 940), 540, 1218);
    ctx.font = '500 26px system-ui, sans-serif'; ctx.fillStyle = 'rgba(174,185,199,0.7)';
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
      tickScan(); // sim just landed → win% / projected may have moved
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
    renderConsensusBoard(state);
    renderMatrix(state);
    renderBrViewToggle();
    renderPlayerView(state);
    renderH2H(state, rows);
    renderBadges();
    renderConsensus(state);
    tickScan(); // animate any numerals that changed since the last render
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
      $('updated').textContent = '✓ ' + new Date().toLocaleTimeString() + ' · ' + source;
      $('countdown').style.display = '';
      scheduleSim();
    } catch (e) {
      $('err').textContent = 'Could not reach the live results feed (' + e.message + '). ' + (lastGood ? 'Showing last good data.' : 'Retrying shortly.');
      $('err').style.display = 'block';
    } finally { inFlight = false; secs = 60; }
  }

  /* ============================ delegated event handlers (bound once) ============================ */
  // leaderboard: expand/collapse a row, build detail lazily on first open
  $('lb').addEventListener('click', e => {
    const head = e.target.closest('.entry-head'); if (!head) return;
    const box = head.parentElement, n = box.dataset.name;
    const nowOpen = !box.classList.contains('open');
    box.classList.toggle('open', nowOpen);
    if (nowOpen) {
      openNames.add(n);
      if (!box.querySelector('.detail') && lastGood && lastRows) {
        const r = lastRows.find(x => x.name === n);
        const ent = POOL.entries.find(x => x.name === n);
        if (r && ent) box.insertAdjacentHTML('beforeend', detailHtml(r, ent, lastGood));
      }
    } else openNames.delete(n);
  });

  // leaderboard search
  const lbSearchEl = $('lbSearch');
  if (lbSearchEl) lbSearchEl.addEventListener('input', () => { lbFilter = lbSearchEl.value; applyLbFilter(); });

  // leaderboard sort
  const lbSortEl = $('lbSort');
  if (lbSortEl) lbSortEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    lbSort = b.dataset.sort || 'projected';
    lbSortEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    if (lastRows && lastGood) { renderLb(lastRows, lastGood); applyLbFilter(); }
  });

  // jump to me
  const jumpBtn = $('lbJumpMe');
  if (jumpBtn) {
    if (!youName) jumpBtn.style.display = 'none';
    jumpBtn.addEventListener('click', () => {
      const row = document.querySelector('#lb .entry.you');
      if (!row) return;
      row.style.display = '';
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('flash');
      setTimeout(() => row.classList.remove('flash'), 900);
    });
  }

  // brackets view toggle (small pools)
  const brToggleEl = $('brViewToggle');
  if (brToggleEl) brToggleEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    brView = b.dataset.view || 'consensus';
    renderBrViewToggle();
  });

  // bracket player search
  const brSearchEl = $('brSearch');
  if (brSearchEl) brSearchEl.addEventListener('input', () => { brFilter = brSearchEl.value; applyBrFilter(); });

  // matches round filter
  $('roundbar').addEventListener('click', e => {
    const c = e.target.closest('.rchip'); if (!c || !lastGood) return;
    activeRound = c.dataset.r;
    renderRoundbar(lastGood);
    renderMatches(lastGood);
  });

  // match stakes toggle
  $('matchwrap').addEventListener('click', e => {
    const b = e.target.closest('.stakes-toggle'); if (!b || !lastGood) return;
    const card = b.closest('.match'); if (!card) return;
    const mi = +card.dataset.mi;
    const m = lastGood.matches[mi]; if (!m) return;
    const key = matchKey(m);
    const open = !openStakes.has(key);
    if (open) openStakes.add(key); else openStakes.delete(key);
    card.classList.toggle('stk-open', open);
    const body = card.querySelector('.stakes-body');
    if (open && body && !body.innerHTML) body.innerHTML = stakesBodyHtml(lastGood, m);
  });

  $('refreshBtn').onclick = refresh;
  $('digestBtn').onclick = copyDigest;
  $('recapBtn').onclick = shareRecap;
  $('homeRecapBtn').onclick = shareRecap;

  /* ============================ init ============================ */
  renderPoolSwitch();
  renderIdentity();
  fillPickers();
  renderSimilar();
  // place the tab indicator under the initially-active tab
  moveTabInd(document.querySelector('.tab.active'));
  window.addEventListener('resize', () => moveTabInd(document.querySelector('.tab.active')));
  setInterval(() => {
    secs--;
    const cd = $('countdown');
    if (cd) { cd.textContent = '↻ ' + Math.max(secs, 0) + 's'; tickIf('countdown', cd); }
    if (secs <= 0) refresh();
  }, 1000);
  refresh();
})();
