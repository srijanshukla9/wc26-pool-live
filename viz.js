/* FIFA Prediction Pro — viz.js
   Visual identity helpers: team kit illustrations (SuperBru-style flat jerseys)
   and deterministic player avatars. UMD; no dependencies. */
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

  function escAttr(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Flat jersey, SuperBru-flavored: body, contrast sleeves, collar notch.
  function kit(team, size) {
    const c = KITS[team] || ['#9aa3ad', '#ffffff', '#6b7480'];
    const s = size || 40;
    return `<svg class="kitvg" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">` +
      `<path d="M21 7 L8 13 L2 27 L13 31 L13 54 Q13 57 16 57 L48 57 Q51 57 51 54 L51 31 L62 27 L56 13 L43 7 Q39 13 32 13 Q25 13 21 7 Z" fill="${c[0]}" stroke="rgba(0,0,0,.25)" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M8 13 L2 27 L13 31 L16 17 Z" fill="${c[1]}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>` +
      `<path d="M56 13 L62 27 L51 31 L48 17 Z" fill="${c[1]}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>` +
      `<path d="M21 7 Q25 13 32 13 Q39 13 43 7 L39 5.4 Q32 10.6 25 5.4 Z" fill="${c[2]}"/>` +
      `</svg>`;
  }

  // Deterministic avatar: initials on a hue derived from the name.
  const AVA_HUES = [14, 36, 152, 200, 262, 330, 90, 220, 0, 48];
  function hashName(n) {
    let h = 0; const s = String(n);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function initials(n) {
    const parts = String(n).replace(/\[.*?\]/g, '').trim().split(/\s+/);
    const a = (parts[0] || '?')[0] || '?';
    const b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (a + b).toUpperCase();
  }
  function avatar(name, size, opts) {
    const s = size || 36;
    const o = opts || {};
    const hue = AVA_HUES[hashName(name) % AVA_HUES.length];
    const bg1 = `hsl(${hue} 52% 46%)`, bg2 = `hsl(${hue} 58% 32%)`;
    const id = 'av' + hashName(name).toString(36) + s;
    const ring = o.ring ? `<circle cx="32" cy="32" r="30" fill="none" stroke="${escAttr(o.ring)}" stroke-width="4"/>` : '';
    const crown = o.crown ? `<text x="50" y="16" font-size="20" text-anchor="middle">👑</text>` : '';
    return `<svg class="ava" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">` +
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>` +
      `<circle cx="32" cy="32" r="30" fill="url(#${id})"/>` + ring +
      `<text x="32" y="40" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="800" fill="#fff" text-anchor="middle">${escAttr(initials(name))}</text>` +
      crown + `</svg>`;
  }

  return { KITS, kit, avatar, initials };
});
