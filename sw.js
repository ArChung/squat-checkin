/* Service Worker：網路優先快取＋推播通知 */
importScripts("js/config.js", "js/draw.js");
const CFG = globalThis.APP_CONFIG;
const Draw = globalThis.Draw;

const CACHE = "squat-club-v4";
const CORE = [
  ".",
  "index.html",
  "app.html",
  "css/report.css",
  "css/style.css",
  "js/report.js",
  "js/config.js",
  "js/draw.js",
  "js/auth.js",
  "js/storage.js",
  "js/app.js",
  "data/report.json",
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

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

/* ---------- 推播：收到（無內容的）推播後，抓當日最新動態組出通知文字 ---------- */
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CFG.timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(Date.now() - CFG.dayStartHour * 3600000));
}

self.addEventListener("push", (e) => {
  e.waitUntil(self.registration.showNotification("深蹲俱樂部", {
    body: "第一季結案報告出爐，點開看你的深蹲人格籤 🏆",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "squat-club"
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return clients.openWindow(".");
    })
  );
});
