// logger.js - 統一ログシステム
//
// 企業レベルのログ管理:
// - 構造化ログ（JSON）とテキスト形式対応
// - レベル別ログ（trace, debug, info, warn, error, fatal）
// - 複数出力先（コンソール、ファイル、リモート）
// - パフォーマンス監視とメトリクス

export class Logger {
  static instances = new Map();

  constructor(name, options = {}) {
    this.name = name;
    this.options = {
      level: options.level || "info",
      format: options.format || "json", // json, text
      transport: options.transport || "console", // console, file, remote
      enableColors: options.enableColors !== false,
      includeTimestamp: options.includeTimestamp !== false,
      includeLevel: options.includeLevel !== false,
      includeName: options.includeName !== false,
      includeStack: options.includeStack || false,
      metadata: options.metadata || {},
      ...options,
    };

    this.levels = {
      trace: { value: 0, color: "\x1b[90m", label: "TRACE" },
      debug: { value: 1, color: "\x1b[36m", label: "DEBUG" },
      info: { value: 2, color: "\x1b[32m", label: "INFO" },
      warn: { value: 3, color: "\x1b[33m", label: "WARN" },
      error: { value: 4, color: "\x1b[31m", label: "ERROR" },
      fatal: { value: 5, color: "\x1b[35m", label: "FATAL" },
    };

    this.currentLevel = this.levels[this.options.level] || this.levels.info;
    this.transporters = this.initializeTransporters();
    this.metrics = {
      totalLogs: 0,
      logsByLevel: {},
      errors: 0,
      startTime: Date.now(),
    };

    // メトリクス初期化
    Object.keys(this.levels).forEach((level) => {
      this.metrics.logsByLevel[level] = 0;
    });
  }

  /**
   * ロガーインスタンス作成/取得
   * @param {string} name - ロガー名
   * @param {Object} options - オプション
   * @returns {Logger} ロガーインスタンス
   */
  static create(name, options = {}) {
    if (Logger.instances.has(name)) {
      return Logger.instances.get(name);
    }

    const logger = new Logger(name, options);
    Logger.instances.set(name, logger);
    return logger;
  }

  /**
   * 子ロガー作成
   * @param {string} childName - 子ロガー名
   * @param {Object} additionalOptions - 追加オプション
   * @returns {Logger} 子ロガー
   */
  child(childName, additionalOptions = {}) {
    const fullName = `${this.name}.${childName}`;
    const childOptions = {
      ...this.options,
      ...additionalOptions,
      metadata: {
        ...this.options.metadata,
        ...additionalOptions.metadata,
        parent: this.name,
      },
    };

    return Logger.create(fullName, childOptions);
  }

  /**
   * トランスポーター初期化
   * @returns {Array} トランスポーター配列
   */
  initializeTransporters() {
    const transporters = [];

    switch (this.options.transport) {
      case "console":
        transporters.push(this.createConsoleTransporter());
        break;
      case "file":
        transporters.push(this.createFileTransporter());
        break;
      case "remote":
        transporters.push(this.createRemoteTransporter());
        break;
      case "multiple":
        transporters.push(
          this.createConsoleTransporter(),
          this.createFileTransporter(),
        );
        break;
      default:
        transporters.push(this.createConsoleTransporter());
    }

    return transporters;
  }

  /**
   * コンソールトランスポーター作成
   * @returns {Object} トランスポーター
   */
  createConsoleTransporter() {
    return {
      name: "console",
      write: (logEntry) => {
        const formatted = this.formatLog(logEntry);

        switch (logEntry.level) {
          case "error":
          case "fatal":
            console.error(formatted);
            break;
          case "warn":
            console.warn(formatted);
            break;
          case "debug":
          case "trace":
            console.debug(formatted);
            break;
          default:
            console.log(formatted);
        }
      },
    };
  }

  /**
   * ファイルトランスポーター作成
   * @returns {Object} トランスポーター
   */
  createFileTransporter() {
    return {
      name: "file",
      write: (logEntry) => {
        // ブラウザ環境ではファイル書き込み不可
        if (typeof window !== "undefined") {
          return;
        }

        // Node.js環境での実装（実際のプロジェクトでは fs モジュール使用）
        const formatted = this.formatLog(logEntry);
        console.log(`[FILE] ${formatted}`);
      },
    };
  }

  /**
   * リモートトランスポーター作成
   * @returns {Object} トランスポーター
   */
  createRemoteTransporter() {
    return {
      name: "remote",
      write: (logEntry) => {
        // リモートログサービスへの送信（実装省略）
        const formatted = this.formatLog(logEntry);
        console.log(`[REMOTE] ${formatted}`);
      },
    };
  }

