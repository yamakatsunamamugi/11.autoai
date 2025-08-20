// popup.js - ポップアップからウィンドウを開く

// ポップアップがクリックされたらメインUIウィンドウを開く
document.addEventListener("DOMContentLoaded", () => {
  chrome.windows.create(
    {
      url: chrome.runtime.getURL("src/ui/ui.html"),
      type: "popup",
      width: 850,
      height: 700,
    },
    () => {
      // ウィンドウが開いたらポップアップを閉じる
      window.close();
    },
  );
});