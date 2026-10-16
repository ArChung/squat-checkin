/* 科技感過場（第二季兩頁共用）
   1. 鎖定框：每顆按鈕按下去，四個朱紅角框收進來框住它，一條掃描線掃過
   2. 切片轉場：換畫面時八條黑色切片蓋過再抽走，前緣一道朱紅光
   站內連結會自動帶轉場，下一頁打開時接著把切片抽走。 */
(function () {
  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FLAG = "squat-wipe";
  const IN_MS = 340, OUT_MS = 420;
  const snd = () => globalThis.Sfx;
  let lockEl = null, wipeEl = null, busy = false;

  function ensure() {
    if (!lockEl) {
      lockEl = document.createElement("div");
      lockEl.className = "lock";
      lockEl.setAttribute("aria-hidden", "true");
      lockEl.innerHTML = "<i></i><i></i><i></i><i></i><b></b>";
      document.body.appendChild(lockEl);
    }
    if (!wipeEl) {
      wipeEl = document.createElement("div");
      wipeEl.className = "wipe";
      wipeEl.setAttribute("aria-hidden", "true");
      wipeEl.innerHTML = Array.from({ length: 8 }, (_, k) => `<i style="--k:${k}"></i>`).join("");
      document.body.appendChild(wipeEl);
    }
  }

  /* 鎖定框：貼著按鈕外緣 5px；long＝停留久一點、掃得慢一點（用在框整張卡） */
  function lock(el, opt) {
    if (REDUCE || !el) return;
    ensure();
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pad = 5;
    lockEl.style.left = r.left - pad + "px";
    lockEl.style.top = r.top - pad + "px";
    lockEl.style.width = r.width + pad * 2 + "px";
    lockEl.style.height = r.height + pad * 2 + "px";
    lockEl.classList.remove("go", "long");
    void lockEl.offsetWidth;
    lockEl.classList.add("go");
    if (opt && opt.long) lockEl.classList.add("long");
  }

  /* 切片轉場：蓋滿的那一刻執行 mid（換內容），抽走後執行 done */
  function wipe(mid, done) {
    if (REDUCE || busy) { if (mid) mid(); if (done) done(); return; }
    ensure();
    busy = true;
    const s = snd(); if (s) s.wipeIn();
    wipeEl.className = "wipe in";
    setTimeout(() => {
      if (mid) mid();
      if (s) s.wipeOut();
      wipeEl.className = "wipe out";
      setTimeout(() => { wipeEl.className = "wipe"; busy = false; if (done) done(); }, OUT_MS);
    }, IN_MS);
  }

  /* 換頁：先蓋滿再走，下一頁接著抽走 */
  function go(href) {
    if (REDUCE) { location.href = href; return; }
    ensure();
    const s = snd(); if (s) s.wipeIn();
    wipeEl.className = "wipe in";
    try { sessionStorage.setItem(FLAG, "1"); } catch (e) {}
    setTimeout(() => { location.href = href; }, IN_MS);
  }

  function enter() {
    let flag = null;
    try { flag = sessionStorage.getItem(FLAG); sessionStorage.removeItem(FLAG); } catch (e) {}
    if (!flag || REDUCE) return;
    ensure();
    wipeEl.className = "wipe cover";
    setTimeout(() => {
      const s = snd(); if (s) s.wipeOut(); // 換頁後還沒點過畫面的話，手機會先靜音
      wipeEl.className = "wipe out";
      setTimeout(() => { wipeEl.className = "wipe"; }, OUT_MS);
    }, 80);
  }

  const TARGET = "button, a[href], label, [role=button]";

  /* 一般按鈕：點下去就鎖定＋輕輕一聲 */
  document.addEventListener("click", (e) => {
    if (e.target.tagName === "INPUT") return; // label 會再派一次 click 給 checkbox，不要重複
    const t = e.target.closest(TARGET);
    if (!t || t.disabled || t.matches(".sh-confirm.hold")) return;
    lock(t);
    const s = snd(); if (s) s.tap();
  }, true);

  /* 按住蓋章的按鈕：一按下就鎖定（它的 click 要放開才會來） */
  document.addEventListener("pointerdown", (e) => {
    const t = e.target.closest(".sh-confirm.hold");
    if (t) lock(t);
  }, true);

  /* 站內連結自動帶轉場 */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.href === location.href) return;
    e.preventDefault();
    go(url.href);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enter);
  else enter();

  globalThis.Fx = { lock, wipe, go };
})();
