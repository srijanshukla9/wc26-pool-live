/* FIFA Prediction Pro — viz.js
   Broadcast-grade visual identity helpers: team kit illustrations (jersey
   illustrations with fabric depth), deterministic player avatars (24-hue
   palette for 84-name pools), and inline probability/momentum bars.
   UMD; zero dependencies; browser + node safe.

   Public API (signatures stable — app.js depends on them):
     VIZ.KITS                          // map team -> [body, sleeve, collar] hexes
     VIZ.kit(team, size)               // -> SVG string (jersey)
     VIZ.avatar(name, size, opts)      // -> SVG string (initials avatar)
     VIZ.initials(name)                // -> string
   New helpers:
     VIZ.teamColor(team)               // -> primary hex for a team
     VIZ.probBar(pct, opts)           // -> HTML string (inline prob/momentum bar)
     VIZ.scoreBug(opts)               // -> HTML string (broadcast score-bug)
*/
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.VIZ = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Home-kit colors per team: [body, sleeves/trim, collar]
  const KITS = {
    'Mexico': ['#0a6b4f', '#ffffff', '#b5121b'],
    'South Korea': ['#e6002d', '#ffffff', '#0b1f4e'],
    'Czech Rep.': ['#d7141a', '#ffffff', '#11457e'],
    'South Africa': ['#f5b81c', '#0a7a4d', '#1a1a1a'],
    'Qatar': ['#8a1538', '#ffffff', '#8a1538'],
    'Switzerland': ['#d52b1e', '#ffffff', '#d52b1e'],
    'Canada': ['#c8102e', '#ffffff', '#c8102e'],
    'Bosnia & Herz.': ['#002f6c', '#fecb00', '#002f6c'],
    'Brazil': ['#ffdc02', '#0aa14b', '#1c3aa9'],
    'Morocco': ['#c1272d', '#0a6233', '#c1272d'],
    'Scotland': ['#0a3078', '#ffffff', '#0a3078'],
    'Haiti': ['#0a20a0', '#d21034', '#0a20a0'],
    'Turkey': ['#e30a17', '#ffffff', '#ffffff'],
    'Paraguay': ['#ffffff', '#d52b1e', '#0038a8'],
    'Australia': ['#ffcd00', '#0a843d', '#0a843d'],
    'United States': ['#ffffff', '#0a2868', '#bf0a30'],
    'Germany': ['#ffffff', '#1a1a1a', '#dd0000'],
    'Ecuador': ['#ffdd00', '#0a4ea2', '#ed1c24'],
    'Ivory Coast': ['#ff8200', '#ffffff', '#0a9e60'],
    'Curacao': ['#0a2b7f', '#f9e814', '#0a2b7f'],
    'Netherlands': ['#ff6600', '#ffffff', '#21468b'],
    'Sweden': ['#ffcd00', '#0a5293', '#0a5293'],
    'Japan': ['#0a2c8b', '#ffffff', '#e60012'],
    'Tunisia': ['#e70013', '#ffffff', '#ffffff'],
    'Belgium': ['#e30613', '#1a1a1a', '#f9d616'],
    'Iran': ['#ffffff', '#239f40', '#da0000'],
    'Egypt': ['#ce1126', '#ffffff', '#1a1a1a'],
    'New Zealand': ['#ffffff', '#1a1a1a', '#1a1a1a'],
    'Spain': ['#aa151b', '#f1bf00', '#0a2462'],
    'Uruguay': ['#7bafd4', '#1a1a1a', '#1a1a1a'],
    'Saudi Arabia': ['#ffffff', '#0a6c35', '#0a6c35'],
    'Cape Verde': ['#0a3893', '#cf2027', '#f7d116'],
    'France': ['#1f2d56', '#ffffff', '#ef4135'],
    'Senegal': ['#ffffff', '#0a853f', '#fdef42'],
    'Norway': ['#ef2b2d', '#0a2868', '#ffffff'],
    'Iraq': ['#0a7a3d', '#ffffff', '#ce1126'],
    'Argentina': ['#85b8e8', '#ffffff', '#1a1a1a'],
    'Austria': ['#ed2939', '#ffffff', '#ed2939'],
    'Jordan': ['#ffffff', '#ce1126', '#0a7a3d'],
    'Algeria': ['#ffffff', '#0a6233', '#d21034'],
    'Portugal': ['#a50021', '#0a6600', '#f9d616'],
    'Colombia': ['#fcd116', '#0a3893', '#ce1126'],
    'DR Congo': ['#0a7fff', '#f7d618', '#ce1021'],
    'Uzbekistan': ['#ffffff', '#0a99b5', '#1eb53a'],
    'England': ['#ffffff', '#1e2a52', '#ce1126'],
    'Croatia': ['#ffffff', '#ff0000', '#171796'],
    'Ghana': ['#ffffff', '#ce1126', '#fcd116'],
    'Panama': ['#d21034', '#0a5293', '#ffffff'],
  };

  const FALLBACK_KIT = ['#9aa3ad', '#ffffff', '#6b7480'];

  function escAttr(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- color utilities -------------------------------------------------
  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  // Ink (text/number) color that reads on a given fill.
  function inkOn(hex) { return luminance(hex) > 0.62 ? '#101418' : '#ffffff'; }
  // A subtle outline color so very light kits (white jerseys) stay visible on dark.
  function outlineFor(hex) { return luminance(hex) > 0.78 ? 'rgba(0,0,0,.30)' : 'rgba(0,0,0,.22)'; }

  // teamColor: primary jersey hex (body), or a sensible fallback.
  function teamColor(team) {
    const c = KITS[team];
    if (!c) return '#1FA2FF'; // --accent fallback
    // If the body is near-white, the collar/sleeve is the recognisable color.
    if (luminance(c[0]) > 0.82) {
      if (luminance(c[1]) < 0.82) return c[1];
      if (luminance(c[2]) < 0.82) return c[2];
    }
    return c[0];
  }

  // --- KIT --------------------------------------------------------------
  // Broadcast jersey: body fill with a soft vertical fabric sheen + inner
  // shadow, contrast sleeves, crisp collar, optional number. Renders clean
  // 18–56px. Deterministic ids per (team,size) avoid <defs> collisions.
  function kit(team, size, opts) {
    const c = KITS[team] || FALLBACK_KIT;
    const o = opts || {};
    const s = size || 40;
    const small = s < 26;                 // drop fine detail when tiny
    const uid = ('k' + simpleHash(team + '|' + s)).toString(36);
    const body = c[0], sleeve = c[1], collar = c[2];
    const oline = outlineFor(body);
    const sheenTop = 'rgba(255,255,255,.16)';
    const sheenBot = 'rgba(0,0,0,.14)';
    const numTxt = (o.number != null && !small) ? String(o.number) : '';

    let defs =
      `<linearGradient id="${uid}b" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${sheenTop}"/>` +
        `<stop offset=".45" stop-color="rgba(255,255,255,0)"/>` +
        `<stop offset="1" stop-color="${sheenBot}"/></linearGradient>`;
    // Inner shadow at the hem/sides via radial highlight — skipped when tiny.
    if (!small) {
      defs +=
        `<radialGradient id="${uid}h" cx=".42" cy=".30" r=".85">` +
          `<stop offset="0" stop-color="rgba(255,255,255,.10)"/>` +
          `<stop offset=".7" stop-color="rgba(255,255,255,0)"/>` +
          `<stop offset="1" stop-color="rgba(0,0,0,.16)"/></radialGradient>`;
    }

    const bodyPath = 'M21 7 L8 13 L2 27 L13 31 L13 54 Q13 57 16 57 L48 57 Q51 57 51 54 L51 31 L62 27 L56 13 L43 7 Q39 13 32 13 Q25 13 21 7 Z';

    let svg = `<svg class="kitvg" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">` +
      `<defs>${defs}</defs>` +
      // base body
      `<path d="${bodyPath}" fill="${body}" stroke="${oline}" stroke-width="1.6" stroke-linejoin="round"/>` +
      // sleeves
      `<path d="M8 13 L2 27 L13 31 L16 17 Z" fill="${sleeve}" stroke="rgba(0,0,0,.16)" stroke-width="1"/>` +
      `<path d="M56 13 L62 27 L51 31 L48 17 Z" fill="${sleeve}" stroke="rgba(0,0,0,.16)" stroke-width="1"/>`;

    // optional number, centred, in contrasting ink
    if (numTxt) {
      svg += `<text x="32" y="44" font-family="'Saira Condensed','Archivo',system-ui,sans-serif" ` +
        `font-size="22" font-weight="800" fill="${inkOn(body)}" fill-opacity=".85" ` +
        `text-anchor="middle">${escAttr(numTxt)}</text>`;
    }

    // fabric sheen + inner shadow over the body (clipped to body via path overlay)
    svg += `<path d="${bodyPath}" fill="url(#${uid}b)"/>`;
    if (!small) svg += `<path d="${bodyPath}" fill="url(#${uid}h)"/>`;

    // crisp collar notch on top
    svg += `<path d="M21 7 Q25 13 32 13 Q39 13 43 7 L39 5.4 Q32 10.6 25 5.4 Z" fill="${collar}" stroke="rgba(0,0,0,.18)" stroke-width="${small ? 0 : 0.8}"/>`;
    // tiny collar highlight line for crispness
    if (!small) svg += `<path d="M25.5 6.4 Q32 11 38.5 6.4" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>`;

    svg += `</svg>`;
    return svg;
  }

  // --- AVATAR -----------------------------------------------------------
  // 24 well-spaced hues so 84-name pools stay visually distinct. Two-tier:
  // hue chosen from the palette, then a per-name lightness jitter so even
  // same-hue collisions differ slightly. Deterministic on name.
  const AVA_HUES = [
    4, 18, 32, 46, 88, 104, 128, 150, 168, 186, 200, 212,
    224, 238, 252, 266, 280, 294, 312, 326, 340, 352, 70, 60
  ];
  function simpleHash(n) {
    let h = 2166136261; const s = String(n);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  // keep legacy name for any external callers
  function hashName(n) { return simpleHash(n); }

  function initials(n) {
    const parts = String(n).replace(/\[.*?\]/g, '').replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const a = (parts[0] || '?')[0] || '?';
    const b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (a + b).toUpperCase();
  }

  function avatar(name, size, opts) {
    const s = size || 36;
    const o = opts || {};
    const h = simpleHash(name);
    const hue = AVA_HUES[h % AVA_HUES.length];
    // secondary hash bits drive small sat/light jitter to separate collisions
    const lightJit = ((h >> 5) % 7) - 3;     // -3..+3
    const satJit = ((h >> 9) % 9);            // 0..8
    const L1 = 47 + lightJit, L2 = 33 + lightJit;
    const S = 56 + satJit;
    const bg1 = `hsl(${hue} ${S}% ${L1}%)`;
    const bg2 = `hsl(${hue} ${S + 6}% ${L2}%)`;
    const id = 'av' + h.toString(36) + 's' + s;

    // ring: explicit color, or team color, or none
    const ringCol = o.ring ? o.ring : (o.teamColor ? teamColor(o.teamColor) : null);
    const ring = ringCol ? `<circle cx="32" cy="32" r="29" fill="none" stroke="${escAttr(ringCol)}" stroke-width="4"/>` : '';

    // crown badge for the leader; scales a touch so it stays sane when small
    const crown = o.crown ? `<g transform="translate(44 4)"><circle cx="9" cy="9" r="9" fill="#1A1303" stroke="#E8B73A" stroke-width="1.4"/><text x="9" y="14.5" font-size="12" text-anchor="middle">👑</text></g>` : '';

    return `<svg class="ava" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">` +
      `<defs>` +
        `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
          `<stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>` +
        `<radialGradient id="${id}g" cx=".35" cy=".28" r=".9">` +
          `<stop offset="0" stop-color="rgba(255,255,255,.28)"/>` +
          `<stop offset=".6" stop-color="rgba(255,255,255,0)"/></radialGradient>` +
      `</defs>` +
      `<circle cx="32" cy="32" r="30" fill="url(#${id})"/>` +
      `<circle cx="32" cy="32" r="30" fill="url(#${id}g)"/>` +
      ring +
      `<text x="32" y="41" font-family="'Saira Condensed','Inter',system-ui,sans-serif" ` +
        `font-size="26" font-weight="800" letter-spacing=".5" fill="#fff" ` +
        `text-anchor="middle" style="paint-order:stroke" stroke="rgba(0,0,0,.18)" stroke-width=".6">${escAttr(initials(name))}</text>` +
      crown + `</svg>`;
  }

  // --- PROBABILITY / MOMENTUM BAR --------------------------------------
  // Inline broadcast-style bar. Returns an HTML string (span.probbar).
  // opts: {
  //   color   : fill hex (default --accent azure),
  //   color2  : gradient end hex (default derived darker),
  //   track   : track color (default faint),
  //   label   : text overlaid/after (e.g. "63%"); if true -> "NN%"
  //   labelPos: 'in' | 'after' | 'none'  (default 'after')
  //   height  : px (default 8),
  //   width   : css width (default '100%'),
  //   striped : boolean — diagonal momentum stripes,
  //   className: extra class
  // }
  function probBar(pct, opts) {
    const o = opts || {};
    let p = Number(pct);
    if (!isFinite(p)) p = 0;
    // accept 0..1 or 0..100
    if (p <= 1.0001 && p >= 0) p = p * 100;
    p = Math.max(0, Math.min(100, p));
    const pr = Math.round(p);

    const col = o.color || '#1FA2FF';
    const col2 = o.color2 || col;
    const track = o.track || 'var(--faint, rgba(255,255,255,.08))';
    const h = o.height || 8;
    const w = o.width || '100%';
    const r = Math.min(h / 2, 6);
    const pos = o.labelPos || (o.label != null ? 'after' : 'none');
    const labelText = o.label === true ? (pr + '%') : (o.label != null ? String(o.label) : (pr + '%'));
    const stripeBg = o.striped
      ? `,repeating-linear-gradient(115deg, rgba(255,255,255,.16) 0 6px, rgba(255,255,255,0) 6px 12px)`
      : '';
    const fillStyle =
      `width:${p}%;height:100%;border-radius:${r}px;` +
      `background:linear-gradient(90deg, ${col} 0%, ${col2} 100%)${stripeBg};` +
      `box-shadow:0 0 0 .5px rgba(0,0,0,.12) inset;` +
      `transition:width .5s var(--ease, cubic-bezier(.22,.61,.36,1));`;

    const trackStyle =
      `position:relative;display:inline-block;vertical-align:middle;` +
      `width:${w};height:${h}px;border-radius:${r}px;` +
      `background:${track};overflow:hidden;`;

    const inLabel = pos === 'in'
      ? `<span class="probbar-in" style="position:absolute;inset:0;display:flex;align-items:center;` +
        `justify-content:flex-end;padding:0 5px;font:700 ${Math.max(9, h - 1)}px/1 'Saira Condensed',system-ui,sans-serif;` +
        `font-variant-numeric:tabular-nums;color:${inkOn(col)};">${escAttr(labelText)}</span>`
      : '';

    const cls = 'probbar' + (o.className ? ' ' + escAttr(o.className) : '');
    const bar =
      `<span class="${cls}" role="img" aria-label="${escAttr(labelText)}" ` +
        `style="${trackStyle}">` +
        `<span class="probbar-fill" style="${fillStyle}"></span>${inLabel}</span>`;

    if (pos === 'after') {
      return `<span class="probbar-wrap" style="display:inline-flex;align-items:center;gap:7px;width:100%;">` +
        bar +
        `<span class="probbar-val" style="font:800 13px/1 'Saira Condensed',system-ui,sans-serif;` +
        `font-variant-numeric:tabular-nums;color:var(--ink,#fff);min-width:30px;text-align:right;">${escAttr(labelText)}</span>` +
        `</span>`;
    }
    return bar;
  }

  // --- SCORE BUG (optional helper) -------------------------------------
  // Compact broadcast score-bug. Returns HTML string.
  // opts: { home, away, hs, as, status, live, hHex, aHex }
  function scoreBug(opts) {
    const o = opts || {};
    const home = o.home || 'TBD', away = o.away || 'TBD';
    const hs = (o.hs == null ? '–' : o.hs), as = (o.as == null ? '–' : o.as);
    const hHex = o.hHex || teamColor(home);
    const aHex = o.aHex || teamColor(away);
    const status = o.status || '';
    const liveDot = o.live
      ? `<span class="sb-live" style="display:inline-flex;align-items:center;gap:5px;font:800 11px/1 'Inter',sans-serif;color:#fff;letter-spacing:.06em;">` +
        `<span style="width:7px;height:7px;border-radius:50%;background:#FF2D55;box-shadow:0 0 0 0 rgba(255,45,85,.6);animation:sbpulse 1.4s infinite;"></span>LIVE</span>`
      : (status ? `<span style="font:700 11px/1 'Inter',sans-serif;color:rgba(255,255,255,.7);letter-spacing:.04em;">${escAttr(status)}</span>` : '');

    // §2.1 broadcast scale: the live number must dominate (48 live / 40 FT).
    const numPx = o.live ? 48 : 40;
    const numFont = `font:900 ${numPx}px/.9 'Saira Condensed','Archivo',sans-serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:#fff;`;
    const nameFont = `font:800 13px/1 'Archivo','Inter',sans-serif;color:#fff;letter-spacing:.02em;text-transform:uppercase;`;
    // jersey kit carries team identity (no flag emoji); falls back gracefully for unknowns.
    const homeKit = kit(home, 30), awayKit = kit(away, 30);
    // team-color rail + faint matching glow on each side block.
    const railL = `inset 4px 0 0 ${hHex}, inset 30px 0 36px -28px ${hHex}`;
    const railR = `inset -4px 0 0 ${aHex}, inset -30px 0 36px -28px ${aHex}`;

    return `<div class="scorebug" style="display:inline-flex;align-items:stretch;gap:0;` +
      `background:var(--score-bug-grad, linear-gradient(100deg,#0E1420,#10243A));` +
      `border:1px solid rgba(255,255,255,.10);border-radius:12px;overflow:hidden;` +
      `box-shadow:0 8px 24px rgba(0,0,0,.45);">` +
      `<span style="display:flex;align-items:center;gap:9px;padding:9px 13px 9px 11px;box-shadow:${railL};">` +
        `${homeKit}<span style="${nameFont}">${escAttr(home)}</span><span style="${numFont}">${escAttr(hs)}</span>` +
      `</span>` +
      `<span style="display:flex;align-items:center;padding:0 9px;border-left:1px solid rgba(255,255,255,.08);border-right:1px solid rgba(255,255,255,.08);">${liveDot}</span>` +
      `<span style="display:flex;align-items:center;gap:9px;padding:9px 11px 9px 13px;box-shadow:${railR};">` +
        `<span style="${numFont}">${escAttr(as)}</span><span style="${nameFont}">${escAttr(away)}</span>${awayKit}` +
      `</span>` +
      `</div>`;
  }

  return { KITS, kit, avatar, initials, teamColor, probBar, scoreBug, hashName };
});
