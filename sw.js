// Multi-Symbol Scanner Pro — Service Worker
// Strategy: cache the app shell (HTML files) for offline access + faster launches.
// API data (Yahoo, Binance, etc.) is NEVER cached — we always want fresh prices.

const CACHE_VERSION = "scanner-pro-v1";
const APP_SHELL = [
  "./",
  "./scanner-hub.html",
  "./scanner-crypto.html",
  "./scanner-stocks.html",
  "./scanner.html",
  "./news.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: pre-cache the app shell so the PWA works offline immediately after install.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL).catch(err => {
        // If a file is missing (e.g. user didn't deploy all), don't abort install.
        // Cache what we can. The SW will still work for the files that exist.
        console.warn("[SW] Some shell files failed to cache:", err);
        return Promise.all(APP_SHELL.map(url =>
          cache.add(url).catch(() => null)
        ));
      }))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches from previous versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
//  - App shell (same-origin HTML/JSON/icons): network-first with cache fallback.
//    This gives users fresh content when online, working shell when offline.
//  - API calls (cross-origin, or query params present): bypass cache entirely.
//    Stale prices are worse than no prices.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  
  // Only GET requests are cacheable
  if (req.method !== "GET") return;
  
  // Skip caching for cross-origin (APIs, proxies, CDNs)
  if (url.origin !== self.location.origin) return;
  
  // Skip caching for requests with query strings (usually dynamic)
  // EXCEPT for our shell files which we want cached
  const isShell = APP_SHELL.some(s => {
    const shellPath = new URL(s, self.location.href).pathname;
    return url.pathname === shellPath;
  });
  if (!isShell && url.search) return;
  
  event.respondWith(
    // Network-first strategy for same-origin shell
    fetch(req)
      .then((response) => {
        // Update cache with fresh response
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed → fall back to cache
        return caches.match(req).then((cached) => {
          return cached || new Response("Offline și resursa nu e în cache.", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        });
      })
  );
});
