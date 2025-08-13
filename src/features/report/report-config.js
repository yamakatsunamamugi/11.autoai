// report-config.js - レポート機能の設定

/**
 * レポート機能の設定クラス
 * 全てのレポート関連設定を一元管理
 */
export class ReportConfig {
  constructor(customConfig = {}) {
    // デフォルト設定をマージ
    this.config = this.mergeConfig(this.getDefaultConfig(), customConfig);
    
    // 設定の検証
    this.validateConfig();
  }

  /**
   * デフォルト設定を取得
   */
  getDefaultConfig() {
    return {
      // 基本設定
      enabled: true,
      defaultAIType: 'chatgpt',
      defaultPrompt: 'レポート生成タスク',
      
      // 列検出設定
      detection: {
        reportColumnName: 'レポート化',
        reportColumnPattern: /^レポート/,
        checkNextColumnOnly: true,  // 作業グループの直後の列のみチェック
        maxColumnsToCheck: 1         // チェックする列数の最大値
      },
      
      // 実行設定
      execution: {
        parallel: false,           // 並列実行の有無
        maxConcurrent: 3,          // 最大同時実行数
        retryAttempts: 3,          // リトライ回数
        retryDelay: 1000,          // リトライ間隔（ミリ秒）
        executionDelay: 500,       // 実行間隔（ミリ秒）
        timeout: 30000             // タイムアウト（ミリ秒）
      },
      
      // ドキュメント設定
      document: {
        titleTemplate: 'レポート - {row}行目',
        includePrompt: true,
        includeAnswer: true,
        includeMetadata: true,
        formatType: 'structured',  // structured, simple, markdown
        sharing: {
          enabled: true,
          defaultPermission: 'view',  // view, comment, edit
          linkShareEnabled: true
        }
      },
      
      // スプレッドシート設定
      spreadsheet: {
        writeUrl: true,            // URLを書き込むか
        writeDocumentId: false,    // ドキュメントIDを書き込むか
        clearBeforeWrite: true,    // 書き込み前にセルをクリア
        updateFormat: true         // セルの書式を更新
      },
      
      // ログ設定
      logging: {
        enabled: true,
        level: 'info',  // debug, info, warn, error
        includeTimestamp: true,
        logToConsole: true,
        logToFile: false
      },
      
      // エラーハンドリング設定
      errorHandling: {
        continueOnError: true,     // エラー時も続行
        collectErrors: true,       // エラーを収集
        maxErrors: 10,             // 最大エラー数
        errorReportEnabled: true   // エラーレポート生成
      },
      
      // パフォーマンス設定
      performance: {
        cacheEnabled: true,        // キャッシュ有効化
        cacheTTL: 3600000,        // キャッシュTTL（ミリ秒）
        batchSize: 10,            // バッチサイズ
        monitoring: {
          enabled: true,
          collectMetrics: true,
          reportInterval: 60000
        }
      }
    };
  }

  /**
   * 設定をマージ
   */
  mergeConfig(defaultConfig, customConfig) {
    const merged = { ...defaultConfig };
    
    for (const key in customConfig) {
      if (customConfig.hasOwnProperty(key)) {
        if (typeof customConfig[key] === 'object' && !Array.isArray(customConfig[key])) {
          merged[key] = {
            ...defaultConfig[key],
            ...customConfig[key]
          };
        } else {
          merged[key] = customConfig[key];
        }
      }
    }
    
    return merged;
  }

  /**
   * 設定の検証
   */
  validateConfig() {
    // 必須項目のチェック
    if (!this.config.defaultAIType) {
      throw new Error('defaultAIType is required');
    }
    
    // AIタイプの検証
    const validAITypes = ['chatgpt', 'claude', 'gemini'];
    if (!validAITypes.includes(this.config.defaultAIType)) {
      throw new Error(`Invalid defaultAIType: ${this.config.defaultAIType}`);
    }
    
    // 数値の範囲チェック
    if (this.config.execution.retryAttempts < 0) {
      throw new Error('retryAttempts must be non-negative');
    }
    
    if (this.config.execution.maxConcurrent < 1) {
      throw new Error('maxConcurrent must be at least 1');
    }
    
    // ログレベルの検証
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(this.config.logging.level)) {
      throw new Error(`Invalid log level: ${this.config.logging.level}`);
    }
  }

  /**
   * 設定値を取得
   */
  get(path) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * 設定値を更新
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;
    
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    target[lastKey] = value;
    
    // 再検証
    this.validateConfig();
  }

  /**
   * 設定をリセット
   */
  reset() {
    this.config = this.getDefaultConfig();
  }

  /**
   * 設定をエクスポート
   */
  export() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 設定をインポート
   */
  import(config) {
    this.config = this.mergeConfig(this.getDefaultConfig(), config);
    this.validateConfig();
  }

  /**
   * 環境変数から設定を読み込み
   */
  loadFromEnv() {
    const envConfig = {};
    
    // 環境変数から設定を読み込む例
    if (process.env.REPORT_ENABLED !== undefined) {
      envConfig.enabled = process.env.REPORT_ENABLED === 'true';
    }
    
    if (process.env.REPORT_DEFAULT_AI_TYPE) {
      envConfig.defaultAIType = process.env.REPORT_DEFAULT_AI_TYPE;
    }
    
    if (process.env.REPORT_PARALLEL_EXECUTION !== undefined) {
      envConfig.execution = {
        parallel: process.env.REPORT_PARALLEL_EXECUTION === 'true'
      };
    }
    
    // 環境変数の設定をマージ
    this.config = this.mergeConfig(this.config, envConfig);
    this.validateConfig();
  }

  /**
   * 設定のサマリーを取得
   */
  getSummary() {
    return {
      enabled: this.config.enabled,
      defaultAIType: this.config.defaultAIType,
      parallelExecution: this.config.execution.parallel,
      maxConcurrent: this.config.execution.maxConcurrent,
      retryAttempts: this.config.execution.retryAttempts,
      logLevel: this.config.logging.level,
      cacheEnabled: this.config.performance.cacheEnabled
    };
  }
}

// シングルトンインスタンス
let configInstance = null;

/**
 * 設定のシングルトンインスタンスを取得
 */
export function getReportConfig(customConfig = {}) {
  if (!configInstance) {
    configInstance = new ReportConfig(customConfig);
  }
  return configInstance;
}

/**
 * 設定をリセット
 */
export function resetReportConfig() {
  configInstance = null;
}

export default ReportConfig;