const CACHE_NAME = 'melotag-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

// Install Event - cache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - network-first fallback to cache (offline support)
self.addEventListener('fetch', (e) => {
  // Exclude external search APIs (iTunes/LRCLIB) from caching to always get fresh results,
  // but cache CDN files (googleapis, unpkg, jsdelivr)
  const url = e.request.url;
  const isCdn = url.includes('googleapis.com') || url.includes('gstatic.com') || url.includes('unpkg.com') || url.includes('jsdelivr.net');
  const isLocal = url.startsWith(self.location.origin);

  if (isLocal || isCdn) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache but fetch fresh in background to update cache (stale-while-revalidate)
          fetch(e.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
            }
          }).catch(() => {/* Ignore network failures when offline */});
          
          return cachedResponse;
        }

        // Fallback to fetch and cache
        return fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cacheCopy));
          }
          return networkResponse;
        });
      })
    );
  }
});
