/**
 * @fileoverview 統合エラーリカバリーシステム
 * 
 * 全AI自動化スクリプトで共通利用するエラーリカバリー機能を提供。
 * 各ステップ（Step1～5）のエラーに対して統一的なリカバリー戦略を適用。
 * 
 * 【主要機能】
 * - 段階的リトライ（即時→5分→10分）
 * - ウィンドウ再起動処理
 * - エラーログの統一管理
 * - リカバリー状態の追跡
 */

class UnifiedErrorRecovery {
  constructor(options = {}) {
    this.config = {
      maxRetries: options.maxRetries || 3,
      retryDelays: options.retryDelays || [0, 300000, 600000], // 0秒, 5分, 10分
      enableWindowRestart: options.enableWindowRestart !== false,
      enableLogging: options.enableLogging !== false,
      aiType: options.aiType || 'Unknown',
      ...options
    };
    
    this.retryHistory = new Map(); // タスクIDごとのリトライ履歴
    this.currentRetryCount = new Map(); // タスクIDごとの現在のリトライ回数
    this.isRecovering = false;
    
    // AI設定マネージャーを初期化
    this.configManager = window.aiConfigManager || new (window.AIConfigManager || class {})();
  }
  
  /**
   * ステップエラーのハンドリング（全ステップ共通）
   * @param {number} stepNumber - ステップ番号（1-5）
   * @param {Object} error - エラーオブジェクト
   * @param {Object} context - エラーコンテキスト
   * @returns {Promise<Object>} リカバリー結果
   */
  async handleStepError(stepNumber, error, context = {}) {
    const taskId = context.taskId || this.generateTaskId();
    const currentRetry = this.currentRetryCount.get(taskId) || 0;
    
    this.log(`Step${stepNumber}エラー検出`, {
      taskId,
      error: error.message || error,
      currentRetry,
      aiType: context.aiType || this.config.aiType
    });
    
    // リトライ回数チェック
    if (currentRetry >= this.config.maxRetries) {
      return this.handleMaxRetriesExceeded(stepNumber, error, taskId);
    }
    
    // エラータイプの分析
    const errorType = this.analyzeErrorType(error, stepNumber);
    
    // リカバリー戦略の決定
    const strategy = this.determineRecoveryStrategy(errorType, currentRetry, stepNumber);
    
    // リカバリー実行
    try {
      const result = await this.executeRecovery(strategy, {
        stepNumber,
        error,
        errorType,
        taskId,
        currentRetry,
        ...context
      });
      
      if (result.success) {
        this.log(`Step${stepNumber}リカバリー成功`, { taskId, strategy: strategy.type });
        this.currentRetryCount.delete(taskId);
        return result;
      }
      
      // リカバリー失敗時はリトライカウントを増やして再実行
      this.currentRetryCount.set(taskId, currentRetry + 1);
      return await this.handleStepError(stepNumber, error, context);
      
    } catch (recoveryError) {
      this.log(`Step${stepNumber}リカバリー失敗`, {
        taskId,
        error: recoveryError.message
      }, 'ERROR');
      
      return {
        success: false,
        error: recoveryError.message,
        originalError: error.message,
        stepNumber,
        taskId
      };
    }
  }
  
  /**
   * エラータイプの分析
   * @private
   */
  analyzeErrorType(error, stepNumber) {
    const errorMessage = (error.message || error.toString()).toLowerCase();
    
    // ステップ別の典型的なエラーパターン
    const stepErrorPatterns = {
      1: { // Step1: スプレッドシート読み込み
        patterns: ['spreadsheet', 'sheet', 'permission', 'access denied'],
        type: 'SPREADSHEET_ERROR'
      },
      2: { // Step2: タスクリスト作成
        patterns: ['task', 'list', 'parse', 'format'],
        type: 'TASK_LIST_ERROR'
      },
      3: { // Step3: AI実行
        patterns: ['send', 'prompt', 'input', 'textarea'],
        type: 'AI_EXECUTION_ERROR'
      },
      4: { // Step4: 応答待機
        patterns: ['timeout', 'wait', 'response', 'stop button'],
        type: 'RESPONSE_WAIT_ERROR'
      },
      5: { // Step5: 応答取得
        patterns: ['fetch', 'get response', '応答取得', 'empty response'],
        type: 'RESPONSE_FETCH_ERROR'
      }
    };
    
    // ステップ固有のエラーチェック
    if (stepErrorPatterns[stepNumber]) {
      const { patterns, type } = stepErrorPatterns[stepNumber];
      if (patterns.some(pattern => errorMessage.includes(pattern))) {
        return type;
      }
    }
    
    // 共通エラーパターン
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'NETWORK_ERROR';
    }
    if (errorMessage.includes('timeout')) {
      return 'TIMEOUT_ERROR';
    }
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      return 'RATE_LIMIT_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }
  
