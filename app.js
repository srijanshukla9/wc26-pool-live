/* FIFA Prediction Pro — app.js  (THE COCKPIT, BLUEPRINT §3/§7/§8/§9/§11)

   Single glanceable broadcast screen wired to the recalibrated engine:
   ONE canonical Points number (Engine.leaderboard rows = {name,rank,champion,
   runnerUp,points,secured,max,breakdown:{groups,thirdPlace,knockouts,champion},
   championAlive}); everything else lives in slide-up drawers.

   Load order (index.html): data.js, engine.js, ratings.js, viz.js, players.js,
   mc.js, charts.js, narrative.js, cards.js, app.js. Every NEW module (CARDS,
   CHARTS, NARRATIVE, PLAYERS/TEAM_META) is guarded so the page degrades if any
   is missing or throws. Frozen engine/mc/ratings/viz math is untouched; the only
   feed extension (goals/venue for Zone-2 analysis) reads the kept raw ESPN json
   directly — parseEspn / scoring stay frozen.

   Discipline: esc() all dynamic strings (84 stranger names); logos via allowlist;
   no :has(); no top-level await; inFlight+finally; rebind handlers cleanly; MC +
   narrative run after first paint. */
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
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // ESPN crest allowlist (img) else flag emoji — used for the small score-bug crest
  const crest = t => {
    const url = LOGOS[t];
    if (url && /^https:\/\/a\.espncdn\.com\/[\w./-]+$/.test(url)) return `<img class="crest" src="${esc(url)}" alt="" loading="lazy">`;
    return `<span class="crest-e">${FLAGS[t] || '🏳️'}</span>`;
  };
  const flagSpan = t => {
    const url = LOGOS[t];
    if (url && /^https:\/\/a\.espncdn\.com\/[\w./-]+$/.test(url)) return `<img class="fl" src="${esc(url)}" alt="" loading="lazy">`;
    return `<span class="fl-e">${FLAGS[t] || '🏳️'}</span>`;
  };
  const teamHtml = t => `${flagSpan(t)} ${esc(t)}`;
  const $ = id => document.getElementById(id);

  /* viz.js — optional, degrade to flags/initials */
  const hasViz = (() => { try { return typeof VIZ !== 'undefined' && !!VIZ; } catch (e) { return false; } })();
  const avatar = (n, s, o) => hasViz ? VIZ.avatar(n, s, o) : `<span class="ava" style="width:${s}px;height:${s}px">${esc((String(n)[0] || '?').toUpperCase())}</span>`;
  const teamHex = t => { if (hasViz) { try { return VIZ.teamColor(t); } catch (e) {} } return 'var(--accent)'; };

  /* new modules — guarded */
  const hasCards = () => { try { return typeof CARDS !== 'undefined' && !!CARDS; } catch (e) { return false; } };
  const hasCharts = () => { try { return typeof CHARTS !== 'undefined' && !!CHARTS; } catch (e) { return false; } };
  const hasNarr = () => { try { return typeof NARRATIVE !== 'undefined' && !!NARRATIVE; } catch (e) { return false; } };
  const PLAYERS_MAP = (() => { try { return (typeof PLAYERS !== 'undefined' && PLAYERS) || {}; } catch (e) { return {}; } })();

  const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200';
  const FIFA_URL = 'https://api.fifa.com/api/v3/calendar/matches?idSeason=285023&idCompetition=17&language=en&count=200';
  const ROUND_LABELS = { group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarterfinals', sf: 'Semifinals', third: '3rd-Place', final: 'Final' };
  const ROUND_SHORT  = { group: 'group stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'quarterfinal', sf: 'semifinal', third: '3rd-place', final: 'final' };

  const YOU_RE = /TARS/;
  const isYou = n => YOU_RE.test(String(n));
  const cleanName = n => String(n).replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim() || String(n);
  const firstName = n => isYou(n) ? 'You' : (cleanName(n).split(/\s+/)[0] || String(n));
  const fmtSigned = d => (d > 0 ? '+' : '') + d;
  const fmtTime = d => new Date(d).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtClock = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const pctLabel = p => { const v = p * 100; return v >= 9.95 ? Math.round(v) + '%' : v.toFixed(1) + '%'; };

  const COUNT = POOL.entries.length;
  const POOL_KEY = POOL.key;
  const BIG_POOL = COUNT > 12;
  const SMALL_POOL = COUNT <= 12;
  const youEntry = POOL.entries.find(e => isYou(e.name)) || null;
  const youName = youEntry ? youEntry.name : null;

  /* ============================ number-tick animation ============================ */
  const REDUCE_MOTION = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  let tickPrev = Object.create(null);
  function fireTick(el) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
  function tickIf(key, el) {
    if (!el) return;
    const val = el.textContent;
    const had = Object.prototype.hasOwnProperty.call(tickPrev, key);
    const prev = tickPrev[key];
    tickPrev[key] = val;
    if (REDUCE_MOTION) return;
    if (!had || prev === val) return;
    fireTick(el);
  }
  function tickScan() {
    tickIf('hero:pts', document.querySelector('#heroTile .fc-overall__pts'));
    tickIf('hero:win', document.querySelector('#heroTile .hero-gauge .v'));
    tickIf('you:rank', document.querySelector('#youTile .you-rankrow .big'));
    document.querySelectorAll('#youTile .you-cell2 .v').forEach((v, i) => tickIf('you:c' + i, v));
    document.querySelectorAll('#lb .card-row').forEach(row => {
      const n = row.dataset.name; if (n == null) return;
      tickIf('pts:' + n, row.querySelector('.cr-pts'));
    });
    document.querySelectorAll('.match').forEach(card => {
      const mi = card.dataset.mi; if (mi == null) return;
      card.querySelectorAll('.sb-score .n').forEach((n, i) => tickIf('sb:' + mi + ':' + i, n));
    });
    tickIf('countdown', $('countdown'));
  }

  /* MC / RATINGS guards */
  const hasMC = () => { try { return typeof MC !== 'undefined' && !!MC; } catch (e) { return false; } };
  const hasRatings = () => { try { return typeof RATINGS !== 'undefined' && !!RATINGS; } catch (e) { return false; } };
  function mcTry(fn, fallback) { if (!hasMC()) return fallback; try { return fn(); } catch (e) { return fallback; } }

  /* ============================ state ============================ */
  let lastGood = null, lastRows = null, lastRaw = null, lastSource = '';
  let prevRanks = null, prevPoints = null, prevMax = null;
  let openStakes = new Set(), activeRound = 'all', scOpen = false;
  let secs = 60, inFlight = false;
  let topology = null, currentHash = null;
  let simCache = { hash: null, sim: null }, prevSim = null;
  let crownsCache = null, badgesCache = null;
  let rooting = { hash: null, items: [], done: false };
  let lbSort = 'points', lbFilter = '';
  let fbSort = 'points', fbFilter = '';
  let brView = 'consensus', brFilter = '';
  let momentumName = null;
  let rankHistory = [];
  let beatsCache = [], surfaceCache = { headline: null, feed: [] }, rivalriesCache = [];
  let drawersBuilt = { matches: false, board: false, brackets: false, titlerace: false, more: false };

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

  /* ============================ rank-history ring buffer ============================ */
  const RANKHIST_KEY = 'wc26-rankhist-' + POOL_KEY;
  const RANKHIST_CAP = 24;
  function loadRankHistory() {
    try {
      const raw = localStorage.getItem(RANKHIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(x => x && x.ranks) : [];
    } catch (e) { return []; }
  }
  function pushRankHistory(hash, rows) {
    if (!rows || !rows.length) return;
    const ranks = {};
    for (const r of rows) ranks[r.name] = r.rank;
    if (rankHistory.length && rankHistory[rankHistory.length - 1].hash === hash) {
      rankHistory[rankHistory.length - 1] = { hash, ts: Date.now(), ranks };
    } else {
      rankHistory.push({ hash, ts: Date.now(), ranks });
      if (rankHistory.length > RANKHIST_CAP) rankHistory = rankHistory.slice(-RANKHIST_CAP);
    }
    try { localStorage.setItem(RANKHIST_KEY, JSON.stringify(rankHistory)); } catch (e) {}
  }

  /* ============================ theme ============================ */
  const themeBtn = $('themeBtn');
  const SUN = 'M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 100 8 4 4 0 000-8z';
  const MOON = 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z';
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const ic = $('themeIcon'); if (ic) ic.innerHTML = `<path d="${t === 'dark' ? SUN : MOON}"/>`;
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
    if (!POOLS[key] || key === POOL_KEY) return;
    try { location.hash = '#pool=' + key; } catch (e) {}
    location.reload();
  }
  function renderPoolSwitch() {
    const sw = $('poolSwitch'), sel = $('poolSelect');
    if (sw) {
      sw.innerHTML = POOL_ORDER.map(key => {
        const p = POOLS[key]; if (!p) return '';
        const active = key === POOL_KEY;
        return `<button class="pool-seg ${active ? 'active' : ''}" data-pool="${esc(key)}" role="tab" aria-selected="${active}" type="button">${esc(p.short)} <span class="cnt">${p.count}</span></button>`;
      }).join('');
      sw.addEventListener('click', e => { const b = e.target.closest('.pool-seg'); if (b) switchPool(b.dataset.pool); });
    }
    if (sel) {
      sel.innerHTML = POOL_ORDER.map(key => {
        const p = POOLS[key]; if (!p) return '';
        return `<option value="${esc(key)}" ${key === POOL_KEY ? 'selected' : ''}>${esc(p.short)} (${p.count})</option>`;
      }).join('');
      sel.value = POOL_KEY;
      sel.onchange = () => switchPool(sel.value);
    }
  }
  function renderIdentity() {
    const lab = $('standGlanceLab'); if (lab) lab.textContent = '· ' + POOL.poolName;
    const vac = $('viewAllCount'); if (vac) vac.textContent = String(COUNT);
    const bsub = $('dockBoardSub'); if (bsub) bsub.textContent = 'All ' + COUNT + ' entries';
  }

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

  /* ============================ extended ESPN read (goals/venue) — BEHIND A FLAG ============================
     The blueprint's Zone-2 analysis wants goals/venue. parseEspn (the scoring path) stays FROZEN;
     we read those fields straight off the kept raw ESPN json into a lookup keyed by matchKey. Never
     feeds scoring — purely cosmetic. Crashes here can never break the page (try/catch + best-effort). */
  let espnDetailMap = {};
  function buildEspnDetailMap(raw) {
    espnDetailMap = {};
    if (!raw || !raw.events || !Engine || !Engine.ESPN_TO_POOL) return;
    const norm = name => {
      if (!name) return null;
      const map = Engine.ESPN_TO_POOL || {};
      return map[name] || name;
    };
    try {
      for (const ev of raw.events) {
        const comp = (ev.competitions && ev.competitions[0]) || {};
        const comps = comp.competitors || [];
        if (comps.length !== 2) continue;
        const hC = comps.find(c => c.homeAway === 'home') || comps[0];
        const aC = comps.find(c => c.homeAway === 'away') || comps[1];
        const home = norm(hC.team && hC.team.displayName);
        const away = norm(aC.team && aC.team.displayName);
        if (!home || !away) continue;
        // goals from competitions[0].details[] (type kicks with scoringPlay)
        const goals = [];
        for (const d of (comp.details || [])) {
          if (!d || !d.scoringPlay) continue;
          const athlete = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || '';
          const clock = (d.clock && d.clock.displayValue) || '';
          goals.push({ who: athlete, clock });
        }
        const venue = (comp.venue && comp.venue.fullName) || '';
        const headline = (ev.competitions && ev.competitions[0] && ev.competitions[0].headlines &&
          ev.competitions[0].headlines[0] && (ev.competitions[0].headlines[0].shortLinkText || ev.competitions[0].headlines[0].description)) || '';
        // key by both round-agnostic team pair (good enough — Zone 2 keys by matchKey too)
        const rk = roundKeyFromSlug((ev.season && ev.season.slug) || '');
        espnDetailMap[rk + '|' + home + '|' + away] = { goals, venue, headline };
      }
    } catch (e) { espnDetailMap = {}; }
  }
  function roundKeyFromSlug(slug) {
    const s = String(slug || '').toLowerCase();
    if (s.indexOf('round-of-32') >= 0) return 'r32';
    if (s.indexOf('round-of-16') >= 0) return 'r16';
    if (s.indexOf('quarter') >= 0) return 'qf';
    if (s.indexOf('semi') >= 0) return 'sf';
    if (s.indexOf('third') >= 0 || s.indexOf('3rd') >= 0) return 'third';
    if (s.indexOf('final') >= 0) return 'final';
    return 'group';
  }
  function detailFor(m) { return espnDetailMap[matchKey(m)] || null; }

  /* ============================ MC: crowns helpers ============================ */
  function currentCrown() {
    if (!crownsCache || !crownsCache.length) return null;
    let pick = null;
    for (const c of crownsCache) if (c && c.winners && c.winners.length) pick = c;
    return pick;
  }
  function crownCounts() {
    const map = {};
    for (const c of (crownsCache || [])) if (c && c.done && c.winners) for (const w of c.winners) map[w] = (map[w] || 0) + 1;
    return map;
  }
  function winProbOf(name) {
    const sim = simCache.sim;
    return (sim && sim.winProb && typeof sim.winProb[name] === 'number') ? sim.winProb[name] : null;
  }
  function titleFavourite() {
    const sim = simCache.sim;
    if (!sim || !sim.winProb) return null;
    let bestName = null, best = -1;
    for (const e of POOL.entries) {
      const v = sim.winProb[e.name];
      if (typeof v === 'number' && v > best) { best = v; bestName = e.name; }
    }
    return bestName != null ? { name: bestName, winProb: best } : null;
  }

  /* ============================ crests map for CARDS (ESPN-harvested, allowlisted) ============================ */
  function crestsForCards() {
    const out = {};
    for (const t in LOGOS) {
      const u = LOGOS[t];
      if (u && /^https:\/\/a\.espncdn\.com\/[\w./-]+$/.test(u)) out[t] = u;
    }
    return out;
  }

  /* ============================ NARRATIVE pipeline ============================ */
  function runNarrative() {
    if (!hasNarr() || !lastRows || !lastGood) { beatsCache = []; surfaceCache = { headline: null, feed: [] }; rivalriesCache = []; return; }
    const ctx = {
      rows: lastRows, prevRanks, prevPoints, prevMax, rankHistory,
      state: lastGood, sim: simCache.sim, prevSim,
      crowns: crownsCache || [], entries: POOL.entries,
      poolName: POOL.poolName, youName, count: COUNT,
      rivals: (POOL.rivals || []),
    };
    try { beatsCache = NARRATIVE.detect(ctx) || []; } catch (e) { beatsCache = []; }
    try { surfaceCache = NARRATIVE.surface(beatsCache, { youName, leaderName: lastRows[0] && lastRows[0].name }) || { headline: null, feed: [] }; } catch (e) { surfaceCache = { headline: null, feed: [] }; }
    try { rivalriesCache = NARRATIVE.rivalries(ctx) || []; } catch (e) { rivalriesCache = []; }
  }

  /* ============================ ZONE 0 — STORY BAR ============================ */
  function renderTodayStory(state, rows) {
    const el = $('todayStory'); if (!el) return;
    const dot = $('z0dot');
    const liveMatches = state.matches.filter(m => m.state === 'in' && m.home && m.away);
    if (dot) dot.style.display = liveMatches.length ? '' : 'none';

    if (liveMatches.length) {
      const m = liveMatches[0];
      const sc = (!isNaN(m.hs)) ? `<span class="accent">${m.hs}–${m.as}</span>` : 'underway';
      el.innerHTML = `<b>LIVE</b> — ${esc(m.home)} ${sc} ${esc(m.away)}${liveMatches.length > 1 ? ` and ${liveMatches.length - 1} more in play` : ''}.`;
      return;
    }
    // narrative headline owns the day when present
    if (surfaceCache.headline && surfaceCache.headline.html) {
      el.innerHTML = surfaceCache.headline.html;
      return;
    }
    const cr = currentCrown();
    const today = state.matches.filter(m => m.completed && m.home && Date.now() - new Date(m.date) < 1.1 * 86400e3);
    const leader = rows[0];
    let html;
    if (cr && cr.done && cr.winners && cr.winners.length) {
      html = `<b>${esc(cr.winners.map(firstName).join(' & '))}</b> took the <b>${esc(ROUND_SHORT[cr.round] || cr.round)}</b> crown — <span class="accent">${cr.pts} pts</span> banked in the window.`;
    } else if (leader) {
      const gap = rows[1] ? leader.points - rows[1].points : 0;
      html = `<b>${esc(firstName(leader.name))}</b> tops ${esc(POOL.poolName)} with <span class="accent">${leader.points}</span> points${gap > 0 && rows[1] ? `, ${gap} clear of ${esc(firstName(rows[1].name))}` : ''}.`;
    } else {
      html = `${esc(POOL.poolName)} is locked and live — standings update with every goal.`;
    }
    if (today.length && !(cr && cr.done)) html += ` <span style="opacity:.85">${today.length} match${today.length === 1 ? '' : 'es'} settled today.</span>`;
    el.innerHTML = html;
  }

  /* ============================ ZONE 1 — HERO (leader CARDS.fullCard + meta) ============================ */
  function renderHero(state, rows) {
    const el = $('heroTile'); if (!el) return;
    const leader = rows[0];
    if (!leader) { el.innerHTML = '<div class="skeleton">No standings yet.</div>'; return; }
    const ent = POOL.entries.find(e => e.name === leader.name) || {};
    const fav = titleFavourite();
    const sims = (simCache.sim && simCache.sim.sims) ? simCache.sim.sims : null;
    const split = !!(fav && fav.name !== leader.name);

    // the WIN% gauge tracks "who is most likely to win it" — the favourite's odds when known
    const gaugeWp = fav ? fav.winProb : winProbOf(leader.name);
    const gaugeVal = gaugeWp != null ? pctLabel(gaugeWp) : '—';
    const gaugeW = gaugeWp != null ? Math.min(100, Math.max(1.5, gaugeWp * 100)) : 0;
    const gaugeLab = split
      ? `Title favourite · ${esc(firstName(fav.name))}${sims ? ' · ' + sims + ' sims' : ''}`
      : `Title odds${sims ? ' · ' + sims + ' sims' : ''}`;

    // THE WHY
    let why;
    const prevR = prevRanks ? prevRanks[leader.name] : null;
    const margin = rows[1] ? leader.points - rows[1].points : null;
    if (prevR && prevR > leader.rank) why = `Took the lead this matchday — up ${prevR - leader.rank} from #${prevR}.`;
    else if (margin === 0 && rows[1]) why = `Tied at the top — separated only by secured points.`;
    else if (rows[1]) why = `Holding #1 by ${margin} over ${esc(firstName(rows[1].name))}.`;
    else why = `Out in front of the field.`;
    if (split) why += ` <span class="fav">Simulator favours ${esc(firstName(fav.name))}.</span>`;

    const champDead = !leader.championAlive;
    const champLine = `Backing ${champDead ? `<span class="dead">${teamHtml(leader.champion)}</span> <span class="outtag">OUT</span>` : teamHtml(leader.champion)} to win it all`;

    const sideHero = (PLAYERS_MAP[leader.champion] || {}).star ? `Headline bet: ${esc((PLAYERS_MAP[leader.champion] || {}).star)} (${esc(leader.champion)})` : '';

    // HERO CARD via CARDS.fullCard (champion-star treatment); fall back to gauge-only chrome
    let cardHtml = '';
    if (hasCards()) {
      cardHtml = CARDS.fullCard(leader, ent, {
        pool: POOL_KEY, you: isYou(leader.name), leaderPoints: leader.points, poolSize: COUNT,
        crests: crestsForCards(), delta: prevR ? prevR - leader.rank : 0,
        narrative: narrativeForEntry(leader.name),
        id: 'hero-' + slugId(leader.name),
      });
    }

    el.style.setProperty('--team', teamHex(leader.champion));
    el.innerHTML = `
      <div class="hero-grid">
        <div class="hero-cardwrap" id="heroCardWrap">${cardHtml || `<div class="skeleton">…</div>`}</div>
        <div class="hero-meta">
          <div class="kicker"><svg class="ico" viewBox="0 0 24 24" style="width:13px;height:13px;color:var(--gold)"><path d="M3 8l3.5 9h11L21 8l-5 4-4-7-4 7z"/></svg> Pool leader · ${esc(POOL.poolName)}</div>
          <div class="hero-id">
            <div class="nm">${esc(cleanName(leader.name))}${isYou(leader.name) ? '<span class="youtag">YOU</span>' : ''}</div>
          </div>
          <div class="hero-caption"><b>${leader.secured}</b> secured · <b>${leader.max}</b> ceiling · 470 max</div>
          <div class="hero-gauge">
            <div class="glab"><span class="l">${esc(gaugeLab)}</span><span class="v num">${esc(gaugeVal)}</span></div>
            <div class="track"><i style="width:${gaugeW}%"></i></div>
          </div>
          <div class="hero-pick">${champLine}</div>
          <div class="hero-why">${why}${sideHero ? `<br><span style="color:var(--dim)">${sideHero}</span>` : ''}</div>
        </div>
      </div>`;
    // wire the hero card's holo/flip
    if (hasCards()) { try { CARDS.initHolo($('heroCardWrap')); } catch (e) {} }
  }

  // small id stem (mirrors cards.js slug for stable hero id)
  function slugId(s) { let h = 0; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  // narrative payload for a single card back-face: pull the entry's beats + a streak hint
  function narrativeForEntry(name) {
    const lines = [];
    for (const b of beatsCache) {
      if (b.subjects && b.subjects.includes(name)) lines.push(stripTags(b.html));
      if (lines.length >= 3) break;
    }
    return { lines: lines.length ? lines : null };
  }
  function stripTags(html) { return String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }

  /* ============================ ZONE 1 — YOU tile + MOVE OF THE DAY ============================ */
  function renderYou(state, rows) {
    const el = $('youTile'); if (!el) return;
    const you = rows.find(r => isYou(r.name));
    const zone1 = $('zone1'), side = $('z1side');
    if (!you) {
      el.style.display = 'none';
      // hide the YOU tile but keep the move tile in the side rail
      return;
    }
    el.style.display = '';
    const wp = winProbOf(you.name);
    const winTxt = wp != null ? pctLabel(wp) : '—';
    const leader = rows[0];
    const gapTop = leader && leader.name !== you.name ? leader.points - you.points : 0;
    const above = rows.find(r => r.rank === you.rank - 1);
    const gapNext = above ? above.points - you.points : 0;
    let mv = '<span class="mv zero">–</span>';
    const prevR = prevRanks ? prevRanks[you.name] : null;
    if (prevR && prevR !== you.rank) mv = prevR > you.rank ? `<span class="mv up">▲${prevR - you.rank}</span>` : `<span class="mv dn">▼${you.rank - prevR}</span>`;
    const champDead = !you.championAlive;
    const champState = champDead ? '<span class="outtag">OUT −50</span>' : '<span class="alivetag">alive</span>';
    const champName = champDead ? `<span class="dead">${teamHtml(you.champion)}</span>` : teamHtml(you.champion);
    const nextCell = you.rank === 1
      ? `<div class="you-cell2"><div class="v win num">—</div><div class="l">Gap to next</div></div>`
      : `<div class="you-cell2"><div class="v acc num">+${gapNext}</div><div class="l">Gap to #${above ? above.rank : you.rank - 1}</div></div>`;

    el.innerHTML = `
      <div class="kicker">You · #${you.rank} of ${COUNT}</div>
      <div class="you-rankrow"><span class="big num">${you.rank}</span><span class="ofn">of ${COUNT}</span>${mv}</div>
      <div class="you-grid">
        <div class="you-cell2"><div class="v win num">${you.points}</div><div class="l">Points</div></div>
        <div class="you-cell2"><div class="v acc num">${esc(winTxt)}</div><div class="l">Title odds</div></div>
        ${nextCell}
      </div>
      <div class="you-champ">Champion: ${champName} ${champState}
        ${you.rank > 1 ? `<span style="margin-left:auto;color:var(--dim);font-weight:600">−${gapTop} to leader</span>` : ''}
      </div>
      <button class="you-sc-btn" type="button">
        <svg class="ico" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M9 5h6M9 9h6M9 13h4M5 3h11l3 3v15H5z"/></svg>
        Scorecard <span class="you-sc-hint">every point traced</span>
      </button>`;
  }

  function biggestMover(rows) {
    if (!prevRanks) return null;
    let up = null, dn = null;
    for (const r of rows) {
      const p = prevRanks[r.name]; if (!p || p === r.rank) continue;
      if (p > r.rank) { const d = p - r.rank; if (!up || d > up.d) up = { name: r.name, d, dir: 'up', rank: r.rank }; }
      else { const d = r.rank - p; if (!dn || d > dn.d) dn = { name: r.name, d, dir: 'dn', rank: r.rank }; }
    }
    if (up && dn) return up.d >= dn.d ? up : dn;
    return up || dn;
  }

  function renderMove(state, rows) {
    const el = $('moveTile'); if (!el) return;
    const mover = biggestMover(rows);
    // prefer a narrative "move of the day" beat (it carries the WHY)
    const moveBeat = beatsCache.find(b => b.kind === 'biggest-mover-up') || beatsCache.find(b => b.kind === 'overtake') || beatsCache.find(b => b.kind === 'leader-change');
    if (!mover && !moveBeat) {
      el.className = 'move-tile steady'; delete el.dataset.name;
      el.innerHTML = `<div class="mk">Move of the day</div><div class="msub">Quiet matchday — standings held.</div>`;
      return;
    }
    if (mover) {
      const glyph = mover.dir === 'up' ? '▲' : '▼';
      const cls = mover.dir === 'up' ? 'up' : 'dn';
      const bar = mover.dir === 'up' ? 'var(--win)' : 'var(--loss)';
      const sub = moveBeat ? moveBeat.html : `Moved ${glyph}${mover.d} to #${mover.rank} this matchday. <b>Tap to find in standings.</b>`;
      el.className = 'move-tile';
      el.style.setProperty('--mv-bar', bar);
      el.dataset.name = mover.name;
      el.innerHTML = `<div class="mk">Move of the day</div>
        <div class="mrow">${avatar(mover.name, 28, crownCounts()[mover.name] ? { ring: 'var(--gold)' } : null)}
          <span class="nm">${esc(firstName(mover.name))}</span>
          <span class="delta ${cls}">${glyph}${mover.d}</span></div>
        <div class="msub">${sub}</div>`;
    } else {
      // no rank move but a narrative beat exists (overtake without delta etc.)
      el.className = 'move-tile';
      el.style.setProperty('--mv-bar', 'var(--accent)');
      el.dataset.name = (moveBeat.subjects && moveBeat.subjects[0]) || '';
      el.innerHTML = `<div class="mk">Move of the day</div><div class="msub" style="margin-top:9px">${moveBeat.html}</div>`;
    }
  }

  /* ============================ ZONE 2 — LIVE MATCH STRIP (broadcast analysis cards) ============================ */
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

  // auto-analysis one-liner (templated, no LLM). Uses ratings (upset), winner, round, goals.
  function autoAnalysis(m, state) {
    const winner = m.completed ? (m.homeWinner ? m.home : m.awayWinner ? m.away : null)
      : (m.state === 'in' && !isNaN(m.hs) ? (m.hs > m.as ? m.home : m.hs < m.as ? m.away : null) : null);
    const loser = winner ? (winner === m.home ? m.away : m.home) : null;
    const det = detailFor(m);
    // upset flag via ratings.js Elo
    let upset = false;
    if (winner && loser && hasRatings()) {
      try {
        // RATINGS is a flat { team -> Elo } map (ratings.js)
        const rw = typeof RATINGS[winner] === 'number' ? RATINGS[winner] : 0;
        const rl = typeof RATINGS[loser] === 'number' ? RATINGS[loser] : 0;
        if (rw && rl && rl - rw >= 60) upset = true;
      } catch (e) {}
    }
    let text = '';
    if (m.state === 'in') {
      if (winner) text = `<b>${esc(winner)}</b> lead${m.round !== 'group' ? ' in the ' + esc(ROUND_SHORT[m.round] || m.round) : ''}.`;
      else text = `Level and live — every goal swings the board.`;
    } else if (m.completed && winner) {
      const clean = (m.hs === 0 || m.as === 0);
      if (m.round === 'group') text = `<b>${esc(winner)}</b> beat ${esc(loser)}${clean ? ' to a clean sheet' : ''} — group table reshuffles live.`;
      else if (m.round === 'final') text = `<b>${esc(winner)}</b> are world champions.`;
      else text = `<b>${esc(winner)}</b> through past ${esc(loser)} into the ${esc(ROUND_SHORT[{ r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final' }[m.round] || m.round] || 'next round')}.`;
    } else if (m.completed) {
      text = `${esc(m.home)} and ${esc(m.away)} share the points.`;
    }
    if (det && det.goals && det.goals.length) {
      const scorers = det.goals.filter(g => g.who).slice(0, 3).map(g => esc(g.who) + (g.clock ? " " + esc(g.clock) : '')).join(', ');
      if (scorers) text += ` <span style="color:var(--dim)">Goals: ${scorers}.</span>`;
    }
    return { text, upset, det };
  }

  function maCardHtml(m, state, mi) {
    const grp = m.round === 'group'
      ? 'Group ' + (Engine.TEAM_GROUP[m.home] || '') + (m.detail ? ' · ' + esc(m.detail) : '')
      : (ROUND_LABELS[m.round] || '');
    let status, scls;
    if (m.state === 'in') { status = '● ' + (m.clock || 'LIVE'); scls = 'live'; }
    else if (m.completed) { status = 'FT'; scls = 'ft'; }
    else { status = fmtTime(m.date); scls = 'sched'; }
    const showSc = !(m.state === 'pre' || isNaN(m.hs));
    const isLive = m.state === 'in';
    const sideCls = side => !m.completed ? '' : (side === 'h' ? (m.hs > m.as ? '' : m.hs < m.as ? 'lose' : '') : (m.as > m.hs ? '' : m.as < m.hs ? 'lose' : ''));
    const left = `<div class="sb-team left ${sideCls('h')}" style="--team:${teamHex(m.home)}">${crest(m.home)}<span class="tnm">${esc(m.home)}</span></div>`;
    const right = `<div class="sb-team right ${sideCls('a')}" style="--team:${teamHex(m.away)}">${crest(m.away)}<span class="tnm">${esc(m.away)}</span></div>`;
    const mid = showSc ? `<span class="n ${sideCls('h')}">${m.hs}</span><span class="dash">–</span><span class="n ${sideCls('a')}">${m.as}</span>` : `<span class="vs">VS</span>`;

    const an = autoAnalysis(m, state);
    const called = whoCalled(m, state);
    let impact = '';
    if (called && called.predicted.length) {
      impact = `<div class="ma-impact"><span class="pin ok">✓</span> moved <b>${called.predicted.length}/${COUNT}</b> ${called.predicted.length === 1 ? 'entry' : 'entries'} who backed ${esc(called.winner)}</div>`;
    } else if (called) {
      impact = `<div class="ma-impact"><span class="pin bad">✗</span> nobody in the pool backed ${esc(called.winner)} — free points missed</div>`;
    } else if (m.state === 'pre') {
      impact = `<div class="ma-impact">Kicks off ${esc(fmtTime(m.date))}</div>`;
    }
    const analysis = an.text ? `<div class="ma-analysis ${an.upset ? 'upset' : ''}"><svg class="ico ai" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z"/></svg><span>${an.text}</span></div>` : '';
    const venue = an.det && an.det.venue ? `<div class="ma-meta"><svg class="ico" viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg> ${esc(an.det.venue)}</div>` : '';

    // STAKES dropdown — fills the dead space under the kickoff/venue line. Lazy (computed on first open),
    // cached per match key. Completed matches show the realised gain/loss; upcoming/live show per-outcome.
    const completed = m.completed && !isNaN(m.hs) && !isNaN(m.as);
    const openStk = openStakes.has(matchKey(m));
    let stakesHtml = '';
    if (stakesAvailable(m)) {
      const togLab = completed ? 'Who gained · who lost' : 'Who gains · who loses';
      stakesHtml = `<button class="stakes-toggle" type="button">${togLab} <svg class="ico chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="stakes-body">${openStk ? stakesBodyHtml(state, m) : ''}</div>`;
    }

    return `<div class="ma-card match ${openStk ? 'stk-open' : ''}" data-mi="${mi}">
      <div class="ma-banner"><span class="rd">${grp}</span><span class="ma-status ${scls}">${esc(status)}</span></div>
      <div class="ma-bug"><div class="score-bug ${isLive ? 'is-live' : ''}">${left}<div class="sb-score">${mid}</div>${right}</div></div>
      ${analysis}${impact}${venue}${stakesHtml}
    </div>`;
  }

  function renderMatchStrip(state) {
    const el = $('matchStrip'); if (!el) return;
    const now = Date.now(), DAY = 86400e3;
    let list = state.matches.filter(m => m.home && m.away &&
      (m.state === 'in' || (new Date(m.date) > now - 1.6 * DAY && new Date(m.date) < now + 1.2 * DAY)));
    // newest/live first
    list.sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || new Date(b.date) - new Date(a.date));
    list = list.slice(0, 12);
    if (!list.length) {
      el.innerHTML = '<div class="strip-empty">No live or recent matches right now. Tap “All matches” for the full schedule.</div>';
      return;
    }
    el.innerHTML = list.map(m => maCardHtml(m, state, state.matches.indexOf(m))).join('');
  }

  /* ============================ ZONE 3 — STANDINGS BOARD (CARDS.cardRow + FLIP reorder) ============================ */
  function rowOpts(r, opts) {
    const o = opts || {};
    // WIN% for the row bar = the simulator's title odds when available (0..1); the
    // renderer degrades to share-of-leader if this is null (sim not yet run).
    const wp = winProbOf(r.name);
    // GAP-to-next = points of the entry one rank ABOVE (canonical points order in
    // lastRows). Leader (rank 1) has no row above -> renderer shows "—".
    const above = (lastRows && r.rank > 1) ? lastRows.find(x => x.rank === r.rank - 1) : null;
    return {
      pool: POOL_KEY, you: isYou(r.name), leaderPoints: lastRows && lastRows[0] ? lastRows[0].points : r.points,
      poolSize: COUNT, crests: crestsForCards(),
      delta: (prevRanks && prevRanks[r.name]) ? prevRanks[r.name] - r.rank : 0,
      winPct: wp != null ? wp : null,
      aheadPoints: above ? above.points : null,
      id: slugId(r.name) + (o.scope || ''),
    };
  }
  function rowHtml(r, opts) {
    const e = POOL.entries.find(x => x.name === r.name) || {};
    if (hasCards()) return CARDS.cardRow(r, e, rowOpts(r, opts));
    // minimal degrade (CARDS module absent) — keep the 8-cell grid intact so it
    // doesn't collapse: rank, rail, thumb, id, win, gap, pts, delta.
    return `<div class="card-row" data-name="${esc(r.name)}" role="button" tabindex="0">
      <span class="cr-rank">${r.rank}</span>
      <span class="cr-railwrap" aria-hidden="true"><span class="cr-rail"></span></span>
      <span></span>
      <span class="cr-id"><span class="cr-name">${esc(firstName(r.name))}</span></span>
      <span class="cr-win"></span>
      <span class="cr-gap cr-gap--lead"><span class="cr-gap-v">—</span></span>
      <span class="cr-pts mega">${r.points}</span>
      <span class="cr-delta cr-delta--flat">–</span></div>`;
  }

  function sortRows(rows, key) {
    const out = rows.slice();
    if (key === 'secured') out.sort((a, b) => b.secured - a.secured || a.rank - b.rank);
    else if (key === 'max') out.sort((a, b) => b.max - a.max || a.rank - b.rank);
    return out; // 'points' = canonical order
  }

  /* FLIP reorder (BLUEPRINT §9): measure positions before re-render (First), apply new DOM (Last),
     invert (translateY Δ), then transition to none (Play). GPU-only; reduced-motion gated. */
  function captureRects(container) {
    const map = {};
    if (!container) return map;
    container.querySelectorAll('.card-row[data-name]').forEach(el => { map[el.dataset.name] = el.getBoundingClientRect(); });
    return map;
  }
  function playFlip(container, before) {
    if (REDUCE_MOTION || !container || !before) return;
    container.querySelectorAll('.card-row[data-name]').forEach(el => {
      const prev = before[el.dataset.name];
      if (!prev) return;
      const now = el.getBoundingClientRect();
      const dy = prev.top - now.top;
      if (!dy) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform .42s var(--ease)';
        el.style.transform = '';
      });
      setTimeout(() => { el.style.transition = ''; el.style.transform = ''; }, 480);
    });
  }

  function renderGlance(rows, state) {
    const lb = $('lb'); if (!lb) return;
    const before = captureRects(lb);

    if (!BIG_POOL) {
      const display = sortRows(rows, lbSort);
      const f = lbFilter.trim().toLowerCase();
      let shown = 0;
      lb.innerHTML = display.map(r => {
        const hidden = f && !r.name.toLowerCase().includes(f);
        if (!hidden) shown++;
        const h = rowHtml(r, { scope: 'g' });
        return hidden ? h.replace('class="card-row', 'data-hidden="1" style="display:none" class="card-row') : h;
      }).join('');
      const cnt = $('lbCount'); if (cnt) cnt.textContent = f ? `Showing ${shown} of ${COUNT}` : `${COUNT} entries`;
      playFlip(lb, before);
      return;
    }

    const f = lbFilter.trim().toLowerCase();
    if (f) {
      const hits = sortRows(rows, lbSort).filter(r => r.name.toLowerCase().includes(f));
      lb.innerHTML = hits.length ? hits.map(r => rowHtml(r, { scope: 'g' })).join('') : '<div class="lb-divider">No players match.</div>';
      const cnt = $('lbCount'); if (cnt) cnt.textContent = `Showing ${hits.length} of ${COUNT}`;
      return;
    }

    // windowed: Top 3 + divider + YOU±neighbours
    const top3 = rows.slice(0, 3);
    const youRow = rows.find(r => isYou(r.name));
    const blocks = [];
    blocks.push(top3.map(r => rowHtml(r, { scope: 'g' })).join(''));
    if (youRow) {
      const idx = rows.indexOf(youRow);
      const nbrs = [];
      if (idx - 1 >= 0) nbrs.push(rows[idx - 1]);
      nbrs.push(youRow);
      if (idx + 1 < rows.length) nbrs.push(rows[idx + 1]);
      const extra = nbrs.filter(r => !top3.includes(r));
      if (extra.length) {
        blocks.push('<div class="lb-divider">Your neighbourhood</div>');
        blocks.push(extra.map(r => rowHtml(r, { scope: 'g' })).join(''));
      }
    }
    lb.innerHTML = blocks.join('');
    const cnt = $('lbCount'); if (cnt) cnt.textContent = `${COUNT} entries`;
    playFlip(lb, before);
  }

  function renderFullBoard() {
    if (!lastRows || !lastGood) return;
    const fb = $('fbLb'); if (!fb) return;
    const before = captureRects(fb);
    const display = sortRows(lastRows, fbSort);
    const f = fbFilter.trim().toLowerCase();
    let shown = 0;
    fb.innerHTML = display.map(r => {
      const hidden = f && !r.name.toLowerCase().includes(f);
      if (!hidden) shown++;
      const h = rowHtml(r, { scope: 'b' });
      return hidden ? h.replace('class="card-row', 'data-hidden="1" style="display:none" class="card-row') : h;
    }).join('');
    const cnt = $('fbCount'); if (cnt) cnt.textContent = f ? `Showing ${shown} of ${COUNT}` : `${COUNT} entries`;
    playFlip(fb, before);
  }
  function applyFbFilter() {
    const f = fbFilter.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#fbLb .card-row').forEach(row => {
      const n = (row.dataset.name || '').toLowerCase();
      const hide = f && !n.includes(f);
      row.style.display = hide ? 'none' : '';
      if (!hide) shown++;
    });
    const cnt = $('fbCount'); if (cnt) cnt.textContent = f ? `Showing ${shown} of ${COUNT}` : `${COUNT} entries`;
  }

  /* ============================ expanded card modal (click a row -> CARDS.fullCard) ============================ */
  function openCardModal(name) {
    if (!hasCards() || !lastRows) return;
    const r = lastRows.find(x => x.name === name); if (!r) return;
    const e = POOL.entries.find(x => x.name === name) || {};
    const inner = $('cardModalInner'); const modal = $('cardModal');
    if (!inner || !modal) return;
    inner.innerHTML = CARDS.fullCard(r, e, {
      pool: POOL_KEY, you: isYou(name), leaderPoints: lastRows[0] ? lastRows[0].points : r.points, poolSize: COUNT,
      crests: crestsForCards(), delta: (prevRanks && prevRanks[name]) ? prevRanks[name] - r.rank : 0,
      narrative: narrativeForEntry(name), id: 'modal-' + slugId(name),
    });
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    try { CARDS.initHolo(inner); } catch (err) {}
  }
  function closeCardModal() {
    const modal = $('cardModal'); if (!modal) return;
    modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
    if (!openDrawer) document.body.style.overflow = '';
    const inner = $('cardModalInner'); if (inner) inner.innerHTML = '';
  }

  /* ============================ SCORECARD — "what I predicted vs what's actually scoring" ============================
     Tap a standings row (or the YOU-tile button) -> a slide-up sheet that reconciles, point-by-point, to the
     entry's canonical Points. The math mirrors Engine.scoreEntry EXACTLY (the frozen rule) so the running total
     equals scoreEntry(entry,state).total / the leaderboard row's points — this is the transparency feature.
       • per slot in an active group: +4 if predicted team == live team at that position
       • per predicted advancer (top-2 of any group; top-3 only for groups the entry backed as a third): +3 if
         that team is currently in the live qualifying set (advLive.adv)
       • per backed third-place group: +3 if it is in the live best-8 (advLive.thirdGroups)
       • knockouts: r16 picks won R32 +3 · qf picks won R16 +4 · sf picks won QF +5 · runner-up +8 · champion +50 */
  const GROUP_KEYS = (() => { try { return Object.keys(Engine.GROUPS); } catch (e) { return []; } })();

  function buildScorecard(entry, state) {
    const sc = Engine.scoreEntry(entry, state); // canonical — the number we must reconcile to
    const advSet = (state.advLive && state.advLive.adv) || new Set();
    const thirdSet = (state.advLive && state.advLive.thirdGroups) || new Set();
    const tables = state.liveTables || {};
    const k = state.knockout || { r16: new Set(), qf: new Set(), sf: new Set() };
    const elim = state.eliminated || new Set();

    // ---- groups ----
    const groups = GROUP_KEYS.map(g => {
      const pred = (entry.groups && entry.groups[g]) || [];
      const tb = tables[g] || { order: [], active: false, complete: false };
      const scored = tb.active || state.allGroupsComplete;
      const backsThird = (entry.thirds || []).includes(g);
      let sub = 0;
      const slots = [];
      for (let i = 0; i < 4; i++) {
        const predTeam = pred[i];
        const liveTeam = (tb.order[i] && tb.order[i].team) || null;
        const posHit = scored && predTeam && liveTeam && predTeam === liveTeam; // +4 exact position
        // a predicted-advancer slot: 1st/2nd always; 3rd only if this group is one of the entry's thirds
        const isAdvSlot = i <= 1 || (i === 2 && backsThird);
        const advHit = isAdvSlot && predTeam && advSet.has(predTeam); // +3 qualifying
        let pts = 0; if (posHit) pts += 4; if (advHit) pts += 3;
        sub += pts;
        slots.push({ i, predTeam, liveTeam, posHit, advHit, isAdvSlot, pts, dead: predTeam && elim.has(predTeam) });
      }
      return { g, scored, active: tb.active, complete: tb.complete, slots, sub };
    });
    const groupsTotal = groups.reduce((a, x) => a + x.sub, 0);

    // ---- third-place ----
    const thirds = (entry.thirds || []).map(g => ({ g, hit: thirdSet.has(g) }));
    const thirdTotal = thirds.filter(t => t.hit).length * 3;

    // ---- knockouts ----
    const koRow = (team, hit, val, set) => ({ team, hit, val, dead: !hit && elim.has(team) });
    const r16 = (entry.r16 || []).map(t => koRow(t, k.r16.has(t), 3));
    const qf = (entry.qf || []).map(t => koRow(t, k.qf.has(t), 4));
    const sf = (entry.sf || []).map(t => koRow(t, k.sf.has(t), 5));
    const r16Total = r16.filter(r => r.hit).length * 3;
    const qfTotal = qf.filter(r => r.hit).length * 4;
    const sfTotal = sf.filter(r => r.hit).length * 5;
    const champWon = k.champion && k.champion === entry.champion;
    const champDead = !champWon && elim.has(entry.champion);
    const runnerWon = k.runnerUp && k.runnerUp === entry.runnerUp;
    const runnerDead = !runnerWon && elim.has(entry.runnerUp);
    const championPts = champWon ? 50 : 0;
    const runnerPts = runnerWon ? 8 : 0;

    const knockoutsTotal = r16Total + qfTotal + sfTotal + runnerPts;
    const running = groupsTotal + thirdTotal + knockoutsTotal + championPts;
    return {
      groups, groupsTotal, thirds, thirdTotal,
      r16, qf, sf, r16Total, qfTotal, sfTotal,
      champion: entry.champion, champWon, champDead, championPts,
      runnerUp: entry.runnerUp, runnerWon, runnerDead, runnerPts,
      knockoutsTotal, running, total: sc.total, breakdown: sc.breakdown,
    };
  }

  // slot pill: predicted team + a +4/+3/✓/✗ marker
  function scSlot(slot) {
    const tag = slot.posHit && slot.advHit ? `<span class="sc-pt hit">+7</span>`
      : slot.posHit ? `<span class="sc-pt hit">+4</span>`
      : slot.advHit ? `<span class="sc-pt hit">+3</span>`
      : slot.dead ? `<span class="sc-pt dead">✗</span>`
      : `<span class="sc-pt miss">·</span>`;
    const liveTeam = slot.liveTeam;
    const matchCls = slot.posHit ? 'pos' : (slot.advHit ? 'adv' : (slot.dead ? 'dead' : ''));
    return `<div class="sc-slot ${matchCls}">
      <span class="sc-pos">${slot.i + 1}</span>
      <span class="sc-pred${slot.dead ? ' dead' : ''}">${slot.predTeam ? teamHtml(slot.predTeam) : '—'}</span>
      <span class="sc-vs">${slot.posHit ? '=' : '→'}</span>
      <span class="sc-live">${liveTeam ? teamHtml(liveTeam) : '<span class="sc-tbd">not started</span>'}</span>
      ${tag}</div>`;
  }
  function scGroupCard(gr) {
    const statusTag = gr.complete ? '<span class="sc-gtag done">final</span>'
      : gr.active ? '<span class="sc-gtag live">live</span>'
      : '<span class="sc-gtag pend">not started</span>';
    const state = gr.complete ? 'done' : gr.active ? 'live' : 'pend';
    // column header names the two sides once per group (PREDICTED | LIVE), aligned to the slot grid
    const colHead = `<div class="sc-collbl"><span></span><span>Predicted</span><span></span><span>Live</span><span></span></div>`;
    return `<div class="sc-group" data-state="${state}">
      <div class="sc-ghead">Group ${esc(gr.g)} ${statusTag}<span class="sc-gsub">${gr.sub} pt${gr.sub === 1 ? '' : 's'}</span></div>
      ${colHead}
      ${gr.slots.map(scSlot).join('')}</div>`;
  }
  function scKoRow(label, val, r) {
    const mark = r.hit ? `<span class="sc-pt hit">+${val}</span>` : r.dead ? `<span class="sc-pt dead">✗</span>` : `<span class="sc-pt miss">pending</span>`;
    return `<div class="sc-korow ${r.hit ? 'hit' : r.dead ? 'dead' : ''}"><span class="sc-kteam${r.dead ? ' dead' : ''}">${teamHtml(r.team)}</span>${mark}</div>`;
  }
  function scKoBlock(title, val, rows) {
    if (!rows.length) return '';
    return `<div class="sc-koblock"><div class="sc-kohead">${esc(title)} <span class="sc-kotot">+${val} each</span></div>${rows.map(r => scKoRow(title, val, r)).join('')}</div>`;
  }

  function scorecardHtml(name) {
    if (!lastRows || !lastGood) return '<div class="skeleton">No standings yet.</div>';
    const r = lastRows.find(x => x.name === name);
    const entry = POOL.entries.find(x => x.name === name);
    if (!r || !entry) return '<div class="skeleton">Entry not found.</div>';
    const d = buildScorecard(entry, lastGood);
    const you = isYou(name);

    // surface scoring groups first (complete -> live -> pending) so the live action wins over a wall of "not started"
    const grpRank = gr => gr.complete ? 0 : gr.active ? 1 : 2;
    const sortedGroups = d.groups.slice().sort((a, b) => grpRank(a) - grpRank(b) || a.g.localeCompare(b.g));
    const pendCount = sortedGroups.filter(gr => grpRank(gr) === 2).length;
    const scoring = sortedGroups.filter(gr => grpRank(gr) < 2);
    const pending = sortedGroups.filter(gr => grpRank(gr) === 2);
    const groupGrid = scoring.length
      ? `<div class="sc-groups">${scoring.map(scGroupCard).join('')}</div>`
        + (pending.length ? `<div class="sc-penddiv">Not started yet · ${pendCount} group${pendCount === 1 ? '' : 's'}</div><div class="sc-groups">${pending.map(scGroupCard).join('')}</div>` : '')
      : `<div class="sc-groups">${sortedGroups.map(scGroupCard).join('')}</div>`;
    const thirdsHtml = d.thirds.length
      ? `<div class="sc-thirds">${d.thirds.map(t => `<span class="sc-chip ${t.hit ? 'hit' : ''}">${esc(t.g)}${t.hit ? ' +3' : ''}</span>`).join('')}</div>`
      : '<div class="sc-empty">No third-place groups backed.</div>';

    // champion / runner-up KO summary line
    const champMark = d.champWon ? '<span class="sc-pt hit">+50</span>' : d.champDead ? '<span class="sc-pt dead">✗ out −50 ceiling</span>' : '<span class="sc-pt miss">alive</span>';
    const runnerMark = d.runnerWon ? '<span class="sc-pt hit">+8</span>' : d.runnerDead ? '<span class="sc-pt dead">✗</span>' : '<span class="sc-pt miss">pending</span>';
    const finalHtml = `<div class="sc-koblock">
      <div class="sc-kohead">Champion <span class="sc-kotot">+50</span></div>
      <div class="sc-korow ${d.champWon ? 'hit' : d.champDead ? 'dead' : ''}"><span class="sc-kteam${d.champDead ? ' dead' : ''}">${teamHtml(d.champion)}</span>${champMark}</div>
      <div class="sc-kohead" style="margin-top:8px">Runner-up <span class="sc-kotot">+8</span></div>
      <div class="sc-korow ${d.runnerWon ? 'hit' : d.runnerDead ? 'dead' : ''}"><span class="sc-kteam${d.runnerDead ? ' dead' : ''}">${teamHtml(d.runnerUp)}</span>${runnerMark}</div>
    </div>`;

    const koBlocks = scKoBlock('Reaches R16 (R32 winners)', 3, d.r16) + scKoBlock('Reaches QF (R16 winners)', 4, d.qf) + scKoBlock('Semifinalists (QF winners)', 5, d.sf);

    // reconciliation ledger: the four section sub-totals literally add up to the canonical Points on screen
    const ptsLabel = you ? 'your Points' : 'Points';
    const ok = d.running === d.total;
    const ledgerRow = (lbl, val) => `<div class="sc-ledrow"><span>${lbl}</span><b>+${val}</b></div>`;
    const ledger = ledgerRow('Groups', d.groupsTotal)
      + ledgerRow('Third place', d.thirdTotal)
      + ledgerRow('Knockouts', d.knockoutsTotal)
      + ledgerRow('Champion', d.championPts);
    const reconc = ok
      ? `<div class="sc-total">${ledger}
          <div class="sc-ledsum"><span class="sc-ledeq">=</span><span class="sc-ledbig">${d.running}</span></div>
          <div class="sc-ledcap">${ptsLabel}</div></div>`
      : `<div class="sc-total mismatch">${ledger}
          <div class="sc-ledsum"><span class="sc-ledeq">=</span><span class="sc-ledbig">${d.running}</span>
            <span class="sc-warn">canonical ${ptsLabel}: ${d.total}</span></div>
          <div class="sc-ledcap">reconciliation mismatch</div></div>`;

    return `
      <div class="sc-head">
        <div class="sc-id">${avatar(name, 40, you ? { ring: 'var(--gold)' } : null)}
          <div class="sc-idtxt"><div class="sc-name">${esc(cleanName(name))}${you ? '<span class="youtag">YOU</span>' : ''}</div>
            <div class="sc-rank">#${r.rank} of ${COUNT} · ${r.secured} secured · ${r.max} ceiling</div></div>
        </div>
        <div class="sc-bigpts"><span class="num">${r.points}</span><span class="sc-bigl">Points</span></div>
      </div>

      <div class="sc-sectitle">Groups <span class="sc-sub">predicted order vs live · +4 exact slot, +3 advancing</span><span class="sc-sectot">${d.groupsTotal}</span></div>
      ${groupGrid}

      <div class="sc-sectitle">Third place <span class="sc-sub">backed groups currently in the live best-8</span><span class="sc-sectot">${d.thirdTotal}</span></div>
      ${thirdsHtml}

      <div class="sc-sectitle">Knockouts <span class="sc-sub">winners vs actual progress</span><span class="sc-sectot">${d.knockoutsTotal + d.championPts}</span></div>
      ${finalHtml}
      ${koBlocks || '<div class="sc-empty">No knockout picks scoring yet.</div>'}

      ${reconc}
      <div class="sc-foot">Live score: current tables treated as final, official pool rules applied — every point above is traceable to a pick.</div>`;
  }

  function openScorecard(name) {
    if (!name) return;
    const sheet = $('scorecard'); const body = $('scorecardBody'); const ttl = $('scorecardName');
    if (!sheet || !body) return;
    if (ttl) ttl.textContent = isYou(name) ? 'Your scorecard' : cleanName(name) + '’s scorecard';
    body.innerHTML = scorecardHtml(name);
    sheet.dataset.name = name;
    sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
    const scrim = $('scrim'); if (scrim) scrim.classList.add('open');
    document.body.style.overflow = 'hidden';
    scOpen = true;
  }
  function closeScorecard() {
    const sheet = $('scorecard'); if (!sheet) return;
    sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true');
    scOpen = false;
    if (!openDrawer && !$('cardModal').classList.contains('open')) {
      const scrim = $('scrim'); if (scrim) scrim.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  /* ============================ ZONE 4 — NARRATIVE FEED + rivalry watch ============================ */
  function beatIconTone(b) {
    const tone = b.tone || 'neutral';
    const icon = tone === 'up'
      ? '<svg class="ico bi" viewBox="0 0 24 24" style="width:14px;height:14px;color:var(--win)"><path d="M3 17l6-6 4 4 8-8M21 7v6M21 7h-6"/></svg>'
      : tone === 'down'
      ? '<svg class="ico bi" viewBox="0 0 24 24" style="width:14px;height:14px;color:var(--loss)"><path d="M3 7l6 6 4-4 8 8M21 17v-6M21 17h-6"/></svg>'
      : '<svg class="ico bi" viewBox="0 0 24 24" style="width:14px;height:14px;color:var(--accent)"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>';
    return { tone, icon };
  }
  function renderFeed() {
    const el = $('feed'); if (!el) return;
    const beats = surfaceCache.feed && surfaceCache.feed.length
      ? surfaceCache.feed
      : (beatsCache.length ? beatsCache.slice(0, 3) : []);
    if (!beats.length) {
      el.innerHTML = `<div class="beat steady"><span class="bt">Quiet matchday — the story builds as more matches are scored.</span></div>`;
    } else {
      el.innerHTML = beats.map(b => {
        const { tone, icon } = beatIconTone(b);
        return `<div class="beat ${tone}">${icon}<span class="bt">${b.html}</span><span class="badge">${esc(b.kind.replace(/-/g, ' '))}</span></div>`;
      }).join('');
    }
    // rivalry watch (top 1-2)
    const rs = $('rivalryStrip');
    if (rs) {
      const rivs = (rivalriesCache || []).filter(r => r.swaps >= 1 || r.pinned).slice(0, 2);
      rs.innerHTML = rivs.map(r => {
        const aheadIsA = (lastRows ? rankOf(r.a) : 99) < (lastRows ? rankOf(r.b) : 99);
        const ahead = aheadIsA ? r.a : r.b, behind = aheadIsA ? r.b : r.a;
        return `<div class="riv"><span class="rk">Rivalry</span>
          <span class="rbody"><b>${esc(firstName(ahead))}</b> leads <b>${esc(firstName(behind))}</b> by ${Math.abs(r.gap)} pt${Math.abs(r.gap) === 1 ? '' : 's'}${r.pinned ? ' · pinned' : ''}</span>
          <span class="rswap">${r.swaps ? r.swaps + '×' : 'rivals'}</span></div>`;
      }).join('');
    }
  }
  function rankOf(name) { const r = lastRows && lastRows.find(x => x.name === name); return r ? r.rank : 99; }

  /* ============================ stakes (who gains · who loses) — shared renderer + lazy cache ============================
     One mechanism for BOTH the Zone-2 "Live & Recent" strip cards and the Matches-drawer cards. Lazy: MC.stakes is
     only run on first open of a card, then cached by results-hash + matchKey so re-open is instant and a refresh
     (new hash) invalidates it. UPCOMING/LIVE → a block per outcome (home/draw/away) with the biggest swings;
     COMPLETED → the single block for the result that actually happened, framed as the realised gain/loss. */
  let stakesCache = Object.create(null); // key: hash::matchKey -> html string
  function stakesCacheKey(m) { return currentHash + '::' + matchKey(m); }

  // pull the sorted, non-zero swings for one outcome's deltas map; you first-tagged
  function swingList(deltas) {
    return POOL.entries
      .map(e => ({ n: e.name, d: (deltas && typeof deltas[e.name] === 'number') ? deltas[e.name] : 0 }))
      .filter(r => r.d !== 0)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || b.d - a.d);
  }
  function swingRowsHtml(swings, cap) {
    const top = swings.slice(0, cap);
    const rows = top.map(r => {
      const you = isYou(r.n);
      // directional glyph carries the sign so gain/loss reads without relying on hue (matches Move-of-the-day ▲/▼)
      return `<div class="stk-row${you ? ' you' : ''}"><span class="stk-nm">${esc(firstName(r.n))}${you ? ' <span class="stk-youtag">you</span>' : ''}</span><b class="${r.d > 0 ? 'up' : 'dn'}">${r.d > 0 ? '▲' : '▼'}${esc(Math.abs(r.d))}</b></div>`;
    }).join('');
    const more = swings.length - top.length;
    return rows + (more > 0 ? `<div class="stk-more">+${more} more</div>` : '');
  }
  function swingSummary(swings) {
    const g = swings.filter(s => s.d > 0).length, l = swings.filter(s => s.d < 0).length;
    if (!g && !l) return 'no points move';
    const parts = [];
    if (g) parts.push(g + (g === 1 ? ' gains' : ' gain'));
    if (l) parts.push(l + (l === 1 ? ' loses' : ' lose'));
    return parts.join(' · ');
  }
  // which outcome key actually happened for a COMPLETED match
  function resultKey(m) {
    if (m.round === 'group') return m.hs > m.as ? 'home' : m.hs < m.as ? 'away' : 'draw';
    return m.homeWinner ? 'home' : m.awayWinner ? 'away' : (m.hs > m.as ? 'home' : m.hs < m.as ? 'away' : 'draw');
  }
  // Build the stakes body for one match. Returns '' when MC is unavailable / throws (caller hides the toggle).
  function stakesRenderHtml(state, m) {
    const stk = mcTry(() => MC.stakes(state, POOL.entries, m), null);
    if (!stk || !stk.outcomes || !stk.outcomes.length) return '';
    const completed = m.completed && !isNaN(m.hs) && !isNaN(m.as);
    if (completed) {
      const rk = resultKey(m);
      const out = stk.outcomes.find(o => o.key === rk) || stk.outcomes[0];
      const swings = swingList(out.deltas);
      const gained = swings.filter(s => s.d > 0).length;
      // For non-group rounds a level scoreline can still have a winner (penalties/ET):
      // mirror resultKey's fallback to m.homeWinner/m.awayWinner so KO results aren't shown as "Draw".
      const winner = m.round !== 'group'
        ? (m.homeWinner ? m.home : m.awayWinner ? m.away : (m.hs > m.as ? m.home : m.hs < m.as ? m.away : null))
        : (m.hs > m.as ? m.home : m.hs < m.as ? m.away : null);
      const head = winner
        ? `<b>${esc(winner)}</b> won → <b class="up">${gained}</b> ${gained === 1 ? 'player' : 'players'} gained`
        : `Draw → ${gained ? `<b class="up">${gained}</b> gained` : 'no points moved'}`;
      const body = swings.length ? swingRowsHtml(swings, 6) : '<div class="stk-row"><span class="stk-nm">No points moved</span><b>±0</b></div>';
      const winStyle = winner ? ` style="--team:${teamHex(winner)}"` : ' style="--team:var(--dim)"';
      return `<div class="stk-result">${head}</div><div class="stk-out${winner ? ' done' : ''}"${winStyle}>${body}</div>`;
    }
    // upcoming / live — one block per outcome, each tinted with its team color + crest so it ties to the score-bug
    return stk.outcomes.map(o => {
      const swings = swingList(o.deltas);
      const sideTeam = o.key === 'home' ? (m.home || '') : o.key === 'away' ? (m.away || '') : '';
      const teamStyle = sideTeam ? ` style="--team:${teamHex(sideTeam)}"` : ' style="--team:var(--dim)"';
      const lab = o.key === 'draw'
        ? 'Draw'
        : `If ${crest(sideTeam)} ${esc(sideTeam || (o.key === 'home' ? 'Home' : 'Away'))} win`;
      const body = swings.length ? swingRowsHtml(swings, 5) : '<div class="stk-row"><span class="stk-nm">No points move</span><b>±0</b></div>';
      return `<div class="stk-out"${teamStyle}><div class="stk-lab"><span>${lab}</span><span class="stk-sum">${esc(swingSummary(swings))}</span></div>${body}</div>`;
    }).join('');
  }
  // cached entry point used by the toggle handlers
  function stakesBodyHtml(state, m) {
    const key = stakesCacheKey(m);
    if (stakesCache[key] != null) return stakesCache[key];
    const html = stakesRenderHtml(state, m) || '<div class="stk-out"><div class="stk-row"><span class="stk-nm">Stakes unavailable.</span></div></div>';
    stakesCache[key] = html;
    return html;
  }
  // Cheap guard for whether to render the toggle at all — never runs MC.stakes upfront (that is lazy,
  // on first open). We show the toggle whenever MC is present and the card carries two teams; if the
  // lazy computation later yields nothing the body degrades to an "unavailable" line.
  function stakesAvailable(m) { return hasMC() && !!m.home && !!m.away; }

  /* ============================ match cards (Matches drawer — collapsible stakes) ============================ */
  function matchCardHtml(m, state, mi) {
    const grp = m.round === 'group'
      ? 'Group ' + (Engine.TEAM_GROUP[m.home] || '') + (m.detail ? ' · ' + esc(m.detail) : '')
      : (ROUND_LABELS[m.round] || '');
    let status, scls;
    if (m.state === 'in') { status = '● ' + (m.clock || 'LIVE'); scls = 'live'; }
    else if (m.completed) { status = 'FT'; scls = 'ft'; }
    else { status = fmtClock(m.date); scls = 'sched'; }
    const showSc = !(m.state === 'pre' || isNaN(m.hs));
    const isLive = m.state === 'in';
    const sideCls = side => !m.completed ? '' : (side === 'h' ? (m.hs > m.as ? '' : m.hs < m.as ? 'lose' : '') : (m.as > m.hs ? '' : m.as < m.hs ? 'lose' : ''));
    const left = `<div class="sb-team left ${sideCls('h')}" style="--team:${teamHex(m.home)}">${crest(m.home)}<span class="tnm">${esc(m.home)}</span></div>`;
    const right = `<div class="sb-team right ${sideCls('a')}" style="--team:${teamHex(m.away)}">${crest(m.away)}<span class="tnm">${esc(m.away)}</span></div>`;
    const mid = showSc ? `<span class="n ${sideCls('h')}">${m.hs}</span><span class="dash">–</span><span class="n ${sideCls('a')}">${m.as}</span>` : `<span class="vs">VS</span>`;
    const called = whoCalled(m, state);
    let calledHtml = '';
    if (called && called.predicted.length) {
      const names = called.predicted.map(firstName);
      const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '');
      calledHtml = `<div class="m-called"><span class="pin ok">✓</span> <b>${called.predicted.length}/${COUNT}</b> took ${esc(called.winner)} · <span>${esc(shown)}</span></div>`;
    } else if (called) {
      calledHtml = `<div class="m-called"><span class="pin bad">✗</span> Nobody backed ${esc(called.winner)}</div>`;
    }
    let stakesHtml = '';
    const completed = m.completed && !isNaN(m.hs) && !isNaN(m.as);
    const openStk = openStakes.has(matchKey(m));
    if (stakesAvailable(m)) {
      const togLab = completed ? 'Who gained · who lost' : 'Who gains · who loses';
      stakesHtml = `<button class="stakes-toggle" type="button">${togLab} <svg class="ico chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="stakes-body">${openStk ? stakesBodyHtml(state, m) : ''}</div>`;
    }
    const openCls = openStk ? 'stk-open' : '';
    return `<div class="match ${openCls}" data-mi="${mi}">
      <div class="m-banner"><span class="rd">${grp}</span><span class="m-status ${scls}">${esc(status)}</span></div>
      <div class="score-bug ${isLive ? 'is-live' : ''}">${left}<div class="sb-score">${mid}</div>${right}</div>
      ${calledHtml}${stakesHtml}
    </div>`;
  }

  /* ============================ leaderboard detail (kept for h2h/player views) ============================ */
  const CATS = [
    ['groups', 'Group points', 312], ['thirdPlace', '3rd-place groups', 24],
    ['knockouts', 'Knockout winners + runner-up', 103], ['champion', 'Champion', 50],
  ];

  function renderPodium(rows, mountId) {
    const top = rows.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean);
    const mount = $(mountId); if (!mount) return;
    mount.innerHTML = order.map(r => {
      const medalSvg = `<svg class="ico" viewBox="0 0 24 24" style="width:22px;height:22px;color:var(--medal)"><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></svg>`;
      const medalCol = ['#E8B73A', '#C7CDD6', '#CD8E5A'][r.rank - 1];
      return `<div class="pod ${r.rank === 1 ? 'p1' : ''}" style="--medal:${medalCol}">
        <div class="pod-ava">${avatar(r.name, r.rank === 1 ? 62 : 50, { ring: medalCol, crown: r.rank === 1 })}<span class="pod-medal">${medalSvg}</span></div>
        <div class="nm">${esc(cleanName(r.name))}${isYou(r.name) ? ' <span class="youtag">YOU</span>' : ''}</div>
        <div class="ch">👑 ${teamHtml(r.champion)}</div>
        <div class="pts num">${r.points}</div>
      </div>`;
    }).join('');
  }

  /* ============================ matches drawer ============================ */
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
    if (activeRound === 'all') list = list.filter(m => m.state === 'in' || (new Date(m.date) > now - 1.3 * DAY && new Date(m.date) < now + 1.6 * DAY));
    else list = list.filter(m => m.round === activeRound);
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    const groups = []; let cur = null;
    for (const m of list) {
      const d = new Date(m.date);
      const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (!cur || cur.key !== key) { cur = { key, label: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), items: [] }; groups.push(cur); }
      cur.items.push(m);
    }
    for (const g of groups) g.items.sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || new Date(a.date) - new Date(b.date));
    $('matchwrap').innerHTML = groups.map(g =>
      `<div class="date-head">${esc(g.label)}</div><div class="matchgrid">${g.items.map(m => matchCardHtml(m, state, state.matches.indexOf(m))).join('')}</div>`
    ).join('') || '<div class="skeleton">No matches in this view.</div>';
  }
  function updateLiveBadges(state) {
    const liveCount = state.matches.filter(m => m.state === 'in').length;
    const lp = $('livepill'); if (lp) lp.style.display = liveCount ? '' : 'none';
    const lt = $('liveTxt'); if (lt) lt.textContent = liveCount + ' LIVE';
    const db = $('dockMatchesBadge'); if (db) db.textContent = liveCount ? liveCount + ' live' : '';
  }

  /* ============================ brackets drawer ============================ */
  function tallyList(getList) {
    const m = {};
    for (const e of POOL.entries) for (const t of [].concat(getList(e))) (m[t] = m[t] || []).push(e.name);
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }
  function tallyGroups(getList) {
    const m = {};
    for (const e of POOL.entries) for (const g of [].concat(getList(e))) (m[g] = m[g] || []).push(e.name);
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }
  function consensusSlot(title, entriesArr, state, opts) {
    const o = opts || {}; const cap = o.cap || 8; const totalEntries = COUNT;
    const top = entriesArr.slice(0, cap); const others = entriesArr.slice(cap);
    const othersCount = others.reduce((s, [, n]) => s + n.length, 0);
    const maxN = entriesArr.length ? entriesArr[0][1].length : 1;
    const crow = ([team, names]) => {
      const n = names.length; const pct = Math.round(n / maxN * 100); const lone = n === 1;
      const dead = state && state.eliminated && state.eliminated.has(team);
      return `<div class="crow ${lone ? 'lone' : ''}"><div class="lab">
          <span class="nm-line">${flagSpan(team)}<span ${dead ? 'style="text-decoration:line-through;opacity:.7"' : ''}>${esc(team)}</span>${lone ? ' 🐺' : ''}</span>
          <span class="cnt"><b>${n}</b>/${totalEntries}</span></div>
        <div class="track"><i style="width:${Math.max(pct, 4)}%;background:${teamHex(team)}"></i></div></div>`;
    };
    const rows = top.map(crow).join('')
      + (othersCount ? `<div class="crow"><div class="lab"><span class="nm-line"><span style="color:var(--dim)">+ ${others.length} others</span></span><span class="cnt"><b>${othersCount}</b>/${totalEntries}</span></div></div>` : '');
    return `<div class="cb-slot card"><h3>${esc(title)}<span class="tag">${entriesArr.length} pick${entriesArr.length === 1 ? '' : 's'}</span></h3>${rows || '<div class="sec-lead">No picks.</div>'}</div>`;
  }
  function renderConsensusBoard(state) {
    const slots = [];
    slots.push(consensusSlot('👑 Champion', tallyList(e => e.champion), state));
    slots.push(consensusSlot('🥈 Runner-up', tallyList(e => e.runnerUp), state));
    slots.push(consensusSlot('🚀 Semifinalists (any slot)', tallyList(e => e.sf), state, { cap: 8 }));
    Object.keys(Engine.GROUPS).forEach(g => slots.push(consensusSlot('Group ' + g + ' winner', tallyList(e => e.groups[g][0]), state, { cap: 6 })));
    slots.push(consensusSlot('3rd-place groups backed', tallyGroups(e => e.thirds), state, { cap: 8 }));
    $('consensusBoard').innerHTML = slots.join('');
  }
  function renderMatrix(state) {
    if (!SMALL_POOL) return;
    const entries = POOL.entries, k = state.knockout, elim = state.eliminated;
    const youIdx = entries.findIndex(e => isYou(e.name));
    const stChamp = t => k.champion ? (k.champion === t ? 'ok' : 'dead') : (elim.has(t) ? 'dead' : 'pend');
    const stRunner = t => { if (k.runnerUp) return k.runnerUp === t ? 'ok' : 'dead'; if (k.champion && k.champion === t) return 'dead'; return elim.has(t) ? 'dead' : 'pend'; };
    const stSf = t => k.sf.has(t) ? 'ok' : (elim.has(t) ? 'dead' : 'pend');
    const stGw = (g, t) => { const tb = state.finalTables[g]; if (tb && tb.complete) return tb.order[0].team === t ? 'ok' : 'dead'; return elim.has(t) ? 'dead' : 'pend'; };
    const majority = vals => { const m = {}; for (const v of vals) m[v] = (m[v] || 0) + 1; const top = Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]; return top ? `${esc(top[0])} ${top[1]}/${vals.length}` : '—'; };
    const wolf = (v, vals) => vals.filter(x => x === v).length === 1 ? ' 🐺' : '';
    const N = entries.length;
    const rowH = (label, cells, consensus, extraCls) =>
      `<tr class="${extraCls || ''}"><th class="rowlab">${label}</th><td class="cons">${consensus}</td>` +
      cells.map((c, i) => `<td class="cell-${c.st}${i === youIdx ? ' youcol' : ''}"${c.title ? ` title="${esc(c.title)}"` : ''}>${c.html}</td>`).join('') + '</tr>';
    const head = `<thead><tr><th class="rowlab">Pick</th><th class="cons">Consensus</th>${entries.map((e, i) => `<th class="${i === youIdx ? 'youcol' : ''}">${esc(firstName(e.name))}</th>`).join('')}</tr></thead>`;
    const rows = [];
    { const vals = entries.map(e => e.champion); rows.push(rowH('👑 Champion', entries.map(e => ({ st: stChamp(e.champion), html: esc(e.champion) + wolf(e.champion, vals) })), majority(vals), 'grp-start')); }
    { const vals = entries.map(e => e.runnerUp); rows.push(rowH('🥈 Runner-up', entries.map(e => ({ st: stRunner(e.runnerUp), html: esc(e.runnerUp) + wolf(e.runnerUp, vals) })), majority(vals))); }
    { const cnt = {}; for (const e of entries) for (const t of e.sf) cnt[t] = (cnt[t] || 0) + 1;
      const sortedAll = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const per = entries.map(e => e.sf.slice().sort((a, b) => (cnt[b] - cnt[a]) || a.localeCompare(b)));
      for (let i = 0; i < 4; i++) {
        const cons = sortedAll[i] ? `${esc(sortedAll[i][0])} ${sortedAll[i][1]}/${N}` : '—';
        rows.push(rowH(i === 0 ? '🚀 Semifinalists' : '&nbsp;', per.map(p => { const t = p[i]; return { st: stSf(t), html: esc(t) + (cnt[t] === 1 ? ' 🐺' : '') }; }), cons, i === 0 ? 'grp-start' : ''));
      } }
    { rows.push(rowH('🛡️ Reaches QF', entries.map(e => {
        const dead = e.qf.filter(t => elim.has(t) && !k.qf.has(t)); const banked = e.qf.filter(t => k.qf.has(t)).length;
        const alive = 8 - dead.length; const st = dead.length ? 'warn' : (banked === 8 ? 'ok' : 'pend');
        return { st, html: esc(alive + '/8 alive'), title: dead.length ? 'Out: ' + dead.join(', ') : '' };
      }), '—', 'grp-start')); }
    Object.keys(Engine.GROUPS).forEach((g, gi) => {
      const vals = entries.map(e => e.groups[g][0]);
      rows.push(rowH('Grp ' + esc(g) + ' winner', entries.map(e => { const t = e.groups[g][0]; return { st: stGw(g, t), html: esc(t) + wolf(t, vals) }; }), majority(vals), gi === 0 ? 'grp-start' : ''));
    });
    $('matrix').innerHTML = head + '<tbody>' + rows.join('') + '</tbody>';
  }
  function renderBrViewToggle() {
    const tg = $('brViewToggle'); if (!tg) return;
    if (SMALL_POOL) {
      tg.style.display = '';
      tg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === brView));
      $('consensusBoard').style.display = brView === 'consensus' ? '' : 'none';
      $('matrixWrap').style.display = brView === 'matrix' ? '' : 'none';
    } else { tg.style.display = 'none'; $('consensusBoard').style.display = ''; $('matrixWrap').style.display = 'none'; }
  }
  function renderPlayerView(state) {
    if (!state) return;
    const sel = $('pvSel'); const e = POOL.entries[+sel.value] || POOL.entries[0];
    const k = state.knockout, elim = state.eliminated;
    const minis = Object.keys(Engine.GROUPS).map(g => {
      const pred = e.groups[g], tb = state.finalTables[g];
      const rowsH = pred.map((t, i) => { let mk = ''; if (tb && tb.complete) mk = tb.order[i].team === t ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'; return `<div class="pv-row"><span>${i + 1}. ${teamHtml(t)}</span>${mk}</div>`; }).join('');
      return `<div class="card pv-g"><h4>Group ${esc(g)}${tb && tb.complete ? ' <span class="done">✓</span>' : ''}</h4>${rowsH}</div>`;
    }).join('');
    const thirdChip = g => { let cls = ''; if (state.allGroupsComplete) cls = state.advFinal.thirdGroups.has(g) ? 'hit' : 'out'; else if (state.advLive.thirdGroups.has(g)) cls = 'hit'; return `<span class="chip2 ${cls}">${esc(g)}</span>`; };
    const koChip = (t, set) => { const cls = set.has(t) ? 'hit' : (elim.has(t) ? 'out' : ''); return `<span class="chip2 ${cls}">${teamHtml(t)}</span>`; };
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
  function fillPickers() {
    const opts = POOL.entries.map((e, i) => `<option value="${i}">${esc(cleanName(e.name))}</option>`).join('');
    $('h2hA').innerHTML = opts; $('h2hB').innerHTML = opts; $('pvSel').innerHTML = opts;
    const momSel = $('momentumSel'); if (momSel) momSel.innerHTML = opts;
    const me = POOL.entries.findIndex(e => isYou(e.name));
    $('h2hA').value = me >= 0 ? me : 0; $('h2hB').value = me === 0 ? 1 : 0; $('pvSel').value = me >= 0 ? me : 0;
    if (momSel) { momSel.value = me >= 0 ? me : 0; momentumName = POOL.entries[me >= 0 ? me : 0].name; }
    $('h2hA').onchange = $('h2hB').onchange = () => renderH2H(lastGood, lastRows);
    $('pvSel').onchange = () => renderPlayerView(lastGood);
    if (momSel) momSel.onchange = () => { momentumName = (POOL.entries[+momSel.value] || {}).name; renderMomentumChart(); };
  }
  function applyBrFilter() {
    const sel = $('pvSel'), f = brFilter.trim().toLowerCase(); if (!sel) return;
    let firstMatch = -1;
    Array.from(sel.options).forEach((opt, i) => {
      const name = (POOL.entries[+opt.value] || {}).name || opt.textContent;
      const hit = !f || String(name).toLowerCase().includes(f);
      opt.hidden = !hit; if (hit && firstMatch < 0) firstMatch = i;
    });
    if (f && firstMatch >= 0 && (sel.options[sel.selectedIndex] || {}).hidden) { sel.selectedIndex = firstMatch; renderPlayerView(lastGood); }
  }
  function renderH2H(state, rows) {
    if (!state || !rows) return;
    const a = POOL.entries[+$('h2hA').value], b = POOL.entries[+$('h2hB').value]; if (!a || !b) return;
    const rowOf = n => rows.find(r => r.name === n) || {};
    const ra = rowOf(a.name), rb = rowOf(b.name);
    let diff = '';
    if (typeof ra.points === 'number' && typeof rb.points === 'number') {
      const d = ra.points - rb.points;
      diff = d === 0 ? `Dead level — both on <b>${ra.points}</b> points.`
        : `<b>${esc(firstName(d > 0 ? a.name : b.name))}</b> leads by <b>${Math.abs(d)}</b> points (${ra.points} vs ${rb.points}).`;
    }
    $('h2hDiff').innerHTML = diff;
    const col = (e) => {
      const r = rowOf(e.name);
      const fields = [['Champion', teamHtml(e.champion)], ['Runner-up', teamHtml(e.runnerUp)], ['Semifinalists', e.sf.map(teamHtml).join(', ')], ['Reaches QF', e.qf.map(t => esc(t.split(' ')[0])).join(', ')]];
      return { e, r, fields };
    };
    const ca = col(a), cb = col(b);
    const mkCol = (c, other) => `<div class="h2h-col ${isYou(c.e.name) ? 'you' : ''}">
      <h4>${esc(cleanName(c.e.name))}${isYou(c.e.name) ? '<span class="youtag">YOU</span>' : ''}</h4>
      <div class="score-line"><b>${c.r.points ?? '–'}</b> points · ${c.r.secured ?? 0} secured · max ${c.r.max ?? '–'}</div>
      ${c.fields.map((f, i) => { const same = f[1] === other.fields[i][1]; return `<div class="h2h-row ${same ? 'same' : 'diff'}"><span class="k">${esc(f[0])}</span><span class="v">${f[1]}</span></div>`; }).join('')}
    </div>`;
    $('h2hGrid').innerHTML = mkCol(ca, cb) + mkCol(cb, ca);
  }

  /* ============================ title-race drawer (CHARTS) ============================ */
  function renderTitleRaceDrawer() {
    if (!hasCharts() || !lastRows) return;
    try { CHARTS.rankRace($('chartRankRace'), { history: rankHistory, rows: lastRows, youName }); } catch (e) {}
    try { CHARTS.titleRace($('chartTitleRace'), { crowns: crownsCache || [], rows: lastRows, youName }); } catch (e) {}
    renderMomentumChart();
  }
  function renderMomentumChart() {
    if (!hasCharts() || !lastRows) return;
    const row = lastRows.find(r => r.name === momentumName) || lastRows[0];
    try { CHARTS.momentum($('chartMomentum'), { row, crowns: crownsCache || [] }); } catch (e) {}
  }

  /* ============================ more drawer ============================ */
  function renderBadges() {
    const wrap = $('badges'), zone = $('badgesCons'); if (!wrap) return;
    if (!badgesCache) { wrap.innerHTML = '<div class="sec-lead">Badges unavailable right now — they land once matchday crowns are decided.</div>'; if (zone) zone.style.display = 'none'; return; }
    const cons = [];
    const cards = POOL.entries.map(e => {
      const list = badgesCache[e.name] || []; const norm = list.filter(b => b && !b.consolation);
      for (const b of list) if (b && b.consolation) cons.push({ name: e.name, b });
      if (!norm.length) return '';
      return `<div class="badge-card"><h4>${esc(cleanName(e.name))}${isYou(e.name) ? '<span class="youtag">YOU</span>' : ''}</h4>` +
        norm.map(b => `<div class="bdg ${b.accent ? 'accent' : ''}"><span class="roundel">${esc(b.emoji)}</span><span><span class="bl">${esc(b.label)}</span><br><span class="bd">${esc(b.desc)}</span></span></div>`).join('') + '</div>';
    }).join('');
    wrap.innerHTML = cards || '<div class="sec-lead">No badges earned yet — first crowns land 18 Jun.</div>';
    if (zone) {
      if (cons.length) { zone.style.display = ''; $('badgesConsList').innerHTML = cons.map(({ name, b }) => `<div class="bdg"><span class="roundel">${esc(b.emoji)}</span><span><span class="bl">${esc(b.label)}</span> — ${esc(firstName(name))}<br><span class="bd">${esc(b.desc)}</span></span></div>`).join(''); }
      else zone.style.display = 'none';
    }
  }
  function renderConsensus(state) {
    const N = POOL.entries.length;
    const bar = (entries, limit) => entries.slice(0, limit || entries.length).map(([team, names]) => {
      const pct = Math.round(names.length / N * 100); const dead = state.eliminated.has(team);
      return `<div class="crow"><div class="lab"><span class="nm-line">${flagSpan(team)}<span ${dead ? 'style="text-decoration:line-through;opacity:.7"' : ''}>${esc(team)}</span></span><span class="cnt"><b>${names.length}</b>/${N}</span></div>
        <div class="track"><i style="width:${Math.max(pct, 4)}%;background:${teamHex(team)}"></i></div></div>`;
    }).join('');
    $('consChampion').innerHTML = bar(tallyList(e => e.champion), 8);
    $('consRunner').innerHTML = bar(tallyList(e => e.runnerUp), 8);
    $('consSemis').innerHTML = bar(tallyList(e => e.sf), 8);
    const bold = tallyList(e => e.sf).filter(([, names]) => names.length === 1).slice(0, 10)
      .map(([team, names]) => `<div class="crow lone"><div class="lab"><span class="nm-line">${flagSpan(team)}<span>${esc(team)}</span> 🐺</span><span class="cnt">only ${esc(firstName(names[0]))}</span></div></div>`).join('')
      || '<div class="sec-lead">Everyone\'s semifinal picks overlap — no lone-wolf calls.</div>';
    $('consBold').innerHTML = bold;
  }
  function similarity(a, b) {
    const ov = (A, B) => { const s = new Set(B); let n = 0; for (const x of A) if (s.has(x)) n++; return A.length ? n / A.length : 0; };
    let s = 0; s += a.champion === b.champion ? 1 : 0; s += a.runnerUp === b.runnerUp ? 1 : 0;
    s += ov(a.sf, b.sf); s += ov(a.qf, b.qf); s += ov(a.r16, b.r16); s += ov(a.thirds, b.thirds);
    let gw = 0; for (const g of Object.keys(a.groups)) if (a.groups[g][0] === b.groups[g][0]) gw++; s += gw / 12;
    return s / 7;
  }
  function renderSimilar() {
    const es = POOL.entries, pairs = [];
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) pairs.push({ a: es[i].name, b: es[j].name, s: similarity(es[i], es[j]) });
    pairs.sort((x, y) => y.s - x.s);
    $('similar').innerHTML = pairs.slice(0, 6).map(p => { const pct = Math.round(p.s * 100); return `<div class="sim-row"><span class="names">${esc(firstName(p.a))} × ${esc(firstName(p.b))}</span><span class="sim-bar"><i style="width:${pct}%"></i></span><span class="pct num">${pct}%</span></div>`; }).join('') || '<div class="sec-lead">Not enough entries to compare.</div>';
  }
  // photo credits — only teams actually picked as champions by this pool, with resolved photos
  function renderPhotoCredits() {
    const el = $('photoCredits'); if (!el) return;
    const champs = new Set(POOL.entries.map(e => e.champion));
    const rows = [];
    Object.keys(PLAYERS_MAP).sort().forEach(team => {
      const p = PLAYERS_MAP[team];
      if (!p || !p.photo || !p.star) return;
      const star = p.star, credit = p.credit || 'Wikimedia Commons / CC BY-SA';
      rows.push(`<div class="crow2"><b>${esc(team)}</b> — ${esc(star)} · ${esc(credit)}${champs.has(team) ? ' ·★' : ''}</div>`);
    });
    el.innerHTML = `<div class="ccol">${rows.join('')}</div>
      <div style="margin-top:10px;color:var(--dim)">★ = backed as a champion in this pool. Photos served from upload.wikimedia.org (canvas-safe). Credit shown is the licence class; full attribution on each Commons file page.</div>`;
  }

  /* ============================ digest + WhatsApp recap (ONE share action) ============================ */
  function digest(rows, state) {
    const today = state.matches.filter(m => m.completed && m.home && Date.now() - new Date(m.date) < 1.3 * 86400e3).map(m => `${m.home} ${m.hs}-${m.as} ${m.away}`);
    const d = new Date(); const sim = simCache.sim; const cr = currentCrown();
    const top = rows.slice(0, Math.min(rows.length, COUNT > 12 ? 10 : rows.length));
    return [
      `⚽ *FIFA Prediction Pro — ${POOL.poolName}* (${d.toLocaleDateString([], { day: 'numeric', month: 'short' })})`, '',
      ...top.map(r => {
        const wp = (sim && sim.winProb && typeof sim.winProb[r.name] === 'number' && sim.winProb[r.name] * 100 >= 0.05) ? ` · ${(sim.winProb[r.name] * 100).toFixed(1)}%` : '';
        return `${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank + '.'} ${cleanName(r.name)} — *${r.points}*${wp} (max ${r.max})${r.championAlive ? '' : ' 👑❌'}`;
      }),
      COUNT > top.length ? `…and ${COUNT - top.length} more in the field` : '', '',
      cr ? `👑 ${cr.round}${cr.done ? ' crown' : ' (live)'}: ${cr.winners.map(firstName).join(' & ')} — ${cr.pts} pts` : '',
      today.length ? '🔥 ' + today.join(' · ') : '', '',
      '📊 Live board: ' + location.href,
      '_points = live score: current tables scored as final, per the pool rules_',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  }
  async function copyDigest() {
    if (!lastRows || !lastGood) return;
    const text = digest(lastRows, lastGood);
    try { await navigator.clipboard.writeText(text); flashDigest('✅ Copied!'); } catch (e) { prompt('Copy the digest:', text); }
  }
  function flashDigest(msg) { const b = $('digestBtn'); if (!b) return; b.title = msg; setTimeout(() => { b.title = 'Copy WhatsApp digest'; }, 1800); }
  function flashRecap(msg) {
    const b = $('recapBtn'); if (!b) return; const lbl = b.querySelector('.lbl');
    if (lbl) { lbl.textContent = msg; setTimeout(() => { lbl.textContent = 'Share'; }, 2400); } else { b.title = msg; setTimeout(() => { b.title = 'Share recap'; }, 2400); }
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function trimTo(ctx, s, maxW) { s = String(s); while (s.length > 1 && ctx.measureText(s).width > maxW) s = s.slice(0, -2) + '…'; return s; }
  function drawRecap(rows) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const ctx = c.getContext('2d'); if (!ctx) return null;
    const canvas = '#0A0E14', gold = '#E8B73A', cream = '#F2F5F9';
    ctx.fillStyle = canvas; ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = gold; ctx.fillRect(0, 0, 1080, 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = gold; ctx.font = '800 58px system-ui, sans-serif'; ctx.fillText('FIFA PREDICTION PRO', 540, 148);
    ctx.fillStyle = cream; ctx.font = '700 42px system-ui, sans-serif'; ctx.fillText(trimTo(ctx, POOL.poolName, 920), 540, 222);
    ctx.fillStyle = 'rgba(174,185,199,0.85)'; ctx.font = '500 30px system-ui, sans-serif';
    ctx.fillText(new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' · live standings · ' + COUNT + ' entries', 540, 272);
    const sim = simCache.sim; const top = rows.slice(0, 5);
    const y0 = 335, rh = 140, gap = 22;
    top.forEach((r, i) => {
      const y = y0 + i * (rh + gap);
      ctx.fillStyle = i === 0 ? 'rgba(232,183,58,0.16)' : 'rgba(255,255,255,0.06)';
      rrect(ctx, 80, y, 920, rh, 20); ctx.fill();
      if (i === 0) { ctx.strokeStyle = 'rgba(232,183,58,0.7)'; ctx.lineWidth = 3; rrect(ctx, 80, y, 920, rh, 20); ctx.stroke(); }
      ctx.textAlign = 'left';
      ctx.font = '400 54px system-ui, sans-serif'; ctx.fillStyle = cream; ctx.fillText(['🥇', '🥈', '🥉', '4.', '5.'][i], 110, y + 88);
      ctx.font = '600 42px system-ui, sans-serif'; ctx.fillStyle = cream; ctx.fillText(trimTo(ctx, cleanName(r.name), 520), 210, y + 70);
      ctx.font = '400 27px system-ui, sans-serif'; ctx.fillStyle = 'rgba(174,185,199,0.8)'; ctx.fillText(trimTo(ctx, '👑 ' + r.champion + (r.championAlive ? '' : ' (out)'), 520), 212, y + 112);
      ctx.textAlign = 'right';
      ctx.font = '800 56px system-ui, sans-serif'; ctx.fillStyle = gold; ctx.fillText(String(r.points), 970, y + 76);
      let wl = 'pts';
      if (sim && sim.winProb && typeof sim.winProb[r.name] === 'number' && sim.winProb[r.name] * 100 >= 0.05) wl = (sim.winProb[r.name] * 100).toFixed(1) + '% win';
      ctx.font = '500 26px system-ui, sans-serif'; ctx.fillStyle = 'rgba(174,185,199,0.8)'; ctx.fillText(wl, 970, y + 114);
    });
    const cr = currentCrown(); ctx.textAlign = 'center';
    ctx.font = '600 32px system-ui, sans-serif'; ctx.fillStyle = '#F4D27A';
    const crTxt = cr ? '👑 ' + cr.round + (cr.done ? ' crown: ' : ' leader: ') + cr.winners.map(firstName).join(' & ') + ' (' + cr.pts + ' pts)' : 'Group stage in progress — first crown decided 18 Jun';
    ctx.fillText(trimTo(ctx, crTxt, 940), 540, 1218);
    ctx.font = '500 26px system-ui, sans-serif'; ctx.fillStyle = 'rgba(174,185,199,0.7)';
    let url = ''; try { url = location.host + location.pathname; } catch (e) {}
    ctx.fillText(url, 540, 1292);
    return c;
  }
  function downloadBlob(blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fpp-recap.png';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function shareRecap() {
    if (!lastRows || !lastGood) { flashRecap('⏳ Loading…'); return; }
    const text = digest(lastRows, lastGood);
    let copied = false; try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
    let c = null; try { c = drawRecap(lastRows); } catch (e) { c = null; }
    if (!c || !c.toBlob) { flashRecap(copied ? '✅ Text copied' : '⚠️ Failed'); return; }
    c.toBlob(blob => {
      if (!blob) { flashRecap(copied ? '✅ Text copied' : '⚠️ Failed'); return; }
      let shared = false;
      try {
        if (typeof File !== 'undefined' && navigator.canShare) {
          const f = new File([blob], 'fpp-recap.png', { type: 'image/png' });
          if (navigator.canShare({ files: [f] })) { shared = true; navigator.share({ files: [f], title: 'FIFA Prediction Pro' }).catch(() => downloadBlob(blob)); }
        }
      } catch (e) { shared = false; }
      if (!shared) downloadBlob(blob);
      flashRecap('✅ ' + (shared ? 'Shared' : 'Saved'));
    }, 'image/png');
  }

  /* ============================ MC simulation pipeline ============================ */
  function scheduleSim() {
    if (!lastGood || !lastRows) return;
    if (!hasMC() || !hasRatings()) { runNarrative(); applySim(); return; }
    if (simCache.hash === currentHash && simCache.sim) { applySim(); startRooting(); return; }
    setTimeout(() => { // after first paint
      if (!lastGood) return;
      try { topology = lastRaw ? MC.parseTopology(lastRaw) : null; } catch (e) { topology = null; }
      let sim = null;
      try { sim = MC.simulate({ state: lastGood, entries: POOL.entries, topology, ratings: RATINGS, sims: 4000 }); } catch (e) { sim = null; }
      prevSim = simCache.sim || prevSim;
      simCache = { hash: currentHash, sim };
      applySim();
      startRooting();
    }, 50);
  }
  function applySim() {
    if (!lastGood || !lastRows) return;
    try {
      runNarrative();
      renderTodayStory(lastGood, lastRows);
      renderHero(lastGood, lastRows);
      renderYou(lastGood, lastRows);
      renderMove(lastGood, lastRows);
      renderFeed();
      renderGlance(lastRows, lastGood);
      if (drawersBuilt.board) renderFullBoard();
      if (drawersBuilt.titlerace) renderTitleRaceDrawer();
      tickScan();
    } catch (e) {}
  }

  /* ============================ Zone-4 "what's next" swing is folded into the move tile / matches drawer ============================ */
  function nextUpcoming(state, n) {
    return state.matches.filter(m => m.home && m.away && m.state === 'pre').sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, n);
  }
  function startRooting() {
    // kept: compute YOUR biggest title-odds swing in the background (informs the move tile sub-line);
    // cheap, guarded, stale-aware. (Surface is the move tile + matches-drawer stakes.)
    if (!lastGood || !youName || !hasMC() || !hasRatings()) return;
    if (rooting.hash === currentHash && rooting.done) return;
    const state = lastGood; const base = simCache.sim; const up = nextUpcoming(state, 4);
    if (!up.length) { rooting = { hash: currentHash, items: [], done: true }; return; }
    const jobs = up.map(m => {
      const stk = mcTry(() => MC.stakes(state, POOL.entries, m), null);
      const outs = (stk && stk.outcomes) ? stk.outcomes : [];
      return { match: m, degraded: !base, outcomes: outs.map(o => ({ key: o.key, label: o.label, dWin: null })) };
    }).filter(j => j.outcomes.length);
    rooting = { hash: currentHash, items: jobs, done: false };
    if (!jobs.length || !base) { rooting.done = true; return; }
    const t0 = Date.now(); let mi = 0, oi = 0;
    const baseP = (base.winProb && typeof base.winProb[youName] === 'number') ? base.winProb[youName] : 0;
    function step() {
      if (rooting.hash !== currentHash) return;
      if (mi >= jobs.length) { rooting.done = true; return; }
      if (Date.now() - t0 > 5000) { rooting.done = true; return; }
      const job = jobs[mi], out = job.outcomes[oi];
      if (!out) { mi++; oi = 0; setTimeout(step, 15); return; }
      try {
        const cs = MC.simulate({ state, entries: POOL.entries, topology, ratings: RATINGS, sims: 1200, condition: { match: job.match, matchKey: out.key } });
        const p = (cs && cs.winProb && typeof cs.winProb[youName] === 'number') ? cs.winProb[youName] : baseP;
        out.dWin = p - baseP;
      } catch (e) { out.dWin = null; job.degraded = true; }
      oi++; setTimeout(step, 15);
    }
    setTimeout(step, 15);
  }

  /* ============================ drawers ============================ */
  let openDrawer = null;
  function buildDrawer(name) {
    if (!lastGood || !lastRows) return;
    if (name === 'matches' && !drawersBuilt.matches) { renderRoundbar(lastGood); renderMatches(lastGood); drawersBuilt.matches = true; }
    else if (name === 'board' && !drawersBuilt.board) { renderPodium(lastRows, 'boardPodium'); renderFullBoard(); drawersBuilt.board = true; }
    else if (name === 'brackets' && !drawersBuilt.brackets) { renderConsensusBoard(lastGood); renderMatrix(lastGood); renderBrViewToggle(); renderPlayerView(lastGood); renderH2H(lastGood, lastRows); drawersBuilt.brackets = true; }
    else if (name === 'titlerace' && !drawersBuilt.titlerace) { renderTitleRaceDrawer(); drawersBuilt.titlerace = true; }
    else if (name === 'more' && !drawersBuilt.more) { renderBadges(); renderConsensus(lastGood); renderSimilar(); renderPhotoCredits(); drawersBuilt.more = true; }
  }
  function showDrawer(name, focusYou) {
    const d = $('drawer-' + name); const scrim = $('scrim'); if (!d) return;
    buildDrawer(name);
    if (openDrawer && openDrawer !== name) { const o = $('drawer-' + openDrawer); if (o) { o.classList.remove('open'); o.setAttribute('aria-hidden', 'true'); } }
    d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.classList.add('open');
    document.body.style.overflow = 'hidden'; openDrawer = name;
    if (focusYou) setTimeout(() => { const row = d.querySelector('.card-row[data-you="1"]'); if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900); } }, 300);
  }
  function closeDrawer() {
    if (!openDrawer) return;
    const d = $('drawer-' + openDrawer); const scrim = $('scrim');
    if (d) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }
    if (scrim) scrim.classList.remove('open');
    if (!$('cardModal').classList.contains('open')) document.body.style.overflow = '';
    openDrawer = null;
  }
  function openBracketFor(name) {
    const idx = POOL.entries.findIndex(e => e.name === name);
    showDrawer('brackets');
    const sel = $('pvSel'); if (sel && idx >= 0) { sel.value = idx; renderPlayerView(lastGood); }
  }

  /* ============================ main refresh ============================ */
  function renderAll(state, rows) {
    runNarrative();
    renderTodayStory(state, rows);
    renderHero(state, rows);
    renderYou(state, rows);
    renderMove(state, rows);
    renderFeed();
    renderGlance(rows, state);
    renderMatchStrip(state);
    updateLiveBadges(state);
    stakesCache = Object.create(null); // results changed -> stale stakes; recomputed lazily on next open
    drawersBuilt = { matches: false, board: false, brackets: false, titlerace: false, more: false };
    if (openDrawer) buildDrawer(openDrawer);
    tickScan();
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
      prevPoints = lastRows ? Object.fromEntries(lastRows.map(r => [r.name, r.points])) : null;
      prevMax = lastRows ? Object.fromEntries(lastRows.map(r => [r.name, r.max])) : null;
      lastGood = state; lastRows = rows; lastRaw = raw; lastSource = source;
      currentHash = resultsHash(matches);
      buildEspnDetailMap(raw);
      pushRankHistory(currentHash, rows);
      crownsCache = mcTry(() => MC.crowns(state, POOL.entries), null);
      badgesCache = mcTry(() => MC.badges(state, POOL.entries, crownsCache || [], rows), null);
      renderAll(state, rows);
      const tb = $('lbToolbar'); if (tb) tb.style.display = BIG_POOL ? '' : 'none';
      $('err').style.display = 'none';
      const upd = $('updated'); if (upd) upd.textContent = '✓ ' + new Date().toLocaleTimeString() + ' · ' + source;
      scheduleSim();
    } catch (e) {
      $('err').textContent = 'Could not reach the live results feed (' + e.message + '). ' + (lastGood ? 'Showing last good data.' : 'Retrying shortly.');
      $('err').style.display = 'block';
    } finally { inFlight = false; secs = 60; }
  }

  /* ============================ delegated event handlers (bound once) ============================ */
  // Zone-3 board: click a card-row -> open that entry's SCORECARD (predicted vs scoring, reconciles to Points).
  $('lb').addEventListener('click', e => {
    const row = e.target.closest('.card-row[data-name]'); if (!row) return;
    openScorecard(row.dataset.name);
  });
  $('lb').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.card-row[data-name]'); if (!row) return;
    e.preventDefault(); openScorecard(row.dataset.name);
  });
  $('fbLb').addEventListener('click', e => {
    const row = e.target.closest('.card-row[data-name]'); if (!row) return;
    openScorecard(row.dataset.name);
  });
  $('fbLb').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.card-row[data-name]'); if (!row) return;
    e.preventDefault(); openScorecard(row.dataset.name);
  });

  // card modal close
  const cardModalEl = $('cardModal');
  if (cardModalEl) cardModalEl.addEventListener('click', e => { if (e.target.closest('[data-cardclose]') || e.target === cardModalEl) closeCardModal(); });

  // Zone-3 glance toolbar (big pool only)
  const lbSearchEl = $('lbSearch');
  if (lbSearchEl) lbSearchEl.addEventListener('input', () => { lbFilter = lbSearchEl.value; if (lastRows && lastGood) renderGlance(lastRows, lastGood); });
  const lbSortEl = $('lbSort');
  if (lbSortEl) lbSortEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    lbSort = b.dataset.sort || 'points';
    lbSortEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    if (lastRows && lastGood) renderGlance(lastRows, lastGood);
  });
  const jumpBtn = $('lbJumpMe');
  if (jumpBtn) {
    if (!youName) jumpBtn.style.display = 'none';
    jumpBtn.addEventListener('click', () => {
      let row = document.querySelector('#lb .card-row[data-you="1"]');
      if (!row) { showDrawer('board', true); return; }
      row.style.display = ''; row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900);
    });
  }

  // Full-board toolbar
  const fbSearchEl = $('fbSearch');
  if (fbSearchEl) fbSearchEl.addEventListener('input', () => { fbFilter = fbSearchEl.value; applyFbFilter(); });
  const fbSortEl = $('fbSort');
  if (fbSortEl) fbSortEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    fbSort = b.dataset.sort || 'points';
    fbSortEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    renderFullBoard(); applyFbFilter();
  });
  const fbJumpBtn = $('fbJumpMe');
  if (fbJumpBtn) {
    if (!youName) fbJumpBtn.style.display = 'none';
    fbJumpBtn.addEventListener('click', () => {
      const row = document.querySelector('#fbLb .card-row[data-you="1"]'); if (!row) return;
      row.style.display = ''; row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900);
    });
  }

  // brackets view toggle + search
  const brToggleEl = $('brViewToggle');
  if (brToggleEl) brToggleEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; brView = b.dataset.view || 'consensus'; renderBrViewToggle(); });
  const brSearchEl = $('brSearch');
  if (brSearchEl) brSearchEl.addEventListener('input', () => { brFilter = brSearchEl.value; applyBrFilter(); });

  // matches round filter
  $('roundbar').addEventListener('click', e => { const c = e.target.closest('.rchip'); if (!c || !lastGood) return; activeRound = c.dataset.r; renderRoundbar(lastGood); renderMatches(lastGood); });

  // shared stakes-toggle handler: lazily fills + caches the body on first open (Matches drawer + Zone-2 strip)
  function toggleStakes(card) {
    if (!card || !lastGood) return;
    const mi = +card.dataset.mi; const m = lastGood.matches[mi]; if (!m) return;
    const key = matchKey(m); const open = !openStakes.has(key);
    if (open) openStakes.add(key); else openStakes.delete(key);
    card.classList.toggle('stk-open', open);
    const body = card.querySelector('.stakes-body');
    if (open && body && !body.innerHTML) body.innerHTML = stakesBodyHtml(lastGood, m);
  }

  // match stakes toggle (Matches drawer)
  $('matchwrap').addEventListener('click', e => {
    const b = e.target.closest('.stakes-toggle'); if (!b) return;
    toggleStakes(b.closest('.match'));
  });

  // Zone-2 strip: tap the stakes toggle -> expand stakes in place; tap anywhere else on the card -> Matches drawer
  $('matchStrip').addEventListener('click', e => {
    const b = e.target.closest('.stakes-toggle');
    if (b) { e.stopPropagation(); toggleStakes(b.closest('.match')); return; }
    showDrawer('matches');
  });

  // Move-of-the-day tile -> scroll-flash that player's row (or open their bracket)
  const moveTile = $('moveTile');
  if (moveTile) moveTile.addEventListener('click', () => {
    const n = moveTile.dataset.name; if (!n) return;
    let row = document.querySelector('#lb .card-row[data-name="' + (window.CSS && CSS.escape ? CSS.escape(n) : n) + '"]');
    if (!row) { openCardModal(n); return; }
    row.style.display = ''; row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900);
  });

  // drawer dock pills + anything routing to a drawer
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-drawer]'); if (opener) { showDrawer(opener.dataset.drawer); return; }
    const closeBtn = e.target.closest('[data-close]'); if (closeBtn) { closeDrawer(); return; }
  });
  const scrimEl = $('scrim'); if (scrimEl) scrimEl.addEventListener('click', () => { if (scOpen) closeScorecard(); else closeDrawer(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('cardModal').classList.contains('open')) { closeCardModal(); return; }
    if (scOpen) { closeScorecard(); return; }
    if (openDrawer) closeDrawer();
  });
  // scorecard close button + YOU-tile "Scorecard" button (delegated — the tile re-renders each refresh)
  const scCloseEl = $('scorecardClose'); if (scCloseEl) scCloseEl.addEventListener('click', closeScorecard);
  const youTileEl = $('youTile');
  if (youTileEl) youTileEl.addEventListener('click', e => { if (e.target.closest('.you-sc-btn') && youName) openScorecard(youName); });

  const viewAllBtn = $('viewAllBtn'); if (viewAllBtn) viewAllBtn.addEventListener('click', () => showDrawer('board'));
  $('refreshBtn').onclick = refresh;
  $('digestBtn').onclick = copyDigest;
  $('recapBtn').onclick = shareRecap;

  /* ============================ PWA: register service worker ============================ */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  /* ============================ init ============================ */
  rankHistory = loadRankHistory();
  renderPoolSwitch();
  renderIdentity();
  fillPickers();
  setInterval(() => {
    secs--;
    const cd = $('countdown');
    if (cd) { cd.textContent = Math.max(secs, 0) + 's'; tickIf('countdown', cd); }
    if (secs <= 0) refresh();
  }, 1000);
  refresh();
})();
