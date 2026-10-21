/* Service Worker：網路優先快取＋推播通知
   第二季起，通知文字由推播發送器（Cloudflare Worker）組好、加密送來，這裡直接顯示。 */
const CACHE = "squat-club-v5";
const CORE = [
  ".",
  "index.html",
  "season1.html",
  "app.html",
  "s2.html",
  "week.html",
  "css/report.css",
  "css/style.css",
  "css/s2.css",
  "js/report.js",
  "js/config.js",
  "js/draw.js",
  "js/auth.js",
  "js/storage.js",
  "js/app.js",
  "js/s2/score.js",
  "js/s2/colors.js",
  "js/s2/sound.js",
  "js/s2/fx.js",
  "js/s2/grid.js",
  "js/s2/demo.js",
  "js/s2/app.js",
  "js/s2/week.js",
  "data/report.json",
  "data/horoscope.json",
  "manifest.webmanifest",
  "version.json",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 每次都先問伺服器有沒有新版（沒變只回 304，很快）；沒網路才用快取 */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const net = e.request.mode === "navigate" ? fetch(e.request) : fetch(e.request, { cache: "no-cache" });
  e.respondWith(
    net
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

/* ---------- 推播：{title, body, url, tag}；沒有內容的舊式推播給一句通用的 ---------- */
self.addEventListener("push", (e) => {
  let m = null;
  try { m = e.data ? e.data.json() : null; } catch (err) { m = null; }
  if (!m || !m.body) m = { title: "深蹲俱樂部", body: "深蹲俱樂部有新動態，點開看看", url: "./" };
  e.waitUntil(self.registration.showNotification(m.title || "深蹲俱樂部", {
    body: m.body,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: m.tag || "squat-club",
    renotify: true,
    data: { url: m.url || "./" }
  }));
});

/* 點通知：打開（或切到）對應的頁面，例如週報 */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          if (c.url !== target && "navigate" in c) c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
