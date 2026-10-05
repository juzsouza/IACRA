/* Legacy Service Worker Migration - EAVRA */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.clients && self.clients.claim) {
        await self.clients.claim();
      }
      if ('caches' in self) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
      if (self.registration && typeof self.registration.unregister === 'function') {
        await self.registration.unregister();
      }
    })()
  );
});
