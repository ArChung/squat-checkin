/* 儲存層（可抽換）：有 databaseURL 就走 Firebase RTDB REST + 單一即時串流，沒有就退回本機 localStorage。
   資料形狀：{
     checkins: { "2026-08-09": { "azhong": { ts } } },
     messages: { "2026-08-09": { "azhong": { text, ts } } },
     members:  { "azhong": { name, role: "founder"|"fan", claimedBy: <uid>, ts } },
     subs:     { "azhong": { "<device>": { endpoint, keys } } }
   } */
(function () {
  const CFG = globalThis.APP_CONFIG;
  const CACHE_KEY = "squat-club-cache-v3";
  const LOCAL_KEY = "squat-club-local-v2";
  const ROOTS = ["checkins", "messages", "members", "subs"];

  let data = empty();
  let notify = function () {};

  function empty() { return { checkins: {}, messages: {}, members: {}, subs: {} }; }
  function pick(obj) {
    const out = empty();
    if (obj) ROOTS.forEach((r) => { if (obj[r]) out[r] = obj[r]; });
    return out;
  }
  function readJSON(key) {
    try { return pick(JSON.parse(localStorage.getItem(key))); } catch (e) { return empty(); }
  }
  function writeJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  /* 寫入時自動帶上裝置身分；權杖過期就換新的重試一次 */
  async function authedFetch(path, opts, retried) {
    let url = CFG.databaseURL + path;
    if (globalThis.DeviceAuth && DeviceAuth.enabled()) {
      const t = await DeviceAuth.token(retried).catch(() => null);
      if (t) url += (url.includes("?") ? "&" : "?") + "auth=" + t;
    }
    const res = await fetch(url, opts);
    if ((res.status === 401 || res.status === 403) && !retried && globalThis.DeviceAuth && DeviceAuth.enabled()) {
      return authedFetch(path, opts, true);
    }
    return res;
  }

  /* ---------- Firebase RTDB（REST + 單一 Server-Sent Events 串流） ---------- */
  const cloud = {
    mode: "cloud",
    get data() { return data; },
    _gen: 0,
    _sources: [],

    async init(onChange) {
      notify = onChange;
      data = readJSON(CACHE_KEY); // 先用快取秒開畫面
      if (Object.keys(data.checkins).length || Object.keys(data.members).length) notify(data);
      await this._load();
    },

    _closeStreams() {
      this._sources.forEach((es) => es.close());
      this._sources = [];
    },

    async _load() {
      this._gen++;
      const gen = this._gen;
      this._closeStreams();

      /* 首選：根節點單一連線（新規則）；規則未開放根讀取時退回逐節點（舊規則相容） */
      try {
        const res = await fetch(`${CFG.databaseURL}/.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const value = pick(await res.json());
        if (gen !== this._gen) return;
        data = value;
        writeJSON(CACHE_KEY, data);
        notify(data);
        this._openStream(gen, null);
        return;
      } catch (e) { /* fall through */ }

      const results = await Promise.all(ROOTS.map(async (root) => {
        try {
          const r = await fetch(`${CFG.databaseURL}/${root}.json`);
          if (!r.ok) throw new Error("HTTP " + r.status);
          return { root, value: (await r.json()) || {}, ok: true };
        } catch (err) {
          return { root, value: data[root] || {}, ok: false };
        }
      }));
      if (gen !== this._gen) return;
      if (!results.some((r) => r.ok)) throw new Error("all roots failed");
      const next = empty();
      results.forEach((r) => { next[r.root] = r.value; });
      data = next;
      writeJSON(CACHE_KEY, data);
      notify(data);
      results.forEach((r) => { if (r.ok) this._openStream(gen, r.root); });
    },

    /* App 從背景回前景時重新同步（iOS 會殺掉背景的串流連線） */
    resync() {
      return this._load().catch(() => {});
    },

    _openStream(gen, root) {
      if (gen !== this._gen) return;
      const es = new EventSource(`${CFG.databaseURL}${root ? "/" + root : ""}/.json`);
      this._sources.push(es);
      const apply = (e) => {
        const msg = JSON.parse(e.data);
        let parts = msg.path.split("/").filter(Boolean);
        if (root) parts = [root].concat(parts);
        if (parts.length === 0) {
          data = pick(msg.data);
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
      const restart = () => {
        es.close();
        setTimeout(() => this._openStream(gen, root), 5000);
      };
      es.addEventListener("cancel", restart);
      es.onerror = () => { if (es.readyState === EventSource.CLOSED) restart(); };
    },

    async _put(path, body) {
      const res = await authedFetch(path, {
        method: body === null ? "DELETE" : "PUT",
        body: body === null ? undefined : JSON.stringify(body)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res;
    },

    async _entry(root, date, person, body) {
      await this._put(`/${root}/${date}/${person}.json`, body);
      // 樂觀更新；串流會推回含伺服器時間的正式資料
      if (body === null) { if (data[root][date]) delete data[root][date][person]; }
      else {
        data[root][date] = data[root][date] || {};
        data[root][date][person] = Object.assign({}, body, { ts: Date.now() });
      }
      notify(data);
    },

    checkin(date, person) { return this._entry("checkins", date, person, { ts: { ".sv": "timestamp" } }); },
    uncheck(date, person) { return this._entry("checkins", date, person, null); },
    say(date, person, text) { return this._entry("messages", date, person, { text: text, ts: { ".sv": "timestamp" } }); },
    unsay(date, person) { return this._entry("messages", date, person, null); },

    /* 成員（認領／加入／移除） */
    async setMember(id, obj) {
      await this._put(`/members/${id}.json`, obj);
      if (obj === null) delete data.members[id];
      else data.members[id] = Object.assign({}, obj, { ts: Date.now() });
      notify(data);
    },

    /* 推播訂閱（每支手機一筆，掛在成員名下） */
    async saveSub(person, key, sub) {
      await this._put(`/subs/${person}/${key}.json`, sub);
    },
    async removeSub(person, key) {
      await this._put(`/subs/${person}/${key}.json`, null).catch(() => {});
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
    async setMember(id, obj) {
      if (obj === null) delete data.members[id];
      else data.members[id] = obj;
      writeJSON(LOCAL_KEY, data);
      notify(data);
    },
    resync() { return Promise.resolve(); },
    async saveSub() { throw new Error("local mode"); },
    async removeSub() {}
  };

  window.Store = CFG.databaseURL ? cloud : local;
})();
