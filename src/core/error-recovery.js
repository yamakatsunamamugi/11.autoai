/**
 * @fileoverview エラーリカバリーシステム
 *
 * Chrome拡張機能のエラーから自動的に回復するための
 * 包括的なエラーハンドリングとリカバリー戦略を提供
 */

/**
 * エラーの重要度レベル
 */
export const ErrorSeverity = {
  LOW: 'low',        // ユーザー体験に影響なし
  MEDIUM: 'medium',  // 一部機能に影響
  HIGH: 'high',      // 主要機能に影響
  CRITICAL: 'critical' // システム全体に影響
};

/**
 * エラータイプ
 */
export const ErrorType = {
  NETWORK: 'network',
  AUTH: 'auth',
  QUOTA: 'quota',
  PERMISSION: 'permission',
  TIMEOUT: 'timeout',
  VALIDATION: 'validation',
  RUNTIME: 'runtime',
  UNKNOWN: 'unknown'
};

/**
 * エラーリカバリー戦略
 */
class ErrorRecoveryStrategy {
  constructor() {
    this.strategies = new Map();
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.initializeStrategies();
  }

  /**
   * デフォルトのリカバリー戦略を初期化
   */
  initializeStrategies() {
    // ネットワークエラーの戦略
    this.registerStrategy(ErrorType.NETWORK, {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      shouldRetry: (error, attempt) => {
        // 一時的なネットワークエラーのみリトライ
        const temporaryErrors = ['NetworkError', 'TimeoutError', 'AbortError'];
        return temporaryErrors.includes(error.name) && attempt < 3;
      },
      recover: async (error, context) => {
        console.log('[ErrorRecovery] ネットワークエラーのリカバリー開始');

        // オフラインチェック
        if (!navigator.onLine) {
          await this.waitForOnline();
        }

        // キャッシュからデータ取得を試みる
        if (context?.cacheKey) {
          const cached = await this.getFromCache(context.cacheKey);
          if (cached) {
            console.log('[ErrorRecovery] キャッシュからデータを復元');
            return cached;
          }
        }

        throw error; // リカバリー失敗
      }
    });

    // 認証エラーの戦略
    this.registerStrategy(ErrorType.AUTH, {
      maxRetries: 1,
      retryDelay: 0,
      shouldRetry: (error) => {
        // 401エラーの場合のみ再認証を試みる
        return error.status === 401;
      },
      recover: async (error, context) => {
        console.log('[ErrorRecovery] 認証エラーのリカバリー開始');

        // トークンをリフレッシュ
        if (globalThis.authService) {
          try {
            await globalThis.authService.refreshToken();
            console.log('[ErrorRecovery] トークンリフレッシュ成功');
            return { retry: true };
          } catch (refreshError) {
            console.error('[ErrorRecovery] トークンリフレッシュ失敗:', refreshError);
            // ユーザーに再ログインを促す
            chrome.runtime.sendMessage({
              type: 'AUTH_REQUIRED',
              message: '認証が必要です。再度ログインしてください。'
            });
          }
        }

        throw error;
      }
    });

    // クォータエラーの戦略
    this.registerStrategy(ErrorType.QUOTA, {
      maxRetries: 0,
      shouldRetry: () => false,
      recover: async (error, context) => {
        console.log('[ErrorRecovery] クォータエラーのリカバリー開始');

        // レート制限の場合は待機
        if (error.retryAfter) {
          const waitTime = parseInt(error.retryAfter) * 1000;
          console.log(`[ErrorRecovery] ${waitTime}ms待機中...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return { retry: true };
        }

        // ストレージクォータの場合はクリーンアップ
        if (context?.storageType) {
          await this.cleanupStorage(context.storageType);
          return { retry: true };
        }

        throw error;
      }
    });

    // タイムアウトエラーの戦略
    this.registerStrategy(ErrorType.TIMEOUT, {
      maxRetries: 2,
      retryDelay: 5000,
      shouldRetry: (error, attempt) => attempt < 2,
      recover: async (error, context) => {
        console.log('[ErrorRecovery] タイムアウトエラーのリカバリー開始');

        // タイムアウト時間を延長してリトライ
        if (context?.timeoutMs) {
          context.timeoutMs = Math.min(context.timeoutMs * 2, 300000); // 最大5分
          console.log(`[ErrorRecovery] タイムアウトを${context.timeoutMs}msに延長`);
          return { retry: true, newContext: context };
        }

        throw error;
      }
    });
  }

  /**
   * リカバリー戦略を登録
   */
  registerStrategy(errorType, strategy) {
    this.strategies.set(errorType, strategy);
  }

  /**
   * エラーからリカバリーを試みる
   */
  async recover(error, errorType = ErrorType.UNKNOWN, context = {}) {
    // エラー履歴に記録
    this.recordError(error, errorType);

    // 戦略を取得
    const strategy = this.strategies.get(errorType) || this.getDefaultStrategy();

    let lastError = error;
    let attempt = 0;

    while (attempt < (strategy.maxRetries || 0)) {
      attempt++;

      if (!strategy.shouldRetry(lastError, attempt)) {
        break;
      }

      // リトライ前の待機
      if (strategy.retryDelay > 0) {
        const delay = strategy.retryDelay * Math.pow(strategy.backoffMultiplier || 1, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        // リカバリー処理を実行
        const result = await strategy.recover(lastError, context);

        if (result?.retry) {
          // コンテキストが更新された場合は適用
          if (result.newContext) {
            context = result.newContext;
          }
          continue;
        }

        return result;
      } catch (recoveryError) {
        lastError = recoveryError;
        console.error(`[ErrorRecovery] リカバリー試行 ${attempt} 失敗:`, recoveryError);
      }
    }

    // すべてのリカバリー試行が失敗
    throw lastError;
  }

  /**
   * デフォルトの戦略を取得
   */
  getDefaultStrategy() {
    return {
      maxRetries: 1,
      retryDelay: 1000,
      shouldRetry: () => true,
      recover: async (error) => {
        throw error;
      }
    };
  }

  /**
   * オンラインになるまで待機
   */
  async waitForOnline(timeout = 30000) {
    if (navigator.onLine) return;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        window.removeEventListener('online', handler);
        reject(new Error('オンライン待機タイムアウト'));
      }, timeout);

      const handler = () => {
        clearTimeout(timeoutId);
        window.removeEventListener('online', handler);
        resolve();
      };

      window.addEventListener('online', handler);
    });
  }

  /**
   * キャッシュからデータを取得
   */
  async getFromCache(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch (error) {
      console.error('[ErrorRecovery] キャッシュ取得エラー:', error);
      return null;
    }
  }

  /**
   * ストレージをクリーンアップ
   */
  async cleanupStorage(storageType = 'local') {
    try {
      const storage = chrome.storage[storageType];
      const items = await storage.get(null);
      const keys = Object.keys(items);

      // 古いアイテムから削除（簡易実装）
      const toDelete = keys.slice(0, Math.floor(keys.length * 0.3)); // 30%削除
      await storage.remove(toDelete);

      console.log(`[ErrorRecovery] ${toDelete.length}個のアイテムを削除`);
    } catch (error) {
      console.error('[ErrorRecovery] ストレージクリーンアップエラー:', error);
    }
  }

  /**
   * エラーを記録
   */
  recordError(error, errorType) {
    const errorRecord = {
      timestamp: Date.now(),
      type: errorType,
      message: error.message,
      stack: error.stack,
      severity: this.calculateSeverity(error, errorType)
    };

    this.errorHistory.push(errorRecord);

    // 履歴サイズを制限
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // クリティカルエラーの場合は通知
    if (errorRecord.severity === ErrorSeverity.CRITICAL) {
      this.notifyCriticalError(errorRecord);
    }
  }

  /**
   * エラーの重要度を計算
   */
  calculateSeverity(error, errorType) {
    // エラータイプによる重要度
    const typeSeverity = {
      [ErrorType.AUTH]: ErrorSeverity.HIGH,
      [ErrorType.PERMISSION]: ErrorSeverity.CRITICAL,
      [ErrorType.QUOTA]: ErrorSeverity.MEDIUM,
      [ErrorType.NETWORK]: ErrorSeverity.LOW,
      [ErrorType.TIMEOUT]: ErrorSeverity.MEDIUM,
      [ErrorType.VALIDATION]: ErrorSeverity.LOW,
      [ErrorType.RUNTIME]: ErrorSeverity.HIGH,
      [ErrorType.UNKNOWN]: ErrorSeverity.MEDIUM
    };

    return typeSeverity[errorType] || ErrorSeverity.MEDIUM;
  }

  /**
   * クリティカルエラーを通知
   */
  notifyCriticalError(errorRecord) {
    chrome.runtime.sendMessage({
      type: 'CRITICAL_ERROR',
      error: errorRecord
    }).catch(error => {
      console.error('[ErrorRecovery] クリティカルエラー通知失敗:', error);
    });
  }

  /**
   * エラー統計を取得
   */
  getErrorStatistics() {
    const stats = {
      total: this.errorHistory.length,
      byType: {},
      bySeverity: {},
      recentErrors: this.errorHistory.slice(-10)
    };

    this.errorHistory.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    });

    return stats;
  }

  /**
   * エラー履歴をクリア
   */
  clearHistory() {
    this.errorHistory = [];
  }
}

/**
 * エラーラップ関数
 * 関数実行を自動的にエラーハンドリングでラップ
 */
export function withErrorRecovery(fn, errorType = ErrorType.UNKNOWN, context = {}) {
  return async function(...args) {
    const recovery = errorRecoverySystem;

    try {
      return await fn.apply(this, args);
    } catch (error) {
      console.error(`[ErrorRecovery] エラーキャッチ (${errorType}):`, error);

      try {
        // リカバリーを試みる
        const result = await recovery.recover(error, errorType, context);

        // リカバリー成功後、元の関数を再実行
        if (result?.retry !== false) {
          return await fn.apply(this, args);
        }

        return result;
      } catch (recoveryError) {
        // リカバリー失敗
        console.error('[ErrorRecovery] リカバリー失敗:', recoveryError);
        throw recoveryError;
      }
    }
  };
}

/**
 * Promise用エラーハンドリング
 */
export function handlePromiseError(promise, errorType = ErrorType.UNKNOWN, context = {}) {
  return promise.catch(error => {
    return errorRecoverySystem.recover(error, errorType, context);
  });
}

// グローバルインスタンス
export const errorRecoverySystem = new ErrorRecoveryStrategy();

// グローバルエラーハンドラーを設定
if (typeof self !== 'undefined') {
  self.addEventListener('error', (event) => {
    console.error('[ErrorRecovery] グローバルエラー:', event.error);
    errorRecoverySystem.recordError(event.error, ErrorType.RUNTIME);
  });

  self.addEventListener('unhandledrejection', (event) => {
    console.error('[ErrorRecovery] 未処理のPromiseリジェクション:', event.reason);
    errorRecoverySystem.recordError(
      new Error(event.reason?.message || String(event.reason)),
      ErrorType.RUNTIME
    );
  });
}

export default {
  ErrorSeverity,
  ErrorType,
  ErrorRecoveryStrategy,
  errorRecoverySystem,
  withErrorRecovery,
  handlePromiseError
};