  /**
   * リカバリー戦略の決定
   * @private
   */
  determineRecoveryStrategy(errorType, retryCount, stepNumber) {
    const waitTime = this.config.retryDelays[retryCount] || 600000;
    
    // エラータイプに基づく戦略
    const strategies = {
      'RESPONSE_FETCH_ERROR': {
        type: 'WINDOW_RESTART',
        waitTime,
        closeWindow: true,
        reopenWindow: true,
        resetState: true
      },
      'TIMEOUT_ERROR': {
        type: 'WINDOW_RESTART',
        waitTime,
        closeWindow: true,
        reopenWindow: true,
        resetState: false
      },
      'NETWORK_ERROR': {
        type: 'WAIT_AND_RETRY',
        waitTime: Math.min(waitTime, 30000), // 最大30秒
        closeWindow: false,
        reopenWindow: false
      },
      'RATE_LIMIT_ERROR': {
        type: 'WAIT_AND_RETRY',
        waitTime: Math.max(waitTime, 60000), // 最低1分
        closeWindow: false,
        reopenWindow: false
      },
      'DEFAULT': {
        type: 'WINDOW_RESTART',
        waitTime,
        closeWindow: true,
        reopenWindow: true,
        resetState: true
      }
    };
    
    return strategies[errorType] || strategies['DEFAULT'];
  }
  
  /**
   * リカバリー実行
   * @private
   */
  async executeRecovery(strategy, context) {
    this.isRecovering = true;
    
    try {
      // 待機時間がある場合
      if (strategy.waitTime > 0) {
        this.log(`${strategy.waitTime / 1000}秒待機中...`, {
          taskId: context.taskId,
          retryAttempt: context.currentRetry + 1
        });
        await this.wait(strategy.waitTime);
      }
      
      // ウィンドウ再起動が必要な場合
      if (strategy.closeWindow && strategy.reopenWindow) {
        return await this.restartWindowAndRetry(context);
      }
      
      // 単純リトライの場合
      if (strategy.type === 'WAIT_AND_RETRY') {
        return await this.simpleRetry(context);
      }
      
      // その他のカスタム戦略
      return await this.executeCustomStrategy(strategy, context);
      
    } finally {
      this.isRecovering = false;
    }
  }
  
  /**
   * ウィンドウ再起動してリトライ
   * @private
   */
  async restartWindowAndRetry(context) {
    this.log('ウィンドウを再起動してリトライします', {
      taskId: context.taskId,
      stepNumber: context.stepNumber,
      retryAttempt: context.currentRetry + 1
    });
    
    return new Promise((resolve) => {
      // AI設定マネージャーを使用して設定を保存
      const normalizedConfig = this.configManager.saveConfig(
        context.taskId,
        context,
        context.aiType || this.config.aiType
      );
      
      // バックグラウンドスクリプトにウィンドウ再起動を要求
      // 共通化されたメッセージを作成
      const restartMessage = this.configManager.createRestartMessage(
        normalizedConfig,
        {
          retryAttempt: context.currentRetry + 1,
          originalError: context.errorType,
          stepNumber: context.stepNumber
        }
      );
      
      chrome.runtime.sendMessage(restartMessage, (response) => {
        if (response && response.success) {
          this.log('ウィンドウ再起動成功', { taskId: context.taskId });
          resolve({
            success: true,
            message: 'ウィンドウ再起動でリカバリー成功',
            retryAttempt: context.currentRetry + 1
          });
        } else {
          this.log('ウィンドウ再起動失敗', {
            taskId: context.taskId,
            error: response?.error
          }, 'ERROR');
          resolve({
            success: false,
            error: response?.error || 'ウィンドウ再起動失敗',
            needsRetry: true
          });
        }
      });
    });
  }
  
