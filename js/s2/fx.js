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

  let wiped = false; // 這次是換頁進來的（切片還在抽走）
  function enter() {
    let flag = null;
    try { flag = sessionStorage.getItem(FLAG); sessionStorage.removeItem(FLAG); } catch (e) {}
    if (!flag || REDUCE) return;
    wiped = true;
    ensure();
    wipeEl.className = "wipe cover";
    setTimeout(() => {
      const s = snd(); if (s) s.wipeOut(); // 換頁後還沒點過畫面的話，手機會先靜音
      wipeEl.className = "wipe out";
      setTimeout(() => { wipeEl.className = "wipe"; }, OUT_MS);
    }, 80);
  }

  /* 入場：每次打開網址，畫面上看得到的區塊跟著一道朱紅掃描線由上往下印出來，
     品牌的 S2 和畫面上的印章最後補一下壓印。頁面在 <head> 先加 intro-wait 把內容藏住，資料到了再呼叫這裡。 */
  let introDone = false;
  function intro(selector) {
    if (introDone) return;
    introDone = true;
    const root = document.documentElement;
    if (REDUCE || !root.animate) { root.classList.remove("intro-wait"); return; }
    root.classList.remove("intro-wait");
    const vh = window.innerHeight;
    const SWEEP = 620, DUR = 560, base = wiped ? 300 : 40;
    const ease = "cubic-bezier(.16, 1, .3, 1)";
    const cand = Array.from(document.querySelectorAll(selector)).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && r.top < vh && r.bottom > 0;
    });
    const blocks = cand.filter((el) => !cand.some((o) => o !== el && el.contains(o))); // 有更細的就用細的
    const at = (el) => base + SWEEP * Math.min(1, Math.max(0, el.getBoundingClientRect().top / vh));

    const line = document.createElement("div");
    line.className = "intro-scan";
    line.setAttribute("aria-hidden", "true");
    document.body.appendChild(line);
    line.animate([
      { transform: "translateY(0)", opacity: 0 },
      { transform: `translateY(${vh * 0.04}px)`, opacity: 1, offset: 0.04 },
      { transform: `translateY(${vh * 0.94}px)`, opacity: 1, offset: 0.94 },
      { transform: `translateY(${vh}px)`, opacity: 0 }
    ], { duration: SWEEP, delay: base, easing: "linear", fill: "backwards" }).onfinish = () => line.remove();

    blocks.forEach((el) => {
      el.animate([
        { opacity: 0, transform: "translateY(14px)", clipPath: "inset(0 0 100% 0)" },
        { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" }
      ], { duration: DUR, delay: at(el), easing: ease, fill: "backwards" });
    });

    /* 壓印：品牌 S2、畫面上的印章 */
    document.querySelectorAll(".brand-s, .seal, .mini-seal").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || r.top > vh || r.bottom < 0) return;
      el.animate([
        { opacity: 0, transform: "scale(1.9) rotate(-10deg)" },
        { opacity: 1, transform: "scale(.94) rotate(0)", offset: 0.6 },
        { opacity: 1, transform: "none" }
      ], { duration: 420, delay: at(el) + 260, easing: "cubic-bezier(.3, 0, .2, 1)", fill: "backwards" });
    });
    /* 大數字閃一下，像儀表剛接上電 */
    document.querySelectorAll(".me-num, .count, .score-card .big b").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || r.top > vh || r.bottom < 0) return;
      el.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }],
        { duration: 420, delay: at(el) + 120, easing: "steps(6, jump-none)", fill: "backwards" });
    });
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

  globalThis.Fx = { lock, wipe, go, intro };
})();
