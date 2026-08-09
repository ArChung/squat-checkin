/* 深蹲俱樂部：畫面與互動 */
(function () {
  const CFG = window.APP_CONFIG;
  const $ = (sel) => document.querySelector(sel);

  const WEEK_CH = ["日", "一", "二", "三", "四", "五", "六"];
  const MONTH_CH = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
  const DAY_SHIFT_MS = CFG.dayStartHour * 3600000;

  /* ---------- 台北時區日期工具（換日點：凌晨 dayStartHour 點） ---------- */
  const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: CFG.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtTime = new Intl.DateTimeFormat("zh-TW", { timeZone: CFG.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtHour = new Intl.DateTimeFormat("en-US", { timeZone: CFG.timeZone, hour: "numeric", hour12: false });

  function dateKey(d) { return fmtKey.format(new Date((d ? d.getTime() : Date.now()) - DAY_SHIFT_MS)); }
  function inLateNight() { return Number(fmtHour.format(new Date())) % 24 < CFG.dayStartHour; }

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

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    $("#lateNote").classList.toggle("hidden", !inLateNight());
    const hasPushups = CFG.members.some((m) => m.pushups);
    $("#goalText").textContent = `深蹲 ${CFG.squats} 下` +
      (hasPushups ? `・男子組加碼伏地挺身 ${CFG.pushupsCount} 下` : "");
  }

  /* ---------- 今日卡片 ---------- */
  function renderCards(data) {
    const wrap = $("#cards");
    const todayCk = data.checkins[today] || {};
    const todayMsg = data.messages[today] || {};
    wrap.innerHTML = "";

    CFG.members.forEach((m) => {
      const rec = todayCk[m.id];
      const done = !!rec;
      const justStamped = !firstRender && done && !prevDone[m.id];
      const msg = todayMsg[m.id];

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
          <div class="status ${done ? "done" : ""}">${done ? "已完成" : "尚未打卡"}</div>
          <button class="bubble ${msg ? "" : "bubble-empty"}" data-say="${m.id}"
                  aria-label="${msg ? "編輯" + m.name + "的嗆聲" : "幫" + m.name + "嗆一句"}">${
            msg ? `${esc(msg.text)}<span class="bubble-ts">${fmtTime.format(new Date(msg.ts))}</span>` : "嗆一句⋯"
          }</button>
          ${done ? `<button class="undo" data-undo="${m.id}">蓋錯了？取消打卡</button>` : ""}
        </div>
        <button class="stamp-zone ${justStamped ? "splashing" : ""}" data-stamp="${m.id}"
                aria-label="${done ? m.name + " 今日已完成" : "幫" + m.name + "蓋章打卡"}">
          ${done
            ? sealSVG(justStamped) + (justStamped ? splats() : "")
            : `<span class="stamp-empty"><span class="tap">蓋章</span><span class="hint">按此打卡</span></span>`}
        </button>
        ${done ? `<span class="done-time">${fmtTime.format(new Date(rec.ts))}</span>` : ""}`;
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
        const on = !!(data.checkins[k] && data.checkins[k][m.id]);
        html += `<span class="dot ${on ? "on" : ""} ${k === today && !on ? "today-col" : ""}"></span>`;
      });
    });
    grid.innerHTML = html;
  }

  /* ---------- 全員達成 ---------- */
  function renderAllDone(data) {
    const todayCk = data.checkins[today] || {};
    const count = CFG.members.filter((m) => todayCk[m.id]).length;
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
  function openSheet(opts) {
    $("#sheetTitle").innerHTML = opts.title;
    $("#sheetConfirm").textContent = opts.confirmText;
    $("#sheetCancel").textContent = opts.cancelText;
    const input = $("#sheetInput");
    input.classList.toggle("hidden", !opts.withInput);
    if (opts.withInput) {
      input.value = opts.inputValue || "";
      input.placeholder = opts.placeholder || "";
      input.maxLength = CFG.maxSayLength;
    }
    $("#sheetOverlay").classList.remove("hidden");
    if (opts.withInput) setTimeout(() => input.focus(), 60);
    $("#sheetConfirm").onclick = () => {
      closeSheet();
      opts.onConfirm(opts.withInput ? input.value.trim() : undefined);
    };
    input.onkeydown = (e) => { if (e.key === "Enter") $("#sheetConfirm").click(); };
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
    const sayBtn = e.target.closest("[data-say]");

    if (stampBtn) {
      const m = CFG.members.find((x) => x.id === stampBtn.dataset.stamp);
      const todayCk = window.Store.data.checkins[today] || {};
      if (todayCk[m.id]) return; // 已蓋章
      const task = m.pushups
        ? `深蹲 ${CFG.squats} 下＋伏地挺身 ${CFG.pushupsCount} 下`
        : `深蹲 ${CFG.squats} 下`;
      openSheet({
        title: `<b>${m.name}</b>｜${task}<br>都做完了嗎？`,
        confirmText: "完成，蓋章！",
        cancelText: "還沒啦",
        onConfirm: () => window.Store.checkin(today, m.id)
          .then(() => pokeOthers(m.id))
          .catch(() => flashError("蓋章失敗，網路好像不太順，再試一次。"))
      });
    }

    if (undoBtn) {
      const m = CFG.members.find((x) => x.id === undoBtn.dataset.undo);
      openSheet({
        title: `要取消 <b>${m.name}</b> 今天的打卡嗎？`,
        confirmText: "取消打卡",
        cancelText: "不要，保留",
        onConfirm: () => window.Store.uncheck(today, m.id).catch(() => flashError("取消失敗，網路好像不太順，再試一次。"))
      });
    }

    if (sayBtn) {
      const m = CFG.members.find((x) => x.id === sayBtn.dataset.say);
      const existing = (window.Store.data.messages[today] || {})[m.id];
      openSheet({
        title: `<b>${m.name}</b> 的今日嗆聲`,
        confirmText: "送出！",
        cancelText: "算了",
        withInput: true,
        inputValue: existing ? existing.text : "",
        placeholder: existing ? "清空送出＝刪掉這句" : "例：今天你們死定了",
        onConfirm: (text) => {
          const act = text
            ? window.Store.say(today, m.id, text).then(() => pokeOthers(m.id))
            : (existing ? window.Store.unsay(today, m.id) : Promise.resolve());
          act.catch(() => flashError("嗆聲送不出去，網路好像不太順，再試一次。"));
        }
      });
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

  /* 跨日自動翻頁（凌晨三點）＋深夜提示更新 */
  setInterval(() => {
    const now = dateKey();
    if (now !== today) {
      today = now;
      prevDone = {};
      firstRender = true;
      celebrated = false;
      render(window.Store.data);
    } else {
      $("#lateNote").classList.toggle("hidden", !inLateNight());
    }
  }, 30000);

  /* ---------- 推播通知 ---------- */
  const ME_KEY = "squat-club-me";
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  function urlB64ToBytes(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  function subKey(endpoint) {
    let h = 5381;
    for (let i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0;
    return "d" + h.toString(16);
  }

  async function renderNotify() {
    if (!CFG.vapidPublicKey || window.Store.mode === "local") return;
    $("#notifySection").classList.remove("hidden");
    const names = $("#notifyNames");
    const state = $("#notifyState");
    const me = localStorage.getItem(ME_KEY);

    let sub = null;
    if (pushSupported()) {
      try {
        const reg = await navigator.serviceWorker.ready;
        sub = await reg.pushManager.getSubscription();
      } catch (e) {}
    } else {
      $("#notifyHint").textContent = "要收通知，請先把網頁「加入主畫面」，再從主畫面的圖示開啟這裡設定。";
      names.innerHTML = "";
      return;
    }

    if (sub && me) {
      const m = CFG.members.find((x) => x.id === me);
      names.innerHTML = "";
      state.classList.remove("hidden");
      state.innerHTML = `這支手機已開啟 <b>${m ? m.name : me}</b> 的通知 ✓
        <button class="notify-off" id="notifyOff">關閉通知</button>`;
      $("#notifyOff").onclick = disableNotify;
      $("#notifyHint").classList.add("hidden");
    } else {
      state.classList.add("hidden");
      $("#notifyHint").classList.remove("hidden");
      names.innerHTML = CFG.members.map((m) =>
        `<button class="notify-name" style="--accent:${m.accent}" data-notify="${m.id}">我是${m.name}</button>`
      ).join("");
    }
  }

  async function enableNotify(personId) {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { flashError("通知權限沒開，去 iPhone 設定裡找到這個 App 打開通知。"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToBytes(CFG.vapidPublicKey)
      });
      await window.Store.saveSub(personId, subKey(sub.endpoint), sub.toJSON());
      localStorage.setItem(ME_KEY, personId);
      renderNotify();
    } catch (e) {
      flashError("開啟通知失敗，重新整理後再試一次。");
    }
  }

  async function disableNotify() {
    try {
      const me = localStorage.getItem(ME_KEY);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        if (me) window.Store.removeSub(me, subKey(sub.endpoint));
        await sub.unsubscribe();
      }
      localStorage.removeItem(ME_KEY);
      renderNotify();
    } catch (e) {}
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-notify]");
    if (btn) enableNotify(btn.dataset.notify);
  });

  /* 打卡／嗆聲成功後，請 Worker 推播給其他人（沒部署 Worker 前靜默略過） */
  function pokeOthers(actorId) {
    if (!CFG.notifyEndpoint) return;
    fetch(`${CFG.notifyEndpoint.replace(/\/$/, "")}/notify`, {
      method: "POST",
      body: JSON.stringify({ actor: actorId })
    }).catch(() => {});
  }

  /* ---------- 回前景：資料重新同步＋檢查新版本 ---------- */
  let bootVersion = null;
  async function fetchVersion() {
    try { return (await (await fetch("version.json", { cache: "no-store" })).json()).v; }
    catch (e) { return null; }
  }
  fetchVersion().then((v) => { bootVersion = v; });

  let lastVisCheck = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const nk = dateKey();
    if (nk !== today) {
      today = nk; prevDone = {}; firstRender = true; celebrated = false;
      render(window.Store.data);
    }
    if (Date.now() - lastVisCheck < 60000) return;
    lastVisCheck = Date.now();
    window.Store.resync();
    fetchVersion().then((v) => {
      if (bootVersion && v && v !== bootVersion) location.reload();
    });
  });

  /* ---------- 啟動 ---------- */
  renderMasthead();
  if (window.Store.mode === "local") showLocalBanner();

  window.Store.init(render).catch(() => {
    flashError("連不上雲端，先顯示上次的紀錄。恢復連線後重新整理即可。");
    render(window.Store.data);
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").then(renderNotify).catch(() => {});
  } else {
    renderNotify();
  }
})();
