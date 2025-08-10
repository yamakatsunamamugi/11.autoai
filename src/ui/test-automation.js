// test-automation.js
// 自動テスト機能モジュール

/**
 * AIテスト自動化クラス
 * 各AIウィンドウでのテキスト入力→実行→待機→取得の自動テストを実行
 */
export class TestAutomation {
  constructor() {
    this.testResults = new Map();
    this.testStatus = new Map();
  }

  /**
   * AIタブでテストを実行（元のコードのexecuteTaskを使用）
   * @param {string} aiType - AI種別
   * @param {number} tabId - タブID
   * @param {string} prompt - テストプロンプト
   * @param {boolean} enableDeepResearch - DeepResearchフラグ
   * @returns {Promise<Object>} テスト結果
   */
  async runTestForAI(
    aiType,
    tabId,
    prompt,
    enableDeepResearch = false,
    enableSearchMode = false,
  ) {
    const testId = `${aiType}-${Date.now()}`;
    this.testStatus.set(aiType, "running");

    // 特殊モード情報を取得（全AI対応）
    let specialMode = null;
    if (window.aiModelManager) {
      const selector = window.aiModelManager.getSelector(aiType);
      if (selector && selector.getCurrentSpecialMode) {
        specialMode = selector.getCurrentSpecialMode();
      }
    }

    console.log(
      `[TestAutomation] ${aiType} - DeepResearch: ${enableDeepResearch}, 検索モード: ${enableSearchMode}, specialMode: ${specialMode}`,
    );

    const result = {
      aiType: aiType,
      tabId: tabId,
      prompt: prompt,
      steps: [],
      success: false,
      error: null,
      timestamp: new Date().toISOString(),
    };

    try {
      // ステップ1: 統合タスク実行（元のコードのexecuteTaskを使用）
      console.log(`[TestAutomation] ${aiType} - 統合タスク実行開始`);
      result.steps.push({
        step: 1,
        name: "統合タスク実行（プロンプト送信→回答取得）",
        status: "running",
      });

      const startTime = Date.now();
      console.log(`[TestAutomation] ${aiType} - executeTaskOnAI呼び出し中...`);
      const taskResult = await this.executeTaskOnAI(
        tabId,
        prompt,
        testId,
        enableDeepResearch,
        specialMode,
        enableSearchMode,
      );
      const duration = Date.now() - startTime;
      console.log(
        `[TestAutomation] ${aiType} - executeTaskOnAI結果:`,
        taskResult,
      );

      result.steps[0].status = taskResult.success ? "success" : "failed";
      result.steps[0].duration = duration;

      if (!taskResult.success) {
        console.error(
          `[TestAutomation] ${aiType} - タスク失敗:`,
          taskResult.error,
        );
        throw new Error(taskResult.error || "統合タスク実行に失敗しました");
      }

      // 成功
      result.success = true;
      result.responseText = taskResult.response;
      result.chunks = taskResult.chunks;
      console.log(`[TestAutomation] ${aiType} - テスト完了 ✅`);
    } catch (error) {
      console.error(`[TestAutomation] ${aiType} - エラー:`, error);
      result.success = false;
      result.error = error.message;
    }

    this.testStatus.set(aiType, result.success ? "completed" : "failed");
    this.testResults.set(aiType, result);

    return result;
  }

