/* 深蹲俱樂部：第一季結案報告書（讀 data/report.json 渲染） */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => Math.round(x * 100) + "%";
  const md = (k) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;

  let D, M, byId;

  /* ================= 工具 ================= */
  function tip(el, html) {
    const t = $("#tooltip");
    const show = (e) => {
      t.innerHTML = html;
      t.classList.add("show");
      const x = e.clientX, y = e.clientY;
      t.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - t.offsetWidth - 8)) + "px";
      t.style.top = Math.max(8, y - t.offsetHeight - 12) + "px";
    };
    const hide = () => t.classList.remove("show");
    el.addEventListener("mouseenter", show);
    el.addEventListener("mousemove", show);
    el.addEventListener("mouseleave", hide);
    el.addEventListener("click", (e) => { e.stopPropagation(); show(e); setTimeout(hide, 2400); });
  }
  document.addEventListener("click", () => $("#tooltip").classList.remove("show"));

  function section(no, title, lead) {
    const s = document.createElement("section");
    s.className = "chapter reveal";
    s.innerHTML = `<h2 class="ch-title"><i>${no}</i>${title}</h2>${lead ? `<p class="ch-lead">${lead}</p>` : ""}`;
    $("#report").appendChild(s);
    return s;
  }
  function card(parent, title, inner) {
    const c = document.createElement("div");
    c.className = "paper-card";
    c.innerHTML = (title ? `<h3 class="card-title">${title}</h3>` : "") + inner;
    parent.appendChild(c);
    return c;
  }
  const insight = (s, html) => s.insertAdjacentHTML("beforeend", `<div class="insight">${html}</div>`);
  const dot = (m) => `<i style="background:${m.color}"></i>`;
  const svgEl = (w, h, inner, label) => `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label || ""}">${inner}</svg>`;
  const quoteOf = (id, d) => (D.quotes[id] || []).find((q) => q.d === d);
  const lateRate = (m) => m.phases[2][1] ? m.phases[2][0] / m.phases[2][1] : 0;

  /* ================= 數據篇 ================= */

  function renderHero() {
    const s = section("01", "數據總覽", "八週、六個人、一條「凌晨三點才換日」的規則。");
    const T = D.team;
    s.insertAdjacentHTML("beforeend", `
      <div class="hero">
        <div class="tile wide"><div class="v">${T.squats.toLocaleString()}</div><div class="l">下深蹲（${T.stamps} 次蓋章 × 40）</div></div>
        <div class="tile"><div class="v">${T.fullDays}<small>/56</small></div><div class="l">天全員到齊</div></div>
        <div class="tile"><div class="v">${T.msgTotal}</div><div class="l">則嗆聲</div></div>
      </div>
      <p class="note">剛好一半的日子全員到齊。深夜（0–5 點）蓋章 <b>${T.nightStamps} 次</b>，三點換日規則被用好用滿。小J 從 8/15、大瞇從 9/8 起算出勤。</p>`);
  }

  function renderHeat() {
    const s = section("02", "五十六天熱力圖", "一格一天。點格子看當天的嗆聲。");
    const days = D.period.days;
    let html = `<div class="heat-wrap"><div class="heat" style="grid-template-columns:50px repeat(${days.length},14px)">`;
    html += `<span class="hn"></span>`;
    for (let w = 0; w < 8; w++) html += `<span class="hd wk" style="grid-column:span 7">W${w + 1}</span>`;
    html += `<span class="hn"></span>`;
    days.forEach((k) => { html += `<span class="hd">${Number(k.slice(8, 10))}</span>`; });
    M.forEach((m) => {
      html += `<span class="hn">${dot(m)} ${esc(m.name)}</span>`;
      days.forEach((k) => {
        const r = D.heat[k][m.id];
        if (!r) html += `<span class="hc ${k < m.join ? "pre" : ""}" data-k="${k}" data-p="${m.id}"></span>`;
        else html += `<span class="hc on ${r.b === "night" ? "night" : ""} ${r.g ? "gold" : ""}" style="--c:${m.color}" data-k="${k}" data-p="${m.id}"></span>`;
      });
    });
    html += `</div></div>
      <div class="legend">
        <span><i style="background:#262119"></i>深夜蓋章</span>
        <span><i style="background:#fff;box-shadow:inset 0 0 0 2px var(--gold)"></i>天選金章</span>
        <span><i style="background:none;border:1.5px dashed var(--dash)"></i>沒蹲</span>
        <span><i style="background:none;text-align:center;line-height:9px;color:var(--dash)">·</i>尚未加入</span></div>`;
    const c = card(s, "", html);
    c.querySelectorAll(".hc").forEach((cell) => {
      const k = cell.dataset.k, p = cell.dataset.p, m = byId[p], r = D.heat[k][p];
      const q = quoteOf(p, k);
      tip(cell, r
        ? `<b>${m.name}</b>・${md(k)}・${r.t} 蓋章${r.b === "night" ? "（深夜）" : ""}${r.g ? "・天選金章" : ""}${q ? `<br>「${esc(q.t)}」` : ""}`
        : `<b>${m.name}</b>・${md(k)}・${k < m.join ? "尚未加入" : "沒蹲"}`);
    });
  }

  function renderWeekly() {
    const s = section("03", "倦怠曲線", "每週全團完成率。");
    const W = D.team.weekly, w = 480, h = 250, pl = 36, pb = 44, pt = 46;
    const bw = (w - pl - 10) / 8, ih = h - pt - pb;
    const ax = pl + 4 * bw + bw * .5, a5top = pt + ih - W[4].rate * ih;
    let g = `<line x1="${ax}" x2="${ax}" y1="20" y2="${a5top - 20}" stroke="#8a5c00" stroke-width="1.5" stroke-dasharray="4 3"/>
      <text x="${ax}" y="14" text-anchor="middle" font-size="11" fill="#8a5c00" font-weight="700">👑 9/9 天選上線</text>`;
    [0, .25, .5, .75, 1].forEach((v) => {
      const y = pt + ih - v * ih;
      g += `<line class="grid" x1="${pl}" x2="${w - 10}" y1="${y}" y2="${y}"/><text class="lbl num" x="${pl - 6}" y="${y + 4}" text-anchor="end">${v * 100}</text>`;
    });
    W.forEach((wk, i) => {
      const x = pl + i * bw + bw * .18, bh = wk.rate * ih, y = pt + ih - bh;
      g += `<rect class="bar" x="${x}" y="${y}" width="${bw * .64}" height="${bh}" fill="${wk.rate >= .9 ? "#c8412f" : "#b9ab8c"}"/>
        <text class="val num" x="${x + bw * .32}" y="${y - 6}" text-anchor="middle">${Math.round(wk.rate * 100)}%</text>
        <text class="lbl" x="${x + bw * .32}" y="${h - pb + 16}" text-anchor="middle">W${wk.week}</text>
        <text class="lbl num" x="${x + bw * .32}" y="${h - pb + 30}" text-anchor="middle" font-size="9">${wk.label.split("–")[0]}</text>
        <rect class="hit" data-i="${i}" x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih + pb}"/>`;
    });
    const c = card(s, "", svgEl(w, h, g, "每週完成率") + `<p class="note">紅色＝完成率九成以上的週。</p>`);
    c.querySelectorAll(".hit").forEach((el) => {
      const wk = W[Number(el.dataset.i)];
      tip(el, `<b>第 ${wk.week} 週</b>（${wk.label}）<br>${wk.done} / ${wk.total} 人次・${pct(wk.rate)}`);
    });
    insight(s, `<b>天選是一劑強心針，藥效剛好一週。</b>前三週都在九成以上，第四週第一次掉到 ${pct(W[3].rate)}。9/9 天選上線，第五週拉回 <b>${pct(W[4].rate)}</b>，最後兩週還是崩到 <b>${pct(W[6].rate)}</b> 與 <b>${pct(W[7].rate)}</b>。`);
  }

  function renderDrawChain() {
    const s = section("04", "天選與互動", "天選：9/9 起每天抽 1～2 人加碼棒式。互動：某人蓋章後 30 分鐘內有人跟上，算一次「帶動」。");
    const P = D.draw.perMember;
    const rows = M.slice().sort((a, b) => P[b.id].drawn - P[a.id].drawn || P[b.id].gold - P[a.id].gold);
    const max = Math.max(...rows.map((m) => P[m.id].drawn));
    const drawHtml = `<div class="rank">` + rows.map((m) => {
      const p = P[m.id];
      return `<div class="r"><span class="rn">${dot(m)}${esc(m.name)}</span>
        <span class="rb"><i style="--c:${m.color};width:${(p.drawn / max) * 100}%"></i></span>
        <span class="rv">${p.drawn} 抽 ${p.gold} 金</span></div>`;
    }).join("") + `</div>`;
    card(s, "被抽次數・金章數", drawHtml);
    const pairs = D.chain.pairs.slice(0, 5).map((p) => `<div class="pair"><span class="pn">${dot(byId[p.a])}${byId[p.a].name}</span><span class="arrow">→</span><span class="pn">${dot(byId[p.b])}${byId[p.b].name}</span><span class="pc">${p.n} 次</span></div>`).join("");
    card(s, "最常見的連動", `<div class="pairs">${pairs}</div>`);
    insight(s, `<b>小J 七抽七金</b>，罐頭六抽只蹲三次。<b>Vicky 是全團發動機</b>，一蹲就有人跟上 ${D.chain.leaders.vicky} 次。每個人的帶動數據，都寫在後面的人格籤裡。`);
  }

  function renderAwards() {
    const s = section("05", "頒獎典禮", "全部由數據自動頒發。每個人至少兩座，小J 一個人抱走五座。");
    const T = D.team, C = D.chain;
    const top = (f) => M.slice().sort((a, b) => f(b) - f(a))[0];
    const g = byId.guantou, j = byId.xiaoj, v = byId.vicky, b = byId.xiaobai, z = byId.azhong, dm = byId.dami;
    const couple = C.pairs.filter((p) => (p.a === "guantou" && p.b === "xiaobai") || (p.a === "xiaobai" && p.b === "guantou")).reduce((a, p) => a + p.n, 0);
    const exTotal = M.reduce((a, m) => a + m.exclaims, 0);
    const A = [
      { t: "全勤王", w: top((m) => m.rate), d: `完成率 ${pct(b.rate)}，${b.done}/${b.eligible} 天` },
      { t: "鐵人獎", w: top((m) => m.bestStreak), d: `連續 ${z.bestStreak} 天不中斷` },
      { t: "天選模範生", w: j, d: `七抽七金，被抽到從不翹`, gold: true },
      { t: "帶動王", w: top((m) => C.leaders[m.id] || 0), d: `一蹲就有人跟上 ${C.leaders.vicky} 次` },
      { t: "壓軸王", w: top((m) => T.lastOfDay[m.id] || 0), d: `當日最後一個蓋章 ${T.lastOfDay.azhong} 次` },
      { t: "三點黨黨魁", w: top((m) => m.buckets.night), d: `深夜蓋章 ${g.buckets.night} 次` },
      { t: "早鳥王", w: j, d: `早上蓋章 ${j.buckets.morning} 次全團最多` },
      { t: "壓線王", w: j, d: `${j.latest} 蓋章，離換日剩 4 分鐘` },
      { t: "後勁獎", w: j, d: `最後三週 ${pct(lateRate(j))} 全團最高` },
      { t: "深夜育兒獎", w: dm, d: `${dm.done} 次蓋章 ${dm.buckets.night} 次在深夜` },
      { t: "嘴砲王", w: top((m) => m.msgCount), d: `嗆聲 ${z.msgCount} 則全團最多` },
      { t: "驚嘆號大賞", w: top((m) => m.exclaims), d: `全團 ${exTotal} 個驚嘆號，一人包辦 ${j.exclaims} 個` },
      { t: "極簡文學獎", w: M.slice().sort((a, b2) => a.msgAvgLen - b2.msgAvgLen)[0], d: `平均 ${v.msgAvgLen} 字，代表作「來了」` },
      { t: "一字箴言獎", w: g, d: `${g.squatOnly} 則嗆聲只有「蹲」` },
      { t: "夫妻同蹲獎", w: { name: "罐頭 × 小白", color: "#c8412f" }, d: `互相帶動 ${couple} 次` },
      { t: "週末失憶獎", w: dm, d: `週末 ${dm.weekend[0]}/${dm.weekend[1]}，本人自述失憶` },
    ];
    s.insertAdjacentHTML("beforeend", `<div class="awards">` + A.map((a) => `
      <div class="award ${a.gold ? "gold" : ""}"><span class="seal-mini">${a.gold ? "金" : "獎"}</span>
        <div class="at">${a.t}</div><div class="aw"><i style="background:${a.w.color}"></i>${esc(a.w.name)}</div><div class="ad">${a.d}</div></div>`).join("") + `</div>`);
  }

  function renderQuotes() {
    const s = section("06", "嗆聲語言學", `${D.team.msgTotal} 則嗆聲的文本分析。這不是打卡簿，是集體焦慮日記。`);
    const all = [];
    M.forEach((m) => (D.quotes[m.id] || []).forEach((q) => all.push(q)));
    const cnt = (re) => all.filter((q) => re.test(q.t)).length;
    const emo = M.slice().sort((a, b) => b.emojis - a.emojis)[0];
    card(s, "", `<div class="stat-row">
      <span class="stat-chip">哀號（累／要死／痠）<b>${cnt(/累|要死|痠|喘|虛弱|難蹲|好難|交差|勉強/)}</b></span>
      <span class="stat-chip">焦慮（壓線／差點／忘記）<b>${cnt(/壓線|壓哨|超時|差點|忘記|打卡時間/)}</b></span>
      <span class="stat-chip">報名次<b>${D.team.rankMsgs}</b></span>
      <span class="stat-chip">帶病蹲<b>${cnt(/感冒|腸病毒|胃食道|受傷|帶病|暈車|膝蓋/)}</b></span>
      <span class="stat-chip">家庭實況<b>${cnt(/陪睡|小孩|小寶|煮飯|老公|夫妻|生日/)}</b></span>
      <span class="stat-chip">表情符號王：${emo.name}<b>${emo.emojis}</b></span>
    </div>`);
    const scenes = [
      ["azhong", "2026-08-19", "最有先見之明：這份報告證明他沒想錯。"],
      ["guantou", "2026-09-08", "最打臉：隔天就中，之後再中五次。"],
      ["vicky", "2026-10-01", "最溫柔：第八週完成率 45%，這句是整季的註腳。"],
    ];
    card(s, "三大名場面", `<div class="quote-wall">` + scenes.map(([id, d, cap]) => {
      const m = byId[id], q = quoteOf(id, d);
      return `<div class="q"><div class="qn" style="--c:${m.color}">${esc(m.name)}</div><div><div class="qb">${esc(q.t)}<span class="qd">${md(d)}</span></div><p class="qcap">${cap}</p></div></div>`;
    }).join("") + `</div>`);
  }

  /* ================= 人格籤 ================= */

  const LOTS = {
    guantou: {
      title: "三點黨黨魁", tags: ["深夜型", "不服輸", "一字派"],
      poem: "子夜三更猶可蹲，一字嗆聲走天下。",
      read: [
        "罐頭的字典裡沒有「今天」，只有「三點前」。前三週 21/21 全勤，之後就把換日線當成真正的截止時間：深夜蓋章 14 次全團最多，壓線、壓哨、差點超時是常用詞。",
        "天選上線那幾天的嗆聲是一部完整的悲劇：9/8「我覺得我不是天選之人」，9/10「明天不可能再中了」，9/11 只剩「😡😡😡」。整季中籤六次，三次直接沒蹲。不是做不到，是不服。",
        "後期嗆聲退化成一個字「蹲」，整季 13 則，像修行，也像放棄溝通。好消息是罐頭蹲完、小白 30 分鐘內跟上 8 次，夫妻同蹲是真的。",
      ],
      quotes: ["2026-09-08", "2026-08-31", "2026-09-10", "2026-09-12"],
      foe: "天選籤筒",
      rx: "把鬧鐘設在 02:30，留半小時給「差點超時」。被抽中不准生氣，生氣也要蹲。",
    },
    azhong: {
      title: "壓軸哀號評論員", tags: ["收尾型", "哀號派", "鐵人"],
      poem: "人人蹲完我才蹲，一邊哀號一邊評。",
      read: [
        "阿忠是全團的收尾燈。19 次當日最後一個蓋章，跟風 24 次全團最多：大家蹲完才出場，順便點評戰況（「小白第四名」）。",
        "嗆聲 47 則全團最多，卻是唯一一個整季沒用過表情符號的人，哀號全靠文字：要死了、累死、膝蓋霹靂啪啦、胃食道逆流要人命。",
        "但阿忠也是鐵人：最長連續 26 天全團第一，中斷從沒超過 2 天。嘴上每天都說要死，身體每天都到場。整季最心碎的一句，是 9/5 的「昨天睡死⋯我的全勤⋯」。",
      ],
      quotes: ["2026-08-19", "2026-08-28", "2026-09-05", "2026-09-13"],
      foe: "胃食道逆流",
      rx: "請 Vicky 每天先蹲。你的跟風反射，是全團最可靠的鬧鐘。",
    },
    xiaobai: {
      title: "夜間節拍器", tags: ["準時型", "冷面派", "幸運兒"],
      poem: "夜夜十點準時到，三度放棄都未遂。",
      read: [
        "小白是全團的節拍器。50 次蓋章有 40 次落在晚上，時間標準差全團最小：不用看時鐘，看小白蓋章就知道快十點半了。完成率 89% 全團第一，中期兩週 14/14 全勤。",
        "招牌句型是「差那麼一點」：差那麼一點沒放棄、差那麼一點棄權、差那麼一點放棄蹲。說要放棄三次，一次都沒成功。",
        "小白自稱天選是自己出的點子，第一次中籤當天就嗆「嚴重懷疑這個系統」。整季只被抽中兩次，兩次都補完棒式，系統其實很照顧你。",
      ],
      quotes: ["2026-08-10", "2026-09-03", "2026-09-10", "2026-09-27"],
      foe: "體重計",
      rx: "把「差那麼一點」註冊成商標。下次出點子前，先確認自己不會被抽到。",
    },
    vicky: {
      title: "極簡帶動機", tags: ["發動機", "極簡派", "作息模範"],
      poem: "兩字來了千軍動，三十分內全跟上。",
      read: [
        "Vicky 用最少的字做最多的事。嗆聲平均 4.6 字全團最短，代表作「來了」。但只要 Vicky 一蹲，30 分鐘內就有人跟上，23 次全團最多，光阿忠就跟了 9 次。",
        "作息全團最健康，深夜只蹲過 1 次。弱點是記性：「忘記打卡」整季自首兩次，帳面上的缺席，有一部分其實是蹲了沒蓋章。",
        "後期 52% 也情有可原：感冒蹲、腸病毒蹲、腸病毒蹲 again，全團帶病出勤代表。10/1 那句「至少每天都有人撐著😂」，是整季最溫柔的嗆聲。",
      ],
      quotes: ["2026-08-11", "2026-09-05", "2026-09-29", "2026-10-01"],
      foe: "腸病毒",
      rx: "蹲完先蓋章再喘氣。你的缺席，有一半是記性的錯。",
    },
    xiaoj: {
      title: "驚嘆號後勁怪物", tags: ["變數型", "驚嘆號派", "天選模範"],
      poem: "嘴說明天改早起，兩點五六還在蹲。",
      read: [
        "小J 是全團最大的變數。時間標準差全團最大：早上蹲過 4 次全團最多，也創下 02:56 的全團最晚紀錄。9/14 宣布「以後還是改早上好了」，9/18 真的中午蹲了，隔天就回到凌晨兩點五十六。",
        "8/15 加入第一天就嗆「太EZ了吧」。驚嘆號 21 個佔全團近半，還有一則嗆聲只有「!!!!!!」。看到有人蓋章，跟風反應只要 1 分鐘，全團最快。",
        "但最後三週全團崩盤時，小J 是唯一撐住的人：81% 全團最高，天選七抽七金，被抽中還嫌「天選不夠過癮，哼哼」。",
      ],
      quotes: ["2026-08-18", "2026-08-15", "2026-09-15", "2026-09-22"],
      foe: "台東",
      rx: "第二季你負責出天選題目，其他人負責活下來。",
    },
    dami: {
      title: "陪睡插班生", tags: ["插班生", "深夜型", "育兒實況"],
      poem: "第五週才插班來，驚醒補蹲是真愛。",
      read: [
        "大瞇是第五週才插班的轉學生，加入隔天天選就上線，六次中籤蹲了三次。",
        "12 次蓋章有 8 次在深夜，中位 00:39 全團最晚。不是熬夜，是陪睡。嗆聲是一本育兒日記：陪睡蹲完睡死、陪睡驚醒補蹲、邊煮飯邊蹲。",
        "開局五天蹲四天很漂亮，之後被週末擊潰（3/7），本人自述「週末會失憶」。9/23 小J 爆料「大瞇抱小孩腰受傷🤣」。帶著這種狀態還蹲了 12 次，其實已經很拼。",
      ],
      quotes: ["2026-09-12", "2026-09-11", "2026-09-17", "2026-09-20"],
      foe: "週末",
      rx: "把小孩一起編進俱樂部。抱小孩深蹲，一次算兩下。",
    },
  };

  /* 六維分數（0–100，以全團最高為 100） */
  const AXES = ["出勤", "穩定", "後勁", "夜貓", "嘴砲", "帶動"];
  function scores(m) {
    const minStd = Math.min(...M.map((o) => o.timeStd));
    const nightShare = (o) => o.buckets.night / o.done;
    const talk = (o) => o.msgCount / o.eligible;
    const maxN = Math.max(...M.map(nightShare)), maxT = Math.max(...M.map(talk));
    const maxL = Math.max(...M.map((o) => D.chain.leaders[o.id] || 0));
    return [
      m.rate * 100,
      (minStd / m.timeStd) * 100,
      lateRate(m) * 100,
      (nightShare(m) / maxN) * 100,
      (talk(m) / maxT) * 100,
      ((D.chain.leaders[m.id] || 0) / maxL) * 100,
    ].map((v) => Math.round(Math.max(0, Math.min(100, v))));
  }

  function radarSVG(m) {
    const sc = scores(m), w = 260, h = 230, cx = 130, cy = 116, R = 78;
    const pt = (i, r) => {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    let g = "";
    [.25, .5, .75, 1].forEach((f) => {
      g += `<polygon points="${AXES.map((_, i) => pt(i, R * f).join(",")).join(" ")}" fill="none" stroke="#e4d7b8" stroke-width="1"/>`;
    });
    AXES.forEach((_, i) => { const [x, y] = pt(i, R); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e4d7b8" stroke-width="1"/>`; });
    g += `<polygon points="${sc.map((v, i) => pt(i, R * v / 100).join(",")).join(" ")}" fill="${m.color}" fill-opacity=".28" stroke="${m.color}" stroke-width="2" stroke-linejoin="round"/>`;
    sc.forEach((v, i) => { const [x, y] = pt(i, R * v / 100); g += `<circle cx="${x}" cy="${y}" r="4" fill="${m.color}" stroke="#fbf6e8" stroke-width="2"/>`; });
    AXES.forEach((a, i) => {
      const [x, y] = pt(i, R + 22);
      g += `<text x="${x}" y="${y - 2}" text-anchor="middle" font-size="12" font-weight="700" fill="#262119">${a}</text>
        <text class="num" x="${x}" y="${y + 12}" text-anchor="middle" font-size="11" fill="#6f6552">${sc[i]}</text>`;
    });
    return svgEl(w, h, g, `${m.name} 六維人格雷達`);
  }

  function phasesSVG(m) {
    const r = m.phases.map((p) => p[1] ? p[0] / p[1] : null);
    const w = 132, h = 96, bw = 28;
    let g = "";
    r.forEach((v, i) => {
      const x = 12 + i * 40;
      if (v === null) g += `<text class="lbl" x="${x + bw / 2}" y="62" text-anchor="middle" font-size="10">未加入</text>`;
      else {
        const bh = Math.max(2, v * 60), y = 76 - bh;
        g += `<rect class="bar" x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${m.color}" opacity="${.5 + i * .25}"/>
          <text class="val num" x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="11">${Math.round(v * 100)}</text>`;
      }
      g += `<text class="lbl" x="${x + bw / 2}" y="${h - 4}" text-anchor="middle" font-size="10">${["前", "中", "後"][i]}</text>`;
    });
    return svgEl(w, h, g, `${m.name} 前中後期完成率`);
  }

  function clockSVG(m) {
    const ang = (min) => ((min - 180) / 1440) * Math.PI * 2 - Math.PI / 2;
    const w = 132, h = 134, cx = 66, cy = 58, R = 44;
    let g = `<path d="M${cx},${cy} L${cx + R * Math.cos(ang(1440))},${cy + R * Math.sin(ang(1440))} A${R},${R} 0 0 1 ${cx + R * Math.cos(ang(1620))},${cy + R * Math.sin(ang(1620))} Z" fill="#262119" opacity=".1"/>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#262119" stroke-width="1.2" opacity=".5"/>`;
    [[180, "3"], [540, "9"], [900, "15"], [1260, "21"]].forEach(([mm, t]) => {
      const a = ang(mm);
      g += `<text class="lbl num" x="${cx + (R + 9) * Math.cos(a)}" y="${cy + (R + 9) * Math.sin(a) + 3.5}" text-anchor="middle" font-size="9">${t}</text>`;
    });
    D.period.days.map((k) => D.heat[k][m.id]).filter(Boolean).forEach((r, i) => {
      const a = ang(r.m), rr = R - 6 - (i % 3) * 5;
      g += `<circle cx="${cx + rr * Math.cos(a)}" cy="${cy + rr * Math.sin(a)}" r="2.6" fill="${m.color}" opacity=".85" stroke="#fbf6e8" stroke-width=".8"/>`;
    });
    const [hh, mi] = m.medianTime.split(":").map(Number);
    const a = ang(hh * 60 + mi + (hh < 3 ? 1440 : 0));
    g += `<line x1="${cx}" y1="${cy}" x2="${cx + (R - 4) * Math.cos(a)}" y2="${cy + (R - 4) * Math.sin(a)}" stroke="#c8412f" stroke-width="2.2" stroke-linecap="round"/>
      <text class="lbl" x="${cx}" y="${h - 2}" text-anchor="middle" font-size="10">中位 ${m.medianTime}</text>`;
    return svgEl(w, h, g, `${m.name} 24 小時蓋章分布`);
  }

  function relations(m) {
    const mutual = {};
    D.chain.pairs.forEach((p) => {
      if (p.a === m.id) mutual[p.b] = (mutual[p.b] || 0) + p.n;
      if (p.b === m.id) mutual[p.a] = (mutual[p.a] || 0) + p.n;
    });
    const best = Object.entries(mutual).sort((a, b) => b[1] - a[1])[0];
    const fol = D.chain.pairs.filter((p) => p.a === m.id).sort((a, b) => b.n - a.n)[0];
    const led = D.chain.pairs.filter((p) => p.b === m.id).sort((a, b) => b.n - a.n)[0];
    return { best, fol, led };
  }

  function renderLots() {
    const s = section("07", "深蹲人格籤", "依出勤、穩定、後勁、夜貓、嘴砲、帶動六個維度，加上每一則嗆聲寫成。純屬娛樂，但句句有據。點籤筒抽出你的完整報告。");
    let html = `<div class="lots">`;
    M.forEach((m) => {
      const L = LOTS[m.id], P = D.draw.perMember[m.id], rel = relations(m);
      const pn = (id) => `<b style="color:${byId[id].color}">${byId[id].name}</b>`;
      const quotes = L.quotes.map((d, i) => {
        const q = quoteOf(m.id, d);
        return q ? `<div class="lq-item ${i === 0 ? "rep" : ""}"><span class="lq-t">${esc(q.t)}</span><span class="lq-d">${md(d)}${i === 0 ? "・代表作" : ""}</span></div>` : "";
      }).join("");
      html += `
      <article class="lot" data-id="${m.id}" style="--c:${m.color}">
        <button class="lot-head" aria-expanded="false">
          <span class="lh-name">${esc(m.name)}</span>
          <span class="lh-hint">點一下抽籤</span>
          <span class="lh-title">${L.title}</span>
          <span class="lh-tags">${L.tags.map((t) => `<i>${t}</i>`).join("")}</span>
        </button>
        <div class="lot-body">
          <p class="lb-poem">${L.poem.replace("，", "，<br>")}</p>
          <div class="lb-radar">${radarSVG(m)}</div>

          <h4 class="lb-h">人格解析</h4>
          ${L.read.map((p) => `<p class="lb-p">${esc(p)}</p>`).join("")}

          <h4 class="lb-h">你的八週</h4>
          <div class="lb-charts">
            <figure>${phasesSVG(m)}<figcaption>前・中・後期完成率</figcaption></figure>
            <figure>${clockSVG(m)}<figcaption>24 小時蓋章時間</figcaption></figure>
          </div>

          <h4 class="lb-h">數據側寫</h4>
          <div class="stat-row">
            <span class="stat-chip">完成率<b>${pct(m.rate)}</b></span>
            <span class="stat-chip">最長連續<b>${m.bestStreak}</b> 天</span>
            <span class="stat-chip">最長中斷<b>${m.worstGap}</b> 天</span>
            <span class="stat-chip">深夜蓋章<b>${m.buckets.night}</b> 次</span>
            <span class="stat-chip">嗆聲<b>${m.msgCount}</b> 則</span>
            <span class="stat-chip">驚嘆號<b>${m.exclaims}</b></span>
            <span class="stat-chip">天選<b>${P.drawn}</b> 抽 <b>${P.gold}</b> 金</span>
            <span class="stat-chip">搶頭香<b>${D.team.firstOfDay[m.id] || 0}</b> 次</span>
            <span class="stat-chip">壓軸<b>${D.team.lastOfDay[m.id] || 0}</b> 次</span>
          </div>

          <h4 class="lb-h">人際關係</h4>
          <ul class="lb-rel">
            ${rel.best ? `<li><span>最佳拍檔</span><div>${pn(rel.best[0])}，互相帶動 ${rel.best[1]} 次</div></li>` : ""}
            ${rel.fol ? `<li><span>你蹲完最常跟上的</span><div>${pn(rel.fol.b)}（${rel.fol.n} 次）</div></li>` : ""}
            ${rel.led ? `<li><span>你最常跟著誰蹲</span><div>${pn(rel.led.a)}（${rel.led.n} 次）</div></li>` : ""}
            <li><span>天敵</span><div><b>${L.foe}</b></div></li>
          </ul>

          <h4 class="lb-h">嗆聲精選</h4>
          <div class="lb-quotes">${quotes}</div>

          <div class="lb-rx">
            <span class="rx-seal">處方</span>
            <h4>第二季處方籤</h4>
            <p>${esc(L.rx)}</p>
          </div>

          <button class="share" data-share="${m.id}">📸 存成圖片，發限動</button>
        </div>
      </article>`;
    });
    html += `</div>`;
    s.insertAdjacentHTML("beforeend", html);
    s.querySelectorAll(".lot-head").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lot = btn.closest(".lot");
        const open = !lot.classList.contains("open");
        lot.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", open);
        if (open) {
          if (navigator.vibrate) navigator.vibrate(15);
          setTimeout(() => lot.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
        }
      });
    });
    s.querySelectorAll("[data-share]").forEach((btn) => btn.addEventListener("click", (e) => { e.stopPropagation(); shareLot(btn.dataset.share); }));
  }

  /* ---------- 分享圖（1080×1350，IG 直式） ---------- */
  async function shareLot(id) {
    const m = byId[id], L = LOTS[id], sc = scores(m);
    await document.fonts.ready;
    const W = 1080, H = 1350, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const F = (wt, px) => `${wt} ${px}px 'LXGW WenKai TC', serif`;
    x.fillStyle = "#f2e9d3"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#262119"; rr(x, 74, 74, W - 132, H - 132, 40); x.fill();
    x.fillStyle = "#fbf6e8"; x.strokeStyle = "#262119"; x.lineWidth = 6; rr(x, 58, 58, W - 132, H - 132, 40); x.fill(); x.stroke();
    x.textAlign = "center";
    x.fillStyle = "#6f6552"; x.font = F(700, 28); x.fillText("深 蹲 俱 樂 部 ・ 第 一 季 ・ 深 蹲 人 格 籤", W / 2, 140);
    x.fillStyle = m.color; x.font = F(700, 88); x.fillText(m.name, W / 2, 250);
    x.fillStyle = "#262119"; x.font = F(700, 58); x.fillText(L.title, W / 2, 335);
    x.font = F(400, 28); x.fillStyle = "#6f6552"; x.fillText(L.tags.join("・"), W / 2, 385);
    x.font = F(700, 38); x.fillStyle = "#262119";
    L.poem.replace(/。$/, "").split("，").forEach((line, i) => x.fillText(line, W / 2, 460 + i * 54));
    // 雷達
    const cx = W / 2, cy = 760, R = 170;
    const P = (i, r) => { const a = -Math.PI / 2 + (i / 6) * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    x.strokeStyle = "#e4d7b8"; x.lineWidth = 2;
    [.25, .5, .75, 1].forEach((f) => { x.beginPath(); AXES.forEach((_, i) => { const [px, py] = P(i, R * f); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.stroke(); });
    AXES.forEach((_, i) => { const [px, py] = P(i, R); x.beginPath(); x.moveTo(cx, cy); x.lineTo(px, py); x.stroke(); });
    x.beginPath(); sc.forEach((v, i) => { const [px, py] = P(i, R * v / 100); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath();
    x.globalAlpha = .28; x.fillStyle = m.color; x.fill(); x.globalAlpha = 1; x.strokeStyle = m.color; x.lineWidth = 5; x.stroke();
    AXES.forEach((a, i) => {
      const [px, py] = P(i, R + 46);
      x.fillStyle = "#262119"; x.font = F(700, 30); x.fillText(a, px, py);
      x.fillStyle = "#6f6552"; x.font = "400 26px 'Anton', sans-serif"; x.fillText(String(sc[i]), px, py + 32);
    });
    // 處方
    x.fillStyle = "#a02c1d"; x.font = F(700, 30); x.fillText("第二季處方籤", W / 2, 1060);
    x.fillStyle = "#262119"; x.font = F(400, 32);
    wrapText(x, L.rx, W / 2, 1110, W - 280, 46);
    x.save(); x.translate(W - 190, 1190); x.rotate(.2); x.strokeStyle = m.color; x.lineWidth = 7;
    x.beginPath(); x.arc(0, 0, 66, 0, 7); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 52, 0, 7); x.stroke();
    x.fillStyle = m.color; x.font = F(700, 50); x.fillText("籤", 0, 18); x.restore();
    x.font = "400 24px 'Anton', sans-serif"; x.fillStyle = "#6f6552"; x.fillText("SQUAT CLUB  2026.08.09 - 10.03", W / 2, 1238);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], `深蹲人格籤-${m.name}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `深蹲人格籤・${m.name}` }); return; } catch (e) {}
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  }
  function wrapText(x, text, cx, y, maxW, lh) {
    let line = "";
    const lines = [];
    for (const ch of text) {
      if (x.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => x.fillText(l, cx, y + i * lh));
  }
  function rr(x, px, py, w, h, r) {
    x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
  }

  /* ================= 第二季星星 & 捲動顯現 ================= */
  function stars() {
    const pos = [[6, 20], [16, 70], [30, 18], [48, 80], [64, 24], [80, 72], [92, 20], [40, 60], [72, 50]];
    $("#season2 .stars").innerHTML = pos.map((p, i) => `<i style="left:${p[0]}%;top:${p[1]}%;animation-delay:${(i * .37).toFixed(2)}s;--sz:${[12, 8, 6][i % 3]}px">✦</i>`).join("");
  }
  function observe() {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .05 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  /* ================= 啟動 ================= */
  fetch("data/report.json", { cache: "no-store" }).then((r) => r.json()).then((data) => {
    D = data; M = D.members; byId = {}; M.forEach((m) => { byId[m.id] = m; });
    renderHero(); renderHeat(); renderWeekly(); renderDrawChain(); renderAwards(); renderQuotes(); renderLots();
    stars(); observe();
  }).catch(() => {
    $("#report").innerHTML = `<p class="note" style="text-align:center;margin-top:30px">報告資料載入失敗，請重新整理。</p>`;
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
