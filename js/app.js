/* 深蹲俱樂部：畫面與互動 */
(function () {
  const CFG = window.APP_CONFIG;
  const $ = (sel) => document.querySelector(sel);

  const WEEK_CH = ["日", "一", "二", "三", "四", "五", "六"];
  const MONTH_CH = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

  /* ---------- 台北時區日期工具 ---------- */
  const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: CFG.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtTime = new Intl.DateTimeFormat("zh-TW", { timeZone: CFG.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });

  function dateKey(d) { return fmtKey.format(d || new Date()); }

  function keyParts(key) {
    const [y, m, day] = key.split("-").map(Number);
    // 用正午 UTC 避開時區邊界，只拿星期幾
    const wd = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay();
    return { y, m, day, wd };
  }

  function lastNDays(n) {
    const out = [];
    const now = Date.now();
    for (let i = n - 1; i >= 0; i--) out.push(dateKey(new Date(now - i * 86400000)));
    return out;
  }

  /* ---------- 狀態 ---------- */
  let today = dateKey();
  let prevDone = {};   // personId -> bool（用來偵測「剛蓋章」以觸發動畫）
  let firstRender = true;
  let celebrated = false;

  /* ---------- 印章 SVG ---------- */
  function sealSVG(animate) {
    return `
    <svg class="seal ${animate ? "stamp-in" : ""}" viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" stroke="var(--seal)">
        <circle cx="50" cy="50" r="45" stroke-width="5"/>
        <circle cx="50" cy="50" r="36.5" stroke-width="1.8"/>
      </g>
      <text x="50" y="46" text-anchor="middle" font-family="LXGW WenKai TC, serif" font-weight="700"
            font-size="27" fill="var(--seal)" letter-spacing="1">達成</text>
      <text x="50" y="70" text-anchor="middle" font-family="Anton, sans-serif"
            font-size="13" fill="var(--seal)" letter-spacing="2">SQUAT!</text>
    </svg>`;
  }

  function splats() {
    let html = "";
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + Math.random();
      const dist = 46 + Math.random() * 26;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      html += `<span class="splat" style="--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px"></span>`;
    }
    return html;
  }

  /* ---------- 報頭日期 ---------- */
  function renderMasthead() {
    const p = keyParts(today);
    $("#dateNum").textContent = p.day;
    $("#dateMonth").textContent = MONTH_CH[p.m - 1];
    $("#dateWeek").textContent = "星期" + WEEK_CH[p.wd];
    const hasPushups = CFG.members.some((m) => m.pushups);
    $("#goalText").textContent = `深蹲 ${CFG.squats} 下` +
      (hasPushups ? `・男子組加碼伏地挺身 ${CFG.pushupsCount} 下` : "");
  }

  /* ---------- 今日卡片 ---------- */
  function renderCards(data) {
    const wrap = $("#cards");
    const todayData = data[today] || {};
    wrap.innerHTML = "";

    CFG.members.forEach((m) => {
      const rec = todayData[m.id];
      const done = !!rec;
      const justStamped = !firstRender && done && !prevDone[m.id];

      const card = document.createElement("article");
      card.className = "card";
      card.style.setProperty("--accent", m.accent);
      card.innerHTML = `
        <div class="name-rail">${m.name}</div>
        <div class="card-main">
          <div class="req">
            <span class="chip">深蹲<b>${CFG.squats}</b></span>
            ${m.pushups ? `<span class="chip extra">伏地挺身<b>${CFG.pushupsCount}</b></span>` : ""}
          </div>
          <div class="status ${done ? "done" : ""}">${
            done ? `已完成 <b>${fmtTime.format(new Date(rec.ts))}</b>` : "尚未打卡"
          }</div>
          ${done ? `<button class="undo" data-undo="${m.id}">蓋錯了？取消打卡</button>` : ""}
        </div>
        <button class="stamp-zone ${justStamped ? "splashing" : ""}" data-stamp="${m.id}"
                aria-label="${done ? m.name + " 今日已完成" : "幫" + m.name + "蓋章打卡"}">
          ${done
            ? sealSVG(justStamped) + (justStamped ? splats() : "")
            : `<span class="stamp-empty"><span class="tap">蓋章</span><span class="hint">按此打卡</span></span>`}
        </button>`;
      wrap.appendChild(card);

      if (justStamped) {
        card.classList.add("thud");
        if (navigator.vibrate) navigator.vibrate(35);
      }
      prevDone[m.id] = done;
    });
  }

  /* ---------- 本週戰績 ---------- */
  function renderWeek(data) {
    const grid = $("#weekGrid");
    const days = lastNDays(7);
    let html = `<span class="wk-corner"></span>`;
    days.forEach((k) => {
      const p = keyParts(k);
      html += `<span class="wk-day ${k === today ? "today" : ""}" role="columnheader">${WEEK_CH[p.wd]}<b>${p.day}</b></span>`;
    });
    CFG.members.forEach((m) => {
      html += `<span class="wk-name" style="--accent:${m.accent}"><i></i>${m.name}</span>`;
      days.forEach((k) => {
        const on = !!(data[k] && data[k][m.id]);
        html += `<span class="dot ${on ? "on" : ""} ${k === today && !on ? "today-col" : ""}"></span>`;
      });
    });
    grid.innerHTML = html;
  }

  /* ---------- 全員達成 ---------- */
  function renderAllDone(data) {
    const todayData = data[today] || {};
    const count = CFG.members.filter((m) => todayData[m.id]).length;
    const all = count === CFG.members.length;
    $("#allDone").classList.toggle("hidden", !all);
    if (all && !firstRender && !celebrated) { celebrated = true; confetti(); }
    if (!all) celebrated = false;
  }

  function confetti() {
    const box = $("#confetti");
    const colors = ["#c8412f", "#d9a441", "#2f6f5e", "#4a6fa5", "#262119"];
    let html = "";
    for (let i = 0; i < 64; i++) {
      html += `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * .7).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.4).toFixed(2)}s"></i>`;
    }
    box.innerHTML = html;
    setTimeout(() => { box.innerHTML = ""; }, 4200);
  }

  /* ---------- 底部確認面板 ---------- */
  function openSheet(title, confirmText, cancelText, onConfirm) {
    $("#sheetTitle").innerHTML = title;
    $("#sheetConfirm").textContent = confirmText;
    $("#sheetCancel").textContent = cancelText;
    $("#sheetOverlay").classList.remove("hidden");
    $("#sheetConfirm").onclick = () => { closeSheet(); onConfirm(); };
  }
  function closeSheet() { $("#sheetOverlay").classList.add("hidden"); }

  /* ---------- 提示橫幅 ---------- */
  function showBanner(text, isError) {
    const b = $("#modeBanner");
    b.textContent = text;
    b.classList.toggle("error", !!isError);
    b.classList.remove("hidden");
  }
  let errTimer;
  function flashError(text) {
    const wasLocal = window.Store.mode === "local";
    showBanner(text, true);
    clearTimeout(errTimer);
    errTimer = setTimeout(() => {
      if (wasLocal) showLocalBanner(); else $("#modeBanner").classList.add("hidden");
    }, 4000);
  }
  function showLocalBanner() {
    showBanner("試用模式：打卡只會存在這支手機裡，還看不到彼此。接上雲端後全員互通。");
  }

  /* ---------- 互動 ---------- */
  document.addEventListener("click", (e) => {
    const stampBtn = e.target.closest("[data-stamp]");
    const undoBtn = e.target.closest("[data-undo]");

    if (stampBtn) {
      const m = CFG.members.find((x) => x.id === stampBtn.dataset.stamp);
      const todayData = window.Store.data[today] || {};
      if (todayData[m.id]) return; // 已蓋章
      const task = m.pushups
        ? `深蹲 ${CFG.squats} 下＋伏地挺身 ${CFG.pushupsCount} 下`
        : `深蹲 ${CFG.squats} 下`;
      openSheet(
        `<b>${m.name}</b>｜${task}<br>都做完了嗎？`,
        "完成，蓋章！", "還沒啦",
        () => window.Store.checkin(today, m.id).catch(() => flashError("蓋章失敗，網路好像不太順，再試一次。"))
      );
    }

    if (undoBtn) {
      const m = CFG.members.find((x) => x.id === undoBtn.dataset.undo);
      openSheet(
        `要取消 <b>${m.name}</b> 今天的打卡嗎？`,
        "取消打卡", "不要，保留",
        () => window.Store.uncheck(today, m.id).catch(() => flashError("取消失敗，網路好像不太順，再試一次。"))
      );
    }
  });
  $("#sheetCancel").addEventListener("click", closeSheet);
  $("#sheetOverlay").addEventListener("click", (e) => { if (e.target.id === "sheetOverlay") closeSheet(); });

  /* ---------- 重繪 ---------- */
  function render(data) {
    renderMasthead();
    renderCards(data);
    renderWeek(data);
    renderAllDone(data);
    firstRender = false;
  }

  /* 跨日自動翻頁 */
  setInterval(() => {
    const now = dateKey();
    if (now !== today) {
      today = now;
      prevDone = {};
      firstRender = true;
      celebrated = false;
      render(window.Store.data);
    }
  }, 30000);

  /* ---------- 啟動 ---------- */
  renderMasthead();
  if (window.Store.mode === "local") showLocalBanner();

  window.Store.init(render).catch(() => {
    flashError("連不上雲端，先顯示上次的紀錄。恢復連線後重新整理即可。");
    render(window.Store.data);
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js");
  }
})();
