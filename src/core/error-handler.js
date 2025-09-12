// error-handler.js - 統一エラーハンドリングシステム
//
// 企業レベルのエラー管理:
// - エクスポネンシャルバックオフリトライ（RetryManagerに統合済み）
// - サーキットブレーカーパターン
// - エラー分類と自動復旧
// - 詳細なエラーメトリクスと監視

import { RetryManager } from '../utils/retry-manager.js';

export class ErrorHandler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    
    // RetryManagerを初期化
    this.retryManager = new RetryManager(this.logger);
    
    this.config = {
      // リトライ設定（RetryManagerに移行済み、互換性のために保持）
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 30000,
        enableJitter: true,
        retryableErrors: ["NetworkError", "TimeoutError", "ServiceUnavailable"],
        ...options.retryConfig,
      },

      // サーキットブレーカー設定
      circuitBreaker: {
        failureThreshold: 5,
        timeout: 60000,
        monitoringPeriod: 10000,
        enabled: true,
        ...options.circuitBreaker,
      },

      // エラー分類設定
      classification: {
        critical: [
          "SecurityError",
          "AuthenticationError",
          "AuthorizationError",
        ],
        retriable: [
          "NetworkError",
          "TimeoutError",
          "ServiceUnavailable",
          "RateLimitError",
        ],
        permanent: ["ValidationError", "NotFoundError", "BadRequestError"],
        ...options.classification,
      },
    };

    this.circuitBreakerState = {
      status: "CLOSED", // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      lastFailureTime: null,
      successCount: 0,
    };

    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCategory: {},
      retriedErrors: 0,
      circuitBreakerTrips: 0,
      recoverySuccesses: 0,
      startTime: Date.now(),
    };

    this.errorRecoveryStrategies = new Map();
    this.setupDefaultRecoveryStrategies();
  }

  /**
   * エラーハンドリングのメインメソッド
   * @param {Error} error - 処理するエラー
   * @param {Object} context - エラーコンテキスト
   * @returns {Promise<Object>} 処理結果
   */
  async handle(error, context = {}) {
    this.logger.debug("エラーハンドリング開始", {
      error: this.serializeError(error),
      context,
    });

    try {
      // エラーメトリクス更新
      this.updateErrorMetrics(error);

      // エラー分類
      const category = this.classifyError(error);

      // サーキットブレーカーチェック
      if (this.config.circuitBreaker.enabled && this.isCircuitOpen()) {
        throw new Error(
          "サーキットブレーカーが開いています。しばらく後に再試行してください。",
        );
      }

      // エラーに応じた処理戦略決定
      const strategy = this.determineStrategy(error, category, context);

      // 戦略実行
      const result = await this.executeStrategy(strategy, error, context);

      // 成功時の処理
      this.handleSuccess(category);

      return result;
    } catch (handlingError) {
      // エラーハンドリング自体のエラー
      this.logger.error("エラーハンドリング失敗", {
        originalError: this.serializeError(error),
        handlingError: this.serializeError(handlingError),
        context,
      });

      // サーキットブレーカー更新
      this.recordFailure();

      throw handlingError;
    }
  }

  /**
   * リトライ付きでタスクを実行（RetryManagerを使用）
   * @param {Function} task - 実行するタスク
   * @param {Object} options - オプション
   * @returns {Promise<*>} タスクの結果
   */
  async executeWithRetry(task, options = {}) {
    const retryConfig = { ...this.config.retry, ...options };
    
    // RetryManagerのexecuteWithExponentialBackoffを使用
    const result = await this.retryManager.executeWithExponentialBackoff({
      action: task,
      isSuccess: (result) => result !== undefined && result !== null,
      maxRetries: retryConfig.maxAttempts,
      initialDelay: retryConfig.initialDelay,
      maxDelay: retryConfig.maxDelay,
      actionName: options.actionName || '処理',
      context: options.context || {}
    });

    if (result.success) {
      if (result.retryCount > 0) {
        this.metrics.recoverySuccesses++;
        this.logger.info(`リトライ成功: ${result.retryCount + 1}回目の試行で成功`);
      }
      return result.result;
    } else {
      this.metrics.retriedErrors += result.retryCount;
      throw result.error || new Error('処理が失敗しました');
    }
  }

  /**
   * エラー分類
   * @param {Error} error - エラー
   * @returns {string} エラーカテゴリ
   */
  classifyError(error) {
    const errorType = error.constructor.name;
    const errorMessage = error.message.toLowerCase();

    // 設定ベースの分類
    for (const [category, types] of Object.entries(
      this.config.classification,
    )) {
      if (types.includes(errorType)) {
        return category;
      }
    }

    // メッセージベースの分類
    if (errorMessage.includes("network") || errorMessage.includes("timeout")) {
      return "retriable";
    }

    if (
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("forbidden")
    ) {
      return "critical";
    }

    if (
      errorMessage.includes("not found") ||
      errorMessage.includes("invalid")
    ) {
      return "permanent";
    }

    return "unknown";
  }

  /**
   * 処理戦略決定
   * @param {Error} error - エラー
   * @param {string} category - エラーカテゴリ
   * @param {Object} context - コンテキスト
   * @returns {Object} 戦略情報
   */
  determineStrategy(error, category, context) {
    const strategy = {
      type: "default",
      shouldRetry: false,
      shouldRecover: false,
      shouldEscalate: false,
      customAction: null,
    };

    switch (category) {
      case "retriable":
        strategy.type = "retry";
        strategy.shouldRetry = true;
        break;

      case "critical":
        strategy.type = "escalate";
        strategy.shouldEscalate = true;
        break;

      case "permanent":
        strategy.type = "fail";
        strategy.shouldRecover = false;
        break;

      default:
        // カスタム復旧戦略をチェック
        const recoveryStrategy = this.errorRecoveryStrategies.get(
          error.constructor.name,
        );
        if (recoveryStrategy) {
          strategy.type = "custom";
          strategy.customAction = recoveryStrategy;
          strategy.shouldRecover = true;
        }
    }

    return strategy;
  }

  /**
   * 戦略実行
   * @param {Object} strategy - 戦略
   * @param {Error} error - エラー
   * @param {Object} context - コンテキスト
   * @returns {Promise<Object>} 実行結果
   */
  async executeStrategy(strategy, error, context) {
    switch (strategy.type) {
      case "retry":
        if (context.task) {
          return await this.executeWithRetry(
            context.task,
            { ...context.retryOptions, actionName: 'エラー復旧リトライ' },
          );
        } else {
          return {
            success: false,
            error: error.message,
            action: "retry_recommended",
          };
        }

      case "custom":
        return await strategy.customAction(error, context);

      case "escalate":
        await this.escalateError(error, context);
        return { success: false, error: error.message, action: "escalated" };

      case "fail":
      default:
        return { success: false, error: error.message, action: "failed" };
    }
  }

  /**
   * エラーエスカレーション
   * @param {Error} error - エラー
   * @param {Object} context - コンテキスト
   */
  async escalateError(error, context) {
    this.logger.error("重大エラーをエスカレーション", {
      error: this.serializeError(error),
      context,
      timestamp: new Date().toISOString(),
    });

    // アラート送信（実装は省略）
    // await this.sendAlert(error, context);
  }

  /**
   * サーキットブレーカー状態チェック
   * @returns {boolean} サーキットが開いているか
   */
  isCircuitOpen() {
    const { status, lastFailureTime } = this.circuitBreakerState;
    const { timeout } = this.config.circuitBreaker;

    if (status === "OPEN") {
      if (Date.now() - lastFailureTime > timeout) {
        // タイムアウト後、HALF_OPENに移行
        this.circuitBreakerState.status = "HALF_OPEN";
        this.circuitBreakerState.successCount = 0;
        this.logger.info("サーキットブレーカーをHALF_OPENに移行");
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * 失敗記録
   */
  recordFailure() {
    this.circuitBreakerState.failureCount++;
    this.circuitBreakerState.lastFailureTime = Date.now();

    const { failureThreshold } = this.config.circuitBreaker;

    if (this.circuitBreakerState.failureCount >= failureThreshold) {
      this.circuitBreakerState.status = "OPEN";
      this.circuitBreakerState.successCount = 0;
      this.metrics.circuitBreakerTrips++;

      this.logger.warn("サーキットブレーカーをOPENに移行", {
        failureCount: this.circuitBreakerState.failureCount,
        threshold: failureThreshold,
      });
    }
  }

  /**
   * 成功処理
   * @param {string} category - エラーカテゴリ
   */
  handleSuccess(category) {
    if (this.circuitBreakerState.status === "HALF_OPEN") {
      this.circuitBreakerState.successCount++;

      // 連続成功でCLOSEに復帰
      if (this.circuitBreakerState.successCount >= 3) {
        this.circuitBreakerState.status = "CLOSED";
        this.circuitBreakerState.failureCount = 0;
        this.logger.info("サーキットブレーカーをCLOSEDに復帰");
      }
    }
  }

  /**
   * リトライ可能エラーチェック
   * @param {Error} error - エラー
   * @param {Object} config - リトライ設定
   * @returns {boolean} リトライ可能か
   */
  isRetryableError(error, config) {
    const errorType = error.constructor.name;
    return (
      config.retryableErrors.includes(errorType) ||
      this.classifyError(error) === "retriable"
    );
  }

  /**
   * 遅延時間計算（エクスポネンシャルバックオフ）
   * @deprecated RetryManagerに移行済み。互換性のために残存
   * @param {number} attempt - 試行回数
   * @param {Object} config - リトライ設定
   * @returns {number} 遅延時間（ms）
   */
  calculateDelay(attempt, config) {
    // RetryManagerのdelayメソッドを使用
    return this.retryManager.delay ? 
      Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      ) : 
      config.initialDelay;
  }

  /**
   * 遅延実行
   * @deprecated RetryManagerに移行済み。互換性のために残存
   * @param {number} ms - 遅延時間（ms）
   * @returns {Promise<void>}
   */
  delay(ms) {
    // RetryManagerのdelayメソッドを使用
    return this.retryManager.delay(ms);
  }

  /**
   * エラーメトリクス更新
   * @param {Error} error - エラー
   */
  updateErrorMetrics(error) {
    this.metrics.totalErrors++;

    const errorType = error.constructor.name;
    this.metrics.errorsByType[errorType] =
      (this.metrics.errorsByType[errorType] || 0) + 1;

    const category = this.classifyError(error);
    this.metrics.errorsByCategory[category] =
      (this.metrics.errorsByCategory[category] || 0) + 1;
  }

  /**
   * エラーシリアライズ
   * @param {Error} error - エラー
   * @returns {Object} シリアライズされたエラー
   */
  serializeError(error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * デフォルト復旧戦略設定
   */
  setupDefaultRecoveryStrategies() {
    // ネットワークエラー復旧
    this.errorRecoveryStrategies.set("NetworkError", async (error, context) => {
      this.logger.info("ネットワークエラー復旧戦略実行");

      // 接続確認
      if (navigator.onLine === false) {
        throw new Error(
          "オフライン状態です。ネットワーク接続を確認してください。",
        );
      }

      // 代替エンドポイント試行（実装省略）
      return {
        success: false,
        error: error.message,
        action: "network_recovery_attempted",
      };
    });

    // 認証エラー復旧
    this.errorRecoveryStrategies.set(
      "AuthenticationError",
      async (error, context) => {
        this.logger.info("認証エラー復旧戦略実行");

        // トークン再取得試行（実装省略）
        return {
          success: false,
          error: error.message,
          action: "auth_recovery_attempted",
        };
      },
    );
  }

  /**
   * カスタム復旧戦略追加
   * @param {string} errorType - エラータイプ
   * @param {Function} strategy - 復旧戦略関数
   */
  addRecoveryStrategy(errorType, strategy) {
    this.errorRecoveryStrategies.set(errorType, strategy);
  }

  /**
   * メトリクス取得
   * @returns {Object} エラーメトリクス
   */
  getMetrics() {
    const uptime = Date.now() - this.metrics.startTime;

    return {
      ...this.metrics,
      uptime,
      errorRate: this.calculateErrorRate(),
      circuitBreakerStatus: this.circuitBreakerState.status,
      meanTimeBetweenFailures: this.calculateMTBF(uptime),
    };
  }

  /**
   * エラー率計算
   * @returns {number} エラー率（パーセント）
   */
  calculateErrorRate() {
    // 実装は省略（総リクエスト数が必要）
    return 0;
  }

  /**
   * 平均故障間隔（MTBF）計算
   * @param {number} uptime - 稼働時間
   * @returns {number} MTBF（ms）
   */
  calculateMTBF(uptime) {
    return this.metrics.totalErrors > 0
      ? uptime / this.metrics.totalErrors
      : uptime;
  }

  /**
   * ヘルスチェック
   * @returns {Object} ヘルス状態
   */
  getHealthStatus() {
    const metrics = this.getMetrics();
    const isHealthy =
      this.circuitBreakerState.status !== "OPEN" && metrics.errorRate < 5.0; // 5%未満

    return {
      status: isHealthy ? "healthy" : "degraded",
      circuitBreaker: this.circuitBreakerState.status,
      errorRate: metrics.errorRate,
      totalErrors: metrics.totalErrors,
      lastCheck: new Date().toISOString(),
    };
  }

  /**
   * 設定更新
   * @param {Object} newConfig - 新しい設定
   */
  configure(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
      retry: { ...this.config.retry, ...newConfig.retry },
      circuitBreaker: {
        ...this.config.circuitBreaker,
        ...newConfig.circuitBreaker,
      },
      classification: {
        ...this.config.classification,
        ...newConfig.classification,
      },
    };
  }

  /**
   * 統計リセット
   */
  resetMetrics() {
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCategory: {},
      retriedErrors: 0,
      circuitBreakerTrips: 0,
      recoverySuccesses: 0,
      startTime: Date.now(),
    };

    this.circuitBreakerState = {
      status: "CLOSED",
      failureCount: 0,
      lastFailureTime: null,
      successCount: 0,
    };
  }

  /**
   * デバッグ情報取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      config: this.config,
      circuitBreakerState: this.circuitBreakerState,
      metrics: this.getMetrics(),
      recoveryStrategies: Array.from(this.errorRecoveryStrategies.keys()),
      healthStatus: this.getHealthStatus(),
    };
  }
}
