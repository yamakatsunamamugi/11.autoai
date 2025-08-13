/**
 * @fileoverview テスト設定管理
 * 
 * 全テストで使用する設定の統一管理と、
 * 設定の検証・調整機能を提供する。
 */

/**
 * テスト設定のスキーマ定義
 */
export const TEST_CONFIG_SCHEMA = {
  // AI設定
  ai: {
    types: ['chatgpt', 'claude', 'gemini', 'genspark'],
    defaultSelections: ['chatgpt', 'claude', 'gemini'],
    timeout: 180000, // 3分
  },
  
  // ウィンドウ設定
  window: {
    maxCount: 4,
    positions: [
      { id: 0, name: '左上', x: 100, y: 100 },
      { id: 1, name: '右上', x: 800, y: 100 },
      { id: 2, name: '左下', x: 100, y: 600 },
      { id: 3, name: '右下', x: 800, y: 600 }
    ],
    columns: ['C', 'F', 'I', 'L'],
    size: { width: 1200, height: 800 }
  },
  
  // テスト実行設定
  execution: {
    defaultRepeatCount: 3,
    waitTime: { min: 5, max: 15 }, // 秒
    tasksPerWindow: 3,
    batchSize: 4, // 同時実行数
    retryAttempts: 3,
    retryDelay: 1000 // ミリ秒
  },
  
  // プロンプト設定
  prompts: {
    test: [
      '今日は何日ですか？',
      '1+1は何ですか？',
      'こんにちは、調子はどうですか？'
    ],
    consecutive: [
      '桃太郎について歴史を解説して',
      'AIの未来について教えて',
      '効率的な勉強方法を提案して'
    ],
    performance: [
      '短い回答をお願いします',
      'はいかいいえで答えてください',
      '一言で回答してください'
    ]
  },
  
  // ログ設定
  logging: {
    levels: ['info', 'success', 'warning', 'error'],
    defaultLevel: 'info',
    maxEntries: 1000,
    timestamps: true
  },
  
  // UI設定
  ui: {
    updateInterval: 100, // ミリ秒
    animationDuration: 300,
    theme: 'light'
  }
};

/**
 * テスト設定管理クラス
 */
export class TestConfigManager {
  constructor(customConfig = {}) {
    this.config = this._mergeConfig(TEST_CONFIG_SCHEMA, customConfig);
    this.listeners = new Map();
  }

  /**
   * 設定を取得
   * 
   * @param {string} path - 設定のパス（例: 'ai.timeout'）
   * @returns {*} 設定値
   */
  get(path = null) {
    if (!path) return this.config;
    
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  /**
   * 設定を更新
   * 
   * @param {string} path - 設定のパス
   * @param {*} value - 新しい値
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key], this.config);
    
    if (target && lastKey) {
      const oldValue = target[lastKey];
      target[lastKey] = value;
      
      // 変更を通知
      this._notifyChange(path, value, oldValue);
    }
  }

  /**
   * 設定変更を監視
   * 
   * @param {string} path - 監視するパス
   * @param {Function} callback - コールバック関数
   */
  watch(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);
  }

  /**
   * 監視を解除
   * 
   * @param {string} path - パス
   * @param {Function} callback - コールバック関数
   */
  unwatch(path, callback) {
    if (this.listeners.has(path)) {
      this.listeners.get(path).delete(callback);
    }
  }

  /**
   * テスト用のスプレッドシート設定を生成
   * 
   * @param {string} testType - テストタイプ
   * @returns {Object} スプレッドシート設定
   */
  createSpreadsheetConfig(testType = 'window') {
    return {
      spreadsheetId: `test_${testType}_${Date.now()}`,
      values: [],
      aiColumns: this._generateAIColumns(),
      columnMapping: this._generateColumnMapping()
    };
  }

  /**
   * テスト実行オプションを生成
   * 
   * @param {Object} overrides - 上書き設定
   * @returns {Object} 実行オプション
   */
  createExecutionOptions(overrides = {}) {
    return {
      testMode: true,
      timeout: this.get('ai.timeout'),
      batchSize: this.get('execution.batchSize'),
      retryAttempts: this.get('execution.retryAttempts'),
      retryDelay: this.get('execution.retryDelay'),
      ...overrides
    };
  }

  /**
   * ウィンドウ設定を取得
   * 
   * @param {number} count - ウィンドウ数
   * @returns {Array} ウィンドウ設定配列
   */
  getWindowConfigs(count = null) {
    const maxCount = this.get('window.maxCount');
    const actualCount = count ? Math.min(count, maxCount) : maxCount;
    const positions = this.get('window.positions');
    const columns = this.get('window.columns');
    
    return Array.from({ length: actualCount }, (_, i) => ({
      position: positions[i % positions.length],
      column: columns[i % columns.length],
      index: i
    }));
  }

