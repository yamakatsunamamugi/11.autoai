/**
 * @fileoverview エラーハンドリングサービス
 *
 * アプリケーション全体のエラーを統一的に処理するサービス
 */

export class ErrorService {
  constructor(logger = console) {
    this.logger = logger;
    this.errorHandlers = new Map();
    this.errorLog = [];
    this.maxLogSize = 100;
  }

  /**
   * エラーハンドラーを登録
   * @param {string} errorType - エラーの種類
   * @param {Function} handler - エラーハンドラー関数
   */
  registerHandler(errorType, handler) {
    this.errorHandlers.set(errorType, handler);
  }

  /**
   * エラーを処理
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - エラーコンテキスト
   */
  async handleError(error, context = {}) {
    // エラーログに記録
    this.logError(error, context);

    // エラーの種類を判定
    const errorType = this.getErrorType(error);

    // 専用ハンドラーがあれば実行
    if (this.errorHandlers.has(errorType)) {
      const handler = this.errorHandlers.get(errorType);
      return await handler(error, context);
    }

    // デフォルト処理
    return this.defaultErrorHandler(error, context);
  }

  /**
   * エラーの種類を判定
   * @param {Error} error
   * @returns {string} エラータイプ
   */
  getErrorType(error) {
    if (error.name === 'NetworkError' || error.message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
    if (error.name === 'AuthenticationError' || error.message.includes('auth')) {
      return 'AUTH_ERROR';
    }
    if (error.message.includes('sheets') || error.message.includes('spreadsheet')) {
      return 'SHEETS_ERROR';
    }
    if (error.message.includes('quota') || error.message.includes('limit')) {
      return 'QUOTA_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * エラーをログに記録
   * @param {Error} error
   * @param {Object} context
   */
  logError(error, context) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      context,
      type: this.getErrorType(error)
    };

    this.errorLog.push(errorEntry);

    // ログサイズを制限
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // コンソールにも出力
    this.logger.error('[ErrorService]', errorEntry);
  }

  /**
   * デフォルトのエラーハンドラー
   * @param {Error} error
   * @param {Object} context
   */
  async defaultErrorHandler(error, context) {
    const errorType = this.getErrorType(error);

    switch (errorType) {
      case 'NETWORK_ERROR':
        return {
          success: false,
          error: 'ネットワークエラーが発生しました。接続を確認してください。',
          retry: true
        };

      case 'AUTH_ERROR':
        return {
          success: false,
          error: '認証エラーが発生しました。再度ログインしてください。',
          retry: false,
          action: 'reauth'
        };

      case 'SHEETS_ERROR':
        return {
          success: false,
          error: 'スプレッドシートアクセスエラーが発生しました。',
          retry: true
        };

      case 'QUOTA_ERROR':
        return {
          success: false,
          error: 'API制限に達しました。しばらく待ってから再試行してください。',
          retry: true,
          retryAfter: 60000 // 1分後
        };

      default:
        return {
          success: false,
          error: `予期しないエラーが発生しました: ${error.message}`,
          retry: false
        };
    }
  }

  /**
   * エラーをリトライ可能か判定
   * @param {Error} error
   * @returns {boolean}
   */
  isRetryable(error) {
    const errorType = this.getErrorType(error);
    return ['NETWORK_ERROR', 'SHEETS_ERROR', 'QUOTA_ERROR'].includes(errorType);
  }

  /**
   * エラーログを取得
   * @param {number} limit - 取得件数
   * @returns {Array} エラーログ
   */
  getErrorLog(limit = 10) {
    return this.errorLog.slice(-limit);
  }

  /**
   * エラーログをクリア
   */
  clearErrorLog() {
    this.errorLog = [];
  }

  /**
   * エラー統計を取得
   * @returns {Object} エラー統計
   */
  getErrorStatistics() {
    const stats = {};

    for (const entry of this.errorLog) {
      if (!stats[entry.type]) {
        stats[entry.type] = 0;
      }
      stats[entry.type]++;
    }

    return {
      total: this.errorLog.length,
      byType: stats,
      lastError: this.errorLog[this.errorLog.length - 1] || null
    };
  }

  /**
   * Chrome拡張機能特有のエラーを処理
   * @param {Error} error
   * @returns {Object} エラー処理結果
   */
  handleChromeError(error) {
    if (chrome.runtime.lastError) {
      return {
        success: false,
        error: chrome.runtime.lastError.message,
        chromeError: true
      };
    }

    return this.handleError(error);
  }
}

// シングルトンインスタンス
let errorServiceInstance = null;

export function getErrorService() {
  if (!errorServiceInstance) {
    errorServiceInstance = new ErrorService();

    // 標準エラーハンドラーを登録
    errorServiceInstance.registerHandler('AUTH_ERROR', async (error) => {
      // 認証エラー専用処理
      if (chrome.identity) {
        try {
          chrome.identity.removeCachedAuthToken({}, () => {
            console.log('認証トークンキャッシュをクリアしました');
          });
        } catch (e) {
          console.error('トークンクリアエラー:', e);
        }
      }

      return {
        success: false,
        error: '認証が必要です。再度ログインしてください。',
        action: 'reauth'
      };
    });
  }

  return errorServiceInstance;
}

export default ErrorService;