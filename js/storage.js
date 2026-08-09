/* 儲存層（可抽換）：有 databaseURL 就走 Firebase RTDB REST + 即時串流，沒有就退回本機 localStorage。
   資料形狀：{ "2026-08-09": { "azhong": { ts: 1786240000000 }, ... }, ... } */
(function () {
  const CFG = window.APP_CONFIG;
  const CACHE_KEY = "squat-club-cache";
  const LOCAL_KEY = "squat-club-local";

  let data = {};
  let notify = function () {};

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch (e) { return {}; }
  }
  function writeJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  /* ---------- Firebase RTDB（REST + Server-Sent Events） ---------- */
  const cloud = {
    mode: "cloud",
    get data() { return data; },

    async init(onChange) {
      notify = onChange;
      data = readJSON(CACHE_KEY); // 先用快取秒開畫面
      if (Object.keys(data).length) notify(data);

      const res = await fetch(CFG.databaseURL + "/checkins.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = (await res.json()) || {};
      writeJSON(CACHE_KEY, data);
      notify(data);
      this._stream();
    },

    _stream() {
      const es = new EventSource(CFG.databaseURL + "/checkins.json");
      const apply = (e) => {
        const msg = JSON.parse(e.data);
        const parts = msg.path.split("/").filter(Boolean);
        if (parts.length === 0) {
          data = msg.data || {};
        } else {
          let node = data;
          for (let i = 0; i < parts.length - 1; i++) {
            if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
            node = node[parts[i]];
          }
          const leaf = parts[parts.length - 1];
          if (e.type === "patch") {
            const target = (typeof node[leaf] === "object" && node[leaf] !== null) ? node[leaf] : (node[leaf] = {});
            for (const k in msg.data) {
              if (msg.data[k] === null) delete target[k];
              else target[k] = msg.data[k];
            }
          } else {
            if (msg.data === null) delete node[leaf];
            else node[leaf] = msg.data;
          }
        }
        writeJSON(CACHE_KEY, data);
        notify(data);
      };
      es.addEventListener("put", apply);
      es.addEventListener("patch", apply);
      const restart = () => { es.close(); setTimeout(() => this._stream(), 5000); };
      es.addEventListener("cancel", restart);
      es.onerror = () => { if (es.readyState === EventSource.CLOSED) restart(); };
    },

    async checkin(date, person) {
      const res = await fetch(`${CFG.databaseURL}/checkins/${date}/${person}.json`, {
        method: "PUT",
        body: JSON.stringify({ ts: { ".sv": "timestamp" } })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      // 串流會把含伺服器時間的正式資料推回來；先本地樂觀更新
      data[date] = data[date] || {};
      data[date][person] = { ts: Date.now() };
      notify(data);
    },

    async uncheck(date, person) {
      const res = await fetch(`${CFG.databaseURL}/checkins/${date}/${person}.json`, { method: "DELETE" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      if (data[date]) { delete data[date][person]; notify(data); }
    }
  };

  /* ---------- 本機模式（尚未接雲端時的試用） ---------- */
  const local = {
    mode: "local",
    get data() { return data; },

    async init(onChange) {
      notify = onChange;
      data = readJSON(LOCAL_KEY);
      notify(data);
      window.addEventListener("storage", (e) => {
        if (e.key === LOCAL_KEY) { data = readJSON(LOCAL_KEY); notify(data); }
      });
    },

    async checkin(date, person) {
      data[date] = data[date] || {};
      data[date][person] = { ts: Date.now() };
      writeJSON(LOCAL_KEY, data);
      notify(data);
    },

    async uncheck(date, person) {
      if (data[date]) delete data[date][person];
      writeJSON(LOCAL_KEY, data);
      notify(data);
    }
  };

  window.Store = CFG.databaseURL ? cloud : local;
})();