  /**
   * 検証ルール
   */
  validate() {
    const errors = [];
    
    // AI設定の検証
    const aiTypes = this.get('ai.types');
    if (!Array.isArray(aiTypes) || aiTypes.length === 0) {
      errors.push('AI types must be a non-empty array');
    }
    
    // ウィンドウ設定の検証
    const windowCount = this.get('window.maxCount');
    const positions = this.get('window.positions');
    if (windowCount > positions.length) {
      errors.push('Window count exceeds available positions');
    }
    
    // 実行設定の検証
    const waitTime = this.get('execution.waitTime');
    if (waitTime.min >= waitTime.max) {
      errors.push('Wait time minimum must be less than maximum');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 設定をリセット
   * 
   * @param {Object} newConfig - 新しい設定
   */
  reset(newConfig = {}) {
    this.config = this._mergeConfig(TEST_CONFIG_SCHEMA, newConfig);
    this._notifyChange('*', this.config, null);
  }

  /**
   * 設定をエクスポート
   * 
   * @returns {Object} 設定オブジェクト
   */
  export() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 設定をインポート
   * 
   * @param {Object} configData - 設定データ
   */
  import(configData) {
    try {
      const parsed = typeof configData === 'string' ? JSON.parse(configData) : configData;
      this.config = this._mergeConfig(this.config, parsed);
      this._notifyChange('*', this.config, null);
    } catch (error) {
      throw new Error(`Invalid config data: ${error.message}`);
    }
  }

  /**
   * 設定をマージ（プライベート）
   * 
   * @param {Object} base - ベース設定
   * @param {Object} override - 上書き設定
   * @returns {Object} マージされた設定
   * @private
   */
  _mergeConfig(base, override) {
    const result = { ...base };
    
    for (const [key, value] of Object.entries(override)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this._mergeConfig(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * 変更を通知（プライベート）
   * 
   * @param {string} path - 変更されたパス
   * @param {*} newValue - 新しい値
   * @param {*} oldValue - 古い値
   * @private
   */
  _notifyChange(path, newValue, oldValue) {
    // 完全一致のリスナーを通知
    if (this.listeners.has(path)) {
      this.listeners.get(path).forEach(callback => {
        callback(newValue, oldValue, path);
      });
    }
    
    // ワイルドカードリスナーを通知
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(callback => {
        callback(newValue, oldValue, path);
      });
    }
  }

  /**
   * AI列設定を生成（プライベート）
   * 
   * @returns {Object} AI列設定
   * @private
   */
  _generateAIColumns() {
    const columns = this.get('window.columns');
    const aiTypes = this.get('ai.types');
    const aiColumns = {};
    
    columns.forEach((column, index) => {
      const aiType = aiTypes[index % aiTypes.length];
      aiColumns[column] = {
        index,
        letter: column,
        header: `${aiType} プロンプト`,
        type: aiType,
        promptDescription: ''
      };
    });
    
    return aiColumns;
  }

  /**
   * 列マッピングを生成（プライベート）
   * 
   * @returns {Object} 列マッピング
   * @private
   */
  _generateColumnMapping() {
    const columns = this.get('window.columns');
    const mapping = {};
    
    columns.forEach((column, index) => {
      mapping[column] = {
        index,
        header: `テスト列 ${column}`
      };
    });
    
    return mapping;
  }
}

/**
 * 環境別設定プリセット
 */
export const CONFIG_PRESETS = {
  // 開発環境用
  development: {
    execution: {
      waitTime: { min: 1, max: 3 },
      retryAttempts: 1,
      retryDelay: 500
    },
    logging: {
      defaultLevel: 'info'
    }
  },
  
  // テスト環境用
  testing: {
    execution: {
      waitTime: { min: 2, max: 5 },
      retryAttempts: 2,
      retryDelay: 1000
    },
    logging: {
      defaultLevel: 'info'
    }
  },
  
  // 本番環境用
  production: {
    execution: {
      waitTime: { min: 5, max: 15 },
      retryAttempts: 3,
      retryDelay: 1000
    },
    logging: {
      defaultLevel: 'warning'
    }
  },
  
  // パフォーマンステスト用
  performance: {
    execution: {
      waitTime: { min: 1, max: 2 },
      tasksPerWindow: 10,
      batchSize: 8
    },
    prompts: {
      test: ['短答'],
      consecutive: ['一言'],
      performance: ['はい']
    }
  }
};

/**
 * デフォルト設定管理インスタンス
 */
export const defaultTestConfig = new TestConfigManager();

/**
 * 環境に基づいた設定を作成
 * 
 * @param {string} environment - 環境名
 * @param {Object} customConfig - カスタム設定
 * @returns {TestConfigManager} 設定管理インスタンス
 */
export function createTestConfig(environment = 'development', customConfig = {}) {
  const preset = CONFIG_PRESETS[environment] || CONFIG_PRESETS.development;
  const mergedConfig = { ...preset, ...customConfig };
  return new TestConfigManager(mergedConfig);
}