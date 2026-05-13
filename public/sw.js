const CACHE_NAME = 'book-calendar-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network-only: never cache anything during development
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
