/* Service Worker：網路優先快取＋推播通知 */
importScripts("js/config.js");
const CFG = globalThis.APP_CONFIG;

const CACHE = "squat-club-v2";
const CORE = [
  ".",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/storage.js",
  "js/app.js",
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
  e.waitUntil((async () => {
    let body = "打卡簿有新動態！";
    try {
      const day = todayKey();
      const [ck, msg] = await Promise.all([
        fetch(`${CFG.databaseURL}/checkins/${day}.json`).then((r) => r.json()),
        fetch(`${CFG.databaseURL}/messages/${day}.json`).then((r) => r.json())
      ]);
      let latest = null;
      for (const id in (ck || {})) {
        if (!latest || ck[id].ts > latest.ts) latest = { type: "checkin", id, ts: ck[id].ts };
      }
      for (const id in (msg || {})) {
        if (!latest || msg[id].ts > latest.ts) latest = { type: "say", id, ts: msg[id].ts, text: msg[id].text };
      }
      if (latest) {
        const name = (CFG.members.find((m) => m.id === latest.id) || {}).name || "有人";
        body = latest.type === "checkin"
          ? `${name} 蓋章了！今日 ${Object.keys(ck || {}).length}/${CFG.members.length} 人達成`
          : `${name} 嗆聲：${latest.text}`;
      }
    } catch (err) {}
    await self.registration.showNotification("深蹲俱樂部", {
      body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "squat-club"
    });
  })());
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
