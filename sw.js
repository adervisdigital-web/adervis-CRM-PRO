const CACHE_NAME = "adervis-crm-v381";
// Только то, без чего приложение не поднимется. Скриншоты онбординга (onboarding/*.webp)
// сюда СОЗНАТЕЛЬНО не входят: это был 1 МБ из 3,5 МБ установки, который скачивали все,
// включая тех, кто онбординг ни разу не открывал. Обработчик fetch ниже кэширует любой
// .webp по факту запроса, поэтому со второго показа они всё равно берутся из кэша, а
// пока не скачаны — <img onerror> открывает CSS-мокап.
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./vendor/supabase.min.js",
  "./vendor/vkid-sdk.min.js",
  "./manifest.json",
  "./logo-icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./fonts/dmsans-latin.woff2",
  "./fonts/dmsans-latin-ext.woff2",
  "./fonts/spacegrotesk-latin.woff2",
  "./fonts/spacegrotesk-latin-ext.woff2",
  "./fonts/manrope-cyrillic.woff2"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Always fetch from network: Supabase API, CDN scripts, external resources
  if (
    url.origin !== location.origin ||
    url.pathname.startsWith("/rest/v1/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/functions/")
  ) {
    return;
  }

  const isStatic = STATIC_ASSETS.some(a => url.pathname.endsWith(a.replace("./", "/"))) ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/);

  if (isStatic) {
    // Cache-first: return cached immediately, refresh cache in background via event.waitUntil
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      // Background refresh — must use event.waitUntil so SW stays alive until write completes
      event.waitUntil(
        fetch(event.request).then(async r => {
          if (r.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, r); // fresh response, body not yet consumed
          }
        }).catch(() => {})
      );
      if (cached) return cached;
      // Cache miss: fetch and cache synchronously
      const r = await fetch(event.request);
      if (r.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, r.clone()); // clone for cache, return original
      }
      return r;
    })());
    return;
  }

  // Network-first, fall back to cache
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone()); // clone for cache, return original
      }
      return response;
    } catch {
      return caches.match(event.request);
    }
  })());
});

// ── Web Push ──────────────────────────────────────────────────────────────────
self.addEventListener("push", event => {
  let title = "Adervis";
  let body  = "Новое уведомление";
  let url   = "./";
  try {
    if (event.data) {
      const d = event.data.json();
      if (d.title) title = d.title;
      if (d.body)  body  = d.body;
      if (d.url)   url   = d.url;
    }
  } catch (_) { /* empty push */ }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  "./logo-icon.svg",
      badge: "./logo-icon.svg",
      data:  { url },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(location.origin) && "focus" in c) return c.focus();
      }
      return clients.openWindow(target);
    })
  );
});
