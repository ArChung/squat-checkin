/* 全站設定：接上 Firebase 之後，把 databaseURL 填上即可（唯一要改的地方） */
window.APP_CONFIG = {
  databaseURL: "https://squat-club-default-rtdb.asia-southeast1.firebasedatabase.app",

  /* pushups: true 的成員要加做伏地挺身（第一週先全部關閉，之後改回 true 即可） */
  members: [
    { id: "guantou", name: "罐頭",  pushups: false, accent: "#b5432f" },
    { id: "azhong",  name: "阿忠",  pushups: false, accent: "#2f6f5e" },
    { id: "xiaobai", name: "小白",  pushups: false, accent: "#4a6fa5" },
    { id: "vicky",   name: "Vicky", pushups: false, accent: "#c67b3b" }
  ],

  squats: 40,
  pushupsCount: 25,
  timeZone: "Asia/Taipei"
};
