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

    async init(onChange) {
      notify = onChange;
      data = readJSON(CACHE_KEY); // 先用快取秒開畫面
      if (Object.keys(data.checkins).length || Object.keys(data.messages).length) notify(data);

      const [ck, msg] = await Promise.all(ROOTS.map(async (root) => {
        const res = await fetch(`${CFG.databaseURL}/${root}.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return (await res.json()) || {};
      }));
      data = { checkins: ck, messages: msg };
      writeJSON(CACHE_KEY, data);
      notify(data);
      ROOTS.forEach((root) => this._stream(root));
    },

    _stream(root) {
      const es = new EventSource(`${CFG.databaseURL}/${root}.json`);
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
      const restart = () => { es.close(); setTimeout(() => this._stream(root), 5000); };
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
    unsay(date, person) { return this._put("messages", date, person, null); }
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
    unsay(date, person) { return this._set("messages", date, person, null); }
  };

  window.Store = CFG.databaseURL ? cloud : local;
})();
