// ========================================
// 🚨 共通エラーハンドリングモジュール
// すべてのAI自動化スクリプト（ChatGPT, Claude, Gemini, Genspark）で使用
// ========================================

(function () {
  "use strict";

  // ========================================
  // Console.error監視システム（全AI共通）
  // ========================================

  class UniversalConsoleErrorMonitor {
    constructor(aiType = "unknown") {
      this.aiType = aiType;
      this.originalConsoleError = console.error;
      this.errorPatterns = this.getAISpecificPatterns();
      this.errorDetected = false;
      this.lastError = null;
      this.initializeMonitor();
    }

    getAISpecificPatterns() {
      // 各AI特有のエラーパターンを定義
      const patterns = {
        chatgpt: [
          /network error/i,
          /Failed to fetch/i,
          /Request failed/i,
          /429.*Too Many Requests/i,
          /ChatGPT is at capacity/i,
          /Something went wrong/i,
          /conversation.*error/i,
        ],
        claude: [
          /\[COMPLETION\].*Request failed/i,
          /TypeError: network error/i,
          /Non-API stream error/i,
          /\[COMPLETION\].*failed/i,
          /Overloaded/i,
          /rate limit/i,
        ],
        gemini: [
          /network error/i,
          /Failed to fetch/i,
          /Request blocked/i,
          /quota.*exceeded/i,
          /Resource exhausted/i,
          /500.*Internal Server Error/i,
        ],
        genspark: [
          /network error/i,
          /Connection refused/i,
          /timeout/i,
          /Service unavailable/i,
          /Request failed/i,
        ],
        common: [
          /network/i,
          /fetch.*failed/i,
          /timeout/i,
          /ERR_NETWORK/i,
          /ERR_INTERNET_DISCONNECTED/i,
          /ERR_CONNECTION/i,
        ],
      };

      // AI固有パターンと共通パターンを結合
      return [...(patterns[this.aiType] || []), ...patterns.common];
    }

    initializeMonitor() {
      const self = this;

      // console.errorをオーバーライド
      console.error = function (...args) {
        // 元のconsole.errorを実行
        self.originalConsoleError.apply(console, args);

        try {
          // エラーメッセージを構築
          const errorMessage = args
            .map((arg) =>
              typeof arg === "object" ? JSON.stringify(arg) : String(arg),
            )
            .join(" ");

          // エラーパターンをチェック
          const matchedPattern = self.errorPatterns.find((pattern) =>
            pattern.test(errorMessage),
          );

          if (matchedPattern) {
            self.handleError(errorMessage, matchedPattern);
          }
        } catch (monitorError) {
          self.originalConsoleError(
            "❌ [CONSOLE-MONITOR] エラー監視失敗:",
            monitorError,
          );
        }
      };

      // ページアンロード時に復元
      window.addEventListener("beforeunload", () => {
        console.error = this.originalConsoleError;
      });

      console.log(
        `✅ [${this.aiType.toUpperCase()}-MONITOR] Console.error監視開始`,
      );
    }

    handleError(errorMessage, pattern) {
      this.errorDetected = true;
      this.lastError = {
        message: errorMessage,
        pattern: pattern.toString(),
        timestamp: Date.now(),
        aiType: this.aiType,
      };

      // グローバル状態を更新
      window[`${this.aiType}APIErrorDetected`] = true;
      window[`${this.aiType}LastConsoleError`] = this.lastError;

      console.warn(`🚨 [${this.aiType.toUpperCase()}-ERROR-DETECTED]`, {
        pattern: pattern.toString(),
        message: errorMessage.substring(0, 200),
      });

      // カスタムイベントを発火
      window.dispatchEvent(
        new CustomEvent("aiAPIError", {
          detail: {
            aiType: this.aiType,
            errorMessage: errorMessage,
            timestamp: Date.now(),
            pattern: pattern.toString(),
          },
        }),
      );
    }

    destroy() {
      console.error = this.originalConsoleError;
    }

    getStats() {
      return {
        errorDetected: this.errorDetected,
        lastError: this.lastError,
        aiType: this.aiType,
      };
    }
  }

  // ========================================
  // 文字数監視強化システム（全AI共通）
  // ========================================

  class UniversalTextMonitor {
    constructor(aiType = "unknown") {
      this.aiType = aiType;
      this.lastTextLength = 0;
      this.textUnchangedCount = 0;
      this.maxUnchangedTime = 60; // 60秒で完了判定
      this.errorOnZero = true; // 文字数0を異常とみなす
    }

    checkTextChange(currentTextLength) {
      const result = {
        changed: false,
        isError: false,
        shouldStop: false,
        message: "",
      };

      // 文字数が突然0になった場合
      if (this.lastTextLength > 0 && currentTextLength === 0) {
        result.isError = true;
        result.shouldStop = true;
        result.message = `文字数が突然0になりました (${this.lastTextLength} → 0)`;

        // APIエラー状態を確認
        const apiErrorDetected =
          window[`${this.aiType}APIErrorDetected`] || false;

        if (apiErrorDetected) {
          result.message += " - APIエラーが検出されています";
        }

        console.error(
          `🚨 [${this.aiType.toUpperCase()}-TEXT-ERROR] ${result.message}`,
        );
        return result;
      }

      // 文字数変化なし
      if (currentTextLength > 0 && currentTextLength === this.lastTextLength) {
        this.textUnchangedCount++;

        if (this.textUnchangedCount >= this.maxUnchangedTime) {
          result.shouldStop = true;
          result.message = `文字数が${this.maxUnchangedTime}秒間変化なし`;
          console.log(
            `✓ [${this.aiType.toUpperCase()}-TEXT] 応答完了: ${result.message}`,
          );
        } else if (this.textUnchangedCount % 10 === 0) {
          console.log(
            `📊 [${this.aiType.toUpperCase()}-TEXT] 文字数変化なし: ${this.textUnchangedCount}秒`,
          );
        }
      } else if (currentTextLength !== this.lastTextLength) {
        // 文字数変化あり
        if (this.textUnchangedCount > 0) {
          console.log(
            `🔄 [${this.aiType.toUpperCase()}-TEXT] 文字数変化検出 (${this.lastTextLength} → ${currentTextLength})`,
          );
        }
        this.textUnchangedCount = 0;
        result.changed = true;
      }

      this.lastTextLength = currentTextLength;
      return result;
    }

    reset() {
      this.lastTextLength = 0;
      this.textUnchangedCount = 0;
    }
  }

  // ========================================
  // 停止ボタン監視エラー判定システム（全AI共通）
  // ========================================

  class UniversalStopButtonMonitor {
    constructor(aiType = "unknown") {
      this.aiType = aiType;
      this.confirmCount = 0;
      this.maxConfirmCount = 10;
      this.errorCheckInterval = 5000; // 5秒ごとにエラーチェック
      this.lastErrorCheck = Date.now();
    }

    shouldStopOnError() {
      // APIエラー状態を確認
      const apiErrorDetected =
        window[`${this.aiType}APIErrorDetected`] || false;
      const lastConsoleError = window[`${this.aiType}LastConsoleError`] || null;

      if (apiErrorDetected && lastConsoleError) {
        const timeSinceError = Date.now() - lastConsoleError.timestamp;

        if (timeSinceError >= this.errorCheckInterval) {
          console.error(
            `🚨 [${this.aiType.toUpperCase()}-STOP] APIエラーにより監視を中断`,
            {
              errorAge: `${Math.round(timeSinceError / 1000)}秒前`,
              errorMessage: lastConsoleError.message,
            },
          );
          return true;
        }
      }

      // ページエラー状態を確認
      const pageTitle = document.title || "";
      const pageURL = window.location.href || "";

      const isErrorPage =
        pageTitle.toLowerCase().includes("error") ||
        pageTitle.includes("エラー") ||
        pageURL.includes("error");

      if (isErrorPage) {
        console.error(
          `🚨 [${this.aiType.toUpperCase()}-STOP] ページエラー状態を検出`,
          {
            pageTitle: pageTitle,
            pageURL: pageURL,
          },
        );
        return true;
      }

      return false;
    }

    updateButtonStatus(buttonFound) {
      if (!buttonFound) {
        this.confirmCount++;

        if (this.confirmCount >= this.maxConfirmCount) {
          console.log(
            `✓ [${this.aiType.toUpperCase()}-STOP] 停止ボタン${this.maxConfirmCount}回連続非検出 - 完了`,
          );
          return true; // 完了
        }
      } else {
        if (this.confirmCount > 0) {
          console.log(
            `🔄 [${this.aiType.toUpperCase()}-STOP] 停止ボタン再検出 - カウントリセット`,
          );
        }
        this.confirmCount = 0;
      }

      return false; // 継続
    }

    reset() {
      this.confirmCount = 0;
      this.lastErrorCheck = Date.now();
    }
  }

  // ========================================
  // 統合エラーハンドラー（全AI共通）
  // ========================================

  class UniversalIntegratedErrorHandler {
    constructor(aiType = "unknown") {
      this.aiType = aiType;
      this.consoleMonitor = new UniversalConsoleErrorMonitor(aiType);
      this.textMonitor = new UniversalTextMonitor(aiType);
      this.stopButtonMonitor = new UniversalStopButtonMonitor(aiType);

      // エラーイベントリスナー
      this.initializeEventListeners();

      console.log(
        `✅ [${aiType.toUpperCase()}-HANDLER] 統合エラーハンドラー初期化完了`,
      );
    }

    initializeEventListeners() {
      // AIエラーイベントを監視
      window.addEventListener("aiAPIError", (event) => {
        if (event.detail.aiType === this.aiType) {
          this.handleAPIError(event.detail);
        }
      });
    }

    handleAPIError(errorDetail) {
      console.error(
        `🔥 [${this.aiType.toUpperCase()}-HANDLER] APIエラー処理:`,
        errorDetail,
      );

      // エラー後の復旧処理（AI固有の処理を呼び出し）
      if (
        typeof window[`handle${this.capitalizeFirst(this.aiType)}Error`] ===
        "function"
      ) {
        window[`handle${this.capitalizeFirst(this.aiType)}Error`](errorDetail);
      } else {
        // デフォルト処理: 2秒後にページリロード
        setTimeout(() => {
          console.warn(
            `🔄 [${this.aiType.toUpperCase()}-HANDLER] ページリロード実行`,
          );
          window.location.reload();
        }, 2000);
      }
    }

    capitalizeFirst(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // 文字数監視のラッパー
    checkTextChange(currentTextLength) {
      return this.textMonitor.checkTextChange(currentTextLength);
    }

    // 停止ボタン監視のラッパー
    shouldStopOnError() {
      return this.stopButtonMonitor.shouldStopOnError();
    }

    updateButtonStatus(buttonFound) {
      return this.stopButtonMonitor.updateButtonStatus(buttonFound);
    }

    // リセット
    reset() {
      this.textMonitor.reset();
      this.stopButtonMonitor.reset();
      window[`${this.aiType}APIErrorDetected`] = false;
      window[`${this.aiType}LastConsoleError`] = null;
    }

    // 統計情報
    getStats() {
      return {
        aiType: this.aiType,
        console: this.consoleMonitor.getStats(),
        textMonitor: {
          lastTextLength: this.textMonitor.lastTextLength,
          unchangedCount: this.textMonitor.textUnchangedCount,
        },
        stopButton: {
          confirmCount: this.stopButtonMonitor.confirmCount,
        },
      };
    }

    destroy() {
      this.consoleMonitor.destroy();
    }
  }

  // ========================================
  // グローバルエクスポート
  // ========================================

  // グローバルに公開（各AIスクリプトから利用可能）
  window.UniversalErrorHandler = {
    ConsoleErrorMonitor: UniversalConsoleErrorMonitor,
    TextMonitor: UniversalTextMonitor,
    StopButtonMonitor: UniversalStopButtonMonitor,
    IntegratedErrorHandler: UniversalIntegratedErrorHandler,

    // 便利な初期化メソッド
    createForAI: function (aiType) {
      return new UniversalIntegratedErrorHandler(aiType);
    },
  };

  console.log(
    "✅ [UNIVERSAL-ERROR-HANDLER] 共通エラーハンドリングモジュール読み込み完了",
  );
})();
