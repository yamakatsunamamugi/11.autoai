// config-manager.js - 設定駆動型アーキテクチャの中核
//
// 企業レベルの設定管理:
// - 階層的設定（環境変数 > 設定ファイル > デフォルト）
// - 動的設定更新とホットリロード
// - 設定の検証と型チェック
// - 機密情報の安全な管理

export class ConfigManager {
  static instance = null;

  constructor(initialConfig = {}) {
    this.config = new Map();
    this.defaults = new Map();
    this.validators = new Map();
    this.listeners = new Map();
    this.isSealed = false;

    // デフォルト設定の読み込み
    this.loadDefaults();

    // 初期設定のマージ
    this.merge(initialConfig);

    // 環境変数からの設定読み込み
    this.loadFromEnvironment();
  }

  /**
   * シングルトンインスタンス取得
   */
  static getInstance(config = null) {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(config);
    }
    return ConfigManager.instance;
  }

  /**
   * デフォルト設定の読み込み
   */
  loadDefaults() {
    const defaults = {
      // ログ設定
      "logging.level": "info",
      "logging.format": "json",
      "logging.transport": "console",
      "logging.maxFileSize": "10MB",
      "logging.maxFiles": 5,

      // ストリーミング処理設定
      "streaming.maxConcurrentWindows": 4,
      "streaming.windowLayout": "quadrant", // quadrant, linear, custom
      "streaming.windowReuse": true,
      "streaming.taskTimeout": 300000, // 5分
      "streaming.retryDelay": 1000,

      // AI設定
      "ai.supportedTypes": ["claude", "gemini", "chatgpt"],
      "ai.urls.claude": "https://claude.ai/new",
      "ai.urls.gemini": "https://gemini.google.com/app",
      "ai.urls.chatgpt": "https://chatgpt.com/?model=gpt-4o",
      "ai.urls.chatgpt-o3": "https://chatgpt.com/?model=o3",
      "ai.urls.chatgpt-o3-pro": "https://chatgpt.com/?model=o3-pro",

      // エラーハンドリング設定
      "error.retry.maxAttempts": 3,
      "error.retry.backoffMultiplier": 2,
      "error.retry.initialDelay": 1000,
      "error.circuitBreaker.failureThreshold": 5,
      "error.circuitBreaker.timeout": 60000,
      "error.circuitBreaker.monitoringPeriod": 10000,

      // セキュリティ設定
      "security.enableSanitization": true,
      "security.maxRequestSize": "10MB",
      "security.allowedOrigins": ["chrome-extension://"],

      // パフォーマンス設定
      "performance.enableMetrics": true,
      "performance.metricsInterval": 5000,
      "performance.maxMemoryUsage": "500MB",

      // ウィンドウ設定
      "window.defaultWidth": 960,
      "window.defaultHeight": 540,
      "window.positions.quadrant": [
        { left: 0, top: 0 }, // 左上
        { left: 0.5, top: 0 }, // 右上
        { left: 0, top: 0.5 }, // 左下
        { left: 0.5, top: 0.5 }, // 右下
      ],

      // 認証設定
      "auth.tokenRefreshInterval": 3600000, // 1時間
      "auth.maxRetries": 3,
      "auth.interactiveMode": true,

      // プラグイン設定
      "plugins.enabled": [],
      "plugins.autoLoad": true,
      "plugins.searchPaths": ["../plugins/", "./plugins/"],

      // デバッグ設定
      "debug.enabled": false,
      "debug.verboseLogging": false,
      "debug.preserveState": false,
    };

    for (const [key, value] of Object.entries(defaults)) {
      this.defaults.set(key, value);
      this.config.set(key, value);
    }
  }

  /**
   * 環境変数からの設定読み込み
   */
  loadFromEnvironment() {
    if (typeof process === "undefined" || !process.env) {
      return; // ブラウザ環境では環境変数なし
    }

    const envPrefix = "AUTOAI_";

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(envPrefix)) {
        const configKey = key
          .substring(envPrefix.length)
          .toLowerCase()
          .replace(/_/g, ".");

        this.set(configKey, this.parseEnvValue(value));
      }
    }
  }

  /**
   * 環境変数値のパース
   */
  parseEnvValue(value) {
    // Boolean値
    if (value === "true") return true;
    if (value === "false") return false;

    // 数値
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

    // JSON配列・オブジェクト
    if (value.startsWith("[") || value.startsWith("{")) {
      try {
        return JSON.parse(value);
      } catch {
        // パースエラーの場合は文字列として扱う
      }
    }

    return value;
  }

  /**
   * 設定値取得
   * @param {string} key - 設定キー（ドット記法対応）
   * @param {*} defaultValue - デフォルト値
   * @returns {*} 設定値
   */
  get(key, defaultValue = undefined) {
    if (this.config.has(key)) {
      return this.config.get(key);
    }

    // ネストしたキーのサポート
    const parts = key.split(".");
    let current = this.getConfigObject();

    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        return defaultValue !== undefined
          ? defaultValue
          : this.defaults.get(key);
      }
    }

    return current;
  }

  /**
   * 設定値設定
   * @param {string} key - 設定キー
   * @param {*} value - 設定値
   */
  set(key, value) {
    if (this.isSealed) {
      throw new Error("設定は封印されています");
    }

    // 検証実行
    if (this.validators.has(key)) {
      const validator = this.validators.get(key);
      if (!validator(value)) {
        throw new Error(`設定値の検証に失敗: ${key} = ${value}`);
      }
    }

    const oldValue = this.config.get(key);
    this.config.set(key, value);

    // 変更通知
    this.notifyListeners(key, value, oldValue);
  }

  /**
   * 設定が存在するかチェック
   * @param {string} key - 設定キー
   * @returns {boolean}
   */
  has(key) {
    return this.config.has(key) || this.defaults.has(key);
  }

  /**
   * 設定をマージ
   * @param {Object} newConfig - 新しい設定
   */
  merge(newConfig) {
    for (const [key, value] of Object.entries(this.flattenObject(newConfig))) {
      this.set(key, value);
    }
  }

  /**
   * 設定の更新
   * @param {Object} updates - 更新する設定
   */
  update(updates) {
    const affectedKeys = [];

    for (const [key, value] of Object.entries(this.flattenObject(updates))) {
      this.set(key, value);
      affectedKeys.push(key);
    }

    // 一括更新通知
    this.notifyBulkUpdate(affectedKeys);
  }

  /**
   * 検証ルール追加
   * @param {string} key - 設定キー
   * @param {Function} validator - 検証関数
   */
  addValidator(key, validator) {
    this.validators.set(key, validator);
  }

  /**
   * 変更リスナー追加
   * @param {string} key - 設定キー
   * @param {Function} listener - リスナー関数
   */
  addListener(key, listener) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(listener);
  }

  /**
   * 変更リスナー削除
   * @param {string} key - 設定キー
   * @param {Function} listener - リスナー関数
   */
  removeListener(key, listener) {
    const listeners = this.listeners.get(key);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * リスナーへの通知
   * @param {string} key - 設定キー
   * @param {*} newValue - 新しい値
   * @param {*} oldValue - 古い値
   */
  notifyListeners(key, newValue, oldValue) {
    const listeners = this.listeners.get(key) || [];
    for (const listener of listeners) {
      try {
        listener(newValue, oldValue, key);
      } catch (error) {
        console.error(`設定変更リスナーでエラー (${key}):`, error);
      }
    }
  }

  /**
   * 一括更新通知
   * @param {Array} affectedKeys - 影響を受けたキー
   */
  notifyBulkUpdate(affectedKeys) {
    // 'config.bulkUpdate' リスナーに通知
    const bulkListeners = this.listeners.get("config.bulkUpdate") || [];
    for (const listener of bulkListeners) {
      try {
        listener(affectedKeys);
      } catch (error) {
        console.error("一括更新リスナーでエラー:", error);
      }
    }
  }

  /**
   * 影響を受けるサービス取得
   * @returns {Array} サービス名配列
   */
  getAffectedServices() {
    // 実装は省略（設定変更時に再構成が必要なサービスを返す）
    return ["StreamProcessor", "TaskGenerator"];
  }

  /**
   * 公開可能な設定取得（機密情報除去）
   * @returns {Object} 公開設定
   */
  getPublicConfig() {
    const publicConfig = {};
    const sensitiveKeys = ["auth.token", "security.", "credentials."];

    for (const [key, value] of this.config.entries()) {
      const isSensitive = sensitiveKeys.some((pattern) =>
        key.includes(pattern),
      );
      if (!isSensitive) {
        publicConfig[key] = value;
      }
    }

    return publicConfig;
  }

  /**
   * 設定の検証
   * @returns {boolean} 検証結果
   */
  isValid() {
    try {
      for (const [key, validator] of this.validators.entries()) {
        const value = this.get(key);
        if (!validator(value)) {
          console.error(`設定検証失敗: ${key}`);
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error("設定検証エラー:", error);
      return false;
    }
  }

  /**
   * 設定を封印（変更不可にする）
   */
  seal() {
    this.isSealed = true;
  }

  /**
   * 設定の封印を解除
   */
  unseal() {
    this.isSealed = false;
  }

  /**
   * オブジェクトのフラット化
   * @param {Object} obj - オブジェクト
   * @param {string} prefix - プレフィックス
   * @returns {Object} フラット化されたオブジェクト
   */
  flattenObject(obj, prefix = "") {
    const flattened = {};

    if (!obj || typeof obj !== "object") {
      return flattened;
    }

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  }

  /**
   * 設定オブジェクト取得
   * @returns {Object} 設定オブジェクト
   */
  getConfigObject() {
    const config = {};

    for (const [key, value] of this.config.entries()) {
      const parts = key.split(".");
      let current = config;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part];
      }

      current[parts[parts.length - 1]] = value;
    }

    return config;
  }

  /**
   * 全設定のエクスポート
   * @returns {Object} 全設定
   */
  export() {
    return Object.fromEntries(this.config.entries());
  }

  /**
   * 設定のインポート
   * @param {Object} config - インポートする設定
   */
  import(config) {
    this.config.clear();
    this.merge(config);
  }

  /**
   * 設定のリセット（デフォルトに戻す）
   */
  reset() {
    this.config.clear();
    for (const [key, value] of this.defaults.entries()) {
      this.config.set(key, value);
    }
  }

  /**
   * デバッグ情報取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      totalConfigs: this.config.size,
      defaultConfigs: this.defaults.size,
      validators: this.validators.size,
      listeners: this.listeners.size,
      isSealed: this.isSealed,
    };
  }
}
