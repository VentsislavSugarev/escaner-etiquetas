// Service worker: guarda una copia de la app para que abra aunque no haya conexión.
// Estrategia "primero red": si hay internet descarga lo último (y lo guarda); si no, usa la copia.
const CACHE = "escaner-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r ?? Response.error())),
  );
});
