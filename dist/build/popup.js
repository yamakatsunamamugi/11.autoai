// popup.js - ポップアップからウィンドウを開く

// WindowServiceをインポート（ウィンドウ管理の一元化）
import { WindowService } from "./src/services/window-service.js";

// Dropbox自動認証用のサービスをインポート
import { dropboxService } from "./src/services/dropbox-service.js";

/**
 * Dropbox自動認証を実行
 * @returns {Promise<boolean>} 認証成功/失敗
 */
async function attemptAutoDropboxAuth() {
  try {
    console.log("[Popup] Dropbox自動認証開始");

    // 自動認証設定をチェック
    const settings = await chrome.storage.local.get(["dropboxAutoAuth"]);
    const autoAuthEnabled = settings.dropboxAutoAuth !== false; // デフォルトでtrue

    if (!autoAuthEnabled) {
      console.log("[Popup] Dropbox自動認証が無効化されています");
      return false;
    }

    // Dropboxサービスを初期化
    try {
      await dropboxService.initialize();
    } catch (initError) {
      console.error("[Popup] Dropboxサービス初期化エラー:", initError);
      // Client IDが設定されていない等の場合は静かに失敗
      return false;
    }

    // 既に認証済みかチェック
    const isAuthenticated = await dropboxService.isAuthenticated();
    if (isAuthenticated) {
      console.log("[Popup] Dropbox認証済み");
      return true;
    }

    console.log("[Popup] Dropbox未認証のため自動認証を実行");

    // 自動認証実行（タイムアウト付き）
    const authResult = await Promise.race([
      dropboxService.authenticate(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("認証タイムアウト（30秒）")), 30000),
      ),
    ]);

    if (authResult && authResult.success) {
      console.log("[Popup] Dropbox自動認証成功");
      return true;
    } else {
      console.error(
        "[Popup] Dropbox自動認証失敗:",
        authResult?.error || "不明なエラー",
      );
      return false;
    }
  } catch (error) {
    // ユーザーキャンセルや一般的なエラーは詳細ログのみ
    if (
      error.message?.includes("User did not approve") ||
      error.message?.includes("タイムアウト")
    ) {
      console.log(
        "[Popup] Dropbox自動認証がキャンセルまたはタイムアウト:",
        error.message,
      );
    } else {
      console.error("[Popup] Dropbox自動認証エラー:", error);
    }
    return false;
  }
}

// ポップアップがクリックされたらメインUIウィンドウを開く
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Dropbox自動認証を試行（並行処理で実行）
    const authPromise = attemptAutoDropboxAuth();

    // 画面情報を取得
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];

    const screenInfo = {
      width: primaryDisplay.workArea.width,
      height: primaryDisplay.workArea.height,
      left: primaryDisplay.workArea.left,
      top: primaryDisplay.workArea.top,
    };

    // 設定を取得して配置を決定（デフォルトで全画面使用）
    const settings = await chrome.storage.local.get(["popupPosition"]);
    const useQuadLayout = settings.popupPosition === "quadLayout"; // quadLayoutの場合のみクワッドレイアウト

    let createdWindow;

    if (useQuadLayout) {
      // 4分割レイアウト: 右下（位置3）に配置
      console.log("[Popup] 4分割レイアウトでポップアップを右下に配置");
      createdWindow = await WindowService.createWindowWithPosition(
        chrome.runtime.getURL("src/ui/ui.html"),
        3, // 位置3 = 右下
        {
          type: "popup",
          focused: true,
        },
      );
    } else {
      // デフォルト: 全画面で表示
      console.log("[Popup] 全画面でポップアップを表示");
      createdWindow = await WindowService.createWindow({
        url: chrome.runtime.getURL("src/ui/ui.html"),
        type: "popup",
        width: screenInfo.width,
        height: screenInfo.height,
        left: screenInfo.left,
        top: screenInfo.top,
      });
    }

    if (createdWindow && createdWindow.id) {
      // ウィンドウIDを保存（処理開始時に移動するため）
      chrome.storage.local.set({ extensionWindowId: createdWindow.id });

      // 認証結果をウィンドウIDと共に保存
      try {
        const authSuccess = await authPromise;
        chrome.storage.local.set({
          dropboxAutoAuthResult: authSuccess,
          dropboxAutoAuthTimestamp: Date.now(),
        });
      } catch (error) {
        console.error("[Popup] 認証結果保存エラー:", error);
      }
    }

    // ポップアップを閉じる
    if (typeof window !== "undefined" && window.close) {
      window.close();
    } else {
      self.close();
    }
  } catch (error) {
    console.error("Failed to create extension window:", error);

    // フォールバック処理
    const settings = await chrome.storage.local.get(["popupPosition"]);
    const useQuadLayout = settings.popupPosition === "quadLayout";

    let fallbackWindow;

    if (useQuadLayout) {
      // 4分割レイアウト: 右下（位置3）に配置
      console.log(
        "[Popup] フォールバック: 4分割レイアウトでポップアップを右下に配置",
      );
      fallbackWindow = await WindowService.createWindowWithPosition(
        chrome.runtime.getURL("src/ui/ui.html"),
        3, // 位置3 = 右下
        {
          type: "popup",
          focused: true,
        },
      );
    } else {
      // デフォルト: 固定サイズで開く
      console.log(
        "[Popup] フォールバック: デフォルトサイズでポップアップを表示",
      );
      fallbackWindow = await WindowService.createWindow({
        url: chrome.runtime.getURL("src/ui/ui.html"),
        type: "popup",
        width: 1200,
        height: 800,
      });
    }

    if (fallbackWindow && fallbackWindow.id) {
      chrome.storage.local.set({ extensionWindowId: fallbackWindow.id });

      // 認証結果をウィンドウIDと共に保存（フォールバック時も）
      try {
        const authSuccess = await attemptAutoDropboxAuth();
        chrome.storage.local.set({
          dropboxAutoAuthResult: authSuccess,
          dropboxAutoAuthTimestamp: Date.now(),
        });
      } catch (error) {
        console.error("[Popup] フォールバック認証結果保存エラー:", error);
      }
    }

    // ポップアップを閉じる
    if (typeof window !== "undefined" && window.close) {
      window.close();
    } else {
      self.close();
    }
  }
});