  /**
   * ログエントリ作成
   * @param {string} level - ログレベル
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   * @returns {Object} ログエントリ
   */
  createLogEntry(level, message, data = null) {
    const timestamp = new Date();
    const logEntry = {
      timestamp,
      level,
      name: this.name,
      message,
      data,
      metadata: this.options.metadata,
    };

    // スタック情報追加
    if (this.options.includeStack && (level === "error" || level === "fatal")) {
      logEntry.stack = this.captureStack();
    }

    return logEntry;
  }

  /**
   * ログフォーマット
   * @param {Object} logEntry - ログエントリ
   * @returns {string} フォーマット済みログ
   */
  formatLog(logEntry) {
    if (this.options.format === "json") {
      return this.formatAsJson(logEntry);
    } else {
      return this.formatAsText(logEntry);
    }
  }

  /**
   * JSONフォーマット
   * @param {Object} logEntry - ログエントリ
   * @returns {string} JSON文字列
   */
  formatAsJson(logEntry) {
    const jsonLog = {
      timestamp: logEntry.timestamp.toISOString(),
      level: logEntry.level,
      name: logEntry.name,
      message: logEntry.message,
    };

    if (logEntry.data) {
      jsonLog.data = logEntry.data;
    }

    if (logEntry.stack) {
      jsonLog.stack = logEntry.stack;
    }

    if (Object.keys(logEntry.metadata).length > 0) {
      jsonLog.metadata = logEntry.metadata;
    }

    return JSON.stringify(jsonLog);
  }

  /**
   * テキストフォーマット
   * @param {Object} logEntry - ログエントリ
   * @returns {string} テキスト文字列
   */
  formatAsText(logEntry) {
    const parts = [];
    const levelInfo = this.levels[logEntry.level];

    // タイムスタンプ
    if (this.options.includeTimestamp) {
      parts.push(`[${logEntry.timestamp.toISOString()}]`);
    }

    // レベル
    if (this.options.includeLevel) {
      const levelLabel = levelInfo.label;
      if (this.options.enableColors) {
        parts.push(`${levelInfo.color}${levelLabel}\x1b[0m`);
      } else {
        parts.push(`[${levelLabel}]`);
      }
    }

    // ロガー名
    if (this.options.includeName) {
      parts.push(`[${logEntry.name}]`);
    }

    // メッセージ
    parts.push(logEntry.message);

    // データ
    if (logEntry.data) {
      if (typeof logEntry.data === "object") {
        parts.push(JSON.stringify(logEntry.data, null, 2));
      } else {
        parts.push(String(logEntry.data));
      }
    }

    // スタック
    if (logEntry.stack) {
      parts.push(`\nStack: ${logEntry.stack}`);
    }

    return parts.join(" ");
  }

  /**
   * スタック情報取得
   * @returns {string} スタック文字列
   */
  captureStack() {
    const error = new Error();
    const stack = error.stack || "";
    const lines = stack.split("\n");

    // Logger内部の呼び出しを除外
    return lines
      .filter((line) => !line.includes("logger.js") && !line.includes("Logger"))
      .slice(0, 10) // 最大10行
      .join("\n");
  }

  /**
   * ログ出力
   * @param {string} level - ログレベル
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   */
  log(level, message, data = null) {
    const levelInfo = this.levels[level];
    if (!levelInfo || levelInfo.value < this.currentLevel.value) {
      return; // レベル不足でスキップ
    }

    try {
      const logEntry = this.createLogEntry(level, message, data);
      this.writeToTransporters(logEntry);
      this.updateMetrics(level);
    } catch (error) {
      console.error("ログ出力エラー:", error);
      this.metrics.errors++;
    }
  }

  /**
   * トランスポーターへの書き込み
   * @param {Object} logEntry - ログエントリ
   */
  writeToTransporters(logEntry) {
    for (const transporter of this.transporters) {
      try {
        transporter.write(logEntry);
      } catch (error) {
        console.error(`トランスポーター ${transporter.name} でエラー:`, error);
      }
    }
  }

  /**
   * メトリクス更新
   * @param {string} level - ログレベル
   */
  updateMetrics(level) {
    this.metrics.totalLogs++;
    this.metrics.logsByLevel[level]++;
  }

  // ===== ログレベル別メソッド =====

  trace(message, data) {
    this.log("trace", message, data);
  }

