/* 全站設定（此檔同時供頁面與 Service Worker 使用） */
globalThis.APP_CONFIG = {
  databaseURL: "https://squat-club-default-rtdb.asia-southeast1.firebasedatabase.app",

  /* 推播通知：公鑰（配對的私鑰在 Cloudflare Worker 裡）；notifyEndpoint 是 Worker 網址，部署後填入 */
  vapidPublicKey: "BIOecdeddcO6-3z_jsQIeMJPwmxr0s5fTJLZNgaGj8kVFfUw3MLLQPPEU1vW4SG--0rt3LlXzmpgaPpWgAu1vtE",
  notifyEndpoint: "",

  /* pushups: true 的成員要加做伏地挺身（第一週先全部關閉，之後改回 true 即可） */
  members: [
    { id: "guantou", name: "罐頭",  pushups: false, accent: "#b5432f" },
    { id: "azhong",  name: "阿忠",  pushups: false, accent: "#2f6f5e" },
    { id: "xiaobai", name: "小白",  pushups: false, accent: "#4a6fa5" },
    { id: "vicky",   name: "Vicky", pushups: false, accent: "#c67b3b" }
  ],

  squats: 40,
  pushupsCount: 25,
  timeZone: "Asia/Taipei",

  /* 換日時間：凌晨 3 點才算新的一天（過 12 點才運動也算前一天） */
  dayStartHour: 3,

  /* 嗆聲留言字數上限 */
  maxSayLength: 40
};
