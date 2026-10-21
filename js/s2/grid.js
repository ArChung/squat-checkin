/* 本季總表（首頁點七格展開、週報頁共用）：一週一列，七格＋那週的分數，最下面一行累計
   tag：目前那一列分數下面的小字（首頁是「本週」，週報頁不標）
   rows：[{ week: 1, days: ["done"|"missed"|"fixed"|"today"|"future" ×7], score: 90 或 null（還沒開始）, current, href }] */
(function () {
  const WD = ["一", "二", "三", "四", "五", "六", "日"];
  const LABEL = { done: "有蹲", missed: "漏掉", fixed: "補回", today: "今天", future: "還沒到" };

  function html(rows, base, tag) {
    if (tag == null) tag = "本週";
    const head = `<div class="sg-row sg-head" aria-hidden="true"><span></span>${WD.map((d) => `<span>${d}</span>`).join("")}<span>分數</span></div>`;
    const body = rows.map((r) => {
      const started = r.score != null;
      const cells = r.days.map((st, i) => `<span class="d d-${st}" aria-label="週${WD[i]}：${LABEL[st] || ""}"><i></i></span>`).join("");
      const score = started
        ? `<b class="sg-score ${r.score < base ? "neg" : ""}">${r.score}${r.current && tag ? `<small>${tag}</small>` : ""}</b>`
        : `<b class="sg-score sg-none">—</b>`;
      const el = r.href ? "a" : "div";
      const attrs = r.href ? ` href="${r.href}" aria-label="第 ${r.week} 週週報"` : "";
      return `<${el} class="sg-row ${r.current ? "cur" : ""} ${started ? "" : "future"} ${r.href ? "link" : ""}"${attrs}><span class="sg-wk">第 ${r.week} 週</span>${cells}${score}</${el}>`;
    }).join("");
    const all = rows.reduce((a, r) => a.concat(r.score != null ? r.days : []), []);
    const n = (st) => all.filter((x) => x === st).length;
    const total = rows.reduce((s, r) => s + (r.score != null ? r.score : 0), 0);
    const parts = [`有蹲 <b>${n("done") + n("fixed")}</b> 天`];
    if (n("fixed")) parts.push(`補回 <b>${n("fixed")}</b> 天`);
    if (n("missed")) parts.push(`漏掉 <b>${n("missed")}</b> 天`);
    parts.push(`累計 <b>${total}</b> 分`);
    return `<div class="sg" role="table">${head}${body}</div><p class="sg-sum">${parts.join("・")}</p>`;
  }

  globalThis.SeasonGrid = { html };
})();
