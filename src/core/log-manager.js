/**
 * @fileoverview ログ管理モジュール
 *
 * 【ステップ構成】
 * Step 1: 初期化
 * Step 2: ログ追加
 * Step 3: AI別ログ
 * Step 4: エラーログ
 * Step 5: 成功ログ
 * Step 6: デバッグログ
 * Step 7: ブロードキャスト
 * Step 8: 接続管理
 * Step 9: ログクリア
 * Step 10: ログ取得
 */

// ===== Step 1: LogManagerクラス定義 =====
export class LogManager {
  constructor() {
    // LogManager初期化開始

    // Step 1-2: 基本設定
    this.logs = [];
    this.maxLogs = 10000;
    this.connections = new Map(); // port connections

    // Step 1-3: カテゴリ定義
    this.categories = {
      AI: {
        CHATGPT: 'chatgpt',
        CLAUDE: 'claude',
        GEMINI: 'gemini',
        GENSPARK: 'genspark'
      },
      SYSTEM: 'system',
      ERROR: 'error'
    };

    // LogManager初期化完了
  }

  /**
   * Step 2: ログを追加
   */
  log(message, options = {}) {
    // Step 2-1: ログエントリの作成
    const logEntry = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      timestamp: new Date().toISOString(),
      message: typeof message === 'string' ? message : JSON.stringify(message),
      category: options.category || 'system',
      level: options.level || 'info',
      ai: options.ai || null,
      metadata: options.metadata || {},
      source: options.source || 'background',
      step: options.step || null // ステップ情報を追加
    };

    // Step 2-2: ステップ情報があればメッセージに含める
    if (options.step) {
      logEntry.message = `[${options.step}] ${logEntry.message}`;
    }

    // Step 2-3: ログを保存
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // 古いログを削除
    }

    // Step 2-4: 接続中のビューアーに送信
    this.broadcast({ type: 'log', data: logEntry });

    // Step 2-5: コンソールにも出力（重要なログのみ）
    const icon = {
      debug: '🔍',
      info: '📝',
      warning: '⚠️',
      error: '❌',
      success: '✅'
    }[logEntry.level] || '📝';

    // 重要なログのみ表示
    if (logEntry.level === 'error' || logEntry.level === 'warning') {
      console.log(`${icon} ${logEntry.message}`);
    }

    return logEntry;
  }

  /**
   * Step 3: AI別ログ
   */
  logAI(aiType, message, options = {}) {
    // Step 3-1: AI種別を含めたログエントリ作成
    return this.log(message, {
      ...options,
      ai: aiType,
      category: aiType.toLowerCase(),
      step: options.step || `Step 3-AI-${aiType}`
    });
  }

  /**
   * Step 4: エラーログ
   */
  error(message, error = null) {
    // Step 4-1: エラー詳細を含めたログエントリ作成
    return this.log(message, {
      level: 'error',
      category: 'error',
      metadata: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : {},
      step: 'Step 4-Error'
    });
  }

  /**
   * Step 5: 成功ログ
   */
  success(message, metadata = {}) {
    // Step 5-1: 成功ログエントリ作成
    return this.log(message, {
      level: 'success',
      metadata,
      step: 'Step 5-Success'
    });
  }

  /**
   * Step 6: デバッグログ
   */
  debug(message, metadata = {}) {
    // Step 6-1: デバッグログエントリ作成
    return this.log(message, {
      level: 'debug',
      metadata,
      step: 'Step 6-Debug'
    });
  }

  /**
   * Step 7: 全接続にブロードキャスト
   */
  broadcast(message) {
    // Step 7-1: 全ポート接続にメッセージ送信
    this.connections.forEach((port) => {
      try {
        // Step 7-2: ポートにメッセージ送信
        port.postMessage(message);
      } catch (e) {
        // Step 7-3: 接続が切れている場合は削除
        this.connections.delete(port);
      }
    });
  }

  /**
   * Step 8: ログビューアー接続を追加
   */
  addConnection(port) {
    // Step 8-1: 接続をMapに追加
    this.connections.set(port, port);

    // Step 8-2: 接続時に既存のログを送信
    port.postMessage({
      type: 'logs-batch',
      data: this.logs
    });

    // Step 8-3: 切断時の処理を設定
    port.onDisconnect.addListener(() => {
      console.log('[Step 8-4] ログビューアー接続切断');
      this.connections.delete(port);
    });

    // Step 8-5: メッセージ受信ハンドラ設定
    port.onMessage.addListener((msg) => {
      if (msg.type === 'get-logs') {
        // Step 8-6: ログ取得要求に応答
        port.postMessage({
          type: 'logs-batch',
          data: this.logs
        });
      } else if (msg.type === 'clear') {
        // Step 8-7: ログクリア要求を処理
        this.clear(msg.category);
      }
    });
  }

  /**
   * Step 9: ログをクリア
   */
  clear(category = null) {
    // Step 9-1: カテゴリ指定の確認
    if (!category) {
      // Step 9-2: 全ログクリア
      console.log('[Step 9-2] 全ログをクリア');
      this.logs = [];
    } else {
      // Step 9-3: カテゴリ別クリア
      console.log(`[Step 9-3] ${category}カテゴリのログをクリア`);
      this.logs = this.logs.filter(log => {
        if (category === 'error') {
          return log.level !== 'error';
        } else if (category === 'system') {
          return log.category !== 'system';
        } else {
          return log.ai !== category;
        }
      });
    }

    // Step 9-4: クリア通知をブロードキャスト
    this.broadcast({ type: 'clear', category });
  }

  /**
   * Step 10: ログを取得
   */
  getLogs(filter = {}) {
    // Step 10-1: フィルタ条件でログを抽出
    console.log('[Step 10-1] ログ取得', filter);

    return this.logs.filter(log => {
      // Step 10-2: カテゴリフィルタ
      if (filter.category && log.category !== filter.category) return false;
      // Step 10-3: レベルフィルタ
      if (filter.level && log.level !== filter.level) return false;
      // Step 10-4: AIフィルタ
      if (filter.ai && log.ai !== filter.ai) return false;
      return true;
    });
  }
}

// Step 11: グローバルインスタンスの作成とエクスポート
export const logManager = new LogManager();

// Step 12: グローバル設定（Chrome拡張機能用）
if (typeof globalThis !== 'undefined') {
  globalThis.logManager = logManager;
  console.log('[Step 12] LogManagerをグローバル空間に登録完了');
}