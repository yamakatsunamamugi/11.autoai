// popup.js - ポップアップからウィンドウを開く

document.addEventListener("DOMContentLoaded", () => {
  // メインUIボタン
  document.getElementById('btn-main-ui').addEventListener('click', () => {
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("src/ui/ui.html"),
        type: "popup",
        width: 850,
        height: 700,
      },
      () => {
        window.close();
      }
    );
  });

  // ログビューアーボタン
  document.getElementById('btn-log-viewer').addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("log-viewer.html")
    }, () => {
      window.close();
    });
  });

  // 統合AIテストボタン
  document.getElementById('btn-test-ui').addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("tests/integration/test-ai-automation-integrated.html")
    }, () => {
      window.close();
    });
  });
});