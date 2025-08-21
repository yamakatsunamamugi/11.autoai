/**
 * @fileoverview リトライマネージャー
 * 
 * 【役割】
 * AI処理のタイムアウトエラー時に自動的にリトライを実行する機能を提供
 * 
 * 【主要機能】
 * - タイムアウトエラー検出
 * - 新規ウィンドウでのリトライ実行
 * - リトライ回数の管理
 * - エラー状態の詳細記録
 * 
 * 【使用方法】
 * const retryManager = new RetryManager();
 * const result = await retryManager.executeWithRetry(task, options);
 */

class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000;
    this.retryCount = 0;
    this.taskHistory = [];
    this.currentTaskId = null;
    this.debugMode = options.debugMode || false;
  }

  /**
   * タスクをリトライ機能付きで実行
   * @param {Object} task - 実行するタスク
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 実行結果
   */
  async executeWithRetry(task, options = {}) {
    const {
      taskId = this.generateTaskId(),
      prompt,
      aiType,
      enableDeepResearch = false,
      specialMode = null,
      timeout = 600000,
      onRetry = null,
      onError = null,
      onSuccess = null
    } = { ...task, ...options };

    this.currentTaskId = taskId;
    this.retryCount = 0;
    
    this.log(`タスク開始: ${taskId}`, 'INFO');
    
    while (this.retryCount <= this.maxRetries) {
      try {
        const attemptNumber = this.retryCount + 1;
        this.log(`実行試行 ${attemptNumber}/${this.maxRetries + 1}`, 'INFO');
        
        // タスク実行履歴を記録
        const attemptStart = Date.now();
        this.taskHistory.push({
          taskId,
          attempt: attemptNumber,
          startTime: attemptStart,
          aiType,
          prompt: prompt.substring(0, 100) + '...'
        });

        // 実際のタスク実行（ai-content-unified.jsから呼び出される）
        const result = await this.executeTask({
          taskId,
          prompt,
          aiType,
          enableDeepResearch,
          specialMode,
          timeout
        });

        // 結果を解析
        if (result.success) {
          this.log(`タスク成功: ${taskId}`, 'SUCCESS');
          if (onSuccess) await onSuccess(result);
          return {
            ...result,
            retryCount: this.retryCount,
            taskId
          };
        }

        // エラー判定
        if (result.error === 'TIMEOUT_NO_RESPONSE' || result.needsRetry) {
          this.log(`タイムアウトエラー検出: ${result.errorMessage}`, 'WARNING');
          
          if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            
            // リトライコールバック実行
            if (onRetry) {
              await onRetry({
                retryCount: this.retryCount,
                maxRetries: this.maxRetries,
                error: result.error,
                taskId
              });
            }
            
            // リトライ前の待機
            this.log(`${this.retryDelay}ms後にリトライします...`, 'INFO');
            await this.wait(this.retryDelay);
            
            // 新規ウィンドウでリトライを要求
            const retryResult = await this.requestNewWindowRetry({
              taskId,
              prompt,
              aiType,
              enableDeepResearch,
              specialMode,
              attemptNumber: this.retryCount + 1
            });
            
            if (retryResult && retryResult.success) {
              return retryResult;
            }
            
            // リトライ失敗時は次の試行へ
            continue;
          }
        }

        // リトライ不要なエラーまたはリトライ回数超過
        this.log(`タスク失敗: ${result.errorMessage}`, 'ERROR');
        if (onError) await onError(result);
        return {
          ...result,
          retryCount: this.retryCount,
          taskId,
          finalError: true
        };

      } catch (error) {
        this.log(`予期しないエラー: ${error.message}`, 'ERROR');
        
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          await this.wait(this.retryDelay);
          continue;
        }
        
        if (onError) await onError({ error: error.message });
        return {
          success: false,
          error: 'UNEXPECTED_ERROR',
          errorMessage: error.message,
          retryCount: this.retryCount,
          taskId,
          finalError: true
        };
      }
    }

    // すべてのリトライが失敗
    return {
      success: false,
      error: 'MAX_RETRIES_EXCEEDED',
      errorMessage: `最大リトライ回数（${this.maxRetries}回）を超過しました`,
      retryCount: this.retryCount,
      taskId,
      finalError: true
    };
  }

  /**
   * 実際のタスク実行（content scriptで実装される）
   * @private
   */
  async executeTask(taskConfig) {
    // この関数はai-content-unified.jsから上書きされる
    throw new Error('executeTask must be implemented by content script');
  }

  /**
   * 新規ウィンドウでのリトライを要求
   * @private
   */
  async requestNewWindowRetry(config) {
    this.log('新規ウィンドウでリトライを要求', 'INFO');
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'RETRY_WITH_NEW_WINDOW',
        ...config,
        originalTabId: chrome.runtime.id  // 現在のタブIDを記録
      }, (response) => {
        if (response && response.success) {
          this.log('新規ウィンドウでのリトライ成功', 'SUCCESS');
          resolve(response);
        } else {
          this.log('新規ウィンドウでのリトライ失敗', 'ERROR');
          resolve(null);
        }
      });
    });
  }

  /**
   * タスクIDを生成
   * @private
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 待機処理
   * @private
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ログ出力
   * @private
   */
  log(message, level = 'INFO') {
    if (!this.debugMode && level === 'DEBUG') return;
    
    const timestamp = new Date().toISOString();
    const prefix = {
      'DEBUG': '🔍',
      'INFO': '📝',
      'SUCCESS': '✅',
      'WARNING': '⚠️',
      'ERROR': '❌'
    }[level] || '📝';
    
    console.log(`[RetryManager] ${prefix} [${timestamp}] ${message}`);
  }

  /**
   * タスク履歴を取得
   */
  getTaskHistory() {
    return this.taskHistory;
  }

  /**
   * 統計情報を取得
   */
  getStatistics() {
    const totalTasks = new Set(this.taskHistory.map(h => h.taskId)).size;
    const totalAttempts = this.taskHistory.length;
    const successfulTasks = this.taskHistory.filter(h => h.success).length;
    const failedTasks = this.taskHistory.filter(h => h.error).length;
    
    return {
      totalTasks,
      totalAttempts,
      successfulTasks,
      failedTasks,
      averageRetries: totalTasks > 0 ? (totalAttempts - totalTasks) / totalTasks : 0,
      successRate: totalAttempts > 0 ? (successfulTasks / totalAttempts) * 100 : 0
    };
  }

  /**
   * リセット
   */
  reset() {
    this.retryCount = 0;
    this.currentTaskId = null;
    this.taskHistory = [];
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.RetryManager = RetryManager;
}

// モジュールエクスポート（ES6モジュール対応）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RetryManager;
}