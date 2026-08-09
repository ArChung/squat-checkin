# 深蹲俱樂部｜每日打卡簿

四個朋友的每日運動打卡網頁：每天**深蹲 40 下**（伏地挺身加碼機制內建，`js/config.js` 把成員的 `pushups` 改為 `true` 即啟用）。

- 免登入，開網頁直接蓋章打卡（榮譽制）
- 今日狀態＋最近七天戰績
- 可加入手機主畫面（PWA），像 App 一樣開啟
- 資料存 Firebase Realtime Database（`js/config.js` 填入 `databaseURL` 即啟用；未填時為單機試用模式）

純靜態網頁，無建置流程，直接部署於 GitHub Pages。

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
