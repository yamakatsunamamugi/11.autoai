// test-window-manager.js
// テストウィンドウ管理機能（バックグラウンドスクリプト経由）

/**
 * テストウィンドウマネージャー
 * Chrome拡張機能のAPIを使用してウィンドウ位置を正確に制御
 */
export class TestWindowManager {
  constructor() {
    this.activeWindows = new Map(); // aiType -> windowId
    this.windowPositions = new Map(); // position -> windowId
  }

  /**
   * AIウィンドウを開く（位置指定付き）
   * @param {string} aiType - AI種別（chatgpt, claude, gemini）
   * @param {number} index - ウィンドウ位置インデックス（0-3）
   * @param {string} url - 開くURL
   * @returns {Promise<boolean>} 成功/失敗
   */
  async openAIWindow(aiType, index, url) {
    console.log(`[TestWindowManager] openAIWindow開始 - ${aiType}: ${url}`);
    try {
      // 既存ウィンドウがあれば閉じる
      if (this.activeWindows.has(aiType)) {
        await this.closeWindow(aiType);
      }

      // ウィンドウ位置を計算
      const position = await this.calculateWindowPosition(index);

      // バックグラウンドスクリプトにウィンドウ作成を依頼
      console.log(`[TestWindowManager] background.jsに送信するURL: ${url}`);
      const response = await this.sendToBackground({
        action: "createTestWindow",
        aiType: aiType,
        url: url,
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
      });

      if (response.success) {
        const windowInfo = {
          windowId: response.windowId,
          tabId: response.tabId,
          aiType: aiType,
          position: position,
          url: url,
          index: index,
        };

        this.activeWindows.set(aiType, windowInfo);
        this.windowPositions.set(index, response.windowId);

        console.log(`[TestWindowManager] ${aiType}ウィンドウ情報:`, windowInfo);
        return windowInfo;
      } else {
        throw new Error(response.error || "ウィンドウ作成失敗");
      }
    } catch (error) {
      console.error(
        `[TestWindowManager] ${aiType}ウィンドウ作成エラー:`,
        error,
      );
      return false;
    }
  }

  /**
   * ウィンドウ位置を計算（4分割）
   * @param {number} index - 位置インデックス（0-3）
   * @returns {Promise<Object>} 位置情報
   */
  async calculateWindowPosition(index) {
    // バックグラウンドスクリプトから画面情報を取得
    const response = await this.sendToBackground({
      action: "getScreenInfo",
    });

    const screenInfo = {
      width: response.screenWidth || screen.width,
      height: response.screenHeight || screen.height,
      left: 0,
      top: 0,
    };

    // 画面を4分割（2x2）して、左上・右上・左下の3つを使用
    const halfWidth = Math.floor(screenInfo.width / 2);
    const halfHeight = Math.floor(screenInfo.height / 2);

    const positions = [
      {
        // 左上（ChatGPT用）
        left: screenInfo.left,
        top: screenInfo.top,
        width: halfWidth,
        height: halfHeight,
        name: "左上",
      },
      {
        // 右上（Claude用）
        left: screenInfo.left + halfWidth,
        top: screenInfo.top,
        width: halfWidth,
        height: halfHeight,
        name: "右上",
      },
      {
        // 左下（Gemini用）
        left: screenInfo.left,
        top: screenInfo.top + halfHeight,
        width: halfWidth,
        height: halfHeight,
        name: "左下",
      },
    ];

    return positions[index % 3];
  }

