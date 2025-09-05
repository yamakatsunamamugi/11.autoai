/**
 * @fileoverview リトライマネージャー - 失敗時の自動リトライ処理を管理
 * 
 * 特徴:
 * - 最大リトライ回数の設定
 * - リトライ前のリセット処理（ウィンドウ再作成など）
 * - 詳細なログ出力
 * - 柔軟な成功判定
 */

export class RetryManager {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * リトライ可能な処理を実行
   * @param {Object} config - リトライ設定
   * @param {Function} config.action - 実行する処理
   * @param {Function} config.isSuccess - 成功判定関数
   * @param {Function} config.onRetry - リトライ前に実行する処理（オプション）
   * @param {number} config.maxRetries - 最大リトライ回数（デフォルト: 3）
   * @param {number} config.retryDelay - リトライ間の待機時間（ミリ秒、デフォルト: 2000）
   * @param {string} config.actionName - 処理名（ログ用）
   * @param {Object} config.context - 処理のコンテキスト情報
   * @returns {Promise<Object>} 処理結果
   */
  async executeWithRetry(config) {
    const {
      action,
      isSuccess = (result) => result && result.success !== false,
      onRetry = null,
      maxRetries = 3,
      retryDelay = 2000,
      actionName = '処理',
      context = {}
    } = config;

    let retryCount = 0;
    let lastResult = null;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        // リトライの場合はログ出力
        if (retryCount > 0) {
          this.logger.log(`[RetryManager] ${actionName} 再試行 ${retryCount}/${maxRetries}`, context);
        }

        // 処理を実行
        lastResult = await action();

        // 成功判定
        if (isSuccess(lastResult)) {
          if (retryCount > 0) {
            this.logger.log(`[RetryManager] ✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
          }
          return {
            success: true,
            result: lastResult,
            retryCount
          };
        }

        // 失敗の詳細をログ
        this.logger.warn(`[RetryManager] ${actionName} 失敗`, {
          ...context,
          attempt: retryCount + 1,
          result: lastResult
        });

      } catch (error) {
        lastError = error;
        this.logger.error(`[RetryManager] ${actionName} エラー`, {
          ...context,
          attempt: retryCount + 1,
          error: error.message
        });
      }

      // 最大リトライ回数に達した場合
      retryCount++;
      if (retryCount >= maxRetries) {
        this.logger.error(`[RetryManager] ❌ ${actionName} が${maxRetries}回失敗しました`, context);
        return {
          success: false,
          result: lastResult,
          error: lastError,
          retryCount
        };
      }

      // リトライ前の処理を実行
      if (onRetry) {
        this.logger.log(`[RetryManager] リトライ前処理を実行中...`, context);
        try {
          await onRetry(retryCount, lastResult, lastError);
        } catch (retryError) {
          this.logger.error(`[RetryManager] リトライ前処理でエラー`, {
            ...context,
            error: retryError.message
          });
          // リトライ前処理が失敗しても続行
        }
      }

      // リトライ前の待機
      if (retryDelay > 0) {
        this.logger.log(`[RetryManager] ${retryDelay}ms 待機中...`);
        await this.delay(retryDelay);
      }
    }

    // ここには到達しないはず
    return {
      success: false,
      result: lastResult,
      error: lastError,
      retryCount
    };
  }

  /**
   * ウィンドウ再作成を伴うリトライ
   * @param {Object} config - リトライ設定
   * @param {Function} config.createWindow - ウィンドウ作成関数
   * @param {Function} config.closeWindow - ウィンドウクローズ関数
   * @param {Function} config.setupWindow - ウィンドウセットアップ関数（スクリプト注入など）
   * @param {Function} config.executePhase - 実行するフェーズ
   * @param {Object} config.task - タスク情報
   * @param {Object} config.context - 実行コンテキスト
   * @returns {Promise<Object>} 処理結果
   */
  async executeWithWindowRetry(config) {
    const {
      createWindow,
      closeWindow,
      setupWindow,
      executePhase,
      task,
      context,
      maxRetries = 3
    } = config;

    return await this.executeWithRetry({
      action: async () => {
        return await executePhase(context.tabId, task);
      },
      
      isSuccess: (result) => {
        // 成功判定（カスタマイズ可能）
        if (!result || result.success === false) return false;
        
        // 機能選択の場合の追加チェック
        if (config.checkFunction) {
          const requestedFunction = task.function || '通常';
          const displayedFunction = result.displayedFunction;
          if (requestedFunction !== '通常' && (!displayedFunction || displayedFunction === '')) {
            return false;
          }
        }
        
        return true;
      },
      
      onRetry: async (retryCount) => {
        this.logger.warn(`[RetryManager] ウィンドウを再作成します（${task.column}${task.row}）`);
        
        // 古いウィンドウを閉じる
        if (closeWindow && context.tabId) {
          await closeWindow(context.tabId);
        }
        
        // 新しいウィンドウを作成
        const newTabId = await createWindow(task, context.position);
        if (!newTabId) {
          throw new Error(`ウィンドウ作成失敗: ${task.column}${task.row}`);
        }
        
        // コンテキストを更新
        context.tabId = newTabId;
        
        // ウィンドウのセットアップ
        if (setupWindow) {
          await setupWindow(newTabId, task);
        }
      },
      
      maxRetries,
      actionName: config.phaseName || 'フェーズ実行',
      context: {
        cell: `${task.column}${task.row}`,
        aiType: task.aiType,
        phase: config.phaseName
      }
    });
  }

  /**
   * 指定時間待機
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// デフォルトインスタンスをエクスポート
export const retryManager = new RetryManager();