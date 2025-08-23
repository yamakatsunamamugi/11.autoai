// popup.js - ポップアップからウィンドウを開く

// WindowServiceをインポート（ウィンドウ管理の一元化）
import { WindowService } from './src/services/window-service.js';

// ポップアップがクリックされたらメインUIウィンドウを開く
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 画面情報を取得
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];
    
    const screenInfo = {
      width: primaryDisplay.workArea.width,
      height: primaryDisplay.workArea.height,
      left: primaryDisplay.workArea.left,
      top: primaryDisplay.workArea.top,
    };
    
    // 初期は全画面で表示
    // WindowServiceを使用してウィンドウを作成（focused: trueがデフォルトで設定される）
    const createdWindow = await WindowService.createWindow({
      url: chrome.runtime.getURL("src/ui/ui.html"),
      type: "popup",
      width: screenInfo.width,
      height: screenInfo.height,
      left: screenInfo.left,
      top: screenInfo.top,
    });
    
    if (createdWindow && createdWindow.id) {
      // ウィンドウIDを保存（処理開始時に移動するため）
      chrome.storage.local.set({ extensionWindowId: createdWindow.id });
    }
    // ポップアップを閉じる
    if (typeof window !== 'undefined' && window.close) {
      window.close();
    } else {
      self.close();
    }
  } catch (error) {
    console.error("Failed to create extension window:", error);
    // フォールバック: デフォルトサイズで開く
    // WindowServiceを使用してウィンドウを作成（focused: trueがデフォルトで設定される）
    const fallbackWindow = await WindowService.createWindow({
      url: chrome.runtime.getURL("src/ui/ui.html"),
      type: "popup",
      width: 1200,
      height: 800,
    });
    
    if (fallbackWindow && fallbackWindow.id) {
      chrome.storage.local.set({ extensionWindowId: fallbackWindow.id });
    }
    // ポップアップを閉じる
    if (typeof window !== 'undefined' && window.close) {
      window.close();
    } else {
      self.close();
    }
  }
});