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
      const s = snd(); if (s && s.sequence) s.sequence([{ t: 0, name: "wipeOut" }]); // 手機還沒點過畫面時先記著，點下去才補播
      wipeEl.className = "wipe out";
      setTimeout(() => { wipeEl.className = "wipe"; }, OUT_MS);
    }, 80);
  }

  /* 入場：每次打開網址，像掃描器開機把畫面印出來（約 1.4 秒）
     1. 螢幕四角的觀景窗先鎖定
     2. 朱紅掃描線由上往下，拖著一段網格殘影，右端讀數 SCAN 000→100
     3. 掃到哪、哪一區就印出來（剛印好的墨比較亮）；標題像訊號對焦抖一下；一週七格由左到右點亮
     4. 品牌字距收合、S2 和印章壓印、大數字像儀表通電閃一下
     5. 掃到底：底部一道光從中間展開，四角淡出
     音效照同一張時間表播（Sfx.sequence）。頁面在 <head> 先加 intro-wait 把內容藏住，資料到了再呼叫這裡。 */
  let introDone = false;
  function intro(selector) {
    if (introDone) return;
    introDone = true;
    const root = document.documentElement;
    root.classList.remove("intro-wait");
    if (REDUCE || !root.animate) return;
    const vh = window.innerHeight;
    const SWEEP = 640, DUR = 560, base = wiped ? 300 : 140, END = base + SWEEP;
    const ease = "cubic-bezier(.16, 1, .3, 1)";
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.width && r.height && r.top < vh && r.bottom > 0; };
    const all = (sel) => Array.from(document.querySelectorAll(sel)).filter(inView);
    const at = (el) => base + SWEEP * Math.min(1, Math.max(0, el.getBoundingClientRect().top / vh));
    const cues = [];
    const cue = (ms, name, arg) => cues.push({ t: ms / 1000, name, arg });
    const layer = (cls, html) => {
      const el = document.createElement("div");
      el.className = cls;
      el.setAttribute("aria-hidden", "true");
      if (html) el.innerHTML = html;
      document.body.appendChild(el);
      return el;
    };

    /* 1. 觀景窗四角 */
    const frame = layer("intro-frame", "<i></i><i></i><i></i><i></i>");
    frame.querySelectorAll("i").forEach((c, k) => {
      const dx = k % 2 ? 16 : -16, dy = k < 2 ? -16 : 16;
      c.animate([{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0 }, { transform: "none", opacity: 1 }],
        { duration: 260, delay: k * 35, easing: ease, fill: "backwards" });
    });
    frame.animate([{ opacity: 1, transform: "none" }, { opacity: 1, transform: "none", offset: 0.8 }, { opacity: 0, transform: "scale(.985)" }],
      { duration: END + 420, easing: "ease-in", fill: "forwards" }).onfinish = () => frame.remove();
    cue(0, "introPower");
    cue(20, "introLock");

    /* 2. 掃描線＋讀數 */
    const line = layer("intro-scan", "<span>SCAN 000</span>");
    const scan = line.animate([
      { transform: "translateY(0)", opacity: 0 },
      { transform: `translateY(${vh * 0.04}px)`, opacity: 1, offset: 0.04 },
      { transform: `translateY(${vh * 0.94}px)`, opacity: 1, offset: 0.94 },
      { transform: `translateY(${vh}px)`, opacity: 0 }
    ], { duration: SWEEP, delay: base, easing: "linear", fill: "backwards" });
    scan.onfinish = () => line.remove();
    const label = line.firstChild;
    const readout = () => {
      const t = scan.currentTime;
      if (t == null || scan.playState === "finished") return;
      const p = Math.round(Math.max(0, Math.min(1, (t - base) / SWEEP)) * 100);
      label.textContent = "SCAN " + String(p).padStart(3, "0");
      requestAnimationFrame(readout);
    };
    requestAnimationFrame(readout);
    cue(base, "introSweep", SWEEP / 1000);

    /* 3. 區塊印出來（有更細的就用細的） */
    const cand = all(selector);
    const blocks = cand.filter((el) => !cand.some((o) => o !== el && el.contains(o)));
    blocks.forEach((el, i) => {
      const d = at(el);
      el.animate([
        { opacity: 0, transform: "translateY(14px)", clipPath: "inset(0 0 100% 0)", filter: "brightness(2.2)" },
        { opacity: 1, filter: "brightness(1.6)", offset: 0.4 },
        { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)", filter: "none" }
      ], { duration: DUR, delay: d, easing: ease, fill: "backwards" });
      cue(d, "introPrint", i);
    });

    /* 標題：像訊號對焦，左右抖一下才站定 */
    all(".me-name, .claim-q, .rules-title b, .wk-title").forEach((el) => {
      const d = at(el) + 70;
      el.animate([
        { transform: "translateX(-9px) skewX(-14deg)", opacity: 0.25, easing: "steps(1, end)" },
        { transform: "translateX(6px) skewX(8deg)", opacity: 0.9, easing: "steps(1, end)" },
        { transform: "translateX(-2px)", opacity: 0.6, easing: "steps(1, end)" },
        { transform: "none", opacity: 1 }
      ], { duration: 240, delay: d, fill: "backwards" });
      cue(d, "introGlitch");
    });

    /* 一週七格由左到右點亮 */
    all("#hero .days, .score-card .days").forEach((row) => {
      const d0 = at(row) + 140;
      row.querySelectorAll(".d").forEach((cell, i) => {
        cell.animate([
          { opacity: 0, transform: "scale(.5)" },
          { opacity: 1, transform: "scale(1.08)", offset: 0.6 },
          { opacity: 1, transform: "none" }
        ], { duration: 260, delay: d0 + i * 42, easing: ease, fill: "backwards" });
        cue(d0 + i * 42, "introCell", i);
      });
    });

    /* 4. 品牌字距收合 */
    all(".brand-zh").forEach((el) => {
      const ls = parseFloat(getComputedStyle(el).letterSpacing) || 4;
      el.animate([{ letterSpacing: ls * 2.6 + "px", opacity: 0 }, { letterSpacing: ls + "px", opacity: 1 }],
        { duration: 620, delay: base, easing: ease, fill: "backwards" });
    });

    /* 壓印：S2、大印章重壓，小朱印輕點 */
    all(".brand-s, .seal, .mini-seal").forEach((el) => {
      const d = at(el) + 260;
      const big = !el.classList.contains("mini-seal");
      el.animate([
        { opacity: 0, transform: `scale(${big ? 1.9 : 2.4}) rotate(-10deg)` },
        { opacity: 1, transform: "scale(.94) rotate(0)", offset: 0.6 },
        { opacity: 1, transform: "none" }
      ], { duration: 420, delay: d, easing: "cubic-bezier(.3, 0, .2, 1)", fill: "backwards" });
      cue(d + 250, big ? "introPress" : "introDot");
    });

    /* 大數字閃一下，像儀表剛接上電 */
    all(".me-num, .count, .score-card .big b").forEach((el) => {
      const d = at(el) + 120;
      el.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }],
        { duration: 420, delay: d, easing: "steps(6, jump-none)", fill: "backwards" });
      [0, 140, 280].forEach((k) => cue(d + k, "introZap"));
    });

    /* 5. 掃到底：底部一道光從中間展開 */
    const done = layer("intro-done");
    done.animate([
      { transform: "scaleX(0)", opacity: 1 },
      { transform: "scaleX(1)", opacity: 1, offset: 0.45 },
      { transform: "scaleX(1)", opacity: 0 }
    ], { duration: 560, delay: END - 30, easing: ease, fill: "backwards" }).onfinish = () => done.remove();
    cue(END + 40, "introReady");

    const s = snd();
    if (s && s.sequence) s.sequence(cues);
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