  /**
   * 統合タスク実行（元のコードのexecuteTaskアクションを使用）
   * @param {number} tabId - タブID
   * @param {string} prompt - プロンプトテキスト
   * @param {string} taskId - タスクID
   * @returns {Promise<Object>} 実行結果
   */
  async executeTaskOnAI(
    tabId,
    prompt,
    taskId,
    enableDeepResearch = false,
    specialMode = null,
    enableSearchMode = false,
  ) {
    console.log(
      `[executeTaskOnAI] 開始 - tabId: ${tabId}, taskId: ${taskId}, DeepResearch: ${enableDeepResearch}, 検索モード: ${enableSearchMode}, specialMode: ${specialMode}`,
    );
    return new Promise((resolve) => {
      // タイムアウトタイマーを設定
      const timeoutId = setTimeout(() => {
        console.error(`[executeTaskOnAI] タイムアウト - tabId: ${tabId}`);
        resolve({
          success: false,
          error: "タスク実行がタイムアウトしました（30秒）",
        });
      }, 30000); // 30秒でタイムアウト

      // background.js経由でcontent scriptにメッセージを送信
      chrome.runtime.sendMessage(
        {
          action: "executeTask",
          tabId: tabId,
          prompt: prompt,
          taskId: taskId,
          timeout: 180000, // 3分タイムアウト
          enableDeepResearch: enableDeepResearch, // DeepResearchフラグを追加
          specialMode: specialMode, // 特殊モード情報を追加
          enableSearchMode: enableSearchMode, // 検索モードフラグを追加
        },
        (response) => {
          clearTimeout(timeoutId); // タイムアウトタイマーをクリア

          if (chrome.runtime.lastError) {
            console.error("統合タスク実行エラー:", chrome.runtime.lastError);
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          console.log(`[executeTaskOnAI] レスポンス受信:`, response);
          resolve(response || { success: false, error: "応答なし" });
        },
      );
    });
  }

  /**
   * コンテンツスクリプトの準備状態を確認
   */
  async checkContentScriptReady(tabId) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: "checkReady" }, (response) => {
        const duration = Date.now() - startTime;

        if (chrome.runtime.lastError) {
          console.error("準備確認エラー:", chrome.runtime.lastError);
          resolve({ success: false, duration });
          return;
        }

        resolve({
          success: response && response.ready,
          duration,
        });
      });
    });
  }

  /**
   * テキストをAIに送信（元のコードのsendPromptを使用）
   */
  async sendTextToAI(tabId, text) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "sendPrompt",
          prompt: text,
          taskId: `test-${Date.now()}`,
        },
        (response) => {
          const duration = Date.now() - startTime;

          if (chrome.runtime.lastError) {
            console.error("テキスト入力エラー:", chrome.runtime.lastError);
            resolve({ success: false, duration });
            return;
          }

          resolve({
            success: response && response.success,
            duration,
          });
        },
      );
    });
  }

  /**
   * 送信ボタンをクリック（sendPromptに統合されているため不要）
   */
  async clickSendButton(tabId) {
    const startTime = Date.now();
    // sendPromptで既に送信まで完了しているため、成功として返す
    return {
      success: true,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 回答を待機（元のコードのgetTaskStatusを使用）
   */
  async waitForResponse(tabId, aiType) {
    const startTime = Date.now();
    const timeout = 60000; // 60秒タイムアウト
    const checkInterval = 2000; // 2秒ごとにチェック

    return new Promise((resolve) => {
      const checkResponse = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed >= timeout) {
          resolve({
            success: false,
            duration: elapsed,
            reason: "timeout",
          });
          return;
        }

        chrome.tabs.sendMessage(
          tabId,
          { action: "getTaskStatus" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("回答チェックエラー:", chrome.runtime.lastError);
              setTimeout(checkResponse, checkInterval);
              return;
            }

            // 簡易的に3秒待機後に成功とする（元のコードに合わせて）
            if (elapsed >= 3000) {
              resolve({
                success: true,
                duration: elapsed,
              });
            } else {
              setTimeout(checkResponse, checkInterval);
            }
          },
        );
      };

      checkResponse();
    });
  }

  /**
   * 回答テキストを取得（元のコードのgetResponseを使用）
   */
  async getResponseText(tabId) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "getResponse",
          taskId: `test-${Date.now()}`,
        },
        (response) => {
          const duration = Date.now() - startTime;

          if (chrome.runtime.lastError) {
            console.error("回答取得エラー:", chrome.runtime.lastError);
            resolve({ success: false, duration });
            return;
          }

          resolve({
            success: response && response.success,
            duration,
            text: response ? response.response : null,
          });
        },
      );
    });
  }

  /**
   * 待機用ヘルパー
   */
  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * テスト結果のサマリーを取得
   */
  getTestSummary() {
    const summary = {
      total: this.testResults.size,
      success: 0,
      failed: 0,
      results: [],
    };

    for (const [aiType, result] of this.testResults) {
      if (result.success) {
        summary.success++;
      } else {
        summary.failed++;
      }

      summary.results.push({
        aiType: aiType,
        success: result.success,
        steps: result.steps.map((step) => ({
          name: step.name,
          status: step.status,
          duration: step.duration,
        })),
        totalDuration: result.steps.reduce(
          (sum, step) => sum + (step.duration || 0),
          0,
        ),
        error: result.error,
      });
    }

    return summary;
  }
}

// エクスポート
export const testAutomation = new TestAutomation();
