// Service Worker: Mitteilungen anzeigen + App auch bei wackeligem Netz starten lassen.
const CACHE = 'kht-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Netz zuerst, bei Ausfall die letzte gespeicherte Fassung.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const own = url.origin === self.location.origin;
  const sdk = url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (e.request.method !== 'GET' || (!own && !sdk)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: own }))
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'Karl-Heinz trinkt', {
      body: data.body || 'Zeit für ein Glas Wasser.',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'trinken'
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