  debug(message, data) {
    this.log("debug", message, data);
  }

  info(message, data) {
    this.log("info", message, data);
  }

  warn(message, data) {
    this.log("warn", message, data);
  }

  error(message, data) {
    this.log("error", message, data);
  }

  fatal(message, data) {
    this.log("fatal", message, data);
  }

  // ===== ユーティリティメソッド =====

  /**
   * ログレベル変更
   * @param {string} level - 新しいレベル
   */
  setLevel(level) {
    if (this.levels[level]) {
      this.currentLevel = this.levels[level];
      this.options.level = level;
    } else {
      throw new Error(`無効なログレベル: ${level}`);
    }
  }

  /**
   * ログレベル取得
   * @returns {string} 現在のレベル
   */
  getLevel() {
    return this.options.level;
  }

  /**
   * フォーマット変更
   * @param {string} format - 新しいフォーマット
   */
  setFormat(format) {
    if (["json", "text"].includes(format)) {
      this.options.format = format;
    } else {
      throw new Error(`無効なフォーマット: ${format}`);
    }
  }

  /**
   * メタデータ追加
   * @param {Object} metadata - メタデータ
   */
  addMetadata(metadata) {
    this.options.metadata = { ...this.options.metadata, ...metadata };
  }

  /**
   * メタデータクリア
   */
  clearMetadata() {
    this.options.metadata = {};
  }

  /**
   * パフォーマンス計測開始
   * @param {string} label - ラベル
   * @returns {Function} 終了関数
   */
  time(label) {
    const startTime = Date.now();
    this.debug(`タイマー開始: ${label}`);

    return (data = null) => {
      const duration = Date.now() - startTime;
      this.info(`タイマー終了: ${label} - ${duration}ms`, data);
      return duration;
    };
  }

  /**
   * メトリクス取得
   * @returns {Object} メトリクス
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime,
      logsPerMinute: this.calculateLogsPerMinute(),
    };
  }

  /**
   * 分あたりログ数計算
   * @returns {number} 分あたりログ数
   */
  calculateLogsPerMinute() {
    const uptimeMinutes = (Date.now() - this.metrics.startTime) / 60000;
    return uptimeMinutes > 0
      ? Math.round(this.metrics.totalLogs / uptimeMinutes)
      : 0;
  }

  /**
   * ログ統計取得
   * @returns {Object} 統計情報
   */
  getStatistics() {
    const metrics = this.getMetrics();

    return {
      name: this.name,
      level: this.options.level,
      format: this.options.format,
      transport: this.options.transport,
      totalLogs: metrics.totalLogs,
      logsByLevel: metrics.logsByLevel,
      errorRate:
        metrics.totalLogs > 0 ? (metrics.errors / metrics.totalLogs) * 100 : 0,
      logsPerMinute: metrics.logsPerMinute,
      uptime: metrics.uptime,
    };
  }

  /**
   * 設定更新
   * @param {Object} newOptions - 新しいオプション
   */
  configure(newOptions) {
    this.options = { ...this.options, ...newOptions };

    // レベル更新
    if (newOptions.level) {
      this.setLevel(newOptions.level);
    }

    // トランスポーター再初期化
    if (newOptions.transport) {
      this.transporters = this.initializeTransporters();
    }
  }

  /**
   * ロガーのシャットダウン
   */
  shutdown() {
    this.info("ロガーシャットダウン", {
      finalMetrics: this.getMetrics(),
    });

    // インスタンスキャッシュから削除
    Logger.instances.delete(this.name);
  }

  /**
   * デバッグ情報取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      name: this.name,
      options: this.options,
      currentLevel: this.currentLevel,
      transporterCount: this.transporters.length,
      metrics: this.getMetrics(),
    };
  }

  // ===== 静的メソッド =====

  /**
   * 全ロガーのメトリクス取得
   * @returns {Object} 全メトリクス
   */
  static getAllMetrics() {
    const allMetrics = {};

    for (const [name, logger] of Logger.instances.entries()) {
      allMetrics[name] = logger.getMetrics();
    }

    return allMetrics;
  }

  /**
   * 全ロガーのレベル変更
   * @param {string} level - 新しいレベル
   */
  static setGlobalLevel(level) {
    for (const logger of Logger.instances.values()) {
      logger.setLevel(level);
    }
  }

  /**
   * 全ロガーのシャットダウン
   */
  static shutdownAll() {
    for (const logger of Logger.instances.values()) {
      logger.shutdown();
    }
    Logger.instances.clear();
  }
}
