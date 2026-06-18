/* FIFA Prediction Pro — app.js
   ONE-SCREEN dashboard (spec v2.0). Loads after data.js, engine.js, ratings.js, viz.js, mc.js.

   data.js exposes globals: POOLS, POOL_ORDER, POOL (active, chosen from
   location.hash '#pool=<key>', defaults to spjain). VIZ (viz.js) is optional;
   MC + RATINGS (mc.js / ratings.js) are optional. Every use of VIZ/MC/RATINGS
   is guarded so the page degrades gracefully if any is missing or throws.

   The five-tab layout is gone: a single glanceable screen answers
   who's winning · where am I · what changed · why · what's next, and everything
   else lives in slide-up drawers. Frozen engine/mc/ratings/viz math is untouched;
   the only NEW persistence is a rank-history ring buffer keyed by resultsHash. */
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
  const avatar = (n, s, o) => hasViz ? VIZ.avatar(n, s, o) : `<span class="ava" style="width:${s}px;height:${s}px">${esc((String(n)[0] || '?').toUpperCase())}</span>`;
  const teamHex = t => {
    if (hasViz) { try { return VIZ.teamColor(t); } catch (e) {} }
    return 'var(--accent)';
  };

  const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200';
  const FIFA_URL = 'https://api.fifa.com/api/v3/calendar/matches?idSeason=285023&idCompetition=17&language=en&count=200';
  const ROUND_LABELS = { group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarterfinals', sf: 'Semifinals', third: '3rd-Place', final: 'Final' };
  const ROUND_SHORT  = { group: 'group stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'quarterfinal', sf: 'semifinal', third: '3rd-place', final: 'final' };

  const YOU_RE = /TARS/;
  const isYou = n => YOU_RE.test(String(n));
  const cleanName = n => String(n).replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim() || String(n);
  const firstName = n => isYou(n) ? 'You' : (cleanName(n).split(/\s+/)[0] || String(n));
  const fmtSigned = d => (d > 0 ? '+' : '') + d;
  const fmtPct = p => { const v = p * 100; return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
  const fmtTime = d => new Date(d).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtClock = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const COUNT = POOL.entries.length;
  const BIG_POOL = COUNT > 12;        // windowed Zone-3 + search toolbar
  const SMALL_POOL = COUNT <= 12;     // matrix view only for small pools

  /* ============================ number-tick animation ============================
     When a live numeral changes, the new value slides in (.tick). Numerals live in
     innerHTML rebuilt on each refresh; we diff against the value last seen per key
     and fire .tick only on a real change (first-seen keys recorded silently). */
  const REDUCE_MOTION = (() => {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  })();
  let tickPrev = Object.create(null);
  function fireTick(el) {
    el.classList.remove('tick');
    void el.offsetWidth; // eslint-disable-line no-unused-expressions
    el.classList.add('tick');
  }
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
  // walk tracked live numerals after a render; tick the ones that changed
  function tickScan() {
    // hero number + gauge % (single-mode .hero-num, two-up .ht-fig, both share the gauge)
    tickIf('hero:proj', document.querySelector('#heroTile .hero-num .big'));
    tickIf('hero:win', document.querySelector('#heroTile .hero-gauge .v'));
    document.querySelectorAll('#heroTile .hero-two .ht-fig').forEach((v, i) => tickIf('hero:two' + i, v));
    // you-tile
    tickIf('you:rank', document.querySelector('#youTile .you-rankrow .big'));
    document.querySelectorAll('#youTile .you-cell2 .v').forEach((v, i) => tickIf('you:c' + i, v));
    // standings rows: projected + win%
    document.querySelectorAll('#lb .entry').forEach(row => {
      const n = row.dataset.name; if (n == null) return;
      tickIf('proj:' + n, row.querySelector('.proj .big'));
      tickIf('win:' + n, row.querySelector('.win-num'));
    });
    // match score-bug numerals (matches drawer)
    document.querySelectorAll('.match').forEach(card => {
      const mi = card.dataset.mi;
      if (mi == null) return;
      card.querySelectorAll('.sb-score .n').forEach((n, i) => tickIf('sb:' + mi + ':' + i, n));
    });
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
  let lbSort = 'projected', lbFilter = '';     // Zone-3 glance toolbar (big pool only)
  let fbSort = 'projected', fbFilter = '';     // Full-board drawer toolbar
  let brView = 'consensus', brFilter = '';
  let rankHistory = [];                          // NEW ring buffer [{hash,ts,ranks}]
  let drawersBuilt = { matches: false, board: false, brackets: false, more: false };

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

  /* ============================ NEW: rank-history ring buffer ============================
     Persist per-results-hash snapshots of {name -> rank}, capped ~24, keyed so we can
     draw a per-row bump sparkline (§4) and richer mover narratives (§3). Degrades when
     <2 history points (sparkline simply skipped). Pool-scoped key avoids cross-pool mixing. */
  const RANKHIST_KEY = 'wc26-rankhist-' + POOL.key;
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
    // replace if same hash already at tail (re-render of identical state), else append
    if (rankHistory.length && rankHistory[rankHistory.length - 1].hash === hash) {
      rankHistory[rankHistory.length - 1] = { hash, ts: Date.now(), ranks };
    } else {
      rankHistory.push({ hash, ts: Date.now(), ranks });
      if (rankHistory.length > RANKHIST_CAP) rankHistory = rankHistory.slice(-RANKHIST_CAP);
    }
    try { localStorage.setItem(RANKHIST_KEY, JSON.stringify(rankHistory)); } catch (e) {}
  }
  // series of last ~8 ranks for a name (oldest→newest), only entries that recorded one
  function rankSeries(name, max) {
    const out = [];
    for (const h of rankHistory) {
      const v = h.ranks && h.ranks[name];
      if (typeof v === 'number') out.push(v);
    }
    return max ? out.slice(-max) : out;
  }

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
    const lab = $('standGlanceLab');
    if (lab) lab.textContent = '· ' + POOL.poolName;
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
  function winProbOf(name) {
    const sim = simCache.sim;
    return (sim && sim.winProb && typeof sim.winProb[name] === 'number') ? sim.winProb[name] : null;
  }
  // the title favourite = max winProb across all entries (or null if sim not ready)
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

  /* ============================ ZONE 0 — TODAY'S STORY ============================
     One auto-narrative sentence: the day's single biggest fact. Priority cascade. */
  function renderTodayStory(state, rows) {
    const el = $('todayStory'); if (!el) return;
    const eye = el.previousElementSibling; // .z0-eye holds the live dot
    const liveMatches = state.matches.filter(m => m.state === 'in' && m.home && m.away);
    let html = '';

    if (liveMatches.length) {
      const m = liveMatches[0];
      const sc = (!isNaN(m.hs)) ? `<span class="accent">${m.hs}–${m.as}</span>` : 'underway';
      html = `<b>LIVE</b> — ${esc(m.home)} ${sc} ${esc(m.away)}${liveMatches.length > 1 ? ` and ${liveMatches.length - 1} more in play` : ''}.`;
    } else {
      if (eye) eye.querySelector('.live-dot') && (eye.querySelector('.live-dot').style.display = 'none');
      const leader = rows[0];
      // a freshly completed crown is a strong "today" fact
      const cr = currentCrown();
      const today = state.matches.filter(m => m.completed && m.home && Date.now() - new Date(m.date) < 1.1 * 86400e3);
      // Zone 0 carries the day's NEWEST fact. The points-vs-odds divergence is now owned by the
      // hero at display scale (renderHero two-up), so we do NOT restate it here — that was
      // redundancy without hierarchy. We lead with a fresh crown, else a single editorial line.
      if (cr && cr.done && cr.winners && cr.winners.length) {
        html = `<b>${esc(cr.winners.map(firstName).join(' & '))}</b> took the <b>${esc(ROUND_SHORT[cr.round] || cr.round)}</b> crown — <span class="accent">${cr.pts} pts</span> banked in the window.`;
      } else if (leader) {
        const gap = rows[1] ? leader.projected - rows[1].projected : 0;
        html = `<b>${esc(firstName(leader.name))}</b> tops ${esc(POOL.poolName)} with <span class="accent">${leader.projected}</span> projected${gap > 0 && rows[1] ? `, ${gap} clear of ${esc(firstName(rows[1].name))}` : ''}.`;
      } else {
        html = `${esc(POOL.poolName)} is locked and live — standings update with every goal.`;
      }
      if (today.length && !(cr && cr.done)) {
        html += ` <span style="opacity:.85">${today.length} match${today.length === 1 ? '' : 'es'} settled today.</span>`;
      }
    }
    el.innerHTML = html;
  }

  /* ============================ ZONE 1A — HERO (who's winning) ============================
     The hero must RESOLVE the points-vs-odds divergence at display scale (spec §2). When the
     points leader is ALSO the title favourite, one big gold number does the job. When they
     differ (the owner's core pain), render a TWO-UP hero: POINTS LEADER (gold) + TITLE
     FAVOURITE (azure), both at display scale, and let the WIN% gauge fill to the favourite's
     real odds — never a 3.5% sliver. No separate fav-flag chip (that redundancy is dropped). */
  function pctLabel(p) { const v = p * 100; return v >= 9.95 ? Math.round(v) + '%' : v.toFixed(1) + '%'; }

  function renderHero(state, rows) {
    const el = $('heroTile'); if (!el) return;
    const leader = rows[0];
    if (!leader) { el.innerHTML = '<div class="skeleton">No standings yet.</div>'; return; }
    const sims = (simCache.sim && simCache.sim.sims) ? simCache.sim.sims : null;
    const fav = titleFavourite();
    const split = !!(fav && fav.name !== leader.name);

    // champion pick line
    const champDead = !leader.championAlive;
    const champLine = `Backing ${champDead ? `<span class="dead">${teamHtml(leader.champion)}</span> <span class="outtag">OUT</span>` : teamHtml(leader.champion)} to win it all`;

    // THE WHY — priority cascade, first true wins (about the points lead)
    let why;
    const prevR = prevRanks ? prevRanks[leader.name] : null;
    const margin = rows[1] ? leader.projected - rows[1].projected : null;
    if (prevR && prevR > leader.rank) {
      why = `Took the lead this matchday — up ${prevR - leader.rank} from #${prevR}.`;
    } else if (margin === 0 && rows[1]) {
      why = `Tied at the top — separated only by tiebreak.`;
    } else if (rows[1]) {
      why = `Holding #1 by ${margin} over ${esc(firstName(rows[1].name))}.`;
    } else {
      why = `Out in front of the field.`;
    }

    // The gauge tracks the QUESTION "who is most likely to win" → the favourite's odds when known.
    // When leader == favourite (or no sim), it's the leader's own odds. This guarantees the bar
    // fills to a visible number rather than the points leader's tiny stub.
    const gaugeWp = fav ? fav.winProb : winProbOf(leader.name);
    const gaugeVal = gaugeWp != null ? pctLabel(gaugeWp) : '—';
    const gaugeW = gaugeWp != null ? Math.min(100, Math.max(1.5, gaugeWp * 100)) : 0;
    const gaugeLab = split
      ? `Title favourite · ${esc(firstName(fav.name))}${sims ? ' · ' + sims + ' sims' : ''}`
      : `Title odds${sims ? ' · ' + sims + ' sims' : ''}`;

    if (split) {
      // TWO-UP: points leader (gold) vs title favourite (azure) — neither dominates; divergence reads instantly
      el.classList.add('hero-split');
      el.innerHTML = `
        <span class="watermark" aria-hidden="true">26</span>
        <div class="kicker">Who's winning · ${esc(POOL.poolName)}</div>
        <div class="hero-two">
          <div class="ht-side leader">
            <div class="ht-eye">Points leader</div>
            <div class="ht-who">
              <span class="crown"><svg class="ico" viewBox="0 0 24 24" style="width:22px;height:22px"><path d="M3 8l3.5 9h11L21 8l-5 4-4-7-4 7z"/></svg></span>
              <span class="ht-nm">${esc(firstName(leader.name))}${isYou(leader.name) ? '<span class="youtag">YOU</span>' : ''}</span>
            </div>
            <div class="ht-fig gold num">${leader.projected}<span class="u">proj</span></div>
          </div>
          <div class="ht-div" aria-hidden="true"></div>
          <div class="ht-side fav">
            <div class="ht-eye acc">Title favourite</div>
            <div class="ht-who">
              <svg class="ico fi" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z"/></svg>
              <span class="ht-nm">${esc(firstName(fav.name))}${isYou(fav.name) ? '<span class="youtag">YOU</span>' : ''}</span>
            </div>
            <div class="ht-fig acc num">${pctLabel(fav.winProb)}<span class="u">to win</span></div>
          </div>
        </div>
        <div class="hero-gauge">
          <div class="glab"><span class="l">${gaugeLab}</span><span class="v num">${gaugeVal}</span></div>
          <div class="track"><i style="width:${gaugeW}%"></i></div>
        </div>
        <div class="hero-why">Most points: <b>${esc(firstName(leader.name))}</b> · best odds: <b>${esc(firstName(fav.name))}</b> — points don't yet match the simulator.</div>`;
      return;
    }

    // SINGLE: leader is also the favourite (or sim not ready) — one dominant gold number
    el.classList.remove('hero-split');
    el.innerHTML = `
      <span class="watermark" aria-hidden="true">26</span>
      <div class="kicker">Pool leader · ${esc(POOL.poolName)}</div>
      <div class="hero-id">
        <span class="crown"><svg class="ico" viewBox="0 0 24 24" style="width:30px;height:30px"><path d="M3 8l3.5 9h11L21 8l-5 4-4-7-4 7z"/></svg></span>
        <div class="nm">${esc(cleanName(leader.name))}${isYou(leader.name) ? '<span class="youtag">YOU</span>' : ''}</div>
      </div>
      <div class="hero-num">
        <span class="big num">${leader.projected}</span>
        <span class="of">/ 470 max · <b>${leader.official}</b> locked</span>
      </div>
      <div class="hero-gauge">
        <div class="glab"><span class="l">${gaugeLab}</span><span class="v num">${gaugeVal}</span></div>
        <div class="track"><i style="width:${gaugeW}%"></i></div>
      </div>
      <div class="hero-pick">${champLine}</div>
      <div class="hero-why">${why}</div>`;
  }

  /* ============================ ZONE 1B — YOU ============================ */
  function renderYou(state, rows) {
    const el = $('youTile'); if (!el) return;
    const you = rows.find(r => isYou(r.name));
    const zone1 = $('zone1');
    if (!you) {
      el.style.display = 'none';
      // hero spans full width — drive via a class so the CSS media query still wins on mobile
      if (zone1) zone1.classList.add('solo');
      return;
    }
    el.style.display = '';
    if (zone1) zone1.classList.remove('solo');
    const wp = winProbOf(you.name);
    const winTxt = wp != null ? (wp * 100 >= 9.95 ? Math.round(wp * 100) + '%' : (wp * 100).toFixed(1) + '%') : '—';
    const leader = rows[0];
    const gapTop = leader && leader.name !== you.name ? leader.projected - you.projected : 0;
    // gap to the next rung up
    const above = rows.find(r => r.rank === you.rank - 1);
    const gapNext = above ? above.projected - you.projected : 0;
    // delta vs prev matchday
    let mv = '<span class="mv zero">–</span>';
    const prevR = prevRanks ? prevRanks[you.name] : null;
    if (prevR && prevR !== you.rank) {
      mv = prevR > you.rank ? `<span class="mv up">▲${prevR - you.rank}</span>` : `<span class="mv dn">▼${you.rank - prevR}</span>`;
    }
    const champDead = !you.championAlive;
    const champState = champDead ? '<span class="outtag">OUT −50</span>' : '<span class="alivetag">alive</span>';
    const champName = champDead ? `<span class="dead">${teamHtml(you.champion)}</span>` : teamHtml(you.champion);

    // The actionable number for someone mid-table is catching the rung directly above — not the
    // points leader (who the hero may flag as NOT the favourite anyway). So the third stat cell is
    // "Gap to next", and the points-gap-to-#1 is demoted to a small secondary line. (Finding: the
    // old "Gap to #1" implied #1-on-points is the target.)
    const nextCell = you.rank === 1
      ? `<div class="you-cell2"><div class="v win num">—</div><div class="l">Gap to next</div></div>`
      : `<div class="you-cell2"><div class="v acc num">+${gapNext}</div><div class="l">Gap to #${above ? above.rank : you.rank - 1}</div></div>`;

    el.innerHTML = `
      <div class="kicker">You · #${you.rank} of ${COUNT}</div>
      <div class="you-rankrow">
        <span class="big num">${you.rank}</span>
        <span class="ofn">of ${COUNT}</span>
        ${mv}
      </div>
      <div class="you-grid">
        <div class="you-cell2"><div class="v win num">${you.projected}</div><div class="l">Projected</div></div>
        <div class="you-cell2"><div class="v acc num">${esc(winTxt)}</div><div class="l">Title odds</div></div>
        ${nextCell}
      </div>
      <div class="you-champ">
        Champion: ${champName} ${champState}
        ${you.rank > 1 ? `<span style="margin-left:auto;color:var(--dim);font-weight:600">−${gapTop} to points leader</span>` : ''}
      </div>`;
  }

  /* ============================ ZONE 2 — WHAT CHANGED & WHY ============================ */
  // biggest mover by rank delta (prevRanks vs current). Returns {name,d,dir} or null.
  function biggestMover(rows) {
    if (!prevRanks) return null;
    let up = null, dn = null;
    for (const r of rows) {
      const p = prevRanks[r.name];
      if (!p || p === r.rank) continue;
      if (p > r.rank) { const d = p - r.rank; if (!up || d > up.d) up = { name: r.name, d, dir: 'up' }; }
      else { const d = r.rank - p; if (!dn || d > dn.d) dn = { name: r.name, d, dir: 'dn' }; }
    }
    if (up && dn) return up.d >= dn.d ? up : dn;
    return up || dn;
  }

  // narrative one-liners (spec §3B). Returns array of {html, bar} newest-meaningful first, cap 3.
  function buildNarratives(state, rows) {
    const out = [];
    const byName = Object.fromEntries(rows.map(r => [r.name, r]));
    // freshly completed matches (last ~1.2 days) for "leapt N after X beat Y" + who-called lines
    const recent = state.matches
      .filter(m => m.completed && m.home && m.away && Date.now() - new Date(m.date) < 1.3 * 86400e3)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // 1. rank gain crossed with a result that caused it
    if (prevRanks) {
      const gains = rows
        .map(r => ({ r, d: (prevRanks[r.name] || r.rank) - r.rank }))
        .filter(x => x.d > 0)
        .sort((a, b) => b.d - a.d);
      const topGain = gains[0];
      if (topGain && topGain.d >= 1) {
        const ent = POOL.entries.find(e => e.name === topGain.r.name);
        // find a recent result this entry called correctly
        let cause = null;
        for (const m of recent) {
          const wc = whoCalled(m, state);
          if (wc && wc.predicted.includes(topGain.r.name)) { cause = { team: wc.winner, opp: wc.winner === m.home ? m.away : m.home }; break; }
        }
        out.push({
          bar: ent ? teamHex(cause ? cause.team : ent.champion) : 'var(--win)',
          html: cause
            ? `<b>${esc(firstName(topGain.r.name))}</b> leapt ${topGain.d} spot${topGain.d === 1 ? '' : 's'} to #${topGain.r.rank} after ${esc(cause.team)} beat ${esc(cause.opp)}.`
            : `<b>${esc(firstName(topGain.r.name))}</b> climbed ${topGain.d} spot${topGain.d === 1 ? '' : 's'} to #${topGain.r.rank} this matchday.`,
        });
      }
    }

    // 2. matchday crown taken
    const doneCrowns = (crownsCache || []).filter(c => c && c.done && c.winners && c.winners.length);
    const lastCrown = doneCrowns.length ? doneCrowns[doneCrowns.length - 1] : null;
    if (lastCrown) {
      out.push({
        bar: 'var(--gold)',
        html: `<b>${esc(lastCrown.winners.map(firstName).join(' & '))}</b> took the ${esc(ROUND_SHORT[lastCrown.round] || lastCrown.round)} crown with ${lastCrown.pts} pts.`,
      });
    }

    // 3. a champion-pick team crashed out
    for (const m of recent) {
      const loser = m.completed ? (m.homeWinner ? m.away : m.awayWinner ? m.home : null) : null;
      if (!loser || !state.eliminated.has(loser)) continue;
      const hit = POOL.entries.filter(e => e.champion === loser);
      if (hit.length) {
        out.push({
          bar: 'var(--loss)',
          html: `<b>${esc(loser)}</b> crashed out — ${hit.length} bracket${hit.length === 1 ? '' : 's'} just lost ${hit.length === 1 ? 'its' : 'their'} champion.`,
        });
        break;
      }
    }

    // 4 / 6. who-called on a freshly completed match (consensus or nobody)
    for (const m of recent) {
      const wc = whoCalled(m, state);
      if (!wc) continue;
      if (wc.predicted.length) {
        if (wc.predicted.length >= Math.ceil(COUNT * 0.5)) {
          const topRow = wc.predicted.map(n => byName[n]).filter(Boolean).sort((a, b) => a.rank - b.rank)[0];
          out.push({
            bar: teamHex(wc.winner),
            html: `<b>${wc.predicted.length} of ${COUNT}</b> called ${esc(wc.winner)}${topRow ? ` — ${esc(firstName(topRow.name))} banked the points` : ''}.`,
          });
          break;
        }
      } else {
        out.push({
          bar: 'var(--accent-2)',
          html: `Nobody backed <b>${esc(wc.winner)}</b> — points the whole pool missed.`,
        });
        break;
      }
    }

    // Substantive degrade (spec finding): when no rank moves / crowns have fired yet (early in the
    // tournament prevRanks is null and official=0 for everyone), Zone 2 must NOT read as broken.
    // Surface the most consequential standing-state fact we DO have: the title-odds gap when the
    // favourite isn't the points leader, else the biggest single-pick consensus risk.
    if (!out.length) {
      const fav = titleFavourite();
      const leader = rows[0];
      if (fav && leader && fav.name !== leader.name) {
        const fr = byName[fav.name];
        out.push({
          bar: 'var(--accent)',
          html: `<b>${esc(firstName(fav.name))}</b> leads the title odds at ${(fav.winProb * 100).toFixed(1)}% — ${fr ? `#${fr.rank} on points, behind ${esc(firstName(leader.name))}'s ${leader.projected}` : `not the points leader`}.`,
        });
      } else if (fav) {
        out.push({
          bar: 'var(--accent)',
          html: `<b>${esc(firstName(fav.name))}</b> tops both the board and the simulator — ${(fav.winProb * 100).toFixed(1)}% title odds.`,
        });
      }
    }

    // dedupe by html, cap 3
    const seen = new Set();
    return out.filter(o => { if (seen.has(o.html)) return false; seen.add(o.html); return true; }).slice(0, 3);
  }

  function renderZone2(state, rows) {
    const chip = $('moverChip');
    const list = $('narrList');
    const zone = $('zone2');
    const mover = biggestMover(rows);
    const narr = buildNarratives(state, rows);

    // No mover AND no narratives → don't reserve a full-width strip for "nothing happened".
    // Collapse to a single slim line (the very first load, prevRanks null + sim not ready, lands here).
    if (!mover && !narr.length) {
      if (zone) zone.classList.add('z2-collapsed');
      if (chip) { chip.style.display = 'none'; delete chip.dataset.name; }
      if (list) list.innerHTML = `<div class="narr steady" style="--n-bar:var(--dim)"><span class="nt">Quiet matchday — standings held. Next swing below.</span><span class="auto">auto</span></div>`;
      return;
    }
    if (zone) zone.classList.remove('z2-collapsed');

    // biggest-mover chip — show only when there's a real move; otherwise hide it so the
    // narrative lines own the strip (no "Standings held steady" placeholder competing for space).
    if (chip) {
      if (mover) {
        chip.style.display = '';
        const glyph = mover.dir === 'up' ? '▲' : '▼';
        const cls = mover.dir === 'up' ? 'up' : 'dn';
        const bar = mover.dir === 'up' ? 'var(--win)' : 'var(--loss)';
        const ent = POOL.entries.find(e => e.name === mover.name);
        chip.className = 'mover-chip';
        chip.style.setProperty('--mc-bar', bar);
        chip.dataset.name = mover.name;
        chip.innerHTML = `<span class="mk">Biggest mover</span>
          <div class="mid">
            ${avatar(mover.name, 26, ent && crownCounts()[mover.name] ? { ring: 'var(--gold)' } : null)}
            <span class="nm">${esc(firstName(mover.name))}</span>
            <span class="delta ${cls}">${glyph}${mover.d}</span>
          </div>
          <div class="msub">tap to find in standings</div>`;
      } else {
        chip.style.display = 'none';
        delete chip.dataset.name;
      }
    }
    // narrative lines (always substantive now — buildNarratives degrades to a standing-state fact)
    if (list) {
      list.innerHTML = (narr.length ? narr : [{ bar: 'var(--dim)', html: 'Quiet matchday — standings held. Next swing below.', steady: true }]).map(n =>
        `<div class="narr ${n.steady ? 'steady' : ''}" style="--n-bar:${n.bar}"><span class="nt">${n.html}</span><span class="auto">auto</span></div>`
      ).join('');
    }
  }

  /* ============================ match cards (broadcast score-bug — Matches drawer) ============================ */
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
    let status, scls;
    if (m.state === 'in') { status = '● ' + (m.clock || 'LIVE'); scls = 'live'; }
    else if (m.completed) { status = 'FT'; scls = 'ft'; }
    else { status = mode === 'home' ? fmtTime(m.date) : fmtClock(m.date); scls = 'sched'; }

    const showSc = !(m.state === 'pre' || isNaN(m.hs));
    const isLive = m.state === 'in';
    const sideCls = side => !m.completed ? '' : (side === 'h'
      ? (m.hs > m.as ? '' : m.hs < m.as ? 'lose' : '')
      : (m.as > m.hs ? '' : m.as < m.hs ? 'lose' : ''));

    const left = `<div class="sb-team left ${sideCls('h')}" style="--team:${teamHex(m.home)}">${crest(m.home)}<span class="tnm">${esc(m.home)}</span></div>`;
    const right = `<div class="sb-team right ${sideCls('a')}" style="--team:${teamHex(m.away)}">${crest(m.away)}<span class="tnm">${esc(m.away)}</span></div>`;
    const mid = showSc
      ? `<span class="n ${sideCls('h')}">${m.hs}</span><span class="dash">–</span><span class="n ${sideCls('a')}">${m.as}</span>`
      : `<span class="vs">VS</span>`;

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

  /* ============================ ZONE 4 — WHAT'S NEXT (single biggest-swing) ============================ */
  function nextUpcoming(state, n) {
    return state.matches
      .filter(m => m.home && m.away && m.state === 'pre')
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, n);
  }

  // render the Zone-4 card from the rooting computation (the single match with max |dWin|)
  function renderNextSwing() {
    const el = $('nextSwing'); if (!el) return;
    const up = lastGood ? nextUpcoming(lastGood, 1) : [];
    if (!youName) {
      // no /TARS/ entry — still show the very next kickoff (no personal swing)
      if (!up.length) { el.innerHTML = '<div class="card next-empty">No upcoming matches left.</div>'; return; }
      const m = up[0];
      el.innerHTML = `<div class="card next-card" data-drawer="matches">
        <div class="nx-top"><span class="nx-eye">Next kickoff</span><span class="nx-when">${esc(fmtTime(m.date))}</span></div>
        <div class="nx-fix">
          <span class="nx-team">${crest(m.home)} ${esc(m.home)}</span><span class="nx-vs">VS</span>
          <span class="nx-team">${crest(m.away)} ${esc(m.away)}</span>
        </div>
        <div class="nx-hint">Open Matches for the pool stakes →</div>
      </div>`;
      return;
    }
    if (!hasMC() || !hasRatings()) {
      if (!up.length) { el.innerHTML = '<div class="card next-empty">No upcoming matches left.</div>'; return; }
      const m = up[0];
      el.innerHTML = `<div class="card next-card" data-drawer="matches">
        <div class="nx-top"><span class="nx-eye">Next kickoff</span><span class="nx-when">${esc(fmtTime(m.date))}</span></div>
        <div class="nx-fix"><span class="nx-team">${crest(m.home)} ${esc(m.home)}</span><span class="nx-vs">VS</span><span class="nx-team">${crest(m.away)} ${esc(m.away)}</span></div>
        <div class="nx-hint">Simulator offline — open Matches for raw stakes →</div>
      </div>`;
      return;
    }

    // pick the rooting job whose best outcome moves YOUR title odds the most (max |dWin|)
    const jobs = rooting.items || [];
    let best = null;
    for (const job of jobs) {
      if (job.degraded) continue;
      for (const o of job.outcomes) {
        if (typeof o.dWin !== 'number') continue;
        if (!best || Math.abs(o.dWin) > Math.abs(best.dWin)) best = { job, dWin: o.dWin, outcome: o };
      }
    }

    if (!best) {
      // sim not done yet, or degraded — show the next kickoff as a placeholder (no layout thrash)
      if (!up.length) { el.innerHTML = '<div class="card next-empty">No upcoming matches left.</div>'; return; }
      const m = up[0];
      el.innerHTML = `<div class="card next-card" data-drawer="matches">
        <div class="nx-top"><span class="nx-eye">Next kickoff</span><span class="nx-when">${esc(fmtTime(m.date))}</span></div>
        <div class="nx-fix"><span class="nx-team">${crest(m.home)} ${esc(m.home)}</span><span class="nx-vs">VS</span><span class="nx-team">${crest(m.away)} ${esc(m.away)}</span></div>
        <div class="nx-hint">Simulating your title-odds swing…</div>
      </div>`;
      return;
    }

    const m = best.job.match;
    const dPct = best.dWin * 100;
    const wantCls = dPct > 0.05 ? '' : dPct < -0.05 ? 'neg' : 'neutral';
    const wantVal = (dPct > 0 ? '+' : '') + dPct.toFixed(1) + '%';
    const verb = dPct > 0.05 ? 'You want' : dPct < -0.05 ? 'Avoid' : 'Roughly neutral';
    const swingLine = wantCls === 'neutral'
      ? `<span class="wt">No outcome here moves your title odds much.</span>`
      : `<span class="wt">${verb}: <b>${esc(best.outcome.label)}</b></span><span class="wv">${esc(wantVal)} odds</span>`;

    el.innerHTML = `<div class="card next-card" data-drawer="matches">
      <div class="nx-top"><span class="nx-eye">Biggest swing for you</span><span class="nx-when">${esc(fmtTime(m.date))}</span></div>
      <div class="nx-fix">
        <span class="nx-team">${crest(m.home)} ${esc(m.home)}</span><span class="nx-vs">VS</span>
        <span class="nx-team">${crest(m.away)} ${esc(m.away)}</span>
      </div>
      <div class="nx-want ${wantCls}">
        <svg class="ico wi" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M21 7v6M21 7h-6"/></svg>
        ${swingLine}
      </div>
      <div class="nx-hint">Tap for full fixtures &amp; every match's stakes →</div>
    </div>`;
  }

  function startRooting() {
    if (!lastGood || !youName || !hasMC() || !hasRatings()) { renderNextSwing(); return; }
    if (rooting.hash === currentHash && rooting.done) { renderNextSwing(); return; }
    const state = lastGood;
    const base = simCache.sim;
    const up = nextUpcoming(state, 4);
    if (!up.length) { renderNextSwing(); return; }
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
    if (!jobs.length) { rooting.done = true; renderNextSwing(); return; }
    if (!base) { rooting.done = true; renderNextSwing(); return; }
    const t0 = Date.now();
    let mi = 0, oi = 0;
    const baseP = (base.winProb && typeof base.winProb[youName] === 'number') ? base.winProb[youName] : 0;
    function step() {
      if (rooting.hash !== currentHash) return; // stale — a newer refresh took over
      if (mi >= jobs.length) { rooting.done = true; renderNextSwing(); return; }
      if (Date.now() - t0 > 5000) { // too slow: degrade remaining matches
        for (let i = mi; i < jobs.length; i++) if (jobs[i].outcomes.some(o => o.dWin === null)) jobs[i].degraded = true;
        rooting.done = true; renderNextSwing(); return;
      }
      const job = jobs[mi], out = job.outcomes[oi];
      if (!out) { mi++; oi = 0; renderNextSwing(); setTimeout(step, 15); return; }
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

  /* ============================ leaderboard (Zone 3 glance + Full-board drawer) ============================ */
  const CATS = [
    ['posBonus', 'Exact group positions', 192], ['advancing', 'Advancing teams', 96],
    ['thirdPlace', '3rd-place groups', 24], ['r32w', 'R32 winners', 48],
    ['r16w', 'R16 winners', 32], ['qfw', 'QF winners', 20],
    ['runnerUp', 'Runner-up', 8], ['champion', 'Champion', 50],
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
        <div class="pts num">${r.projected}</div>
      </div>`;
    }).join('');
  }

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

  function winCellHtml(r) {
    const wp = winProbOf(r.name);
    if (wp == null) return `<div class="winwrap"><div class="win-bar"><i style="width:0%"></i></div><span class="win-num num">—</span></div>`;
    const pctNum = wp * 100;
    if (pctNum >= 0.05) {
      const shown = pctNum >= 9.95 ? Math.round(pctNum) + '%' : pctNum.toFixed(1) + '%';
      return `<div class="winwrap"><div class="win-bar"><i style="width:${Math.min(100, Math.max(2, pctNum))}%"></i></div><span class="win-num num">${shown}</span></div>`;
    }
    const tag = r.championAlive ? '<span class="alivetag">In contention</span>' : '<span class="outtag">Long shot</span>';
    return `<div class="winwrap" style="justify-content:flex-end">${tag}</div>`;
  }

  // NEW §4: word-sized inline bump sparkline of last ~8 ranks (inverted-y; rank 1 on top)
  function bumpHtml(name) {
    const series = rankSeries(name, 8);
    if (series.length < 2) return '<span class="bump"></span>';
    const W = 56, H = 22, pad = 2;
    let lo = Math.min(...series), hi = Math.max(...series);
    if (lo === hi) { lo -= 1; hi += 1; } // flat line, give it room
    const n = series.length;
    const pts = series.map((v, i) => {
      const x = pad + (W - 2 * pad) * (n === 1 ? 0 : i / (n - 1));
      // inverted: smaller rank (better) → higher on screen (smaller y)
      const y = pad + (H - 2 * pad) * ((v - lo) / (hi - lo));
      return [x, y];
    });
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const cls = isYou(name) ? 'hot' : '';
    const last = pts[pts.length - 1];
    return `<svg class="bump ${cls}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/><circle class="dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="1.8"/></svg>`;
  }

  function entryHeadHtml(r, e, state, cc, opts) {
    const noBump = !!(opts && opts.noBump);
    const rankCls = r.rank === 1 ? 'r1' : (r.rank <= 3 ? 'r' + r.rank : '');
    let dl = '<span class="delta zero">–</span>';
    if (prevRanks && prevRanks[r.name] && prevRanks[r.name] !== r.rank) {
      dl = prevRanks[r.name] > r.rank
        ? `<span class="delta up">▲${prevRanks[r.name] - r.rank}</span>`
        : `<span class="delta dn">▼${r.rank - prevRanks[r.name]}</span>`;
    }
    const crownTag = cc[r.name] ? `<span class="crowntag" title="Matchday crowns">👑${cc[r.name] > 1 ? '×' + cc[r.name] : ''}</span>` : '';
    const champState = r.championAlive ? '<span class="alivetag">alive</span>' : '<span class="outtag">OUT −50</span>';
    const champName = r.championAlive ? teamHtml(r.champion) : `<span class="dead">${teamHtml(r.champion)}</span>`;
    // GAP column (F1 timing-tower): points behind the leader
    const leadProj = lastRows && lastRows[0] ? lastRows[0].projected : r.projected;
    const gapVal = r.rank === 1 ? '—' : '−' + (leadProj - r.projected);
    // "official" subline is noise while every row reads "0 official" (groups not complete yet) —
    // only show it once a row has actually banked official points.
    const offLine = r.official > 0 ? `<div class="off num">${r.official} official</div>` : '';
    // Zone-3 glance drops the bump column entirely (dead weight before history exists + cuts
    // clutter); the Full-board drawer keeps it where density is expected.
    const bumpCell = noBump ? '' : bumpHtml(r.name);
    return `<div class="entry-head">
      <div class="rank ${rankCls} num">${r.rank}</div>
      ${dl}
      <div class="lb-ava">${avatar(r.name, 28, cc[r.name] ? { ring: 'var(--gold)' } : null)}</div>
      <div class="who">
        <div class="nm">${esc(cleanName(r.name))}${isYou(r.name) ? '<span class="youtag">YOU</span>' : ''}${crownTag}</div>
        <div class="ch" data-bracket="${esc(r.name)}">Champion: ${champName} ${champState}</div>
      </div>
      ${bumpCell}
      ${winCellHtml(r)}
      <div class="gap num">${gapVal}</div>
      <div class="proj"><div class="big num">${r.projected}</div>${offLine}</div>
      <div class="chev"><svg class="ico" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>
    </div>`;
  }

  function sortRows(rows, sortKey) {
    const out = rows.slice();
    if (sortKey === 'official') out.sort((a, b) => b.official - a.official || a.rank - b.rank);
    else if (sortKey === 'max') out.sort((a, b) => b.max - a.max || a.rank - b.rank);
    return out;
  }

  function rowHtml(r, byName, cc, state, openSet, opts) {
    const e = byName[r.name];
    const accentBar = r.rank === 1 ? 'var(--gold)' : (r.rank <= 3 ? 'var(--gold-soft)' : (isYou(r.name) ? 'var(--accent)' : 'var(--line)'));
    const open = openSet.has(r.name);
    const detail = open ? detailHtml(r, e, state) : '';
    const headCls = (opts && opts.noBump) ? ' no-bump' : '';
    return `<div class="entry ${isYou(r.name) ? 'you' : ''} ${open ? 'open' : ''}${headCls}" data-name="${esc(r.name)}" style="--accent-bar:${accentBar}">
      ${entryHeadHtml(r, e, state, cc, opts)}
      ${detail}
    </div>`;
  }

  /* ----- Zone 3 GLANCE (always-visible, windowed for big pools) ----- */
  const GLANCE = { noBump: true };   // Zone-3 rows omit the sparkline (leaner glance, ~5 columns)
  function renderGlance(rows, state) {
    const byName = Object.fromEntries(POOL.entries.map(e => [e.name, e]));
    const cc = crownCounts();
    const lb = $('lb'); if (!lb) return;

    if (!BIG_POOL) {
      // small pool — show all rows (filter applies via toolbar if present)
      const display = sortRows(rows, lbSort);
      const f = lbFilter.trim().toLowerCase();
      let shown = 0;
      const html = display.map((r, i) => {
        const hidden = f && !r.name.toLowerCase().includes(f);
        if (!hidden) shown++;
        return rowHtml(r, byName, cc, state, openNames, GLANCE).replace('class="entry ', 'class="entry ' + (i % 2 ? 'zebra ' : '')).replace('style="--accent-bar', (hidden ? 'data-hidden="1" style="display:none;--accent-bar' : 'style="--accent-bar'));
      }).join('');
      lb.innerHTML = html;
      const cnt = $('lbCount'); if (cnt) cnt.textContent = f ? `Showing ${shown} of ${COUNT}` : `${COUNT} entries`;
      return;
    }

    // BIG pool — when the user is searching, the windowed Top3+neighbourhood can't answer the
    // query (most rows aren't rendered), so honor lbFilter with a flat filtered list. Empty
    // filter falls through to the windowed glance below.
    const f = lbFilter.trim().toLowerCase();
    if (f) {
      const hits = sortRows(rows, lbSort).filter(r => r.name.toLowerCase().includes(f));
      lb.innerHTML = hits.length
        ? hits.map((r, i) => rowHtml(r, byName, cc, state, openNames, GLANCE).replace('class="entry ', 'class="entry ' + (i % 2 ? 'zebra ' : ''))).join('')
        : '<div class="lb-divider">No players match.</div>';
      const cnt = $('lbCount'); if (cnt) cnt.textContent = `Showing ${hits.length} of ${COUNT}`;
      return;
    }

    // BIG pool — windowed: Top 3 + divider + YOU±1 neighbourhood
    const top3 = rows.slice(0, 3);
    const youRow = rows.find(r => isYou(r.name));
    const blocks = [];
    blocks.push(top3.map((r, i) => rowHtml(r, byName, cc, state, openNames, GLANCE).replace('class="entry ', 'class="entry ' + (i % 2 ? 'zebra ' : ''))).join(''));
    if (youRow) {
      const idx = rows.indexOf(youRow);
      const nbrs = [];
      if (idx - 1 >= 0) nbrs.push(rows[idx - 1]);
      nbrs.push(youRow);
      if (idx + 1 < rows.length) nbrs.push(rows[idx + 1]);
      // only show the neighbourhood if it isn't already entirely inside the top-3 block
      const extra = nbrs.filter(r => !top3.includes(r));
      if (extra.length) {
        blocks.push('<div class="lb-divider">Your neighbourhood</div>');
        blocks.push(extra.map(r => rowHtml(r, byName, cc, state, openNames, GLANCE)).join(''));
      }
    }
    lb.innerHTML = blocks.join('');
    const cnt = $('lbCount'); if (cnt) cnt.textContent = `${COUNT} entries`;
  }

  /* ----- Full-board drawer (all rows, search/sort/jump) ----- */
  function renderFullBoard() {
    if (!lastRows || !lastGood) return;
    const byName = Object.fromEntries(POOL.entries.map(e => [e.name, e]));
    const cc = crownCounts();
    const display = sortRows(lastRows, fbSort);
    const f = fbFilter.trim().toLowerCase();
    let shown = 0;
    const html = display.map((r, i) => {
      const hidden = f && !r.name.toLowerCase().includes(f);
      if (!hidden) shown++;
      const base = rowHtml(r, byName, cc, lastGood, openNames);
      const zebra = base.replace('class="entry ', 'class="entry ' + (i % 2 ? 'zebra ' : ''));
      return hidden ? zebra.replace('style="--accent-bar', 'data-hidden="1" style="display:none;--accent-bar') : zebra;
    }).join('');
    const fb = $('fbLb'); if (fb) fb.innerHTML = html;
    const cnt = $('fbCount'); if (cnt) cnt.textContent = f ? `Showing ${shown} of ${COUNT}` : `${COUNT} entries`;
  }
  function applyFbFilter() {
    const f = fbFilter.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#fbLb .entry').forEach(row => {
      const n = (row.dataset.name || '').toLowerCase();
      const hide = f && !n.includes(f);
      row.style.display = hide ? 'none' : '';
      if (!hide) shown++;
    });
    const cnt = $('fbCount'); if (cnt) cnt.textContent = f ? `Showing ${shown} of ${COUNT}` : `${COUNT} entries`;
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
  }

  // live-count badge in nav + dock badge (computed every refresh, cheap)
  function updateLiveBadges(state) {
    const liveCount = state.matches.filter(m => m.state === 'in').length;
    const lp = $('livepill'); if (lp) lp.style.display = liveCount ? '' : 'none';
    const lt = $('liveTxt'); if (lt) lt.textContent = liveCount + ' LIVE';
    const db = $('dockMatchesBadge'); if (db) db.textContent = liveCount ? liveCount + ' live' : '';
  }

  /* ============================ brackets drawer: consensus board ============================ */
  function tallyList(getList) {
    const m = {};
    for (const e of POOL.entries) for (const t of [].concat(getList(e))) (m[t] = m[t] || []).push(e.name);
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }

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
    Object.keys(Engine.GROUPS).forEach(g => {
      slots.push(consensusSlot('Group ' + g + ' winner', tallyList(e => e.groups[g][0]), state, { cap: 6 }));
    });
    slots.push(consensusSlot('3rd-place groups backed', tallyGroups(e => e.thirds), state, { cap: 8, isGroup: true }));
    $('consensusBoard').innerHTML = slots.join('');
  }

  function tallyGroups(getList) {
    const m = {};
    for (const e of POOL.entries) for (const g of [].concat(getList(e))) (m[g] = m[g] || []).push(e.name);
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }

  /* ============================ brackets drawer: pick matrix (small pools only) ============================ */
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

    const rowH = (label, cells, consensus, extraCls) =>
      `<tr class="${extraCls || ''}"><th class="rowlab">${label}</th><td class="cons">${consensus}</td>` +
      cells.map((c, i) => `<td class="cell-${c.st}${i === youIdx ? ' youcol' : ''}"${c.title ? ` title="${esc(c.title)}"` : ''}>${c.html}</td>`).join('') + '</tr>';

    const head = `<thead><tr><th class="rowlab">Pick</th><th class="cons">Consensus</th>${entries.map((e, i) =>
      `<th class="${i === youIdx ? 'youcol' : ''}">${esc(firstName(e.name))}</th>`).join('')}</tr></thead>`;

    const rows = [];
    { const vals = entries.map(e => e.champion);
      rows.push(rowH('👑 Champion', entries.map(e => ({ st: stChamp(e.champion), html: esc(e.champion) + wolf(e.champion, vals) })), majority(vals), 'grp-start')); }
    { const vals = entries.map(e => e.runnerUp);
      rows.push(rowH('🥈 Runner-up', entries.map(e => ({ st: stRunner(e.runnerUp), html: esc(e.runnerUp) + wolf(e.runnerUp, vals) })), majority(vals))); }
    { const cnt = {};
      for (const e of entries) for (const t of e.sf) cnt[t] = (cnt[t] || 0) + 1;
      const sortedAll = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const per = entries.map(e => e.sf.slice().sort((a, b) => (cnt[b] - cnt[a]) || a.localeCompare(b)));
      for (let i = 0; i < 4; i++) {
        const cons = sortedAll[i] ? `${esc(sortedAll[i][0])} ${sortedAll[i][1]}/${N}` : '—';
        rows.push(rowH(i === 0 ? '🚀 Semifinalists' : '&nbsp;', per.map(p => {
          const t = p[i];
          return { st: stSf(t), html: esc(t) + (cnt[t] === 1 ? ' 🐺' : '') };
        }), cons, i === 0 ? 'grp-start' : ''));
      }
    }
    { rows.push(rowH('🛡️ Reaches QF', entries.map(e => {
        const dead = e.qf.filter(t => elim.has(t) && !k.qf.has(t));
        const banked = e.qf.filter(t => k.qf.has(t)).length;
        const alive = 8 - dead.length;
        const st = dead.length ? 'warn' : (banked === 8 ? 'ok' : 'pend');
        return { st, html: esc(alive + '/8 alive'), title: dead.length ? 'Out: ' + dead.join(', ') : '' };
      }), '—', 'grp-start')); }
    Object.keys(Engine.GROUPS).forEach((g, gi) => {
      const vals = entries.map(e => e.groups[g][0]);
      rows.push(rowH('Grp ' + esc(g) + ' winner', entries.map(e => {
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

  /* ============================ brackets drawer: single player view ============================ */
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

  /* ============================ brackets drawer: head-to-head ============================ */
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

  /* ============================ more drawer: badges ============================ */
  function renderBadges() {
    const wrap = $('badges'), zone = $('badgesCons');
    if (!wrap) return;
    if (!badgesCache) {
      wrap.innerHTML = '<div class="sec-lead">Badges unavailable right now — they land once matchday crowns are decided.</div>';
      if (zone) zone.style.display = 'none';
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
    if (zone) {
      if (cons.length) {
        zone.style.display = '';
        $('badgesConsList').innerHTML = cons.map(({ name, b }) =>
          `<div class="bdg"><span class="roundel">${esc(b.emoji)}</span><span><span class="bl">${esc(b.label)}</span> — ${esc(firstName(name))}<br><span class="bd">${esc(b.desc)}</span></span></div>`).join('');
      } else zone.style.display = 'none';
    }
  }

  /* ============================ more drawer: consensus columns ============================ */
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

  /* ============================ more drawer: most similar brackets ============================ */
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

  /* ============================ digest + WhatsApp recap (ONE share action) ============================ */
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
    try { await navigator.clipboard.writeText(text); flashDigest('✅ Copied!'); }
    catch (e) { prompt('Copy the digest:', text); }
  }
  function flashDigest(msg) {
    const b = $('digestBtn'); if (!b) return;
    const o = b.dataset.orig || b.innerHTML; b.dataset.orig = o;
    b.title = msg; setTimeout(() => { b.title = 'Copy WhatsApp digest'; }, 1800);
  }
  function flashRecap(msg) {
    const b = $('recapBtn'); if (!b) return;
    const o = b.dataset.orig || b.innerHTML; b.dataset.orig = o;
    const lbl = b.querySelector('.lbl');
    if (lbl) { lbl.textContent = msg; setTimeout(() => { lbl.textContent = 'Share'; }, 2400); }
    else { b.title = msg; setTimeout(() => { b.title = 'Share recap'; }, 2400); }
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
    const canvas = '#0A0E14', gold = '#E8B73A', cream = '#F2F5F9';
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
    if (!lastRows || !lastGood) { flashRecap('⏳ Loading…'); return; }
    const text = digest(lastRows, lastGood);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
    let c = null;
    try { c = drawRecap(lastRows); } catch (e) { c = null; }
    if (!c || !c.toBlob) { flashRecap(copied ? '✅ Text copied' : '⚠️ Failed'); return; }
    c.toBlob(blob => {
      if (!blob) { flashRecap(copied ? '✅ Text copied' : '⚠️ Failed'); return; }
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
      flashRecap('✅ ' + (shared ? 'Shared' : 'Saved'));
    }, 'image/png');
  }

  /* ============================ MC simulation pipeline ============================ */
  function scheduleSim() {
    if (!lastGood || !lastRows) return;
    if (!hasMC() || !hasRatings()) { renderNextSwing(); return; }
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
  // sim landed — repaint the zones whose numbers depend on win% (hero gauge, you-tile, standings)
  function applySim() {
    if (!lastGood || !lastRows) return;
    try {
      renderTodayStory(lastGood, lastRows);
      renderHero(lastGood, lastRows);
      renderYou(lastGood, lastRows);
      renderGlance(lastRows, lastGood);
      if (drawersBuilt.board) renderFullBoard();
      tickScan();
    } catch (e) {}
  }

  /* ============================ drawers (slide-up sheets) ============================ */
  let openDrawer = null;
  function buildDrawer(name) {
    if (!lastGood || !lastRows) return;
    if (name === 'matches' && !drawersBuilt.matches) {
      renderRoundbar(lastGood); renderMatches(lastGood); drawersBuilt.matches = true;
    } else if (name === 'board' && !drawersBuilt.board) {
      renderPodium(lastRows, 'boardPodium'); renderFullBoard(); drawersBuilt.board = true;
    } else if (name === 'brackets' && !drawersBuilt.brackets) {
      renderConsensusBoard(lastGood); renderMatrix(lastGood); renderBrViewToggle();
      renderPlayerView(lastGood); renderH2H(lastGood, lastRows); drawersBuilt.brackets = true;
    } else if (name === 'more' && !drawersBuilt.more) {
      renderBadges(); renderConsensus(lastGood); renderSimilar(); drawersBuilt.more = true;
    }
  }
  function showDrawer(name, focusYou) {
    const d = $('drawer-' + name); const scrim = $('scrim');
    if (!d) return;
    buildDrawer(name);
    if (openDrawer && openDrawer !== name) { const o = $('drawer-' + openDrawer); if (o) { o.classList.remove('open'); o.setAttribute('aria-hidden', 'true'); } }
    d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.classList.add('open');
    document.body.style.overflow = 'hidden';
    openDrawer = name;
    if (focusYou) {
      setTimeout(() => {
        const row = d.querySelector('.entry.you');
        if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900); }
      }, 300);
    }
  }
  function closeDrawer() {
    if (!openDrawer) return;
    const d = $('drawer-' + openDrawer); const scrim = $('scrim');
    if (d) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }
    if (scrim) scrim.classList.remove('open');
    document.body.style.overflow = '';
    openDrawer = null;
  }
  // open a player's bracket in the Brackets drawer
  function openBracketFor(name) {
    const idx = POOL.entries.findIndex(e => e.name === name);
    showDrawer('brackets');
    const sel = $('pvSel');
    if (sel && idx >= 0) { sel.value = idx; renderPlayerView(lastGood); }
  }

  /* ============================ main refresh ============================ */
  function renderAll(state, rows) {
    renderTodayStory(state, rows);
    renderHero(state, rows);
    renderYou(state, rows);
    renderZone2(state, rows);
    renderGlance(rows, state);
    updateLiveBadges(state);
    // rebuild any currently-open / already-built drawers so they stay live
    drawersBuilt = { matches: false, board: false, brackets: false, more: false };
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
      lastGood = state; lastRows = rows; lastRaw = raw; lastSource = source;
      currentHash = resultsHash(matches);
      // NEW: append this snapshot to the rank-history ring buffer (powers movers + sparkline)
      pushRankHistory(currentHash, rows);
      crownsCache = mcTry(() => MC.crowns(state, POOL.entries), null);
      badgesCache = mcTry(() => MC.badges(state, POOL.entries, crownsCache || [], rows), null);
      renderAll(state, rows);
      // reveal the glance toolbar only for the big pool (84) — 10-pool needs no search
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
  // Zone-3 glance: expand/collapse a row (build detail lazily); tap champion sub-line → bracket
  $('lb').addEventListener('click', e => {
    const champ = e.target.closest('.ch[data-bracket]');
    if (champ) { e.stopPropagation(); openBracketFor(champ.dataset.bracket); return; }
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

  // Full-board drawer: same expand behaviour
  $('fbLb').addEventListener('click', e => {
    const champ = e.target.closest('.ch[data-bracket]');
    if (champ) { e.stopPropagation(); openBracketFor(champ.dataset.bracket); return; }
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

  // Zone-3 glance toolbar (big pool only)
  const lbSearchEl = $('lbSearch');
  if (lbSearchEl) lbSearchEl.addEventListener('input', () => {
    lbFilter = lbSearchEl.value;
    if (lastRows && lastGood) renderGlance(lastRows, lastGood);
  });
  const lbSortEl = $('lbSort');
  if (lbSortEl) lbSortEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    lbSort = b.dataset.sort || 'projected';
    lbSortEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    if (lastRows && lastGood) renderGlance(lastRows, lastGood);
  });
  const jumpBtn = $('lbJumpMe');
  if (jumpBtn) {
    if (!youName) jumpBtn.style.display = 'none';
    jumpBtn.addEventListener('click', () => {
      let row = document.querySelector('#lb .entry.you');
      if (!row) { showDrawer('board', true); return; } // windowed out → use full board
      row.style.display = '';
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('flash');
      setTimeout(() => row.classList.remove('flash'), 900);
    });
  }

  // Full-board drawer toolbar
  const fbSearchEl = $('fbSearch');
  if (fbSearchEl) fbSearchEl.addEventListener('input', () => { fbFilter = fbSearchEl.value; applyFbFilter(); });
  const fbSortEl = $('fbSort');
  if (fbSortEl) fbSortEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    fbSort = b.dataset.sort || 'projected';
    fbSortEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    renderFullBoard(); applyFbFilter();
  });
  const fbJumpBtn = $('fbJumpMe');
  if (fbJumpBtn) {
    if (!youName) fbJumpBtn.style.display = 'none';
    fbJumpBtn.addEventListener('click', () => {
      const row = document.querySelector('#fbLb .entry.you');
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

  // Zone-2 mover chip → scroll-flash that player's standings row (or open full board)
  const moverChip = $('moverChip');
  if (moverChip) moverChip.addEventListener('click', () => {
    const n = moverChip.dataset.name; if (!n) return;
    let row = document.querySelector('#lb .entry[data-name="' + (window.CSS && CSS.escape ? CSS.escape(n) : n) + '"]');
    if (!row) { openBracketFor(n); return; }
    row.style.display = '';
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 900);
  });

  // drawer dock pills + cards that route to a drawer
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-drawer]');
    if (opener) { showDrawer(opener.dataset.drawer); return; }
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) { closeDrawer(); return; }
  });
  // scrim + ESC close
  const scrimEl = $('scrim');
  if (scrimEl) scrimEl.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openDrawer) closeDrawer(); });

  // view-all → full board drawer
  const viewAllBtn = $('viewAllBtn');
  if (viewAllBtn) viewAllBtn.addEventListener('click', () => showDrawer('board'));

  $('refreshBtn').onclick = refresh;
  $('digestBtn').onclick = copyDigest;
  $('recapBtn').onclick = shareRecap;

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
