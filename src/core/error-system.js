/**
 * @fileoverview 統一エラーハンドリングシステム
 * 
 * アプリケーション全体で使用するエラークラスと
 * 中央エラーハンドリング機能を提供する。
 */

/**
 * エラーカテゴリ定義
 */
export const ERROR_CATEGORIES = {
  NETWORK: 'network',
  AUTH: 'authentication',
  VALIDATION: 'validation',
  TIMEOUT: 'timeout',
  PERMISSION: 'permission',
  RESOURCE: 'resource',
  PARSING: 'parsing',
  SYSTEM: 'system',
  USER: 'user',
  TEST: 'test'
};

/**
 * エラー重要度レベル
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * ベースエラークラス
 */
export class BaseError extends Error {
  constructor(message, category = ERROR_CATEGORIES.SYSTEM, options = {}) {
    super(message);
    
    this.name = this.constructor.name;
    this.category = category;
    this.severity = options.severity || ERROR_SEVERITY.MEDIUM;
    this.code = options.code || null;
    this.context = options.context || {};
    this.timestamp = new Date().toISOString();
    this.retryable = options.retryable || false;
    this.userFriendly = options.userFriendly || false;
    this.originalError = options.originalError || null;
    
    // スタックトレースを保持
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * エラーをJSON形式で出力
   * 
   * @returns {Object} JSON表現
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      retryable: this.retryable,
      userFriendly: this.userFriendly,
      stack: this.stack
    };
  }

  /**
   * ユーザー向けメッセージを取得
   * 
   * @returns {string} ユーザー向けメッセージ
   */
  getUserMessage() {
    if (this.userFriendly) {
      return this.message;
    }

    // カテゴリに基づいたデフォルトメッセージ
    switch (this.category) {
      case ERROR_CATEGORIES.NETWORK:
        return 'ネットワークエラーが発生しました。接続を確認してください。';
      case ERROR_CATEGORIES.AUTH:
        return '認証エラーが発生しました。ログインし直してください。';
      case ERROR_CATEGORIES.TIMEOUT:
        return '処理がタイムアウトしました。しばらく待ってから再試行してください。';
      case ERROR_CATEGORIES.PERMISSION:
        return '権限エラーが発生しました。必要な権限があることを確認してください。';
      default:
        return 'エラーが発生しました。しばらく待ってから再試行してください。';
    }
  }
}

/**
 * ネットワークエラー
 */
export class NetworkError extends BaseError {
  constructor(message, options = {}) {
    super(message, ERROR_CATEGORIES.NETWORK, {
      retryable: true,
      severity: ERROR_SEVERITY.HIGH,
      ...options
    });
    
    this.url = options.url || null;
    this.method = options.method || null;
    this.statusCode = options.statusCode || null;
    this.responseData = options.responseData || null;
  }
}

/**
 * 認証エラー
 */
export class AuthenticationError extends BaseError {
  constructor(message, options = {}) {
    super(message, ERROR_CATEGORIES.AUTH, {
      retryable: false,
      severity: ERROR_SEVERITY.HIGH,
      ...options
    });
    
    this.authMethod = options.authMethod || null;
    this.tokenExpired = options.tokenExpired || false;
  }
}

/**
 * バリデーションエラー
 */
export class ValidationError extends BaseError {
  constructor(message, options = {}) {
    super(message, ERROR_CATEGORIES.VALIDATION, {
      retryable: false,
      severity: ERROR_SEVERITY.MEDIUM,
      userFriendly: true,
      ...options
    });
    
    this.field = options.field || null;
    this.value = options.value || null;
    this.rule = options.rule || null;
  }
}

/**
 * タイムアウトエラー
 */
export class TimeoutError extends BaseError {
  constructor(message, options = {}) {
    super(message, ERROR_CATEGORIES.TIMEOUT, {
      retryable: true,
      severity: ERROR_SEVERITY.MEDIUM,
      ...options
    });
    
    this.timeoutDuration = options.timeoutDuration || null;
    this.operation = options.operation || null;
  }
}

/**
 * テストエラー
 */
