"use strict";

// Prefixed: every project page on strokirk.github.io shares this origin's Cache Storage.
const CACHE = "tarot-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "deck.json", "manifest.webmanifest",
  "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const deck = await (await cache.match("deck.json")).json();
    await cache.addAll(deck.cards.map((c) => `img/${c.id}.jpg`));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("tarot-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (ev) => {
  const { request } = ev;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return;

  if (fonts || url.pathname.includes("/img/")) {
    ev.respondWith(cacheFirst(request));
  } else {
    ev.respondWith(staleWhileRevalidate(ev, request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request, res.clone());
  return res;
}

// Serve the cached copy at once and refresh it in the background, so a deploy shows up on the next launch.
async function staleWhileRevalidate(ev, request) {
  const cache = await caches.open(CACHE);
  // ignoreSearch: deep links like ?spread=celtic should still open offline.
  const hit = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
  const refresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  if (hit) {
    ev.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  return refresh;
}