  /**
   * バックグラウンドスクリプトにメッセージを送信
   * @param {Object} message - 送信メッセージ
   * @returns {Promise<Object>} レスポンス
   */
  async sendToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response || {});
        }
      });
    });
  }

  /**
   * ウィンドウ情報を取得
   * @param {string} aiType - AI種別
   * @returns {Object|null} ウィンドウ情報
   */
  getWindowInfo(aiType) {
    return this.activeWindows.get(aiType) || null;
  }

  /**
   * 全ウィンドウ情報を取得
   * @returns {Map} 全ウィンドウ情報
   */
  getAllWindowInfo() {
    return new Map(this.activeWindows);
  }

  /**
   * ウィンドウをアクティブ化（フォーカス）
   * @param {string} aiType - AI種別
   * @returns {Promise<boolean>} 成功/失敗
   */
  async activateWindow(aiType) {
    const windowInfo = this.getWindowInfo(aiType);
    if (!windowInfo || !windowInfo.windowId) {
      console.error(
        `[TestWindowManager] ${aiType} ウィンドウ情報が見つかりません`,
      );
      return false;
    }

    try {
      // Chrome APIを直接使用してウィンドウをアクティブ化
      await chrome.windows.update(windowInfo.windowId, { focused: true });
      console.log(
        `[TestWindowManager] ${aiType} ウィンドウをアクティブ化しました`,
      );
      return true;
    } catch (error) {
      console.error(
        `[TestWindowManager] ${aiType} ウィンドウアクティブ化エラー:`,
        error,
      );
      return false;
    }
  }

  /**
   * ウィンドウの準備完了を待つ
   * @param {string} aiType - AI種別
   * @param {number} timeout - タイムアウト（ミリ秒）
   * @returns {Promise<boolean>} 準備完了かどうか
   */
  async waitForWindowReady(aiType, timeout = 15000) {
    const windowInfo = this.getWindowInfo(aiType);
    if (!windowInfo || !windowInfo.tabId) return false;

    const startTime = Date.now();
    const checkInterval = 1000;

    return new Promise((resolve) => {
      const checkReady = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed >= timeout) {
          console.log(`[TestWindowManager] ${aiType} 準備待機タイムアウト`);
          resolve(false);
          return;
        }

        // タブの状態をチェック
        chrome.tabs.get(windowInfo.tabId, (tab) => {
          if (chrome.runtime.lastError) {
            console.log(
              `[TestWindowManager] ${aiType} タブ取得エラー:`,
              chrome.runtime.lastError,
            );
            setTimeout(checkReady, checkInterval);
            return;
          }

          if (
            tab &&
            tab.status === "complete" &&
            tab.url &&
            !tab.url.startsWith("chrome://")
          ) {
            console.log(
              `[TestWindowManager] ${aiType} 準備完了 (${elapsed}ms)`,
            );
            resolve(true);
          } else {
            console.log(
              `[TestWindowManager] ${aiType} 準備中... (${elapsed}ms)`,
            );
            setTimeout(checkReady, checkInterval);
          }
        });
      };

      checkReady();
    });
  }

  /**
   * ウィンドウを閉じる
   * @param {string} aiType - AI種別
   * @returns {Promise<void>}
   */
  async closeWindow(aiType) {
    const windowInfo = this.activeWindows.get(aiType);
    if (!windowInfo) return;

    try {
      await this.sendToBackground({
        action: "closeTestWindow",
        data: { windowId: windowInfo.windowId },
      });
    } catch (error) {
      console.error(`[TestWindowManager] ウィンドウクローズエラー:`, error);
    }

    this.activeWindows.delete(aiType);
    // windowPositionsからも削除
    for (const [pos, id] of this.windowPositions.entries()) {
      if (id === windowInfo.windowId) {
        this.windowPositions.delete(pos);
        break;
      }
    }
  }

  /**
   * 全ウィンドウを閉じる
   * @returns {Promise<void>}
   */
  async closeAllWindows() {
    const closePromises = Array.from(this.activeWindows.keys()).map((aiType) =>
      this.closeWindow(aiType),
    );
    await Promise.allSettled(closePromises);
  }

  /**
   * ウィンドウの状態を取得
   * @returns {Object} 状態情報
   */
  getStatus() {
    return {
      activeWindows: Array.from(this.activeWindows.entries()),
      windowPositions: Array.from(this.windowPositions.entries()),
      windowCount: this.activeWindows.size,
    };
  }
}

// グローバルインスタンス
export const testWindowManager = new TestWindowManager();
