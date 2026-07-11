const CACHE_NAME = "afp-shell-v2";
const APP_SHELL_URLS = ["/", "/gastos", "/manifest.webmanifest", "/icons/app-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/gastos"));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname === "/api/gastos/bootstrap" ||
    url.pathname === "/api/expenses" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icons/app-icon.svg"
  ) {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) return cachedResponse;

  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());

  return response;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cachedResponse =
      (await caches.match(request)) ||
      (fallbackUrl ? await caches.match(fallbackUrl) : null);

    if (cachedResponse) return cachedResponse;

    return new Response("Sin conexión.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
