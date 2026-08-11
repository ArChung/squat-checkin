/* 裝置匿名身分（Firebase Anonymous Auth，REST 版）
   使用者完全無感：第一次使用時自動領一個隨機裝置身分，存在手機裡。
   不用帳號、不用密碼——「認領卡片」就是把卡綁定到這個裝置身分上。 */
(function () {
  const CFG = globalThis.APP_CONFIG;
  const KEY = "squat-club-auth";
  let mem = null; // { uid, refreshToken, idToken, exp }
  let pending = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
  }

  async function signUp() {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${CFG.webApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true })
    });
    if (!res.ok) throw new Error("signup " + res.status);
    const j = await res.json();
    return { uid: j.localId, refreshToken: j.refreshToken, idToken: j.idToken, exp: Date.now() + 55 * 60000 };
  }

  async function refresh(rt) {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${CFG.webApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(rt)
    });
    if (!res.ok) throw new Error("refresh " + res.status);
    const j = await res.json();
    return { uid: j.user_id, refreshToken: j.refresh_token, idToken: j.id_token, exp: Date.now() + 55 * 60000 };
  }

  async function ensure(force) {
    if (!CFG.webApiKey) return null;
    if (!mem) mem = load();
    if (mem && mem.idToken && Date.now() < mem.exp && !force) return mem;
    if (pending) return pending;
    pending = (async () => {
      try {
        if (mem && mem.refreshToken) {
          mem = await refresh(mem.refreshToken).catch(() => signUp());
        } else {
          mem = await signUp();
        }
        save(mem);
        return mem;
      } finally { pending = null; }
    })();
    return pending;
  }

  globalThis.DeviceAuth = {
    enabled() { return !!CFG.webApiKey; },
    async uid() { const a = await ensure(); return a ? a.uid : null; },
    async token(force) { const a = await ensure(force); return a ? a.idToken : null; },
    cachedUid() { if (!mem) mem = load(); return mem ? mem.uid : null; }
  };
})();
