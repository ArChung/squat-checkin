/* 全站設定：接上 Firebase 之後，把 databaseURL 填上即可（唯一要改的地方） */
window.APP_CONFIG = {
  /* 例："https://squat-club-xxxx-default-rtdb.asia-southeast1.firebasedatabase.app" */
  databaseURL: "",

  members: [
    { id: "guantou", name: "罐頭",  pushups: true,  accent: "#b5432f" },
    { id: "azhong",  name: "阿忠",  pushups: true,  accent: "#2f6f5e" },
    { id: "xiaobai", name: "小白",  pushups: false, accent: "#4a6fa5" },
    { id: "vicky",   name: "Vicky", pushups: false, accent: "#c67b3b" }
  ],

  squats: 40,
  pushupsCount: 25,
  timeZone: "Asia/Taipei"
};
