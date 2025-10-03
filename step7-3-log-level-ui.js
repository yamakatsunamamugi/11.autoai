// ログレベル設定UIの管理
document.addEventListener("DOMContentLoaded", async () => {
  const logLevelSelect = document.getElementById("logLevelSelect");
  const saveLogLevelBtn = document.getElementById("saveLogLevelBtn");
  const logLevelStatus = document.getElementById("logLevelStatus");

  // 保存済みのログレベルを取得
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get("logLevel", (result) => {
      if (result.logLevel) {
        logLevelSelect.value = result.logLevel;
      }
    });
  }

  // 保存ボタンのクリックイベント
  saveLogLevelBtn?.addEventListener("click", () => {
    const selectedLevel = parseInt(logLevelSelect.value);
    const levelName = ["", "ERROR", "WARN", "INFO", "DEBUG"][selectedLevel];

    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ logLevel: selectedLevel }, () => {
        // ログレベル変更を出力
        console.info(`📋 ログレベル変更: ${levelName} (${selectedLevel})`);

        // 成功メッセージを表示
        logLevelStatus.style.display = "inline";
        setTimeout(() => {
          logLevelStatus.style.display = "none";
        }, 2000);
      });
    }
  });
});
