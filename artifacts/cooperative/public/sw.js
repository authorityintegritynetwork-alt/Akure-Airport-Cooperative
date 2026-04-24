const CACHE_NAME = "aacs-shell-v2";

// Derive the deployment base path from the SW registration scope so the
// service worker works correctly regardless of where the app is mounted
// (e.g. "/" or "/cooperative/").
const SCOPE_PATH = new URL("./", self.registration.scope).pathname;
const SHELL_URL = SCOPE_PATH;
const PRECACHE_URLS = [
  SHELL_URL,
  SCOPE_PATH + "logo.png",
  SCOPE_PATH + "logo.svg",
  SCOPE_PATH + "favicon.svg",
];

const API_PREFIX = SCOPE_PATH + "api/";
const AUTH_PREFIX = SCOPE_PATH + "auth/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Don't interfere with API or auth requests under any circumstance.
  if (url.pathname.startsWith(API_PREFIX) || url.pathname.startsWith(AUTH_PREFIX)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(SHELL_URL).then((res) => res || Response.error())
      )
    );
    return;
  }

  // Only cache requests inside our deployment scope.
  if (!url.pathname.startsWith(SCOPE_PATH)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== "basic") return res;
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => cached || Response.error());
    })
  );
});