export class TestError extends BaseError {
  constructor(message, options = {}) {
    super(message, ERROR_CATEGORIES.TEST, {
      retryable: options.retryable || false,
      severity: ERROR_SEVERITY.LOW,
      ...options
    });
    
    this.testName = options.testName || null;
    this.testPhase = options.testPhase || null;
    this.expectedValue = options.expectedValue || null;
    this.actualValue = options.actualValue || null;
  }
}

/**
 * 中央エラーハンドラー
 */
export class ErrorHandler {
  constructor(config = {}) {
    this.config = {
      logErrors: true,
      logLevel: 'error',
      reportToService: false,
      serviceUrl: null,
      maxRetries: 3,
      retryDelay: 1000,
      enableUserNotification: true,
      enableMetrics: true,
      ...config
    };

    this.errorCounts = new Map();
    this.errorHistory = [];
    this.maxHistorySize = 1000;
    this.listeners = new Set();
  }

  /**
   * エラーを処理
   * 
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - 追加コンテキスト
   * @returns {Promise<Object>} 処理結果
   */
  async handle(error, context = {}) {
    // BaseErrorでない場合はラップ
    const wrappedError = error instanceof BaseError ? error : this._wrapError(error, context);
    
    // エラー情報を拡張
    wrappedError.context = { ...wrappedError.context, ...context };
    
    // メトリクスを更新
    if (this.config.enableMetrics) {
      this._updateMetrics(wrappedError);
    }
    
    // ログ出力
    if (this.config.logErrors) {
      this._logError(wrappedError);
    }
    
    // 履歴に記録
    this._recordHistory(wrappedError);
    
    // リスナーに通知
    this._notifyListeners(wrappedError);
    
    // 外部サービスに報告
    if (this.config.reportToService && this.config.serviceUrl) {
      this._reportToService(wrappedError).catch(console.error);
    }
    
    // 回復処理
    const recoveryResult = await this._attemptRecovery(wrappedError);
    
    return {
      error: wrappedError,
      handled: true,
      recovery: recoveryResult,
      canRetry: wrappedError.retryable && recoveryResult.canRetry,
      userMessage: wrappedError.getUserMessage()
    };
  }

  /**
   * エラーリスナーを追加
   * 
   * @param {Function} listener - リスナー関数
   */
  addListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * エラーリスナーを削除
   * 
   * @param {Function} listener - リスナー関数
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * エラー統計を取得
   * 
   * @returns {Object} エラー統計
   */
  getStats() {
    const totalErrors = Array.from(this.errorCounts.values())
      .reduce((sum, count) => sum + count, 0);

    const errorsByCategory = {};
    const errorsBySeverity = {};

    this.errorHistory.forEach(entry => {
      // カテゴリ別統計
      errorsByCategory[entry.category] = (errorsByCategory[entry.category] || 0) + 1;
      
      // 重要度別統計
      errorsBySeverity[entry.severity] = (errorsBySeverity[entry.severity] || 0) + 1;
    });

    return {
      totalErrors,
      errorsByCategory,
      errorsBySeverity,
      recentErrors: this.errorHistory.slice(-10),
      errorCounts: Object.fromEntries(this.errorCounts)
    };
  }

  /**
   * エラー履歴をクリア
   */
  clearHistory() {
    this.errorHistory = [];
    this.errorCounts.clear();
  }

