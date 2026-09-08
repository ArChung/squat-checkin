/* 天選之人抽籤（確定性亂數）：頁面與 Service Worker 共用。
   同一天全世界算出同樣的兩位中籤者，不需伺服器、不需資料庫。 */
(function () {
  const CFG = globalThis.APP_CONFIG;

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 該日抽幾人（依 countWeights 加權隨機，用獨立種子，與「抽誰」互不影響） */
  function countFor(dateKey) {
    const d = CFG.draw;
    const weights = d.countWeights || { "1": 1 };
    const keys = Object.keys(weights).map(Number).sort((a, b) => a - b);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let r = mulberry32(hashStr(dateKey + "|squat-club-count-v1"))() * total;
    for (const k of keys) {
      r -= weights[k];
      if (r < 0) return k;
    }
    return keys[keys.length - 1];
  }

  /* 該日中籤者；日期在開跑日前回傳空陣列 */
  function drawFor(dateKey) {
    const d = CFG.draw;
    if (!d || !d.startDate || dateKey < d.startDate) return [];
    const rand = mulberry32(hashStr(dateKey + "|squat-club-tianxuan-v1"));
    const arr = CFG.members.map((m) => m.id);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr.slice(0, Math.min(countFor(dateKey), arr.length));
  }

  /* 該日的開獎時刻（epoch ms）：當天早上 revealHour 點（台北時間） */
  function revealAt(dateKey) {
    const h = String(CFG.draw.revealHour).padStart(2, "0");
    return Date.parse(`${dateKey}T${h}:00:00+08:00`);
  }

  function isRevealed(dateKey, now) {
    const d = CFG.draw;
    if (!d || !d.startDate || dateKey < d.startDate) return false;
    return (now || Date.now()) >= revealAt(dateKey);
  }

  globalThis.Draw = { drawFor, countFor, revealAt, isRevealed };
})();