  /**
   * 単純リトライ
   * @private
   */
  async simpleRetry(context) {
    this.log('単純リトライを実行', {
      taskId: context.taskId,
      stepNumber: context.stepNumber
    });
    
    // タスクの再実行を要求
    return {
      success: false,
      needsRetry: true,
      retryAttempt: context.currentRetry + 1,
      message: '単純リトライを実行します'
    };
  }
  
  /**
   * カスタム戦略の実行
   * @private
   */
  async executeCustomStrategy(strategy, context) {
    // 拡張ポイント：将来的にカスタム戦略を追加可能
    this.log('カスタム戦略を実行', { strategy: strategy.type });
    return {
      success: false,
      needsRetry: true
    };
  }
  
  /**
   * 最大リトライ回数超過時の処理
   * @private
   */
  handleMaxRetriesExceeded(stepNumber, error, taskId) {
    this.log(`Step${stepNumber}: 最大リトライ回数超過`, {
      taskId,
      maxRetries: this.config.maxRetries,
      error: error.message
    }, 'ERROR');
    
    // リトライ履歴を保存
    this.retryHistory.set(taskId, {
      stepNumber,
      error: error.message,
      attempts: this.config.maxRetries,
      timestamp: new Date().toISOString()
    });
    
    // クリーンアップ
    this.currentRetryCount.delete(taskId);
    
    return {
      success: false,
      error: 'MAX_RETRIES_EXCEEDED',
      errorMessage: `Step${stepNumber}で最大リトライ回数（${this.config.maxRetries}回）を超過しました`,
      originalError: error.message,
      finalError: true,
      stepNumber,
      taskId
    };
  }
  
  /**
   * エラー履歴の取得
   */
  getErrorHistory(taskId = null) {
    if (taskId) {
      return this.retryHistory.get(taskId);
    }
    return Array.from(this.retryHistory.entries());
  }
  
  /**
   * リセット
   */
  reset() {
    this.retryHistory.clear();
    this.currentRetryCount.clear();
    this.isRecovering = false;
  }
  
  /**
   * タスクIDの生成
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
  log(message, data = null, level = 'INFO') {
    if (!this.config.enableLogging) return;
    
    const timestamp = new Date().toISOString();
    const prefix = {
      'INFO': '📝',
      'SUCCESS': '✅',
      'WARNING': '⚠️',
      'ERROR': '❌'
    }[level] || '📝';
    
    const logMessage = `[UnifiedErrorRecovery] ${prefix} ${message}`;
    
    // コンソールに出力
    if (level === 'ERROR') {
      console.error(logMessage, data || '');
    } else if (level === 'WARNING') {
      console.warn(logMessage, data || '');
    } else {
      console.log(logMessage, data || '');
    }
    
    // Chrome拡張機能のログにも送信
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      const logLevel = level === 'ERROR' ? 'error' : 
                       level === 'WARNING' ? 'warn' : 'info';
      
      chrome.runtime.sendMessage({
        type: 'LOG_ERROR',
        level: logLevel,
        message: logMessage,
        details: {
          timestamp: timestamp,
          aiType: this.config.aiType,
          data: data,
          source: 'UnifiedErrorRecovery'
        }
      }).catch(() => {
        // 送信エラーは無視
      });
    }
  }
  
  /**
   * 統計情報の取得
   */
  getStatistics() {
    const totalTasks = this.retryHistory.size;
    const activeRetries = this.currentRetryCount.size;
    const failedTasks = Array.from(this.retryHistory.values()).filter(h => h.attempts >= this.config.maxRetries).length;
    
    return {
      totalTasks,
      activeRetries,
      failedTasks,
      successRate: totalTasks > 0 ? ((totalTasks - failedTasks) / totalTasks * 100).toFixed(2) + '%' : 'N/A',
      isRecovering: this.isRecovering,
      config: this.config
    };
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.UnifiedErrorRecovery = UnifiedErrorRecovery;
}

// モジュールエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedErrorRecovery;
}