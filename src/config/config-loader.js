/**
 * @fileoverview 設定ローダー
 * 
 * 外部設定ファイルの読み込みと管理機能を提供する。
 * 環境別設定、設定のマージ、バリデーション機能を含む。
 */

/**
 * 設定ローダークラス
 */
export class ConfigLoader {
  constructor() {
    this.cache = new Map();
    this.watchers = new Map();
    this.loadPromises = new Map();
  }

  /**
   * 設定ファイルを読み込み
   * 
   * @param {string} path - 設定ファイルのパス
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 設定オブジェクト
   */
  async loadConfig(path, options = {}) {
    const {
      environment = this._getEnvironment(),
      cache = true,
      validate = true,
      merge = true
    } = options;

    const cacheKey = `${path}:${environment}`;

    // キャッシュチェック
    if (cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 既に読み込み中の場合は同じPromiseを返す
    if (this.loadPromises.has(cacheKey)) {
      return this.loadPromises.get(cacheKey);
    }

    const loadPromise = this._loadConfigInternal(path, environment, { validate, merge });
    this.loadPromises.set(cacheKey, loadPromise);

    try {
      const config = await loadPromise;
      
      if (cache) {
        this.cache.set(cacheKey, config);
      }
      
      return config;
    } finally {
      this.loadPromises.delete(cacheKey);
    }
  }

  /**
   * 複数の設定ファイルを読み込んでマージ
   * 
   * @param {Array<string>} paths - 設定ファイルパスの配列
   * @param {Object} options - オプション
   * @returns {Promise<Object>} マージされた設定
   */
  async loadMultipleConfigs(paths, options = {}) {
    const configs = await Promise.all(
      paths.map(path => this.loadConfig(path, options))
    );

    return this._mergeConfigs(configs);
  }

  /**
   * 環境変数から設定を読み込み
   * 
   * @param {string} prefix - 環境変数のプレフィックス
   * @returns {Object} 環境変数ベースの設定
   */
  loadFromEnvironment(prefix = 'AUTOAI_') {
    const config = {};
    
    if (typeof process !== 'undefined' && process.env) {
      Object.keys(process.env).forEach(key => {
        if (key.startsWith(prefix)) {
          const configKey = key.substring(prefix.length).toLowerCase();
          const value = this._parseEnvironmentValue(process.env[key]);
          this._setNestedValue(config, configKey, value);
        }
      });
    }

    return config;
  }

  /**
   * 設定の変更を監視
   * 
   * @param {string} path - 設定ファイルパス
   * @param {Function} callback - 変更時のコールバック
   * @param {Object} options - オプション
   */
  async watchConfig(path, callback, options = {}) {
    const { interval = 5000 } = options;
    const watchKey = path;

    if (this.watchers.has(watchKey)) {
      this.watchers.get(watchKey).callbacks.add(callback);
      return;
    }

    let lastModified = null;
    const callbacks = new Set([callback]);

    const checkForChanges = async () => {
      try {
        const stats = await this._getFileStats(path);
        const currentModified = stats?.lastModified;

        if (lastModified && currentModified && currentModified > lastModified) {
          const newConfig = await this.loadConfig(path, { cache: false });
          callbacks.forEach(cb => {
            try {
              cb(newConfig, path);
            } catch (error) {
              console.error('Config watcher callback error:', error);
            }
          });
        }

        lastModified = currentModified;
      } catch (error) {
        console.error('Config watcher error:', error);
      }
    };

    const intervalId = setInterval(checkForChanges, interval);
    
    this.watchers.set(watchKey, {
      intervalId,
      callbacks,
      path
    });

    // 初回チェック
    await checkForChanges();
  }

  /**
   * 監視を停止
   * 
   * @param {string} path - 設定ファイルパス
   * @param {Function} callback - コールバック（指定時は該当コールバックのみ削除）
   */
  unwatchConfig(path, callback = null) {
    const watchKey = path;
    const watcher = this.watchers.get(watchKey);

    if (!watcher) return;

    if (callback) {
      watcher.callbacks.delete(callback);
      if (watcher.callbacks.size > 0) {
        return; // 他のコールバックが残っている場合は継続
      }
    }

    clearInterval(watcher.intervalId);
    this.watchers.delete(watchKey);
  }

  /**
   * キャッシュをクリア
   * 
   * @param {string} pattern - クリアするキーのパターン（正規表現）
   */
  clearCache(pattern = null) {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * 設定を保存
   * 
   * @param {string} path - 保存先パス
   * @param {Object} config - 設定オブジェクト
   * @param {Object} options - オプション
   */
  async saveConfig(path, config, options = {}) {
    const { format = 'json', backup = true } = options;

    try {
      // バックアップ作成
      if (backup && await this._fileExists(path)) {
        const backupPath = `${path}.backup.${Date.now()}`;
        await this._copyFile(path, backupPath);
      }

      // 設定を保存
      const content = this._serializeConfig(config, format);
      await this._writeFile(path, content);

      // キャッシュを更新
      const cacheKey = `${path}:${this._getEnvironment()}`;
      this.cache.set(cacheKey, config);

    } catch (error) {
      throw new Error(`Failed to save config to ${path}: ${error.message}`);
    }
  }

  /**
   * 内部設定読み込み処理
   * 
   * @param {string} path - ファイルパス
   * @param {string} environment - 環境
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 設定オブジェクト
   * @private
   */
  async _loadConfigInternal(path, environment, options) {
    try {
      // ベース設定を読み込み
      const baseConfig = await this._readConfigFile(path);

      // 環境別設定をマージ
      let config = baseConfig;
      if (options.merge && environment && baseConfig.test?.environments?.[environment]) {
        config = this._mergeConfigs([baseConfig, {
          test: baseConfig.test.environments[environment]
        }]);
      }

      // 環境変数設定をマージ
      if (options.merge) {
        const envConfig = this.loadFromEnvironment();
        if (Object.keys(envConfig).length > 0) {
          config = this._mergeConfigs([config, envConfig]);
        }
      }

      // バリデーション
      if (options.validate) {
        this._validateConfig(config);
      }

      return config;

    } catch (error) {
      throw new Error(`Failed to load config from ${path}: ${error.message}`);
    }
  }

  /**
   * 設定ファイルを読み込み
   * 
   * @param {string} path - ファイルパス
   * @returns {Promise<Object>} 設定オブジェクト
   * @private
   */
  async _readConfigFile(path) {
    try {
      // ブラウザ環境
      if (typeof window !== 'undefined') {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
      }
      
      // Node.js環境
      if (typeof require !== 'undefined') {
        const fs = require('fs').promises;
        const content = await fs.readFile(path, 'utf8');
        return JSON.parse(content);
      }

      throw new Error('Unsupported environment');

    } catch (error) {
      throw new Error(`Failed to read config file ${path}: ${error.message}`);
    }
  }

  /**
   * 設定をマージ
   * 
   * @param {Array<Object>} configs - 設定配列
   * @returns {Object} マージされた設定
   * @private
   */
  _mergeConfigs(configs) {
    return configs.reduce((merged, config) => {
      return this._deepMerge(merged, config);
    }, {});
  }

  /**
   * ディープマージ
   * 
   * @param {Object} target - マージ先
   * @param {Object} source - マージ元
   * @returns {Object} マージ結果
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this._deepMerge(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 設定をバリデーション
   * 
   * @param {Object} config - 設定オブジェクト
   * @private
   */
  _validateConfig(config) {
    const errors = [];

    // 必須フィールドのチェック
    const requiredFields = ['ai', 'window', 'logging'];
    requiredFields.forEach(field => {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // AI設定のバリデーション
    if (config.ai) {
      if (!Array.isArray(config.ai.types) || config.ai.types.length === 0) {
        errors.push('ai.types must be a non-empty array');
      }
      if (typeof config.ai.timeout !== 'number' || config.ai.timeout <= 0) {
        errors.push('ai.timeout must be a positive number');
      }
    }

    // ウィンドウ設定のバリデーション
    if (config.window) {
      if (typeof config.window.maxCount !== 'number' || config.window.maxCount <= 0) {
        errors.push('window.maxCount must be a positive number');
      }
      if (!Array.isArray(config.window.positions)) {
        errors.push('window.positions must be an array');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * 現在の環境を取得
   * 
   * @returns {string} 環境名
   * @private
   */
  _getEnvironment() {
    // 環境変数から取得
    if (typeof process !== 'undefined' && process.env.NODE_ENV) {
      return process.env.NODE_ENV;
    }

    // URLから推測
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
      }
      if (hostname.includes('test') || hostname.includes('staging')) {
        return 'testing';
      }
      return 'production';
    }

    return 'development';
  }

  /**
   * 環境変数の値をパース
   * 
   * @param {string} value - 環境変数の値
   * @returns {*} パースされた値
   * @private
   */
  _parseEnvironmentValue(value) {
    // 数値
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // 真偽値
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // JSON
    if ((value.startsWith('{') && value.endsWith('}')) ||
        (value.startsWith('[') && value.endsWith(']'))) {
      try {
        return JSON.parse(value);
      } catch {
        // パースに失敗した場合は文字列として扱う
      }
    }

    return value;
  }

  /**
   * ネストされた値を設定
   * 
   * @param {Object} obj - 対象オブジェクト
   * @param {string} path - パス（ドット区切り）
   * @param {*} value - 値
   * @private
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * ファイルの存在確認
   * 
   * @param {string} path - ファイルパス
   * @returns {Promise<boolean>} 存在フラグ
   * @private
   */
  async _fileExists(path) {
    try {
      if (typeof window !== 'undefined') {
        const response = await fetch(path, { method: 'HEAD' });
        return response.ok;
      }
      
      if (typeof require !== 'undefined') {
        const fs = require('fs').promises;
        await fs.access(path);
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * ファイル情報を取得
   * 
   * @param {string} path - ファイルパス
   * @returns {Promise<Object>} ファイル情報
   * @private
   */
  async _getFileStats(path) {
    try {
      if (typeof require !== 'undefined') {
        const fs = require('fs').promises;
        const stats = await fs.stat(path);
        return {
          lastModified: stats.mtime.getTime(),
          size: stats.size
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * ファイルをコピー
   * 
   * @param {string} src - コピー元
   * @param {string} dest - コピー先
   * @returns {Promise} コピー処理
   * @private
   */
  async _copyFile(src, dest) {
    if (typeof require !== 'undefined') {
      const fs = require('fs').promises;
      await fs.copyFile(src, dest);
    }
  }

  /**
   * ファイルに書き込み
   * 
   * @param {string} path - ファイルパス
   * @param {string} content - 内容
   * @returns {Promise} 書き込み処理
   * @private
   */
  async _writeFile(path, content) {
    if (typeof require !== 'undefined') {
      const fs = require('fs').promises;
      await fs.writeFile(path, content, 'utf8');
    } else {
      throw new Error('File writing not supported in browser environment');
    }
  }

  /**
   * 設定をシリアライズ
   * 
   * @param {Object} config - 設定オブジェクト
   * @param {string} format - フォーマット
   * @returns {string} シリアライズされた文字列
   * @private
   */
  _serializeConfig(config, format) {
    switch (format) {
      case 'json':
        return JSON.stringify(config, null, 2);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}

/**
 * グローバル設定ローダーインスタンス
 */
export const configLoader = new ConfigLoader();

/**
 * アプリケーション設定をロード
 * 
 * @param {Object} options - オプション
 * @returns {Promise<Object>} アプリケーション設定
 */
export async function loadAppConfig(options = {}) {
  const configPath = options.configPath || '/config/app-config.json';
  return configLoader.loadConfig(configPath, options);
}

/**
 * 環境別設定を作成
 * 
 * @param {string} environment - 環境名
 * @param {Object} overrides - 上書き設定
 * @returns {Promise<Object>} 環境別設定
 */
export async function createEnvironmentConfig(environment, overrides = {}) {
  const baseConfig = await loadAppConfig({ environment });
  return configLoader._deepMerge(baseConfig, overrides);
}