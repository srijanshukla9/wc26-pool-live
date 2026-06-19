/* FIFA Prediction Pro — service worker (BLUEPRINT §11)
   Strategy (online-first app, frequently deployed):
     • App shell (HTML/JS/CSS/manifest/icon): NETWORK-FIRST — always serve the
       latest code when online, fall back to cache only when offline. This means
       a new deploy lands immediately, never "one reload behind".
     • Assets (flagcdn flags, ESPN crests, Wikimedia player photos, fonts):
       cache-first (immutable / hash-pathed URLs — safe to keep forever).
     • Live feed (ESPN scoreboard / FIFA fallback): network-first, never cached
       as truth (only a last-good fallback when fully offline).
   No build step; pure static. Bump VERSION on any shell change to purge old caches. */
'use strict';

var VERSION = 'fpp-v2';
var SHELL_CACHE = VERSION + '-shell';
var ASSET_CACHE = VERSION + '-assets';
var FEED_CACHE = VERSION + '-feed';

// Resolve relative to the SW scope so it works under a GitHub Pages subpath.
function scoped(path) { return new URL(path, self.registration.scope).toString(); }

var SHELL = [
  '', 'index.html', 'manifest.json', 'icon.svg',
  'data.js', 'engine.js', 'ratings.js', 'viz.js', 'players.js',
  'mc.js', 'charts.js', 'narrative.js', 'cards.js', 'app.js',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) {
      // best-effort: a single 404 must not abort the whole install
      return Promise.all(SHELL.map(function (p) {
        return c.add(scoped(p)).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(VERSION) !== 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isFeed(url) {
  return /site\.api\.espn\.com|api\.fifa\.com/.test(url);
}
function isAsset(url) {
  return /flagcdn\.com|a\.espncdn\.com|upload\.wikimedia\.org|fonts\.gstatic\.com|fonts\.googleapis\.com|hatscripts\.github\.io/.test(url);
}
function isShell(url) {
  // same-origin GET within our scope
  try {
    var u = new URL(url);
    return u.origin === self.location.origin;
  } catch (e) { return false; }
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;

  // 1) LIVE FEED — network-first, fall back to last cached response when offline.
  if (isFeed(url)) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(FEED_CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
    return;
  }

  // 2) ASSETS — cache-first (immutable). Populate cache on first hit.
  if (isAsset(url)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(ASSET_CACHE).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () { return hit; });
      })
    );
    return;
  }

  // 3) SHELL — network-first: always serve the latest code when online; the cache
  //    is only an offline fallback. Guarantees a new deploy is seen immediately.
  if (isShell(url)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req); // offline → last cached shell
      })
    );
  }
});
