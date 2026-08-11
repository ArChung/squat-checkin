# 深蹲俱樂部｜每日打卡簿

四個朋友的每日運動打卡網頁：每天**深蹲 40 下**（伏地挺身加碼機制內建，`js/config.js` 把成員的 `pushups` 改為 `true` 即啟用）。

- 免登入，開網頁直接蓋章打卡（榮譽制）
- 今日狀態＋最近七天戰績
- 可加入手機主畫面（PWA），像 App 一樣開啟
- 資料存 Firebase Realtime Database（`js/config.js` 填入 `databaseURL` 即啟用；未填時為單機試用模式）

純靜態網頁，無建置流程，直接部署於 GitHub Pages。

## 裝置綁定與粉絲加入

- 啟用條件：`js/config.js` 填入 `webApiKey`（Firebase Web API 金鑰）＋資料庫規則 v4
- 身分機制：Firebase Anonymous Auth（REST 版，`js/auth.js`），使用者無感、免登入
- 創始成員四卡各自「認領」後綁定裝置，只有本人手機能蓋章／嗆聲；團主（azhong）可重設綁定、移除粉絲
- 粉絲「我也要加入」→ 取暱稱 → 產生 `f_*` 成員卡（只能蓋章，不能嗆聲，動作不推播）
- 即時同步：規則 v4 開放根節點讀取後自動併為單一 SSE 連線（省同時連線額度）；舊規則下自動退回逐節點模式

## 推播通知架構

- 手機在「打卡通知」區塊選擇身分後訂閱 Web Push，訂閱存於 RTDB `/subs/<person>/`
- 打卡／嗆聲成功後前端呼叫 Cloudflare Worker（`js/config.js` 的 `notifyEndpoint`）發送無內容推播
- Service Worker 收到推播後抓當日最新動態組出通知文字（免 payload 加密）
- Worker 程式（含 VAPID 私鑰）在本機 `worker-private/`（git 忽略，勿入公開 repo）

## 部署注意

每次部署**必須同步更新 `version.json`** 的版本字串——App 回前景時靠它判斷要不要自動重新載入新版。

## 本機預覽

```bash
python -m http.server 8642
```

## 成員與規則調整

改 `js/config.js` 的 `members`、`squats`、`pushupsCount` 即可。
