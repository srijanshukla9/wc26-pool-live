/* FIFA Prediction Pro — cards.js
   FUT-grade card system (BLUEPRINT §4). Two tiers for phone perf:
     • CARDS.cardRow(row, entry, opts)  -> dense 56–64px board row (the workhorse)
     • CARDS.fullCard(row, entry, opts) -> 300×420 holo card (on click/expand)
     • CARDS.initHolo(rootEl)           -> wires the pokemon-cards-css tilt/glare/foil
   Self-contained UMD (global CARDS). Zero hard deps; degrades gracefully when
   VIZ / PLAYERS / TEAM_META are absent. All dynamic strings are escaped; every
   <img> lazy-loads and degrades down the §2 resolution chain via onerror.

   ── PUBLIC SIGNATURES ──────────────────────────────────────────────────────
   CARDS.fullCard(row, entry, opts?) -> HTML string
       row   : a canonical Engine.leaderboard() row
               { name, rank, champion, runnerUp, points, secured, max,
                 breakdown:{groups,thirdPlace,knockouts,champion}, championAlive }
       entry : the pool entry (data.js) — used for entry.photo (friend photo),
               entry.champion / entry.runnerUp, and the back-face narrative.
       opts  : { pool, you, leaderPoints, crests, narrative, id, delta }
                 pool         : 'spjain' | 'open' (drives the pool badge text)
                 you          : true if this is the viewer's own entry
                 leaderPoints : #1's points, for the probBar %-of-leader (full card footer)
                 crests       : { teamName -> espncdn URL } harvested from the live feed
                 narrative    : optional { groupHits, streak, h2h, note, lines[] }
                 id           : stable DOM id stem (defaults to a hash of the name)
                 delta        : rank delta since last sync (+up / -down / 0)
   CARDS.cardRow(row, entry, opts?) -> HTML string  (same opts; uses opts.delta + leaderPoints)
   CARDS.initHolo(rootEl)          -> void (idempotent; wires every .fut-card under rootEl)

   ── CSS CLASS CONTRACT (index.html styles these; app.js mounts them) ────────
   Card (full):
     .fut-card                      card root; sets --team, data-tier, data-rank, data-you
       data-tier = champion|gold|silver|bronze   (drives tier gradient + foil eligibility)
       data-rank = "1" on the leader             (idle breathing foil)
       data-you  = "1" on the viewer's card
       data-mover = up|down                      (green/red left-rail mover glow)
     .fut-card__inner               the 3D-flip container (transform-style:preserve-3d)
     .fut-card__face                a face; .is-front / .is-back (backface-visibility:hidden)
     .fut-card__shine               glare layer  (radial gradient at --pointer-x/y)
     .fut-card__foil                foil layer   (color-dodge; foil tier only)
     .fut-card__grain               feTurbulence grain overlay
     .fut-card__rail                team-color left rail
     .fc-overall                    the big Points number (Saira 900)
     .fc-overall__pts / .fc-overall__pos / .fc-overall__crown
     .fc-photo  .fc-photo__img .fc-photo__hero .fc-photo__flag .fc-photo__crest .fc-photo__kit
     .fc-crests .fc-crest--champ .fc-crest--runner .fc-pool-badge
     .fc-name                       lower-third name plate
     .fc-stats  .fc-stat (.fc-stat__k label / .fc-stat__v value)   — GRP·3RD·KO·CHAMP
     .fc-ribbon                     "CHAMPION PICK" diagonal corner ribbon (uses --team)
     .fc-credit                     tiny Wikimedia photo credit (when a star photo resolves)
     .fut-card__back ...            .fcb-title .fcb-row .fcb-k .fcb-v .fcb-lines .fcb-flip-hint
     .fut-card.is-flipped           toggled to show the back face
   Row (dense board) — F1-timing-tower density, no dead space:
     .card-row                      root; sets --team, data-tier, data-you, data-mover
       grid: [rank 36][rail 3][avatar 40][name 1fr][WIN% 160][GAP 64][PTS 70][delta 44]
     .cr-rank  .cr-railwrap .cr-rail  .cr-thumb (.cr-thumb__img .cr-thumb__badge)
     .cr-id  .cr-name  .cr-sub (.cr-champ-code + crest)
     .cr-win (.cr-win-bar prominent 8px accent bar + .cr-win-val tabular %)
     .cr-gap (.cr-gap-v interval to rank above + .cr-gap-k label; .cr-gap--lead = "—")
     .cr-pts  .cr-delta
     opts.winPct (0..1 or 0..100) drives the bar; opts.aheadPoints drives the gap column.
     A row is clickable; app.js binds click -> expand into fullCard (data-name carries the key).
   Interaction props set by initHolo on .fut-card:
     --pointer-x / --pointer-y          (0–100%)
     --pointer-from-center              (0–1)
     --rotate-x / --rotate-y            (deg)
     --background-x / --background-y    (37–63% / 33–67%)
   prefers-reduced-motion + (hover:none) coarse pointers -> static / glare-only (handled here + CSS).
*/
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.CARDS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GLOBAL = (typeof self !== 'undefined' && self)
    || (typeof window !== 'undefined' && window)
    || (typeof globalThis !== 'undefined' && globalThis)
    || {};
  // Resolved lazily (at call time) so it works whether the globals are present at
  // module load (browser <script> order) or set afterwards (node/test harness).
  function getVIZ()     { return GLOBAL.VIZ || null; }
  function getPlayers() { return GLOBAL.PLAYERS || {}; }
  function getMeta()    { return GLOBAL.TEAM_META || {}; }

  // ── escaping ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // for use inside a JS string embedded in an HTML attribute (onerror handlers)
  function escJsAttr(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')
      .replace(/</g, '\\x3c').replace(/>/g, '\\x3e').replace(/&/g, '&amp;');
  }
  function escUrl(u) {
    var s = String(u == null ? '' : u);
    // only allow the keyless/CORS-open hosts the blueprint sanctions
    if (/^https:\/\/upload\.wikimedia\.org\/[\w./%~:()'!*,+-]+$/i.test(s)) return s;
    if (/^https:\/\/a\.espncdn\.com\/[\w./-]+$/i.test(s)) return s;
    if (/^https:\/\/flagcdn\.com\/[\w./-]+$/i.test(s)) return s;
    if (/^(assets|\.\/assets|\.\.\/assets)\/[\w./-]+$/i.test(s)) return s; // local friend photos
    return '';
  }

  // ── viz fallbacks ────────────────────────────────────────────────────────────
  function teamColor(t) {
    var V = getVIZ();
    if (V && V.teamColor) { try { return V.teamColor(t); } catch (e) {} }
    return '#1FA2FF';
  }
  function avatarSvg(name, size, o) {
    var V = getVIZ();
    if (V && V.avatar) { try { return V.avatar(name, size, o); } catch (e) {} }
    var i = String(name || '?').trim().charAt(0).toUpperCase() || '?';
    return '<span class="ava" style="display:inline-flex;align-items:center;justify-content:center;'
      + 'width:' + (size || 36) + 'px;height:' + (size || 36) + 'px;border-radius:50%;'
      + 'background:#243043;color:#fff;font:800 ' + Math.round((size || 36) * 0.42) + 'px var(--f-num,sans-serif)">'
      + esc(i) + '</span>';
  }
  function kitSvg(team, size) {
    var V = getVIZ();
    if (V && V.kit) { try { return V.kit(team, size); } catch (e) {} }
    return '';
  }
  function initials(name) {
    var V = getVIZ();
    if (V && V.initials) { try { return V.initials(name); } catch (e) {} }
    return String(name || '?').trim().charAt(0).toUpperCase() || '?';
  }
  // luminance for ink-on-fill (mirrors viz.inkOn so ribbons read)
  function inkOn(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); if (isNaN(n)) return '#fff';
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#101418' : '#ffffff';
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  // a stable, DOM-safe id stem from a name
  function slug(s) {
    var h = 2166136261, str = String(s || '');
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'c' + (h >>> 0).toString(36);
  }
  // first name only, for compact labels
  function firstName(n) {
    return String(n || '').replace(/\[.*?\]/g, '').trim().split(/\s+/)[0] || String(n || '');
  }
  // 3-letter team code: prefer ESPN abbr (upper), else first 3 letters
  function teamCode(team) {
    var meta = getMeta()[team];
    if (meta && meta.espnAbbr) return meta.espnAbbr.slice(0, 3).toUpperCase();
    return String(team || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || '???';
  }
  function flagUrl(team) {
    var meta = getMeta()[team];
    if (meta && meta.iso2) return 'https://flagcdn.com/' + meta.iso2 + '.svg';
    return '';
  }
  // ESPN crest: prefer the live-harvested URL, else the static abbr fallback
  function crestUrl(team, crests) {
    if (crests && crests[team] && escUrl(crests[team])) return crests[team];
    var meta = getMeta()[team];
    if (meta && meta.espnAbbr) return 'https://a.espncdn.com/i/teamlogos/countries/500/' + meta.espnAbbr + '.png';
    return '';
  }
  // RANK -> tier (BLUEPRINT §4A). topThird = rank within the top third of the pool.
  function tierFor(rank, poolSize) {
    if (rank === 1) return 'champion';
    if (rank <= 3) return 'gold';
    var third = Math.max(3, Math.ceil((poolSize || 12) / 3));
    if (rank <= third) return 'silver';
    return 'bronze';
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  // ── PHOTO ZONE (the §2 resolution chain, expressed as one <img> + onerror cascade) ──
  // friend photo → champion star cut-out (Wikimedia, masked fade, breaks frame)
  //   → champion HERO (flagcdn flag bg + ESPN crest + VIZ.kit) → VIZ.avatar glyph.
  // We render the HERO + avatar as always-present DOM under the <img>; the <img>
  // sits on top and is removed (display:none) on error so the layer beneath shows.
  function photoZone(row, entry, opts) {
    var champ = (entry && entry.champion) || row.champion || '';
    var name = row.name;
    var tc = teamColor(champ);
    var players = getPlayers();
    var star = players[champ] || {};

    // candidate photo sources, in priority order
    var friend = entry && entry.photo ? escUrl(entry.photo) : '';
    var starPhoto = star.photo ? escUrl(star.photo) : '';

    // The HERO fallback (always-available): faded flag bg + crest + kit.
    var heroFlag = flagUrl(champ);
    var heroCrest = crestUrl(champ, opts && opts.crests);
    var heroKit = kitSvg(champ, 92);
    var hero =
      '<div class="fc-photo__hero" aria-hidden="true">'
        + (heroFlag ? '<img class="fc-photo__flag" src="' + esc(heroFlag) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' : '')
        + (heroCrest ? '<img class="fc-photo__crest" src="' + esc(heroCrest) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' : '')
        + (heroKit ? '<span class="fc-photo__kit">' + heroKit + '</span>' : '')
      + '</div>';

    // The final glyph fallback (under the hero, only shows if everything 404s — but hero
    // is generated art so it effectively never does; kept for absolute safety).
    var glyph = '<div class="fc-photo__glyph" aria-hidden="true">'
      + avatarSvg(name, 116, { teamColor: champ, crown: row.rank === 1 }) + '</div>';

    // The cut-out <img>: starts at the best available source. onerror walks the chain:
    //   friend -> star -> (hide, reveal hero). We encode the next URL in onerror.
    var primary = friend || starPhoto || '';
    var isStarShown = !!primary && (!friend); // the visible img is the star cut-out
    var imgEl = '';
    if (primary) {
      // build the onerror cascade: if friend fails -> try star; if star fails -> hide.
      var onerr;
      if (friend && starPhoto) {
        onerr = "if(this.dataset.step!=='star'){this.dataset.step='star';this.src='" + escJsAttr(starPhoto) + "';}else{this.style.display='none';}";
      } else {
        onerr = "this.style.display='none';";
      }
      imgEl = '<img class="fc-photo__img" src="' + esc(primary) + '" alt="' + esc(firstName(name)) + ' — ' + esc(champ) + ' pick"'
        + ' loading="lazy" decoding="async" data-step="' + (friend ? 'friend' : 'star') + '"'
        + ' onerror="' + onerr + '">';
    }

    var credit = (isStarShown && star.credit)
      ? '<span class="fc-credit" title="' + esc(star.star || '') + ' — ' + esc(star.credit) + '">'
          + esc(star.star ? star.star + ' · ' : '') + esc(star.credit) + '</span>'
      : '';

    return '<div class="fc-photo" style="--team:' + esc(tc) + '">'
      + glyph + hero + imgEl + credit + '</div>';
  }

  // ── CRESTS + POOL BADGE ──────────────────────────────────────────────────────
  function crestImg(team, cls, crests, size) {
    var url = crestUrl(team, crests);
    if (url) {
      return '<img class="' + cls + '" src="' + esc(url) + '" alt="' + esc(team) + '" title="' + esc(team) + '"'
        + ' width="' + size + '" height="' + size + '" loading="lazy" decoding="async"'
        + ' onerror="this.style.display=\'none\';this.nextElementSibling&&(this.nextElementSibling.style.display=\'inline-flex\')">'
        + '<span class="' + cls + ' ' + cls + '--fb" style="display:none">' + esc(teamCode(team)) + '</span>';
    }
    return '<span class="' + cls + ' ' + cls + '--fb">' + esc(teamCode(team)) + '</span>';
  }
  function poolBadge(pool) {
    var label = pool === 'spjain' ? 'SP JAIN' : pool === 'open' ? 'OPEN' : (pool ? String(pool).toUpperCase() : 'POOL');
    return '<span class="fc-pool-badge" title="' + esc(label) + ' pool">' + esc(label) + '</span>';
  }

  // ── CREST WATERMARK (BLUEPRINT §3 material device #4) ────────────────────────
  // An always-present, photo-independent team-crest layer: large, faint (6–8%),
  // bleeding off a corner — the "team-dressed" depth that survives behind any photo.
  // Self-contained inline styling so it renders without a stylesheet rule (the
  // index.html .fc-watermark/.cr-watermark rules are optional polish); if a host
  // stylesheet later defines those classes it can override these inline defaults.
  // Decorative only: on a crest 404 it silently removes itself (no fallback glyph).
  //   variant 'card' → bottom-right bleed at ~75% width, opacity .07 (full FUT card)
  //   variant 'row'  → right-edge bleed ~70px, opacity .05 (dense board row)
  //   variant 'match'→ behind the score-bug, opacity .06 (match analysis cards)
  function crestWatermark(team, variant, crests) {
    var url = crestUrl(team, crests);
    if (!url) return ''; // no crest → no watermark (the layer is decorative)
    var v = variant || 'card';
    var box, img;
    if (v === 'row') {
      box = 'position:absolute;right:-14px;top:50%;transform:translateY(-50%);width:70px;height:70px;'
        + 'z-index:0;opacity:.05;filter:grayscale(.2);pointer-events:none;';
      img = 'width:100%;height:100%;object-fit:contain;';
    } else if (v === 'match') {
      box = 'position:absolute;right:-10%;bottom:-12%;width:55%;'
        + 'z-index:0;opacity:.06;filter:grayscale(.2);pointer-events:none;';
      img = 'width:100%;height:auto;display:block;';
    } else { // 'card'
      box = 'position:absolute;right:-22%;bottom:-8%;width:75%;'
        + 'z-index:1;opacity:.07;filter:grayscale(.2);pointer-events:none;';
      img = 'width:100%;height:auto;display:block;';
    }
    return '<div class="fc-watermark fc-watermark--' + esc(v) + '" aria-hidden="true" style="' + box + '">'
      + '<img src="' + esc(url) + '" alt="" loading="lazy" decoding="async" style="' + img + '"'
      + ' onerror="this.parentNode&&this.parentNode.parentNode&&this.parentNode.parentNode.removeChild(this.parentNode)">'
      + '</div>';
  }

  // ── STAT ROW (GRP · 3RD · KO · CHAMP = breakdown) ────────────────────────────
  function statRow(breakdown) {
    var b = breakdown || {};
    var stats = [
      ['GRP', num(b.groups)],
      ['3RD', num(b.thirdPlace)],
      ['KO', num(b.knockouts)],
      ['CHAMP', num(b.champion)],
    ];
    return '<div class="fc-stats" role="list">'
      + stats.map(function (s) {
          return '<div class="fc-stat" role="listitem">'
            + '<span class="fc-stat__v">' + esc(s[1]) + '</span>'
            + '<span class="fc-stat__k">' + esc(s[0]) + '</span>'
          + '</div>';
        }).join('<span class="fc-stat__sep" aria-hidden="true"></span>')
      + '</div>';
  }

  // ── BACK FACE (narrative payload; placeholder-friendly) ──────────────────────
  function backFace(row, entry, opts) {
    var n = (opts && opts.narrative) || {};
    var champ = (entry && entry.champion) || row.champion || '';
    var runner = (entry && entry.runnerUp) || row.runnerUp || '';
    var rows = [];
    rows.push(['CHAMPION', champ + (row.championAlive === false ? '  (OUT)' : '')]);
    if (runner) rows.push(['RUNNER-UP', runner]);
    rows.push(['POINTS', num(row.points)]);
    rows.push(['SECURED', num(row.secured)]);
    rows.push(['CEILING', num(row.max)]);
    if (n.groupHits != null) rows.push(['GROUP HITS', n.groupHits]);
    if (n.streak) rows.push(['STREAK', n.streak]);
    if (n.h2h) rows.push(['H2H', n.h2h]);

    var lines = (n.lines && n.lines.length)
      ? n.lines
      : (n.note ? [n.note] : ['Group-by-group hits, streaks and rivalry beats land here once the narrative engine fills them in.']);

    return '<div class="fut-card__face is-back">'
      + '<div class="fut-card__back">'
        + '<div class="fcb-title">' + esc(firstName(row.name)) + '<span class="fcb-sub">' + esc(row.name) + '</span></div>'
        + '<div class="fcb-grid">'
          + rows.map(function (r) {
              return '<div class="fcb-row"><span class="fcb-k">' + esc(r[0]) + '</span>'
                + '<span class="fcb-v">' + esc(r[1]) + '</span></div>';
            }).join('')
        + '</div>'
        + '<div class="fcb-lines">'
          + lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('')
        + '</div>'
        + '<div class="fcb-flip-hint">tap to flip back</div>'
      + '</div>'
    + '</div>';
  }

  // ── FRONT FACE ───────────────────────────────────────────────────────────────
  function frontFace(row, entry, opts) {
    var champ = (entry && entry.champion) || row.champion || '';
    var runner = (entry && entry.runnerUp) || row.runnerUp || '';
    var tc = teamColor(champ);
    var ribbonInk = inkOn(tc);
    var crests = opts && opts.crests;
    var isLeader = row.rank === 1;

    // OVERALL block: the Points number dominates; position = crown chip (#1) or champ code.
    var posChip = isLeader
      ? '<span class="fc-overall__crown" title="Pool leader">👑</span>'
      : '<span class="fc-overall__pos">' + esc(teamCode(champ)) + '</span>';
    var overall =
      '<div class="fc-overall">'
        + '<span class="fc-overall__pts mega" data-tnum>' + esc(num(row.points)) + '</span>'
        + posChip
      + '</div>';

    // crest cluster: champion (largest, flag ribbon behind) + runner-up + pool badge
    var crestCluster =
      '<div class="fc-crests">'
        + '<span class="fc-crest-wrap" title="Champion pick: ' + esc(champ) + '">'
          + (flagUrl(champ) ? '<img class="fc-crest__flag" src="' + esc(flagUrl(champ)) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' : '')
          + crestImg(champ, 'fc-crest fc-crest--champ', crests, 34)
        + '</span>'
        + (runner ? '<span title="Runner-up pick: ' + esc(runner) + '">' + crestImg(runner, 'fc-crest fc-crest--runner', crests, 24) + '</span>' : '')
        + poolBadge(opts && opts.pool)
      + '</div>';

    var ribbon = '<div class="fc-ribbon" style="--team:' + esc(tc) + ';--ribbon-ink:' + esc(ribbonInk) + '"><span>CHAMPION PICK</span></div>';

    return '<div class="fut-card__face is-front">'
      + '<div class="fut-card__grain" aria-hidden="true"></div>'
      + crestWatermark(champ, 'card', crests)
      + '<div class="fut-card__shine" aria-hidden="true"></div>'
      + '<div class="fut-card__foil" aria-hidden="true"></div>'
      + '<span class="fut-card__rail" aria-hidden="true"></span>'
      + ribbon
      + '<div class="fc-top">' + overall + crestCluster + '</div>'
      + '<div class="fc-bottom">'
        + '<div class="fc-name">' + esc(row.name) + '</div>'
        + statRow(row.breakdown)
      + '</div>'
    + '</div>'
    // The cut-out photo lives in its OWN non-clipped layer (sibling of the clipped face)
    // so the champion-star head crosses the top border — the signature FUT "break the
    // frame" move (BLUEPRINT §4A). The face keeps overflow:hidden for grain/shine/foil.
    + '<div class="fc-photo-layer">' + photoZone(row, entry, opts) + '</div>';
  }

  // ── PUBLIC: fullCard ─────────────────────────────────────────────────────────
  function fullCard(row, entry, opts) {
    opts = opts || {};
    entry = entry || {};
    var poolSize = opts.poolSize || opts.leaderRank || 12;
    var tier = tierFor(row.rank, poolSize);
    var champ = (entry && entry.champion) || row.champion || '';
    var tc = teamColor(champ);
    var id = opts.id || slug(row.name);
    var delta = num(opts.delta);
    var mover = delta >= 2 ? 'up' : delta <= -2 ? 'down' : '';

    return '<div class="fut-card" id="card-' + esc(id) + '"'
        + ' data-tier="' + esc(tier) + '"'
        + ' data-rank="' + esc(row.rank) + '"'
        + (opts.you ? ' data-you="1"' : '')
        + (mover ? ' data-mover="' + mover + '"' : '')
        + ' data-name="' + esc(row.name) + '"'
        + ' style="--team:' + esc(tc) + '"'
        + ' tabindex="0" role="group" aria-label="' + esc(row.name) + ', ' + esc(num(row.points)) + ' points, rank ' + esc(row.rank) + '">'
      + '<div class="fut-card__inner">'
        + frontFace(row, entry, opts)
        + backFace(row, entry, opts)
      + '</div>'
    + '</div>';
  }

  // ── PUBLIC: cardRow (dense board workhorse, 56–64px) ─────────────────────────
  function cardRow(row, entry, opts) {
    opts = opts || {};
    entry = entry || {};
    var poolSize = opts.poolSize || 12;
    var tier = tierFor(row.rank, poolSize);
    var champ = (entry && entry.champion) || row.champion || '';
    var tc = teamColor(champ);
    var id = opts.id || slug(row.name);
    var crests = opts.crests;
    var isLeader = row.rank === 1;

    // WIN% — the prominent inline timing-tower bar (BLUEPRINT §4B).
    // Prefer the simulator's title-odds (opts.winPct, 0..1 OR 0..100); when the sim
    // hasn't run yet, gracefully degrade to points-as-%-of-leader so the bar never
    // reads empty. Bar = accent-filled 8px rounded; the % label sits beside it in
    // Saira tabular numerals so it reads at a glance, not as a hairline.
    var leaderPts = num(opts.leaderPoints) || num(row.points);
    var pctOfLeader = leaderPts > 0 ? (num(row.points) / leaderPts) * 100 : 0;
    var hasWin = opts.winPct != null && isFinite(Number(opts.winPct));
    var winRaw = hasWin ? Number(opts.winPct) : pctOfLeader;
    // normalise 0..1 -> 0..100
    if (winRaw <= 1.0001 && winRaw >= 0) winRaw = winRaw * 100;
    var winPct = Math.max(0, Math.min(100, winRaw));
    // label: title odds get a "%"; the fallback (share-of-leader) is unlabelled-friendly
    var winLabel = hasWin
      ? (winPct >= 9.95 ? Math.round(winPct) + '%' : (winPct < 0.05 ? '0%' : winPct.toFixed(1) + '%'))
      : Math.round(winPct) + '%';
    var accent = 'var(--accent)';
    var V = getVIZ();
    var barInner = V && V.probBar
      ? V.probBar(winPct, { color: accent, color2: accent, height: 8, labelPos: 'none', width: '100%' })
      : '<span class="cr-bar-fb" style="--p:' + winPct + '%"></span>';
    var winBlock =
      '<span class="cr-win" title="' + (hasWin ? 'Title odds' : 'Share of leader') + ': ' + esc(winLabel) + '">'
        + '<span class="cr-win-bar">' + barInner + '</span>'
        + '<span class="cr-win-val" data-tnum>' + esc(winLabel) + '</span>'
      + '</span>';

    // GAP to the rank directly above (timing-tower interval). The leader shows "—".
    // opts.aheadPoints carries the points of the row one rank higher (app.js fills it).
    var gapBlock;
    if (isLeader || opts.aheadPoints == null) {
      gapBlock = '<span class="cr-gap cr-gap--lead" aria-label="leads the pool">'
        + '<span class="cr-gap-v">&mdash;</span><span class="cr-gap-k">gap</span></span>';
    } else {
      var gap = num(opts.aheadPoints) - num(row.points);
      if (gap < 0) gap = 0; // rows are points-sorted; guard against any tie/secured swap
      gapBlock = '<span class="cr-gap" aria-label="' + esc(gap) + ' points behind the rank above">'
        + '<span class="cr-gap-v" data-tnum>&minus;' + esc(gap) + '</span>'
        + '<span class="cr-gap-k">behind</span></span>';
    }

    // thumb: friend photo if present, else champion star cut-out, else avatar glyph.
    // We render the avatar glyph as the base, then overlay an <img> that hides on error.
    var players = getPlayers();
    var star = players[champ] || {};
    var friend = entry && entry.photo ? escUrl(entry.photo) : '';
    var starPhoto = star.photo ? escUrl(star.photo) : '';
    var thumbSrc = friend || starPhoto || '';
    var thumbImg = thumbSrc
      ? '<img class="cr-thumb__img" src="' + esc(thumbSrc) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">'
      : '';
    var thumb =
      '<span class="cr-thumb' + (isLeader ? ' cr-thumb--leader' : '') + '" style="--team:' + esc(tc) + '">'
        + '<span class="cr-thumb__glyph">' + avatarSvg(row.name, 40, { teamColor: champ, crown: isLeader }) + '</span>'
        + thumbImg
        + '<span class="cr-thumb__badge">' + crestImg(champ, 'cr-crest', crests, 16) + '</span>'
      + '</span>';

    // delta chip ▲/▼/–
    var delta = num(opts.delta);
    var deltaCls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    var deltaTxt = delta > 0 ? '▲' + delta : delta < 0 ? '▼' + Math.abs(delta) : '–';
    var deltaChip = '<span class="cr-delta cr-delta--' + deltaCls + '" aria-label="rank change ' + esc(deltaTxt) + '">' + esc(deltaTxt) + '</span>';

    var mover = delta >= 2 ? 'up' : delta <= -2 ? 'down' : '';

    return '<div class="card-row" role="button" tabindex="0"'
        + ' data-tier="' + esc(tier) + '"'
        + (opts.you ? ' data-you="1"' : '')
        + (mover ? ' data-mover="' + mover + '"' : '')
        + ' data-name="' + esc(row.name) + '"'
        + ' data-id="' + esc(id) + '"'
        + ' style="--team:' + esc(tc) + '"'
        + ' aria-label="' + esc(row.name) + ', rank ' + esc(row.rank) + ', ' + esc(num(row.points)) + ' points. Open card.">'
      + crestWatermark(champ, 'row', crests)
      + '<span class="cr-rank" data-tnum>' + esc(row.rank) + '</span>'
      + '<span class="cr-railwrap" aria-hidden="true"><span class="cr-rail"></span></span>'
      + thumb
      + '<span class="cr-id">'
        + '<span class="cr-name">' + esc(firstName(row.name)) + (opts.you ? '<span class="cr-you">YOU</span>' : '') + '</span>'
        + '<span class="cr-sub"><span class="cr-champ-code">' + esc(teamCode(champ)) + '</span>'
          + crestImg(champ, 'cr-sub-crest', crests, 12)
          + (row.championAlive === false ? '<span class="cr-out">OUT</span>' : '')
        + '</span>'
      + '</span>'
      + winBlock
      + gapBlock
      + '<span class="cr-pts mega" data-tnum>' + esc(num(row.points)) + '</span>'
      + deltaChip
    + '</div>';
  }

  // ── PUBLIC: initHolo — pokemon-cards-css tilt/glare/foil (MIT math) ──────────
  // One rAF-throttled pointermove per card sets CSS custom props. Foil (color-dodge)
  // is reserved for champion+gold tier (handled in CSS via [data-tier]); coarse
  // pointers get glare-only; prefers-reduced-motion -> fully static.
  function initHolo(rootEl) {
    if (typeof document === 'undefined') return;
    var scope = rootEl && rootEl.querySelectorAll ? rootEl : document;
    var cards = scope.querySelectorAll ? scope.querySelectorAll('.fut-card') : [];

    var reduce = false, coarse = false;
    try {
      reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      coarse = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
    } catch (e) {}

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.__holoWired) continue;
      card.__holoWired = true;

      // Flip on click/tap (and keyboard) — always available, motion-safe.
      bindFlip(card);

      if (reduce) { card.setAttribute('data-static', '1'); continue; }

      wireTilt(card, coarse);
    }
  }

  function bindFlip(card) {
    function toggle(e) {
      // ignore clicks on links/credits inside the card
      if (e && e.target && e.target.closest && e.target.closest('a, .fc-credit')) return;
      card.classList.toggle('is-flipped');
    }
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); }
    });
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function round(v, p) { var m = Math.pow(10, p || 0); return Math.round(v * m) / m; }
  // map 0..100 into [a..b]
  function adjust(v, a, b) { return a + (v / 100) * (b - a); }

  function wireTilt(card, coarse) {
    var rafId = null, pending = null;

    function apply() {
      rafId = null;
      if (!pending) return;
      var px = pending.px, py = pending.py;
      // pointer-from-center (0..1): sqrt distance from the 50/50 midpoint / 50, clamped
      var dx = px - 50, dy = py - 50;
      var fromCenter = clamp(Math.sqrt(dx * dx + dy * dy) / 50, 0, 1);
      // rotation ≈ ±15°: -(centerY/3.5), centerX/3.5  (center measured from -50..50)
      var rotX = round(-(dy / 3.5), 2);
      var rotY = round(dx / 3.5, 2);
      // background remap into the narrow ranges from §4A
      var bgX = round(adjust(px, 37, 63), 2);
      var bgY = round(adjust(py, 33, 67), 2);

      var s = card.style;
      s.setProperty('--pointer-x', round(px, 2) + '%');
      s.setProperty('--pointer-y', round(py, 2) + '%');
      s.setProperty('--pointer-from-center', String(round(fromCenter, 3)));
      s.setProperty('--background-x', bgX + '%');
      s.setProperty('--background-y', bgY + '%');
      if (!coarse) {
        s.setProperty('--rotate-x', rotX + 'deg');
        s.setProperty('--rotate-y', rotY + 'deg');
      }
      card.classList.add('is-active');
      pending = null;
    }

    function onMove(e) {
      var r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var cx = (e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0));
      var cy = (e.clientY != null ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0));
      var px = clamp(((cx - r.left) / r.width) * 100, 0, 100);
      var py = clamp(((cy - r.top) / r.height) * 100, 0, 100);
      pending = { px: px, py: py };
      if (rafId == null) rafId = requestAnimationFrame(apply);
    }

    function onLeave() {
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
      pending = null;
      var s = card.style;
      s.setProperty('--pointer-x', '50%');
      s.setProperty('--pointer-y', '50%');
      s.setProperty('--pointer-from-center', '0');
      s.setProperty('--background-x', '50%');
      s.setProperty('--background-y', '50%');
      s.setProperty('--rotate-x', '0deg');
      s.setProperty('--rotate-y', '0deg');
      card.classList.remove('is-active');
    }

    card.addEventListener('pointermove', onMove, { passive: true });
    card.addEventListener('pointerleave', onLeave, { passive: true });
    card.addEventListener('pointercancel', onLeave, { passive: true });
    onLeave(); // seed neutral values
  }

  return { fullCard: fullCard, cardRow: cardRow, initHolo: initHolo };
});
