const CACHE_NAME = "adervis-crm-v2";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./logo-icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
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

  // Static assets: cache-first, update in background
  const isStatic = STATIC_ASSETS.some(a => url.pathname.endsWith(a.replace("./", "/"))) ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/);

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Everything else: network-first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Web Push ──────────────────────────────────────────────────────────────────
self.addEventListener("push", event => {
  let title = "Adervis CRM";
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
