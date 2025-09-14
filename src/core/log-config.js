// log-config.js - ログ設定管理
// Service Worker環境対応: Logger をグローバルからアクセス
let Logger = null;

// Loggerクラスの動的取得
function getLogger() {
  if (!Logger) {
    // グローバル空間のLoggerを使用
    if (typeof window !== 'undefined' && window.Logger) {
      Logger = window.Logger;
    } else if (typeof globalThis !== 'undefined' && globalThis.Logger) {
      Logger = globalThis.Logger;
    } else {
      // フォールバック: シンプルなLogger
      Logger = {
        create: (name, options) => ({
          info: console.log.bind(console),
          warn: console.warn.bind(console),
          error: console.error.bind(console),
          debug: console.log.bind(console),
          child: (childName) => Logger.create(`${name}.${childName}`, options)
        })
      };
    }
  }
  return Logger;
}

class LogConfig {
    constructor() {
        const LoggerClass = getLogger();
        this.mainLogger = LoggerClass.create('AutoAI', {
            level: this.getLogLevel(),
            format: 'text',
            transport: 'console',
            enableColors: true,
            includeTimestamp: false,
            includeLevel: true,
            includeName: true
        });

        this.componentLoggers = {};
        this.setupLoggers();
    }

    getLogLevel() {
        // localStorage から設定を読み込み、デフォルトは 'info'
        try {
            const settings = localStorage.getItem('autoai-debug-settings');
            if (settings) {
                const parsed = JSON.parse(settings);
                return parsed.logLevel || 'info';
            }
        } catch (error) {
            console.warn('ログ設定の読み込みに失敗:', error);
        }
        return 'info';
    }

    setLogLevel(level) {
        try {
            const settings = {
                logLevel: level,
                timestamp: Date.now()
            };
            localStorage.setItem('autoai-debug-settings', JSON.stringify(settings));
            
            // すべてのロガーのレベルを更新
            const LoggerClass = getLogger();
            if (LoggerClass.setGlobalLevel) {
                LoggerClass.setGlobalLevel(level);
            }
            
            this.mainLogger.info(`ログレベルを ${level} に変更しました`);
        } catch (error) {
            console.error('ログレベルの保存に失敗:', error);
        }
    }

    setupLoggers() {
        const components = [
            'StreamProcessorV2', 
            'WindowManager',
            'UIController',
            'PowerManager',
            'AuthService',
            'SheetsClient'
        ];

        components.forEach(component => {
            this.componentLoggers[component] = this.mainLogger.child(component);
        });
    }

    getLogger(component) {
        if (!this.componentLoggers[component]) {
            this.componentLoggers[component] = this.mainLogger.child(component);
        }
        return this.componentLoggers[component];
    }

    // デバッグモードの切り替え
    enableDebugMode() {
        this.setLogLevel('debug');
        this.mainLogger.info('デバッグモードを有効にしました');
    }

    disableDebugMode() {
        this.setLogLevel('info');
        this.mainLogger.info('デバッグモードを無効にしました');
    }

    isDebugMode() {
        return this.getLogLevel() === 'debug';
    }

    // 進捗ログ用のヘルパー
    logProgress(component, message, current, total) {
        const logger = this.getLogger(component);
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        logger.info(`${message} (${current}/${total} - ${percentage}%)`);
    }

    // バッチ処理ログ用のヘルパー
    logBatchStart(component, batchInfo) {
        const logger = this.getLogger(component);
        logger.info(`🚀 バッチ処理開始: ${batchInfo.name} (${batchInfo.count}件)`);
    }

    logBatchComplete(component, batchInfo, results) {
        const logger = this.getLogger(component);
        logger.info(`✅ バッチ処理完了: ${batchInfo.name} (成功: ${results.success}, 失敗: ${results.failed})`);
    }

    // エラーログ用のヘルパー
    logError(component, message, error, context = {}) {
        const logger = this.getLogger(component);
        logger.error(message, {
            error: error.message,
            stack: error.stack,
            context
        });
    }

    // 既存回答スキップログの集約
    logSkippedCells(component, cells) {
        const logger = this.getLogger(component);
        if (cells.length === 0) return;
        
        const cellRanges = this.formatCellRanges(cells);
        logger.info(`📊 既存回答ありでスキップ: ${cellRanges} (計${cells.length}セル)`);
    }

    // セル範囲の見やすい表示
    formatCellRanges(cells) {
        if (cells.length === 0) return '';
        
        // セルをソート
        const sortedCells = [...cells].sort();
        const ranges = [];
        let start = sortedCells[0];
        let end = start;
        
        for (let i = 1; i < sortedCells.length; i++) {
            const current = sortedCells[i];
            const currentNum = parseInt(current.match(/\d+$/)?.[0] || '0');
            const endNum = parseInt(end.match(/\d+$/)?.[0] || '0');
            
            if (currentNum === endNum + 1 && current.replace(/\d+$/, '') === end.replace(/\d+$/, '')) {
                end = current;
            } else {
                ranges.push(start === end ? start : `${start}-${end}`);
                start = current;
                end = current;
            }
        }
        
        ranges.push(start === end ? start : `${start}-${end}`);
        return ranges.join(', ');
    }

    // 統計情報の表示
    showStatistics() {
        const LoggerClass = getLogger();
        const stats = LoggerClass.getAllMetrics ? LoggerClass.getAllMetrics() : {};
        console.group('📊 ログ統計情報');
        
        Object.entries(stats).forEach(([name, metrics]) => {
            console.log(`${name}:`, {
                総ログ数: metrics.totalLogs,
                レベル別: metrics.logsByLevel,
                エラー率: `${((metrics.errors / metrics.totalLogs) * 100).toFixed(1)}%`,
                稼働時間: `${Math.round(metrics.uptime / 1000)}秒`
            });
        });
        
        console.groupEnd();
    }
}

// グローバルインスタンス
try {
  if (typeof window !== 'undefined') {
    window.AutoAILogConfig = window.AutoAILogConfig || new LogConfig();
  } else if (typeof globalThis !== 'undefined') {
    globalThis.AutoAILogConfig = globalThis.AutoAILogConfig || new LogConfig();
  }
} catch (error) {
  console.warn('Failed to initialize LogConfig:', error);
}

// Service Worker環境対応のexport
const logConfigInstance = (typeof window !== 'undefined' && window.AutoAILogConfig) || 
                          (typeof globalThis !== 'undefined' && globalThis.AutoAILogConfig) ||
                          null;

export default logConfigInstance;