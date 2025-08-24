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
      enableWriteVerification = true,
      onRetry = null,
      onError = null,
      onSuccess = null,
      onWriteFailure = null
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
          timeout,
          enableWriteVerification
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

        // エラー判定（AI特化エラーパターンを追加）
        if (result.error === 'TIMEOUT_NO_RESPONSE' || 
            result.error === 'SPREADSHEET_WRITE_FAILED' ||
            result.error === 'WRITE_VERIFICATION_FAILED' ||
            result.needsRetry ||
            (result.writeResult && !result.writeResult.verified) ||
            this.isAISpecificRetryableError(result)) {
          
          let errorType = result.error || 'UNKNOWN_ERROR';
          let errorMessage = result.errorMessage || 'エラーが発生しました';
          
          // スプレッドシート書き込み確認失敗の場合
          if (result.writeResult && !result.writeResult.verified) {
            errorType = 'WRITE_VERIFICATION_FAILED';
            errorMessage = 'スプレッドシートへの書き込み確認に失敗しました';
          }
          
          this.log(`エラー検出: ${errorType} - ${errorMessage}`, 'WARNING');
          
          // AI特化エラーの場合は専用の戦略を適用
          let aiRetryStrategy = null;
          let effectiveRetryDelay = this.retryDelay;
          let effectiveMaxRetries = this.maxRetries;
          
          if (this.isAISpecificRetryableError(result)) {
            aiRetryStrategy = this.getAISpecificRetryStrategy(result);
            effectiveRetryDelay = this.calculateAIRetryDelay(aiRetryStrategy.strategy, this.retryCount);
            effectiveMaxRetries = Math.min(aiRetryStrategy.maxRetries, this.maxRetries);
            this.log(aiRetryStrategy.message, 'INFO');
          }
          
          if (this.retryCount < effectiveMaxRetries) {
            this.retryCount++;
            
            // リトライコールバック実行
            if (onRetry) {
              await onRetry({
                retryCount: this.retryCount,
                maxRetries: effectiveMaxRetries,
                error: errorType,
                errorMessage: errorMessage,
                taskId,
                isWriteVerificationFailure: errorType === 'WRITE_VERIFICATION_FAILED',
                aiRetryStrategy: aiRetryStrategy
              });
            }
            
            // 書き込み確認失敗時の特別な処理
            if (errorType === 'WRITE_VERIFICATION_FAILED' && onWriteFailure) {
              await onWriteFailure({
                retryCount: this.retryCount,
                maxRetries: effectiveMaxRetries,
                taskId,
                writeResult: result.writeResult
              });
            }
            
            // リトライ前の待機（AI特化遅延時間を使用）
            this.log(`${effectiveRetryDelay}ms後にリトライします... ${aiRetryStrategy ? `(${aiRetryStrategy.strategy})` : ''}`, 'INFO');
            await this.wait(effectiveRetryDelay);
            
            // 新規ウィンドウでリトライを要求
            const retryResult = await this.requestNewWindowRetry({
              taskId,
              prompt,
              aiType,
              enableDeepResearch,
              specialMode,
              enableWriteVerification,
              attemptNumber: this.retryCount + 1,
              retryReason: errorType
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

  /**
   * AI特化リトライ可能エラーの判定
   * @param {Object} result - タスク実行結果
   * @returns {boolean} リトライ可能かどうか
   */
  isAISpecificRetryableError(result) {
    if (!result.error && !result.errorMessage) {
      return false;
    }

    const errorMessage = (result.errorMessage || result.error || '').toLowerCase();
    
    // AI特化エラーパターン
    const aiRetryablePatterns = [
      // ChatGPT関連エラー
      'rate limit',
      'too many requests',
      'model is overloaded',
      'openai api error',
      'chatgpt error',
      'gpt model unavailable',
      
      // Claude関連エラー
      'claude is overloaded',
      'anthropic api error',
      'claude error',
      'claude unavailable',
      'request was rejected',
      
      // Gemini関連エラー
      'gemini api error',
      'quota exceeded',
      'bard is unavailable',
      'gemini model error',
      'google ai error',
      
      // Genspark関連エラー
      'genspark error',
      'genspark unavailable',
      'service temporarily unavailable',
      'genspark timeout',
      
      // 一般的なAIエラー
      'ai response error',
      'model unavailable',
      'ai timeout',
      'ai service error',
      'request interrupted by user',
      'response generation failed',
      'model loading',
      'service temporarily down',
      'connection timeout',
      'server overload',
      'temporary service interruption'
    ];

    // エラーパターンマッチング
    for (const pattern of aiRetryablePatterns) {
      if (errorMessage.includes(pattern)) {
        this.log(`AI特化エラーパターン検出: ${pattern}`, 'WARNING');
        return true;
      }
    }

    // 特定のエラーコード
    const aiRetryableErrorCodes = [
      'AI_RESPONSE_ERROR',
      'AI_TIMEOUT_ERROR',
      'MODEL_UNAVAILABLE_ERROR',
      'AI_RATE_LIMIT_ERROR',
      'AI_OVERLOAD_ERROR',
      'AI_SERVICE_ERROR'
    ];

    if (aiRetryableErrorCodes.includes(result.error)) {
      this.log(`AI特化エラーコード検出: ${result.error}`, 'WARNING');
      return true;
    }

    // HTTPステータスコードベースの判定（AI API特有）
    if (result.statusCode) {
      const retryableStatusCodes = [
        429, // Too Many Requests (Rate Limit)
        502, // Bad Gateway (Service Unavailable)
        503, // Service Unavailable
        504, // Gateway Timeout
        520, // Cloudflare: Unknown Error
        521, // Cloudflare: Web Server Is Down
        522, // Cloudflare: Connection Timed Out
        524  // Cloudflare: A Timeout Occurred
      ];
      
      if (retryableStatusCodes.includes(result.statusCode)) {
        this.log(`AI特化HTTPエラーコード検出: ${result.statusCode}`, 'WARNING');
        return true;
      }
    }

    return false;
  }

  /**
   * AI特化リトライ戦略の取得
   * @param {Object} result - タスク実行結果
   * @returns {Object} リトライ戦略情報
   */
  getAISpecificRetryStrategy(result) {
    const errorMessage = (result.errorMessage || result.error || '').toLowerCase();
    
    // レート制限エラーの場合は長めの待機時間
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      return {
        retryDelay: 10000, // 10秒
        maxRetries: 2,     // 回数を抑える
        strategy: 'rate_limit_backoff',
        message: 'レート制限によるリトライ戦略を適用'
      };
    }
    
    // モデル過負荷エラーの場合
    if (errorMessage.includes('overloaded') || errorMessage.includes('overload')) {
      return {
        retryDelay: 15000, // 15秒
        maxRetries: 2,
        strategy: 'overload_backoff',
        message: 'モデル過負荷によるリトライ戦略を適用'
      };
    }
    
    // サービス一時的利用不可の場合
    if (errorMessage.includes('unavailable') || errorMessage.includes('temporarily')) {
      return {
        retryDelay: 8000,  // 8秒
        maxRetries: 3,
        strategy: 'service_unavailable_backoff',
        message: 'サービス一時利用不可によるリトライ戦略を適用'
      };
    }
    
    // 一般的なAIエラーの場合
    return {
      retryDelay: 5000,  // 5秒（デフォルト）
      maxRetries: 3,
      strategy: 'ai_general_backoff',
      message: '一般的なAIエラーによるリトライ戦略を適用'
    };
  }

  /**
   * AI特化のリトライ遅延時間計算
   * @param {string} errorType - エラータイプ
   * @param {number} attemptNumber - 試行回数
   * @returns {number} 遅延時間（ミリ秒）
   */
  calculateAIRetryDelay(errorType, attemptNumber) {
    const baseDelays = {
      'rate_limit_backoff': 10000,
      'overload_backoff': 15000,
      'service_unavailable_backoff': 8000,
      'ai_general_backoff': 5000
    };
    
    const baseDelay = baseDelays[errorType] || 5000;
    
    // エクスポネンシャルバックオフ（最大60秒まで）
    const exponentialDelay = baseDelay * Math.pow(1.5, attemptNumber - 1);
    return Math.min(exponentialDelay, 60000);
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