  /**
   * エラーをラップ
   * 
   * @param {Error} error - 元のエラー
   * @param {Object} context - コンテキスト
   * @returns {BaseError} ラップされたエラー
   * @private
   */
  _wrapError(error, context) {
    const message = error.message || 'Unknown error';
    let category = ERROR_CATEGORIES.SYSTEM;
    let options = { originalError: error, context };

    // エラーメッセージからカテゴリを推測
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
      category = ERROR_CATEGORIES.NETWORK;
      options.retryable = true;
    } else if (lowerMessage.includes('timeout')) {
      category = ERROR_CATEGORIES.TIMEOUT;
      options.retryable = true;
    } else if (lowerMessage.includes('auth') || lowerMessage.includes('unauthorized')) {
      category = ERROR_CATEGORIES.AUTH;
    } else if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
      category = ERROR_CATEGORIES.VALIDATION;
    }

    return new BaseError(message, category, options);
  }

  /**
   * メトリクスを更新
   * 
   * @param {BaseError} error - エラー
   * @private
   */
  _updateMetrics(error) {
    const key = `${error.category}:${error.name}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
  }

  /**
   * エラーをログ出力
   * 
   * @param {BaseError} error - エラー
   * @private
   */
  _logError(error) {
    const logEntry = {
      timestamp: error.timestamp,
      level: this.config.logLevel,
      category: error.category,
      severity: error.severity,
      message: error.message,
      context: error.context,
      stack: error.stack
    };

    // 重要度に応じてログレベルを調整
    switch (error.severity) {
      case ERROR_SEVERITY.CRITICAL:
        console.error('[CRITICAL ERROR]', logEntry);
        break;
      case ERROR_SEVERITY.HIGH:
        console.error('[ERROR]', logEntry);
        break;
      case ERROR_SEVERITY.MEDIUM:
        console.warn('[WARNING]', logEntry);
        break;
      case ERROR_SEVERITY.LOW:
        console.info('[INFO]', logEntry);
        break;
    }
  }

  /**
   * 履歴に記録
   * 
   * @param {BaseError} error - エラー
   * @private
   */
  _recordHistory(error) {
    this.errorHistory.push({
      timestamp: error.timestamp,
      name: error.name,
      message: error.message,
      category: error.category,
      severity: error.severity,
      context: error.context
    });

    // 履歴サイズを制限
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * リスナーに通知
   * 
   * @param {BaseError} error - エラー
   * @private
   */
  _notifyListeners(error) {
    this.listeners.forEach(listener => {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('Error listener failed:', listenerError);
      }
    });
  }

  /**
   * 外部サービスに報告
   * 
   * @param {BaseError} error - エラー
   * @returns {Promise} 報告結果
   * @private
   */
  async _reportToService(error) {
    try {
      const response = await fetch(this.config.serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(error.toJSON())
      });

      if (!response.ok) {
        throw new Error(`Failed to report error: ${response.status}`);
      }
    } catch (reportError) {
      console.error('Failed to report error to service:', reportError);
    }
  }

  /**
   * 回復処理を試行
   * 
   * @param {BaseError} error - エラー
   * @returns {Promise<Object>} 回復結果
   * @private
   */
  async _attemptRecovery(error) {
    const result = {
      recovered: false,
      canRetry: error.retryable,
      suggestion: null
    };

    // カテゴリ別の回復処理
    switch (error.category) {
      case ERROR_CATEGORIES.NETWORK:
        result.suggestion = 'ネットワーク接続を確認してください';
        result.canRetry = true;
        break;
      
      case ERROR_CATEGORIES.AUTH:
        result.suggestion = '再度ログインしてください';
        result.canRetry = false;
        break;
      
      case ERROR_CATEGORIES.TIMEOUT:
        result.suggestion = 'しばらく待ってから再試行してください';
        result.canRetry = true;
        break;
      
      case ERROR_CATEGORIES.VALIDATION:
        result.suggestion = '入力内容を確認してください';
        result.canRetry = false;
        break;
    }

    return result;
  }
}

/**
 * グローバルエラーハンドラーインスタンス
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * エラーハンドリングのヘルパー関数
 */

/**
 * 関数をエラーハンドリングでラップ
 * 
 * @param {Function} fn - ラップする関数
 * @param {Object} context - エラーコンテキスト
 * @param {ErrorHandler} handler - エラーハンドラー
 * @returns {Function} ラップされた関数
 */
export function withErrorHandling(fn, context = {}, handler = globalErrorHandler) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const handlingResult = await handler.handle(error, context);
      
      if (handlingResult.canRetry) {
        // リトライ可能な場合は元のエラーを再スロー
        throw error;
      }
      
      // リトライ不可能な場合は処理済みエラーを返す
      throw handlingResult.error;
    }
  };
}

/**
 * Promise をエラーハンドリング付きで実行
 * 
 * @param {Promise} promise - 実行するPromise
 * @param {Object} context - エラーコンテキスト
 * @param {ErrorHandler} handler - エラーハンドラー
 * @returns {Promise} 処理結果
 */
export async function handlePromise(promise, context = {}, handler = globalErrorHandler) {
  try {
    return await promise;
  } catch (error) {
    return handler.handle(error, context);
  }
}