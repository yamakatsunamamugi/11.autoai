/**
 * シンプルなログシステム
 * ログレベル制御とモジュール別ログ出力を提供
 */

// ログレベル定義
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// デフォルト設定
const DEFAULT_LEVEL = LOG_LEVELS.INFO;

class Logger {
  constructor() {
    this.debugMode = this._getDebugMode();
    this.moduleSettings = new Map();
    this.globalLevel = this.debugMode ? LOG_LEVELS.DEBUG : DEFAULT_LEVEL;
  }

  /**
   * デバッグモードをlocalStorageから取得
   */
  _getDebugMode() {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('debug_mode') === 'true';
  }

  /**
   * ログレベルをチェック
   */
  _shouldLog(level, moduleName) {
    const moduleLevel = this.moduleSettings.get(moduleName) ?? this.globalLevel;
    return level >= moduleLevel;
  }

  /**
   * ログ出力フォーマット
   */
  _format(level, moduleName, message, data) {
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    const timestamp = new Date().toLocaleTimeString('ja-JP', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    return {
      prefix: `[${timestamp}] [${levelName}] [${moduleName}]`,
      message,
      data
    };
  }

  /**
   * デバッグログ（開発時のみ）
   */
  debug(moduleName, message, data = null) {
    if (!this._shouldLog(LOG_LEVELS.DEBUG, moduleName)) return;
    
    const { prefix, message: msg, data: logData } = this._format(LOG_LEVELS.DEBUG, moduleName, message, data);
    
    if (logData) {
      console.log(`${prefix} ${msg}`, logData);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  }

  /**
   * 情報ログ（通常の処理情報）
   */
  info(moduleName, message, data = null) {
    if (!this._shouldLog(LOG_LEVELS.INFO, moduleName)) return;
    
    const { prefix, message: msg, data: logData } = this._format(LOG_LEVELS.INFO, moduleName, message, data);
    
    if (logData) {
      console.info(`${prefix} ${msg}`, logData);
    } else {
      console.info(`${prefix} ${msg}`);
    }
  }

  /**
   * 警告ログ
   */
  warn(moduleName, message, data = null) {
    if (!this._shouldLog(LOG_LEVELS.WARN, moduleName)) return;
    
    const { prefix, message: msg, data: logData } = this._format(LOG_LEVELS.WARN, moduleName, message, data);
    
    if (logData) {
      console.warn(`${prefix} ${msg}`, logData);
    } else {
      console.warn(`${prefix} ${msg}`);
    }
  }

  /**
   * エラーログ
   */
  error(moduleName, message, data = null) {
    if (!this._shouldLog(LOG_LEVELS.ERROR, moduleName)) return;
    
    const { prefix, message: msg, data: logData } = this._format(LOG_LEVELS.ERROR, moduleName, message, data);
    
    if (logData) {
      console.error(`${prefix} ${msg}`, logData);
    } else {
      console.error(`${prefix} ${msg}`);
    }
  }

  /**
   * デバッグモードを切り替え
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.globalLevel = enabled ? LOG_LEVELS.DEBUG : DEFAULT_LEVEL;
    
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('debug_mode', enabled ? 'true' : 'false');
    }
    
    console.info(`[Logger] デバッグモード: ${enabled ? 'ON' : 'OFF'}`);
  }

  /**
   * 特定モジュールのログレベルを設定
   */
  setModuleLevel(moduleName, level) {
    if (typeof level === 'string') {
      level = LOG_LEVELS[level.toUpperCase()];
    }
    
    if (level !== undefined) {
      this.moduleSettings.set(moduleName, level);
      console.info(`[Logger] ${moduleName}のログレベル: ${Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level)}`);
    }
  }

  /**
   * グローバルログレベルを設定
   */
  setGlobalLevel(level) {
    if (typeof level === 'string') {
      level = LOG_LEVELS[level.toUpperCase()];
    }
    
    if (level !== undefined) {
      this.globalLevel = level;
      console.info(`[Logger] グローバルログレベル: ${Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level)}`);
    }
  }

  /**
   * 現在の設定を表示
   */
  showSettings() {
    console.group('📊 ログ設定');
    console.log('デバッグモード:', this.debugMode ? 'ON' : 'OFF');
    console.log('グローバルレベル:', Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === this.globalLevel));
    
    if (this.moduleSettings.size > 0) {
      console.log('モジュール別設定:');
      this.moduleSettings.forEach((level, module) => {
        console.log(`  ${module}: ${Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level)}`);
      });
    }
    console.groupEnd();
  }
}

// シングルトンインスタンス
const logger = new Logger();

// グローバルに公開（デバッグ用）
if (typeof window !== 'undefined') {
  window.logger = logger;
}

export default logger;