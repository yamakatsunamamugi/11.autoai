// error-handler.js - 統一エラーハンドリングシステム
//
// 企業レベルのエラー管理:
// - エクスポネンシャルバックオフリトライ
// - サーキットブレーカーパターン
// - エラー分類と自動復旧
// - 詳細なエラーメトリクスと監視

export class ErrorHandler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.config = {
      // リトライ設定
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 30000,
        enableJitter: true,
        retryableErrors: ["NetworkError", "TimeoutError", "ServiceUnavailable", "AIResponseError", "AITimeoutError", "ModelUnavailableError"],
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
          "AISecurityError",
          "PromptInjectionError",
        ],
        retriable: [
          "NetworkError",
          "TimeoutError",
          "ServiceUnavailable",
          "RateLimitError",
          "AIResponseError",
          "AITimeoutError",
          "ModelUnavailableError",
          "AIRateLimitError",
        ],
        permanent: ["ValidationError", "NotFoundError", "BadRequestError", "InvalidPromptError"],
        aiSpecific: [
          "ChatGPTError",
          "ClaudeError", 
          "GeminiError",
          "GensparkError",
          "ModelOverloadError",
          "ContentFilterError",
          "TokenLimitError",
        ],
        ...options.classification,
      },

      // AI特化設定
      aiHandling: {
        enabled: true,
        platforms: {
          chatgpt: {
            errorPatterns: ["rate limit", "token limit", "content policy", "moderation"],
            recoveryStrategies: ["waitAndRetry", "simplifyPrompt", "splitPrompt"],
            timeout: 180000,
          },
          claude: {
            errorPatterns: ["overloaded", "rate limit", "safety", "harmful content"],
            recoveryStrategies: ["waitAndRetry", "reformatPrompt", "useAlternativeModel"],
            timeout: 180000,
          },
          gemini: {
            errorPatterns: ["quota exceeded", "safety filter", "blocked", "harmful"],
            recoveryStrategies: ["waitAndRetry", "adjustSafetySettings", "reformatPrompt"],
            timeout: 180000,
          },
          genspark: {
            errorPatterns: ["service unavailable", "timeout", "server error"],
            recoveryStrategies: ["waitAndRetry", "useBackupEndpoint"],
            timeout: 180000,
          },
        },
        ...options.aiHandling,
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
   * リトライ付きでタスクを実行
   * @param {Function} task - 実行するタスク
   * @param {Object} options - オプション
   * @returns {Promise<*>} タスクの結果
   */
  async executeWithRetry(task, options = {}) {
    const retryConfig = { ...this.config.retry, ...options };
    let lastError = null;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        const result = await task();

        // 成功時
        if (attempt > 1) {
          this.metrics.recoverySuccesses++;
          this.logger.info(`リトライ成功: ${attempt}回目の試行で成功`);
        }

        return result;
      } catch (error) {
        lastError = error;

        // リトライ可能エラーかチェック
        if (!this.isRetryableError(error, retryConfig)) {
          throw error;
        }

        // 最後の試行の場合はリトライしない
        if (attempt === retryConfig.maxAttempts) {
          break;
        }

        // 遅延計算と待機
        const delay = this.calculateDelay(attempt, retryConfig);
        this.logger.warn(
          `リトライ ${attempt}/${retryConfig.maxAttempts}: ${delay}ms後に再試行`,
          {
            error: this.serializeError(error),
          },
        );

        await this.delay(delay);
        this.metrics.retriedErrors++;
      }
    }

    throw lastError;
  }

  /**
   * エラー分類
   * @param {Error} error - エラー
   * @returns {string} エラーカテゴリ
   */
  classifyError(error) {
    const errorType = error.constructor.name;
    const errorMessage = error.message.toLowerCase();

    // AI特化エラーの分類
    if (this.config.aiHandling.enabled) {
      const aiCategory = this.classifyAIError(error, errorMessage);
      if (aiCategory) {
        return aiCategory;
      }
    }

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
   * AI特化エラー分類
   * @param {Error} error - エラー
   * @param {string} errorMessage - エラーメッセージ（小文字）
   * @returns {string|null} AIエラーカテゴリまたはnull
   */
  classifyAIError(error, errorMessage) {
    // AI特化エラータイプの確認
    if (this.config.classification.aiSpecific.includes(error.constructor.name)) {
      return "aiSpecific";
    }

    // AI Platform別エラーパターンチェック
    for (const [platform, config] of Object.entries(this.config.aiHandling.platforms)) {
      for (const pattern of config.errorPatterns) {
        if (errorMessage.includes(pattern.toLowerCase())) {
          // プラットフォーム固有のエラー
          error.aiPlatform = platform;
          error.aiErrorPattern = pattern;
          
          // エラーパターンに応じたカテゴリ分類
          if (pattern.includes("rate limit") || pattern.includes("quota")) {
            return "retriable";
          } else if (pattern.includes("safety") || pattern.includes("policy") || pattern.includes("harmful")) {
            return "critical";
          } else if (pattern.includes("overloaded") || pattern.includes("unavailable")) {
            return "retriable";
          } else if (pattern.includes("token limit")) {
            return "permanent"; // プロンプトを短くする必要がある
          }
          
          return "aiSpecific";
        }
      }
    }

    // 一般的なAIエラーパターン
    const aiPatterns = [
      { pattern: "ai response", category: "retriable" },
      { pattern: "model unavailable", category: "retriable" },
      { pattern: "prompt injection", category: "critical" },
      { pattern: "content filter", category: "critical" },
      { pattern: "token limit exceeded", category: "permanent" },
      { pattern: "request interrupted by user", category: "retriable" },
      { pattern: "timeout_no_response", category: "retriable" },
      { pattern: "spreadsheet_write_failed", category: "retriable" },
      { pattern: "write_verification_failed", category: "retriable" },
    ];

    for (const { pattern, category } of aiPatterns) {
      if (errorMessage.includes(pattern)) {
        error.aiErrorType = pattern;
        return category;
      }
    }

    return null;
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
            context.retryOptions,
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
   * @param {number} attempt - 試行回数
   * @param {Object} config - リトライ設定
   * @returns {number} 遅延時間（ms）
   */
  calculateDelay(attempt, config) {
    const baseDelay =
      config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(baseDelay, config.maxDelay);

    // ジッター追加（ランダム要素）
    if (config.enableJitter) {
      const jitter = cappedDelay * 0.1 * Math.random();
      return Math.floor(cappedDelay + jitter);
    }

    return cappedDelay;
  }

  /**
   * 遅延実行
   * @param {number} ms - 遅延時間（ms）
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    // AI特化復旧戦略
    if (this.config.aiHandling.enabled) {
      this.setupAIRecoveryStrategies();
    }
  }

  /**
   * AI特化復旧戦略設定
   */
  setupAIRecoveryStrategies() {
    // ChatGPTエラー復旧
    this.errorRecoveryStrategies.set("ChatGPTError", async (error, context) => {
      return this.executeAIRecoveryStrategy(error, context, "chatgpt");
    });

    // Claudeエラー復旧
    this.errorRecoveryStrategies.set("ClaudeError", async (error, context) => {
      return this.executeAIRecoveryStrategy(error, context, "claude");
    });

    // Geminiエラー復旧
    this.errorRecoveryStrategies.set("GeminiError", async (error, context) => {
      return this.executeAIRecoveryStrategy(error, context, "gemini");
    });

    // Gensparkエラー復旧
    this.errorRecoveryStrategies.set("GensparkError", async (error, context) => {
      return this.executeAIRecoveryStrategy(error, context, "genspark");
    });

    // 一般的なAIエラー復旧
    this.errorRecoveryStrategies.set("AIResponseError", async (error, context) => {
      const platform = error.aiPlatform || this.detectAIPlatform(context);
      return this.executeAIRecoveryStrategy(error, context, platform);
    });

    this.errorRecoveryStrategies.set("AITimeoutError", async (error, context) => {
      this.logger.info("AIタイムアウトエラー復旧戦略実行");
      
      // 新しいウィンドウでリトライを提案
      return {
        success: false,
        error: error.message,
        action: "ai_timeout_recovery",
        suggestion: "新しいウィンドウでリトライすることを推奨します",
        retryWithNewWindow: true,
      };
    });

    this.errorRecoveryStrategies.set("ModelUnavailableError", async (error, context) => {
      this.logger.info("モデル利用不可エラー復旧戦略実行");
      
      return {
        success: false,
        error: error.message,
        action: "model_unavailable_recovery",
        suggestion: "しばらく待ってから再試行するか、別のAIモデルを使用してください",
        waitTime: 60000, // 60秒待機を推奨
      };
    });
  }

  /**
   * AI復旧戦略実行
   * @param {Error} error - エラー
   * @param {Object} context - コンテキスト
   * @param {string} platform - AIプラットフォーム
   * @returns {Promise<Object>} 復旧結果
   */
  async executeAIRecoveryStrategy(error, context, platform) {
    if (!platform || !this.config.aiHandling.platforms[platform]) {
      return {
        success: false,
        error: error.message,
        action: "no_platform_specific_recovery",
      };
    }

    const platformConfig = this.config.aiHandling.platforms[platform];
    const errorPattern = error.aiErrorPattern;
    
    this.logger.info(`${platform} エラー復旧戦略実行: ${errorPattern}`);

    // パターンに応じた復旧戦略選択
    for (const strategy of platformConfig.recoveryStrategies) {
      const result = await this.executeSpecificRecoveryStrategy(strategy, error, context, platform);
      if (result.success) {
        return result;
      }
    }

    // すべての戦略が失敗した場合
    return {
      success: false,
      error: error.message,
      action: "ai_recovery_failed",
      platform,
      attemptedStrategies: platformConfig.recoveryStrategies,
    };
  }

  /**
   * 特定の復旧戦略実行
   * @param {string} strategy - 戦略名
   * @param {Error} error - エラー
   * @param {Object} context - コンテキスト
   * @param {string} platform - AIプラットフォーム
   * @returns {Promise<Object>} 実行結果
   */
  async executeSpecificRecoveryStrategy(strategy, error, context, platform) {
    switch (strategy) {
      case "waitAndRetry":
        await this.delay(this.config.retry.initialDelay);
        return {
          success: true,
          action: "wait_and_retry",
          platform,
          waitTime: this.config.retry.initialDelay,
        };

      case "simplifyPrompt":
        return {
          success: true,
          action: "simplify_prompt",
          platform,
          suggestion: "プロンプトを簡素化して再試行することを推奨します",
          modifyPrompt: true,
        };

      case "splitPrompt":
        return {
          success: true,
          action: "split_prompt",
          platform,
          suggestion: "プロンプトを複数の小さな部分に分割して処理することを推奨します",
          splitPrompt: true,
        };

      case "reformatPrompt":
        return {
          success: true,
          action: "reformat_prompt",
          platform,
          suggestion: "プロンプトの形式を調整して再試行することを推奨します",
          reformatPrompt: true,
        };

      case "useAlternativeModel":
        return {
          success: true,
          action: "use_alternative_model",
          platform,
          suggestion: "別のモデルを使用して再試行することを推奨します",
          switchModel: true,
        };

      case "adjustSafetySettings":
        return {
          success: true,
          action: "adjust_safety_settings",
          platform,
          suggestion: "安全性設定を調整して再試行することを推奨します",
          adjustSafety: true,
        };

      case "useBackupEndpoint":
        return {
          success: true,
          action: "use_backup_endpoint",
          platform,
          suggestion: "バックアップエンドポイントを使用して再試行することを推奨します",
          useBackup: true,
        };

      default:
        return {
          success: false,
          action: "unknown_strategy",
          strategy,
        };
    }
  }

  /**
   * AIプラットフォーム検出
   * @param {Object} context - コンテキスト
   * @returns {string|null} プラットフォーム名
   */
  detectAIPlatform(context) {
    if (context.aiType) {
      const aiType = context.aiType.toLowerCase();
      if (aiType.includes('chatgpt')) return 'chatgpt';
      if (aiType.includes('claude')) return 'claude';
      if (aiType.includes('gemini')) return 'gemini';
      if (aiType.includes('genspark')) return 'genspark';
    }
    
    if (context.url) {
      const url = context.url.toLowerCase();
      if (url.includes('openai.com') || url.includes('chat.openai.com')) return 'chatgpt';
      if (url.includes('claude.ai') || url.includes('anthropic.com')) return 'claude';
      if (url.includes('gemini.google.com') || url.includes('bard.google.com')) return 'gemini';
      if (url.includes('genspark.ai')) return 'genspark';
    }
    
    return null;
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
