/* App shell only. Exchange-rate responses are never written to Cache Storage. */
var CACHE = "fx-shell-v1";
var FILES = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    await cache.addAll(FILES);
    try {
      var directory = await fetch("./", { cache: "reload" });
      if (directory.ok) {
        await cache.put("./", new Response(await directory.blob(), {
          status: 200,
          headers: { "Content-Type": directory.headers.get("Content-Type") || "text/html" },
        }));
      }
    } catch (err) {
      /* index.html still answers navigations when the directory URL redirects. */
    }
  })());
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (key) {
      return key !== CACHE;
    }).map(function (key) {
      return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async function () {
    var cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      var index = await caches.match("./index.html");
      if (index) return index;
    }
    return fetch(request);
  })());
});
