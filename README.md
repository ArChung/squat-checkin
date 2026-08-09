# 深蹲俱樂部｜每日打卡簿

四個朋友的每日運動打卡網頁：每天**深蹲 40 下**（伏地挺身加碼機制內建，`js/config.js` 把成員的 `pushups` 改為 `true` 即啟用）。

- 免登入，開網頁直接蓋章打卡（榮譽制）
- 今日狀態＋最近七天戰績
- 可加入手機主畫面（PWA），像 App 一樣開啟
- 資料存 Firebase Realtime Database（`js/config.js` 填入 `databaseURL` 即啟用；未填時為單機試用模式）

純靜態網頁，無建置流程，直接部署於 GitHub Pages。

## 本機預覽

```bash
python -m http.server 8642
```

## 成員與規則調整

改 `js/config.js` 的 `members`、`squats`、`pushupsCount` 即可。
