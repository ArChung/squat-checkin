/* 儲存層（可抽換）：有 databaseURL 就走 Firebase RTDB REST + 即時串流，沒有就退回本機 localStorage。
   資料形狀：{
     checkins: { "2026-08-09": { "azhong": { ts: 1786240000000 } } },
     messages: { "2026-08-09": { "azhong": { text: "今天你們死定了", ts: 1786240000000 } } }
   } */
(function () {
  const CFG = window.APP_CONFIG;
  const CACHE_KEY = "squat-club-cache-v2";
  const LOCAL_KEY = "squat-club-local-v2";
  const ROOTS = ["checkins", "messages"];

  let data = { checkins: {}, messages: {} };
  let notify = function () {};

  function readJSON(key) {
    try {
      const obj = JSON.parse(localStorage.getItem(key)) || {};
      return { checkins: obj.checkins || {}, messages: obj.messages || {} };
    } catch (e) { return { checkins: {}, messages: {} }; }
  }
  function writeJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  /* ---------- Firebase RTDB（REST + Server-Sent Events） ---------- */
  const cloud = {
    mode: "cloud",
    get data() { return data; },

    _es: {},

    async init(onChange) {
      notify = onChange;
      data = readJSON(CACHE_KEY); // 先用快取秒開畫面
      if (Object.keys(data.checkins).length || Object.keys(data.messages).length) notify(data);
      await this._load();
    },

    async _load() {
      /* 各節點獨立容錯：某節點讀不到（如規則尚未開通）時不拖垮其他節點 */
      const results = await Promise.all(ROOTS.map(async (root) => {
        try {
          const res = await fetch(`${CFG.databaseURL}/${root}.json`);
          if (!res.ok) throw new Error("HTTP " + res.status);
          return { root, value: (await res.json()) || {}, ok: true };
        } catch (e) {
          return { root, value: data[root] || {}, ok: false };
        }
      }));
      if (!results.some((r) => r.ok)) throw new Error("all roots failed");
      const next = {};
      results.forEach((r) => { next[r.root] = r.value; });
      data = next;
      writeJSON(CACHE_KEY, data);
      notify(data);
      results.forEach((r) => { if (r.ok) this._stream(r.root); });
    },

    /* App 從背景回前景時重新同步（iOS 會殺掉背景的串流連線） */
    resync() {
      return this._load().catch(() => {});
    },

    _stream(root) {
      if (this._es[root]) this._es[root].close();
      const es = new EventSource(`${CFG.databaseURL}/${root}.json`);
      this._es[root] = es;
      const apply = (e) => {
        const msg = JSON.parse(e.data);
        const parts = msg.path.split("/").filter(Boolean);
        if (parts.length === 0) {
          data[root] = msg.data || {};
        } else {
          let node = data[root];
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
      const restart = () => {
        es.close();
        setTimeout(() => { if (this._es[root] === es) this._stream(root); }, 5000);
      };
      es.addEventListener("cancel", restart);
      es.onerror = () => { if (es.readyState === EventSource.CLOSED) restart(); };
    },

    async _put(root, date, person, body) {
      const res = await fetch(`${CFG.databaseURL}/${root}/${date}/${person}.json`, {
        method: body === null ? "DELETE" : "PUT",
        body: body === null ? undefined : JSON.stringify(body)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      if (body === null) { if (data[root][date]) delete data[root][date][person]; }
      else {
        data[root][date] = data[root][date] || {};
        data[root][date][person] = Object.assign({}, body, { ts: Date.now() }); // 樂觀更新；串流會推回伺服器時間
      }
      notify(data);
    },

    checkin(date, person) { return this._put("checkins", date, person, { ts: { ".sv": "timestamp" } }); },
    uncheck(date, person) { return this._put("checkins", date, person, null); },
    say(date, person, text) { return this._put("messages", date, person, { text: text, ts: { ".sv": "timestamp" } }); },
    unsay(date, person) { return this._put("messages", date, person, null); },

    /* 推播訂閱（每支手機一筆，掛在成員名下） */
    async saveSub(person, key, sub) {
      const res = await fetch(`${CFG.databaseURL}/subs/${person}/${key}.json`, {
        method: "PUT", body: JSON.stringify(sub)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
    },
    async removeSub(person, key) {
      await fetch(`${CFG.databaseURL}/subs/${person}/${key}.json`, { method: "DELETE" });
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

    async _set(root, date, person, value) {
      if (value === null) { if (data[root][date]) delete data[root][date][person]; }
      else {
        data[root][date] = data[root][date] || {};
        data[root][date][person] = value;
      }
      writeJSON(LOCAL_KEY, data);
      notify(data);
    },

    checkin(date, person) { return this._set("checkins", date, person, { ts: Date.now() }); },
    uncheck(date, person) { return this._set("checkins", date, person, null); },
    say(date, person, text) { return this._set("messages", date, person, { text: text, ts: Date.now() }); },
    unsay(date, person) { return this._set("messages", date, person, null); },
    resync() { return Promise.resolve(); },
    async saveSub() { throw new Error("local mode"); },
    async removeSub() {}
  };

  window.Store = CFG.databaseURL ? cloud : local;
})();
