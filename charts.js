/* FIFA Prediction Pro — charts.js  (BLUEPRINT §6)
   Hand-rolled inline-SVG charts. ZERO dependencies (no Chart.js / D3 / ECharts).
   Theme-aware (currentColor + CSS custom props, so it inverts on light/dark and
   uses the gold/team palette already in tokens). prefers-reduced-motion safe:
   the draw-from-0 stroke/area animation is skipped under reduce. Crisp on phones
   (vector, viewBox-scaled), tabular numerals, aria-labels on every chart root.

   UMD; global CHARTS. Browser + node safe. Degrades when VIZ is absent.

   PUBLIC API ----------------------------------------------------------------
     CHARTS.rankRace(container, {history, rows, youName, highlight})
       The BUMP chart. x = matchday index (history oldest->newest),
       y = rank INVERTED (#1 on top), smooth bump curves. Highlights leader +
       YOU + top movers (3-6 series) bold w/ avatar + champion-code line-end
       labels + 👑 on the leader; ghosts the rest faint. <2 history pts -> message.

     CHARTS.titleRace(container, {crowns | winProbHistory, rows, youName})
       Win-prob / expRank over knockout windows, overlaid lines.

     CHARTS.momentum(container, {row, crowns})
       Per-player points-accumulation step line.

   CONTAINER / CLASS CONTRACT ------------------------------------------------
     - `container` may be an Element or an id string; its innerHTML is replaced.
     - Root node rendered: <svg class="chart chart--rankrace|titlerace|momentum"
         role="img" aria-label="…" viewBox="0 0 W H" preserveAspectRatio>.
       (When there is no data, root is <div class="chart chart--empty"> instead.)
     - Drawn elements carry stable classes for CSS theming/animation:
         .chart-grid          gridlines / baseline (stroke:currentColor low-op)
         .chart-axislabel     tick text (fill:currentColor low-op, tabular-nums)
         .chart-series        a highlighted line/area path group
         .chart-series.ghost  a de-emphasised (faint) series
         .chart-series.you    the YOU series      .chart-series.leader  the #1 series
         .chart-line          stroke path (vector-effect:non-scaling-stroke)
         .chart-area          filled area (titleRace/momentum)
         .chart-dot           data point marker
         .chart-endcap        line-end label group (avatar + code + crown)
         .chart-draw          carries the draw-from-0 animation (stroke-dash /
                              clip reveal); removed when reduce-motion.
     - All colors come from CSS vars with literal fallbacks so it renders even
       with no stylesheet: --gold #E8B73A, --accent #1FA2FF, --win #2BD66A,
       --loss #FF5C5C, --ink currentColor. A team series uses VIZ.teamColor().
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CHARTS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  // the host global (window/self in a browser, global in node) — for VIZ lookup.
  var GLOBAL = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
    : (typeof self !== 'undefined') ? self
    : (typeof global !== 'undefined') ? global : this;

  /* ----------------------------- tiny utils ----------------------------- */
  function el(id) {
    if (id && id.nodeType === 1) return id;
    if (typeof document === 'undefined') return null;
    return typeof id === 'string' ? document.getElementById(id) : id;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : (d || 0); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }

  // VIZ is optional; degrade to local helpers if absent. Resolve across the
  // browser global (window/self), the UMD-captured root, and globalThis so it
  // works whether charts.js is loaded as a <script> (window.VIZ) or required.
  function VIZ_() { return (GLOBAL && GLOBAL.VIZ) || null; }
  function teamColor(team) {
    var v = VIZ_();
    if (v && typeof v.teamColor === 'function') { try { return v.teamColor(team); } catch (e) {} }
    return null;
  }
  function avatarSvg(name, size, opts) {
    var v = VIZ_();
    if (v && typeof v.avatar === 'function') { try { return v.avatar(name, size, opts); } catch (e) {} }
    return null;
  }
  function initials(name) {
    var v = VIZ_();
    if (v && typeof v.initials === 'function') { try { return v.initials(name); } catch (e) {} }
    var parts = String(name).replace(/\[.*?\]/g, '').replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
    var a = (parts[0] || '?')[0] || '?';
    var b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (a + b).toUpperCase();
  }
  // 3-letter champion code — no canonical code map in the codebase, so derive
  // from the team name (letters only, first 3, upper). "DR Congo"->"DRC"-ish.
  function teamCode(team) {
    if (!team) return '';
    var letters = String(team).replace(/[^A-Za-z]/g, '');
    return letters.slice(0, 3).toUpperCase();
  }
  function reduceMotion() {
    try {
      return typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  /* ------------------- DOM-or-string SVG builder ------------------------ */
  // We build the SVG as a markup string (works in node-less tests too) and
  // assign via innerHTML, then post-process for animation in the browser.
  function svgOpen(cls, w, h, ariaLabel) {
    return '<svg class="chart ' + esc(cls) + '" role="img" aria-label="' + esc(ariaLabel) + '" ' +
      'viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" ' +
      'width="100%" font-family="Inter,system-ui,sans-serif" ' +
      'style="display:block;overflow:visible;color:var(--ink,currentColor)">';
  }
  function emptyNote(container, cls, msg) {
    var c = el(container);
    var html = '<div class="chart chart--empty ' + esc(cls) + '" role="img" aria-label="' + esc(msg) + '" ' +
      'style="display:flex;align-items:center;justify-content:center;min-height:120px;padding:18px;' +
      'text-align:center;color:var(--muted,rgba(127,127,127,.7));' +
      'font:600 13px/1.5 Inter,system-ui,sans-serif;">' + esc(msg) + '</div>';
    if (c) c.innerHTML = html;
    return html;
  }

  /* --------------- smooth bump curve (curveBumpX, hand-rolled) ----------
     Monotone-in-x cubic with horizontal control tangents — same shape D3's
     curveBumpX produces; reads as a clean "bump chart" S between matchdays. */
  function bumpPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + f1(pts[0][0]) + ' ' + f1(pts[0][1]);
    var d = 'M' + f1(pts[0][0]) + ' ' + f1(pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      var x0 = pts[i - 1][0], y0 = pts[i - 1][1];
      var x1 = pts[i][0], y1 = pts[i][1];
      var mx = (x0 + x1) / 2;
      d += ' C' + f1(mx) + ' ' + f1(y0) + ' ' + f1(mx) + ' ' + f1(y1) + ' ' + f1(x1) + ' ' + f1(y1);
    }
    return d;
  }
  // straight polyline (titleRace overlay / momentum step uses its own)
  function linePath(pts) {
    if (!pts.length) return '';
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1]); }).join(' ');
  }
  // step-after path for points-accumulation
  function stepPath(pts) {
    if (!pts.length) return '';
    var d = 'M' + f1(pts[0][0]) + ' ' + f1(pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      d += ' L' + f1(pts[i][0]) + ' ' + f1(pts[i - 1][1]) + ' L' + f1(pts[i][0]) + ' ' + f1(pts[i][1]);
    }
    return d;
  }

  /* ------------- post-render: draw-from-0 animation (browser) -----------
     Stroke-dash reveal on .chart-line.chart-draw + a clip/opacity reveal on
     .chart-area.chart-draw. Gated by prefers-reduced-motion. */
  function animate(svgNode) {
    if (!svgNode || reduceMotion()) return;
    var DUR = 500, EASE = 'cubic-bezier(.22,.61,.36,1)';
    var lines = svgNode.querySelectorAll('.chart-line.chart-draw');
    for (var i = 0; i < lines.length; i++) {
      (function (ln, idx) {
        var len;
        try { len = ln.getTotalLength(); } catch (e) { len = 0; }
        if (!len) return;
        ln.style.transition = 'none';
        ln.style.strokeDasharray = len + ' ' + len;
        ln.style.strokeDashoffset = String(len);
        // force reflow so the transition takes
        // eslint-disable-next-line no-unused-expressions
        ln.getBoundingClientRect();
        var delay = Math.min(idx * 40, 160);
        ln.style.transition = 'stroke-dashoffset ' + DUR + 'ms ' + EASE + ' ' + delay + 'ms';
        ln.style.strokeDashoffset = '0';
      })(lines[i], i);
    }
    var areas = svgNode.querySelectorAll('.chart-area.chart-draw, .chart-dot.chart-draw, .chart-endcap.chart-draw');
    for (var j = 0; j < areas.length; j++) {
      (function (a, idx) {
        a.style.transition = 'none';
        a.style.opacity = '0';
        a.getBoundingClientRect();
        a.style.transition = 'opacity ' + DUR + 'ms ' + EASE + ' ' + Math.min(120 + idx * 30, 360) + 'ms';
        a.style.opacity = a.getAttribute('data-op') || '1';
      })(areas[j], j);
    }
  }
  function mount(container, html, cls, msgFallback) {
    var c = el(container);
    if (!c) return html;            // node/test path: return markup
    c.innerHTML = html;
    var svg = c.querySelector('svg.chart');
    if (svg) animate(svg);
    return html;
  }

  /* ===================================================================== */
  /* 1) RANK-RACE / BUMP                                                    */
  /* ===================================================================== */
  function rankRace(container, opts) {
    opts = opts || {};
    var history = Array.isArray(opts.history) ? opts.history.filter(function (h) { return h && h.ranks; }) : [];
    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var youName = opts.youName || null;
    var highlightIn = Array.isArray(opts.highlight) ? opts.highlight.slice() : [];

    if (history.length < 2) {
      return emptyNote(container, 'chart--rankrace',
        'Rank race appears after two or more updates. Check back once more matches are scored.');
    }

    // series per name = ranks across the history snapshots (oldest->newest).
    // null where a snapshot has no rank for that name (line breaks cleanly).
    var names = {};
    history.forEach(function (h) { Object.keys(h.ranks).forEach(function (n) { names[n] = true; }); });
    var allNames = Object.keys(names);
    var N = history.length;

    function seriesFor(name) {
      return history.map(function (h) {
        var v = h.ranks[name];
        return typeof v === 'number' ? v : null;
      });
    }
    function lastRank(name) {
      var s = seriesFor(name);
      for (var i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i];
      return null;
    }
    function firstRank(name) {
      var s = seriesFor(name);
      for (var i = 0; i < s.length; i++) if (s[i] != null) return s[i];
      return null;
    }

    // champion lookup from rows
    var champOf = {};
    rows.forEach(function (r) { if (r && r.name) champOf[r.name] = r.champion; });

    // choose highlights: explicit -> leader (rank 1 latest) -> YOU -> top movers.
    var hi = [];
    function pushHi(n) { if (n && hi.indexOf(n) < 0 && names[n]) hi.push(n); }
    highlightIn.forEach(pushHi);
    // leader = name at rank 1 in newest snapshot
    var newest = history[history.length - 1].ranks;
    var leaderName = null, bestR = Infinity;
    Object.keys(newest).forEach(function (n) { if (newest[n] < bestR) { bestR = newest[n]; leaderName = n; } });
    pushHi(leaderName);
    pushHi(youName);
    // top movers by |firstRank - lastRank|
    var movers = allNames.map(function (n) {
      var fr = firstRank(n), lr = lastRank(n);
      return { name: n, delta: (fr != null && lr != null) ? (fr - lr) : 0 };
    }).sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    for (var mi = 0; mi < movers.length && hi.length < 6; mi++) pushHi(movers[mi].name);
    hi = hi.slice(0, 6);

    // y domain over ranks that actually appear (so a 10-pool isn't squashed by a 94-pool).
    var ranksSeen = [];
    history.forEach(function (h) { Object.keys(h.ranks).forEach(function (n) { ranksSeen.push(h.ranks[n]); }); });
    var lo = Math.min.apply(null, ranksSeen);
    var hiR = Math.max.apply(null, ranksSeen);
    if (lo === hiR) { lo = Math.max(1, lo - 1); hiR = hiR + 1; }

    // geometry
    var W = 720, H = 360;
    var padL = 34, padR = 132, padT = 22, padB = 34; // padR leaves room for end-labels
    var plotW = W - padL - padR, plotH = H - padT - padB;
    function X(i) { return padL + (N === 1 ? 0 : plotW * (i / (N - 1))); }
    // inverted: rank 1 (lo) -> top (small y)
    function Y(rank) { return padT + plotH * ((rank - lo) / (hiR - lo)); }

    var gold = 'var(--gold,#E8B73A)', accent = 'var(--accent,#1FA2FF)';
    var parts = [];
    parts.push(svgOpen('chart--rankrace', W, H, 'Rank race bump chart: standings by matchday, rank 1 on top'));

    // --- gridlines + x ticks (matchday index) ---
    parts.push('<g class="chart-grid" stroke="currentColor" stroke-opacity=".10" stroke-width="1">');
    for (var gi = 0; gi < N; gi++) {
      var gx = X(gi);
      parts.push('<line x1="' + f1(gx) + '" y1="' + padT + '" x2="' + f1(gx) + '" y2="' + (padT + plotH) + '"/>');
    }
    parts.push('</g>');
    parts.push('<g class="chart-axislabel" fill="currentColor" fill-opacity=".55" ' +
      'font="700 11px Inter" style="font:700 11px/1 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums">');
    for (var ti = 0; ti < N; ti++) {
      parts.push('<text x="' + f1(X(ti)) + '" y="' + (H - 12) + '" text-anchor="middle">' + (ti + 1) + '</text>');
    }
    parts.push('<text x="' + padL + '" y="' + (padT - 8) + '" text-anchor="start" fill-opacity=".5">#1</text>');
    parts.push('</g>');

    var hiSet = {}; hi.forEach(function (n) { hiSet[n] = true; });

    // --- ghost (faint) series first, so highlights paint on top ---
    parts.push('<g class="chart-ghosts">');
    allNames.forEach(function (n) {
      if (hiSet[n]) return;
      var s = seriesFor(n);
      var pts = [];
      for (var i = 0; i < N; i++) if (s[i] != null) pts.push([X(i), Y(s[i])]);
      if (pts.length < 2) return;
      parts.push('<path class="chart-series ghost chart-line" d="' + bumpPath(pts) + '" ' +
        'fill="none" stroke="currentColor" stroke-opacity=".10" stroke-width="1.5" ' +
        'vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>');
    });
    parts.push('</g>');

    // --- highlighted series ---
    hi.forEach(function (n, idx) {
      var s = seriesFor(n);
      var pts = [];
      for (var i = 0; i < N; i++) if (s[i] != null) pts.push([X(i), Y(s[i])]);
      if (!pts.length) return;
      var isYou = youName && n === youName;
      var isLeader = n === leaderName;
      var col = isLeader ? gold : (isYou ? accent : (teamColor(champOf[n]) || accent));
      var cls = 'chart-series' + (isYou ? ' you' : '') + (isLeader ? ' leader' : '');
      parts.push('<g class="' + cls + '" data-name="' + esc(n) + '">');
      if (pts.length >= 2) {
        // soft underglow for legibility against ghosts
        parts.push('<path class="chart-line" d="' + bumpPath(pts) + '" fill="none" ' +
          'stroke="' + col + '" stroke-opacity=".22" stroke-width="7" ' +
          'vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>');
        parts.push('<path class="chart-line chart-draw" d="' + bumpPath(pts) + '" fill="none" ' +
          'stroke="' + col + '" stroke-width="' + (isLeader ? 3.5 : 3) + '" ' +
          'vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>');
      }
      // node dots
      pts.forEach(function (p) {
        parts.push('<circle class="chart-dot chart-draw" data-op="1" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) +
          '" r="' + (isLeader ? 3.2 : 2.6) + '" fill="' + col + '" stroke="var(--canvas,#0A0E14)" stroke-width="1"/>');
      });
      // --- line-end label: avatar glyph + champion code (+ crown on leader) ---
      var last = pts[pts.length - 1];
      var lx = last[0] + 10, ly = last[1];
      var av = avatarSvg(n, 22, isLeader ? { ring: gold, crown: true } : (isYou ? { ring: accent } : { teamColor: champOf[n] }));
      var code = teamCode(champOf[n]);
      parts.push('<g class="chart-endcap chart-draw" data-op="1" transform="translate(' + f1(lx) + ',' + f1(ly - 11) + ')">');
      if (av) {
        // embed avatar SVG inline via <g> + foreignObject-free: avatar is its own <svg>, nest it
        parts.push('<g transform="translate(0,0)">' + av.replace('<svg', '<svg x="0" y="0"') + '</g>');
      } else {
        parts.push('<circle cx="11" cy="11" r="11" fill="' + col + '"/>' +
          '<text x="11" y="15" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">' + esc(initials(n)) + '</text>');
      }
      parts.push('<text x="28" y="9" font-size="11" font-weight="800" fill="' + col + '" ' +
        'style="font-family:\'Saira Condensed\',Inter,system-ui,sans-serif;letter-spacing:.02em">' + esc(code) + '</text>');
      parts.push('<text x="28" y="20" font-size="9.5" font-weight="700" fill="currentColor" fill-opacity=".7" ' +
        'style="font-family:Inter,system-ui,sans-serif">' + esc(shortName(n)) + (isLeader ? ' 👑' : '') + '</text>');
      parts.push('</g>');
      parts.push('</g>');
    });

    parts.push('</svg>');
    return mount(container, parts.join(''), 'chart--rankrace');
  }

  function shortName(n) {
    var clean = String(n).replace(/\[.*?\]/g, '').trim();
    return clean.length > 12 ? clean.slice(0, 11) + '…' : clean;
  }

  /* ===================================================================== */
  /* 2) TITLE-RACE  (win-prob / expRank over knockout windows)             */
  /* ===================================================================== */
  // Accepts either:
  //   opts.winProbHistory = [{round, probs:{name->0..1}}, ...]  (preferred)
  //   OR opts.crowns (MC.crowns rows) -> derive an expected-rank proxy track
  //      from ranksAfter per window (inverted so "up" = better).
  function titleRace(container, opts) {
    opts = opts || {};
    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var youName = opts.youName || null;

    // Build windows[] = [{label, vals:{name->0..1 (higher=better)}}]
    var windows = [];
    var mode = 'prob';
    if (Array.isArray(opts.winProbHistory) && opts.winProbHistory.length) {
      windows = opts.winProbHistory.map(function (w) {
        return { label: w.round || w.label || '', vals: w.probs || w.winProb || {} };
      });
    } else if (Array.isArray(opts.crowns) && opts.crowns.length) {
      // derive: for each crown window, invert ranksAfter to a 0..1 "title heat"
      mode = 'rank';
      var done = opts.crowns.filter(function (c) { return c && c.ranksAfter; });
      // pool size from the widest ranksAfter
      var size = 0;
      done.forEach(function (c) { size = Math.max(size, Object.keys(c.ranksAfter).length); });
      windows = done.map(function (c) {
        var vals = {}, ranks = {};
        Object.keys(c.ranksAfter).forEach(function (n) {
          var rk = c.ranksAfter[n];
          vals[n] = size > 1 ? (size - rk) / (size - 1) : 1; // rank1 -> 1, last -> 0
          ranks[n] = rk;
        });
        return { label: c.round || '', vals: vals, ranks: ranks };
      });
    }

    if (windows.length < 2) {
      return emptyNote(container, 'chart--titlerace',
        'Title race chart appears once knockout windows have been simulated.');
    }

    // series to draw = leader + YOU + top-3 by latest value (cap 6)
    var latest = windows[windows.length - 1].vals;
    var ranked = Object.keys(latest).sort(function (a, b) { return num(latest[b]) - num(latest[a]); });
    var pick = [];
    function add(n) { if (n && pick.indexOf(n) < 0 && latest[n] != null) pick.push(n); }
    // leader (rows rank 1) + you
    var leaderRow = rows.filter(function (r) { return r && r.rank === 1; })[0];
    if (leaderRow) add(leaderRow.name);
    add(youName);
    for (var i = 0; i < ranked.length && pick.length < 6; i++) add(ranked[i]);

    var champOf = {}; rows.forEach(function (r) { if (r && r.name) champOf[r.name] = r.champion; });
    var leaderName = leaderRow ? leaderRow.name : ranked[0];

    var W = 720, H = 320, padL = 40, padR = 124, padT = 20, padB = 38;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var Nx = windows.length;
    function X(i) { return padL + (Nx === 1 ? 0 : plotW * (i / (Nx - 1))); }
    function Y(v) { return padT + plotH * (1 - clamp(num(v), 0, 1)); } // 0 bottom, 1 top

    var gold = 'var(--gold,#E8B73A)', accent = 'var(--accent,#1FA2FF)';
    var parts = [];
    var lbl = mode === 'prob' ? 'win probability' : 'title position';
    parts.push(svgOpen('chart--titlerace', W, H, 'Title race: ' + lbl + ' across knockout rounds'));

    // grid + y ticks (0/25/50/75/100%)
    parts.push('<g class="chart-grid" stroke="currentColor" stroke-opacity=".10" stroke-width="1">');
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      var gy = Y(t);
      parts.push('<line x1="' + padL + '" y1="' + f1(gy) + '" x2="' + (padL + plotW) + '" y2="' + f1(gy) + '"/>');
    });
    parts.push('</g>');
    parts.push('<g class="chart-axislabel" fill="currentColor" fill-opacity=".55" ' +
      'style="font:700 10px/1 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums">');
    if (mode === 'prob') {
      [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
        parts.push('<text x="' + (padL - 6) + '" y="' + f1(Y(t) + 3) + '" text-anchor="end">' + Math.round(t * 100) + '%</text>');
      });
    }
    windows.forEach(function (w, i) {
      parts.push('<text x="' + f1(X(i)) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(w.label) + '</text>');
    });
    parts.push('</g>');

    pick.forEach(function (n) {
      var pts = [];
      windows.forEach(function (w, i) { if (w.vals[n] != null) pts.push([X(i), Y(w.vals[n])]); });
      if (!pts.length) return;
      var isYou = youName && n === youName;
      var isLeader = n === leaderName;
      var col = isLeader ? gold : (isYou ? accent : (teamColor(champOf[n]) || accent));
      var cls = 'chart-series' + (isYou ? ' you' : '') + (isLeader ? ' leader' : '');
      parts.push('<g class="' + cls + '" data-name="' + esc(n) + '">');
      if (pts.length >= 2) {
        // faint area to the baseline for the leader+you only (keeps it readable)
        if (isLeader || isYou) {
          var area = linePath(pts) + ' L' + f1(pts[pts.length - 1][0]) + ' ' + f1(Y(0)) +
            ' L' + f1(pts[0][0]) + ' ' + f1(Y(0)) + ' Z';
          parts.push('<path class="chart-area chart-draw" data-op="1" d="' + area + '" fill="' + col + '" fill-opacity=".10"/>');
        }
        parts.push('<path class="chart-line chart-draw" d="' + linePath(pts) + '" fill="none" ' +
          'stroke="' + col + '" stroke-width="' + (isLeader ? 3.5 : 2.5) + '" ' +
          'vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>');
      }
      pts.forEach(function (p) {
        parts.push('<circle class="chart-dot chart-draw" data-op="1" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) +
          '" r="2.6" fill="' + col + '" stroke="var(--canvas,#0A0E14)" stroke-width="1"/>');
      });
      // end label
      var last = pts[pts.length - 1];
      var lastWin = windows[windows.length - 1];
      var valTxt = mode === 'prob'
        ? (Math.round(num(latest[n]) * 100) + '%')
        : ('#' + (lastWin.ranks && lastWin.ranks[n] != null ? lastWin.ranks[n] : '?'));
      parts.push('<g class="chart-endcap chart-draw" data-op="1" transform="translate(' + f1(last[0] + 8) + ',' + f1(last[1]) + ')">');
      parts.push('<text x="0" y="-2" font-size="11" font-weight="800" fill="' + col + '" ' +
        'style="font-family:\'Saira Condensed\',Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums">' + esc(valTxt) + '</text>');
      parts.push('<text x="0" y="11" font-size="9.5" font-weight="700" fill="currentColor" fill-opacity=".7" ' +
        'style="font-family:Inter,system-ui,sans-serif">' + esc(shortName(n)) + (isLeader ? ' 👑' : '') + '</text>');
      parts.push('</g>');
      parts.push('</g>');
    });

    parts.push('</svg>');
    return mount(container, parts.join(''), 'chart--titlerace');
  }

  /* ===================================================================== */
  /* 3) MOMENTUM  (per-player points-accumulation step line)               */
  /* ===================================================================== */
  function momentum(container, opts) {
    opts = opts || {};
    var row = opts.row || null;
    var crowns = Array.isArray(opts.crowns) ? opts.crowns : [];
    var name = row && row.name;
    if (!name) return emptyNote(container, 'chart--momentum', 'Select an entry to see its points momentum.');

    // accumulate gains for this name across crown windows (oldest->newest).
    var labels = [], cum = [], running = 0, fired = false;
    crowns.forEach(function (c) {
      if (!c || !c.gains) return;
      var g = num(c.gains[name], 0);
      running += g;
      labels.push(c.round || '');
      cum.push(running);
      if (g !== 0) fired = true;
    });

    if (cum.length < 1 || (!fired && cum.length < 2)) {
      return emptyNote(container, 'chart--momentum',
        'Momentum builds as ' + esc(shortName(name)) + ' banks points across rounds.');
    }

    // prepend a 0 origin so the step rises "from 0"
    labels = ['START'].concat(labels);
    cum = [0].concat(cum);

    var maxY = Math.max.apply(null, cum.concat([1]));
    var W = 680, H = 280, padL = 40, padR = 56, padT = 20, padB = 36;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var Nx = cum.length;
    function X(i) { return padL + (Nx === 1 ? 0 : plotW * (i / (Nx - 1))); }
    function Y(v) { return padT + plotH * (1 - (v / maxY)); }

    var col = teamColor(row.champion) || 'var(--gold,#E8B73A)';
    var parts = [];
    parts.push(svgOpen('chart--momentum', W, H, 'Points momentum for ' + esc(name) + ': cumulative points by round'));

    // grid (y) + labels
    parts.push('<g class="chart-grid" stroke="currentColor" stroke-opacity=".10" stroke-width="1">');
    [0, 0.5, 1].forEach(function (t) {
      var gy = Y(t * maxY);
      parts.push('<line x1="' + padL + '" y1="' + f1(gy) + '" x2="' + (padL + plotW) + '" y2="' + f1(gy) + '"/>');
    });
    parts.push('</g>');
    parts.push('<g class="chart-axislabel" fill="currentColor" fill-opacity=".55" ' +
      'style="font:700 10px/1 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums">');
    [0, 0.5, 1].forEach(function (t) {
      parts.push('<text x="' + (padL - 6) + '" y="' + f1(Y(t * maxY) + 3) + '" text-anchor="end">' + Math.round(t * maxY) + '</text>');
    });
    labels.forEach(function (l, i) {
      parts.push('<text x="' + f1(X(i)) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(l) + '</text>');
    });
    parts.push('</g>');

    var pts = cum.map(function (v, i) { return [X(i), Y(v)]; });
    // area under the step
    var areaD = stepPath(pts) + ' L' + f1(pts[pts.length - 1][0]) + ' ' + f1(Y(0)) +
      ' L' + f1(pts[0][0]) + ' ' + f1(Y(0)) + ' Z';
    parts.push('<g class="chart-series" data-name="' + esc(name) + '">');
    parts.push('<path class="chart-area chart-draw" data-op="1" d="' + areaD + '" fill="' + col + '" fill-opacity=".14"/>');
    parts.push('<path class="chart-line chart-draw" d="' + stepPath(pts) + '" fill="none" stroke="' + col + '" ' +
      'stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>');
    pts.forEach(function (p, i) {
      parts.push('<circle class="chart-dot chart-draw" data-op="1" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) +
        '" r="3" fill="' + col + '" stroke="var(--canvas,#0A0E14)" stroke-width="1"/>');
      if (i > 0) {
        parts.push('<text class="chart-axislabel" x="' + f1(p[0]) + '" y="' + f1(p[1] - 8) + '" text-anchor="middle" ' +
          'fill="' + col + '" style="font:800 11px/1 \'Saira Condensed\',Inter,sans-serif;font-variant-numeric:tabular-nums">' +
          cum[i] + '</text>');
      }
    });
    parts.push('</g>');

    parts.push('</svg>');
    return mount(container, parts.join(''), 'chart--momentum');
  }

  return {
    rankRace: rankRace,
    titleRace: titleRace,
    momentum: momentum,
    // internals exposed for tests / reuse
    _bumpPath: bumpPath,
    _stepPath: stepPath,
    _teamCode: teamCode
  };
});
