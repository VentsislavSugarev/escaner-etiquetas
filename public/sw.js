// Service worker: guarda una copia de la app para que abra aunque no haya conexión.
//
// Estas dos líneas las rellena vite.config.ts al compilar (no tocar su forma):
const FILES = ["./"]; // todos los archivos de esta versión
const CACHE = "escaner-dev"; // cambia solo cuando cambian los archivos

const SLOW_NETWORK_MS = 3000; // con wifi muy lenta, a los 3 s se usa la copia guardada
// La página pide el JS y el CSS con cabeceras distintas a las de la copia guardada; algunos
// servidores responden "Vary: Origin" y entonces la copia no se reconocería. ignoreVary lo evita.
const MATCH = { ignoreVary: true };

// Al instalarse: guarda la app entera (también el lector .wasm), aunque aún no se haya usado.
// No se activa hasta tenerlo todo, así que la versión anterior no se borra antes de tiempo.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // "no-cache": pregunta al servidor aunque el navegador tenga copia (si no, podría guardar un index.html viejo)
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: "no-cache" }))))
      .then(() => self.skipWaiting()),
  );
});

// Al activarse una versión nueva: borra las copias de versiones anteriores y toma el control.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Lo de assets/ lleva un "hash" en el nombre: nunca cambia, así que si está guardado no hace falta la red.
  if (url.pathname.includes("/assets/")) event.respondWith(cacheFirst(request));
  else event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

// "Primero red": si hay internet descarga lo último (y lo guarda); si no, usa la copia.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);

  const fromNetwork = fetch(request).then((response) => {
    // La página (index.html) solo la guarda la instalación: así nunca se mezcla una página
    // nueva con los archivos de la versión anterior (sin conexión saldría en blanco).
    if (response.ok && request.mode !== "navigate") cache.put(request, response.clone());
    return response;
  });

  // Espera a la red, pero si tarda demasiado y hay copia guardada, usa la copia.
  const slow = new Promise((resolve) => setTimeout(resolve, SLOW_NETWORK_MS));
  const winner = await Promise.race([fromNetwork.catch(() => null), slow.then(() => "slow")]);
  // Un 404/500 tampoco vale si tenemos copia guardada.
  if (winner && winner !== "slow" && winner.ok) return winner;

  const cached =
    (await cache.match(request, { ...MATCH, ignoreSearch: true })) ??
    (request.mode === "navigate" ? await cache.match("./", MATCH) : undefined); // p. ej. .../index.html
  if (cached) return cached;
  // Sin copia: la respuesta de la red tal cual (aunque sea un error) o un error si no hay conexión.
  return fromNetwork.catch(() => Response.error());
}
