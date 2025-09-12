/**
 * @fileoverview リトライマネージャー - 失敗時の自動リトライ処理を管理
 * 
 * ■ リトライ条件と記録タイミング
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 【AI操作時に即座に記録】（発生した瞬間に記録される）
 * ├─ 1. 処理失敗 (recordFailedTask): AI処理でエラーが発生
 * └─ 2. 応答取得失敗 (recordResponseFailure): スプレッドシート書き込みエラー
 * 
 * 【グループ完了後にチェック】（全タスク処理後に確認される）
 * ├─ 3. 空白セル (recordEmptyTask): 回答が空または空白文字のみ
 * └─ 4. 待機テキスト (isWaitingText): 「お待ちください...」等と完全一致
 * 
 * ■ リトライ実行タイミング
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 1. グループ内の全タスク処理完了後
 * 2. 待機テキストチェック: 5秒間隔で最大10分間
 * 3. リトライ実行: 段階的遅延後に実行
 * 
 * ■ グループ処理の停止条件
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * - リトライ回数が上限（10回）に達した場合
 * - グループ内に未完了タスクが残っている場合
 * → 次のグループへは進まず、処理を停止
 * 
 * ■ リトライ動作フロー
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * [グループ処理開始]
 *     ↓
 * [全タスク処理]
 *     ↓
 * [完了待機: 5秒ごとにチェック、最大10分]
 *     ↓
 * [リトライ対象収集]
 *     ├─ 失敗タスク (recordFailedTask)
 *     ├─ 空白セル (recordEmptyTask)
 *     ├─ 応答取得失敗 (recordResponseFailure)
 *     └─ 待機テキスト (isWaitingText)
 *     ↓
 * [遅延時間待機]
 *     - 1回目: 5秒
 *     - 2回目: 10秒
 *     - 3回目: 30秒
 *     - 4回目: 1分
 *     - 5回目: 2分
 *     - 6回目: 5分
 *     - 7回目: 10分
 *     - 8回目: 20分
 *     - 9回目: 30分
 *     - 10回目: 1時間
 *     ↓
 * [リトライ実行] → 失敗時は次回遅延へ（最大10回）
 *     ↓
 * [完了チェック]
 *     ├─ 全タスク完了 → 次のグループへ
 *     └─ 未完了あり → 処理停止
 * 
 * ■ 設定ファイル
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * src/config/retry-patterns.json で管理
 * - waitingTextPatterns: 待機テキストパターン
 * - maxRetryCount: 最大リトライ回数
 * - retryDelays: 各回の遅延時間（ミリ秒）
 */

// ブラウザ環境用のデフォルト値設定（動的インポートを使用しない）
const isNode = false;  // ブラウザ環境として扱う
const fs = null;
const path = null;
const fileURLToPath = null;
const dirname = null;

// PC識別子のインポート
import { PCIdentifier } from '../utils/pc-identifier.js';

export class RetryManager {
  constructor(logger = console) {
    this.logger = logger;
    
    // PC識別子を取得
    try {
      this.pcIdentifier = PCIdentifier.getInstance();
      this.pcId = this.pcIdentifier.getId();
      this.logger.log(`[RetryManager] PC ID: ${this.pcId}`);
    } catch (error) {
      this.pcId = 'unknown';
      this.logger.warn('[RetryManager] PC ID取得失敗:', error);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 設定ファイル読み込み
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.loadRetryPatterns();
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // リトライ対象タスクの記録用Map
    // グループごとに失敗タスクを管理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.groupFailedTasks = new Map();      // 処理失敗: groupId -> Map(column -> Set<task>)
    this.groupEmptyTasks = new Map();       // 空白セル: groupId -> Map(column -> Set<task>)
    this.groupResponseFailures = new Map(); // 応答失敗: groupId -> Map(column -> Set<task>)
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // リトライ管理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.groupRetryCount = new Map();   // 各グループのリトライ回数
    this.groupRetryStats = new Map();   // リトライ統計情報
    this.groupRetryTimers = new Map();  // 遅延実行タイマー
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // デフォルト設定（設定ファイルで上書き）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.maxGroupRetryCount = 10;       // 最大10回リトライ
    this.groupRetryDelays = [];         // 段階的遅延時間配列
    this.waitingTextPatterns = [];      // 待機テキストパターン
    this.minCharacterThreshold = 100;   // 最小文字数閾値
  }
  
  /**
   * リトライパターン設定をファイルから読み込み
   */
  async loadRetryPatterns() {
    // ブラウザ環境の場合はデフォルト値を使用
    if (!isNode || !fs || !path) {
      this.waitingTextPatterns = ['お待ちください...', '現在操作中です'];
      this.maxGroupRetryCount = 10;
      this.minCharacterThreshold = 100;
      this.groupRetryDelays = [
        30000,   // 1回目: 30秒待機
        60000,   // 2回目: 1分待機
        300000,  // 3回目: 5分待機
        600000,  // 4回目: 10分待機
        1200000, // 5回目: 20分待機
        2400000, // 6回目: 40分待機
        3600000, // 7回目: 60分待機
        5400000, // 8回目: 90分待機
        7200000, // 9回目: 120分待機
        9000000  // 10回目: 150分待機
      ];
      this.logger.log('[RetryManager] ブラウザ環境のため、デフォルト設定を使用します');
      return;
    }
    
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const configPath = path.join(__dirname, '../config/retry-patterns.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      this.waitingTextPatterns = config.waitingTextPatterns || [];
      this.maxGroupRetryCount = config.retryConfig?.maxRetryCount || 10;
      this.minCharacterThreshold = config.retryConfig?.minCharacterThreshold || 100;
      this.groupRetryDelays = config.retryConfig?.retryDelays || [
        5000, 10000, 30000, 60000, 120000, 
        300000, 600000, 1200000, 1800000, 3600000
      ];
      
      this.logger.log('[RetryManager] 設定ファイルを読み込みました:', {
        待機パターン数: this.waitingTextPatterns.length,
        最大リトライ回数: this.maxGroupRetryCount,
        最小文字数閾値: this.minCharacterThreshold
      });
    } catch (error) {
      this.logger.warn('[RetryManager] 設定ファイルの読み込みに失敗。デフォルト値を使用します:', error.message);
      // デフォルト値を設定
      this.waitingTextPatterns = ['お待ちください...', '現在操作中です'];
      this.maxGroupRetryCount = 10;
      this.minCharacterThreshold = 100;
      this.groupRetryDelays = [
        30000,   // 1回目: 30秒待機
        60000,   // 2回目: 1分待機
        300000,  // 3回目: 5分待機
        600000,  // 4回目: 10分待機
        1200000, // 5回目: 20分待機
        2400000, // 6回目: 40分待機
        3600000, // 7回目: 60分待機
        5400000, // 8回目: 90分待機
        7200000, // 9回目: 120分待機
        9000000  // 10回目: 150分待機
      ];
    }
  }

  /**
   * リトライ可能な処理を実行
   * @param {Object} config - リトライ設定
   * @param {Function} config.action - 実行する処理
   * @param {Function} config.isSuccess - 成功判定関数
   * @param {Function} config.onRetry - リトライ前に実行する処理（オプション）
   * @param {number} config.maxRetries - 最大リトライ回数（デフォルト: 3）
   * @param {number} config.retryDelay - リトライ間の待機時間（ミリ秒、デフォルト: 2000）
   * @param {string} config.actionName - 処理名（ログ用）
   * @param {Object} config.context - 処理のコンテキスト情報
   * @returns {Promise<Object>} 処理結果
   */
  async executeWithRetry(config) {
    const {
      action,
      isSuccess = (result) => result && result.success !== false,
      onRetry = null,
      maxRetries = 3,
      retryDelay = 2000,
      actionName = '処理',
      context = {}
    } = config;

    let retryCount = 0;
    let lastResult = null;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        // リトライの場合はログ出力
        if (retryCount > 0) {
          this.logger.log(`[RetryManager] ${actionName} 再試行 ${retryCount}/${maxRetries}`, context);
        }

        // 処理を実行
        lastResult = await action();

        // 成功判定
        if (isSuccess(lastResult)) {
          if (retryCount > 0) {
            this.logger.log(`[RetryManager] ✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
          }
          return {
            success: true,
            result: lastResult,
            retryCount
          };
        }

        // 失敗の詳細をログ
        this.logger.warn(`[RetryManager] ${actionName} 失敗`, {
          ...context,
          attempt: retryCount + 1,
          result: lastResult
        });

      } catch (error) {
        lastError = error;
        this.logger.error(`[RetryManager] ${actionName} エラー`, {
          ...context,
          attempt: retryCount + 1,
          error: error.message
        });
      }

      // 最大リトライ回数に達した場合
      retryCount++;
      if (retryCount >= maxRetries) {
        this.logger.error(`[RetryManager] ❌ ${actionName} が${maxRetries}回失敗しました`, context);
        return {
          success: false,
          result: lastResult,
          error: lastError,
          retryCount
        };
      }

      // リトライ前の処理を実行
      if (onRetry) {
        this.logger.log(`[RetryManager] リトライ前処理を実行中...`, context);
        try {
          await onRetry(retryCount, lastResult, lastError);
        } catch (retryError) {
          this.logger.error(`[RetryManager] リトライ前処理でエラー`, {
            ...context,
            error: retryError.message
          });
          // リトライ前処理が失敗しても続行
        }
      }

      // リトライ前の待機
      if (retryDelay > 0) {
        this.logger.log(`[RetryManager] ${retryDelay}ms 待機中...`);
        await this.delay(retryDelay);
      }
    }

    // ここには到達しないはず
    return {
      success: false,
      result: lastResult,
      error: lastError,
      retryCount
    };
  }

  /**
   * 段階的な遅延時間でリトライを実行
   * @param {Object} config - リトライ設定
   * @param {Function} config.action - 実行する処理
   * @param {Function} config.isSuccess - 成功判定関数
   * @param {string} config.actionName - 処理名（ログ用）
   * @param {Object} config.context - 処理のコンテキスト情報
   * @returns {Promise<Object>} 処理結果
   */
  async executeWithProgressiveRetry(config) {
    const {
      action,
      isSuccess = (result) => result && result.success !== false,
      actionName = '処理',
      context = {}
    } = config;

    let retryCount = 0;
    let lastResult = null;
    let lastError = null;
    const maxRetries = this.maxGroupRetryCount || 10;
    const retryDelays = this.groupRetryDelays || [
      30000,   // 1回目: 30秒待機
      60000,   // 2回目: 1分待機
      300000,  // 3回目: 5分待機
      600000,  // 4回目: 10分待機
      1200000, // 5回目: 20分待機
      2400000, // 6回目: 40分待機
      3600000, // 7回目: 60分待機
      5400000, // 8回目: 90分待機
      7200000, // 9回目: 120分待機
      9000000  // 10回目: 150分待機
    ];

    while (retryCount < maxRetries) {
      try {
        // リトライの場合はログ出力
        if (retryCount > 0) {
          const delay = retryDelays[retryCount - 1] || retryDelays[retryDelays.length - 1];
          const delaySeconds = Math.round(delay / 1000);
          const delayDisplay = delaySeconds < 60 ? `${delaySeconds}秒` : `${Math.round(delaySeconds / 60)}分`;
          this.logger.log(`[RetryManager] ${actionName} 再試行 ${retryCount}/${maxRetries} (${delayDisplay}待機後)`, context);
        }

        // 処理を実行
        lastResult = await action();

        // 成功判定
        if (isSuccess(lastResult)) {
          if (retryCount > 0) {
            this.logger.log(`[RetryManager] ✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
          }
          return {
            success: true,
            result: lastResult,
            retryCount
          };
        }

        // 失敗の詳細をログ
        this.logger.warn(`[RetryManager] ${actionName} 失敗`, {
          ...context,
          attempt: retryCount + 1,
          result: lastResult
        });

      } catch (error) {
        lastError = error;
        this.logger.error(`[RetryManager] ${actionName} エラー`, {
          ...context,
          attempt: retryCount + 1,
          error: error.message
        });
      }

      // 最大リトライ回数に達した場合
      retryCount++;
      if (retryCount >= maxRetries) {
        this.logger.error(`[RetryManager] ❌ ${actionName} が${maxRetries}回失敗しました`, context);
        return {
          success: false,
          result: lastResult,
          error: lastError,
          retryCount
        };
      }

      // 段階的な遅延時間で待機
      const delay = retryDelays[retryCount - 1] || retryDelays[retryDelays.length - 1];
      const delaySeconds = Math.round(delay / 1000);
      const delayDisplay = delaySeconds < 60 ? `${delaySeconds}秒` : `${Math.round(delaySeconds / 60)}分`;
      this.logger.log(`[RetryManager] ${delayDisplay}待機中...`);
      await this.delay(delay);
    }

    // ここには到達しないはず
    return {
      success: false,
      result: lastResult,
      error: lastError,
      retryCount
    };
  }

  /**
   * ウィンドウ再作成を伴うリトライ
   * @param {Object} config - リトライ設定
   * @param {Function} config.createWindow - ウィンドウ作成関数
   * @param {Function} config.closeWindow - ウィンドウクローズ関数
   * @param {Function} config.setupWindow - ウィンドウセットアップ関数（スクリプト注入など）
   * @param {Function} config.executePhase - 実行するフェーズ
   * @param {Object} config.task - タスク情報
   * @param {Object} config.context - 実行コンテキスト
   * @returns {Promise<Object>} 処理結果
   */
  async executeWithWindowRetry(config) {
    const {
      createWindow,
      closeWindow,
      setupWindow,
      executePhase,
      task,
      context,
      maxRetries = 3
    } = config;

    return await this.executeWithRetry({
      action: async () => {
        return await executePhase(context.tabId, task);
      },
      
      isSuccess: (result) => {
        // 成功判定（カスタマイズ可能）
        if (!result || result.success === false) return false;
        
        // 機能選択の場合の追加チェック
        if (config.checkFunction) {
          const requestedFunction = task.function || '通常';
          const displayedFunction = result.displayedFunction;
          if (requestedFunction !== '通常' && (!displayedFunction || displayedFunction === '')) {
            return false;
          }
        }
        
        return true;
      },
      
      onRetry: async (retryCount) => {
        this.logger.warn(`[RetryManager] ウィンドウを再作成します（${task.column}${task.row}）`);
        
        // 古いウィンドウを閉じる
        if (closeWindow && context.tabId) {
          await closeWindow(context.tabId);
        }
        
        // 新しいウィンドウを作成
        const newTabId = await createWindow(task, context.position);
        if (!newTabId) {
          throw new Error(`ウィンドウ作成失敗: ${task.column}${task.row}`);
        }
        
        // コンテキストを更新
        context.tabId = newTabId;
        
        // ウィンドウのセットアップ
        if (setupWindow) {
          await setupWindow(newTabId, task);
        }
      },
      
      maxRetries,
      actionName: config.phaseName || 'フェーズ実行',
      context: {
        cell: `${task.column}${task.row}`,
        aiType: task.aiType,
        phase: config.phaseName
      }
    });
  }

  /**
   * 指定時間待機
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * エクスポネンシャル・バックオフでリトライを実行
   * @param {Object} config - リトライ設定
   * @param {Function} config.action - 実行する処理
   * @param {Function} config.isSuccess - 成功判定関数
   * @param {number} config.maxRetries - 最大リトライ回数（デフォルト: 3）
   * @param {number} config.initialDelay - 初期遅延時間（ミリ秒、デフォルト: 1000）
   * @param {number} config.maxDelay - 最大遅延時間（ミリ秒、デフォルト: 60000）
   * @param {string} config.actionName - 処理名（ログ用）
   * @param {Object} config.context - 処理のコンテキスト情報
   * @returns {Promise<Object>} 処理結果
   */
  async executeWithExponentialBackoff(config) {
    const {
      action,
      isSuccess = (result) => result && result.success !== false,
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 60000,
      actionName = '処理',
      context = {}
    } = config;

    let retryCount = 0;
    let lastResult = null;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        // リトライの場合はログ出力
        if (retryCount > 0) {
          const delay = Math.min(initialDelay * Math.pow(2, retryCount - 1), maxDelay);
          const delayDisplay = delay < 1000 ? `${delay}ms` : `${Math.round(delay / 1000)}秒`;
          this.logger.log(`[RetryManager] ${actionName} 再試行 ${retryCount}/${maxRetries} (${delayDisplay}待機後)`, context);
        }

        // 処理を実行
        lastResult = await action();

        // 成功判定
        if (isSuccess(lastResult)) {
          if (retryCount > 0) {
            this.logger.log(`[RetryManager] ✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
          }
          return {
            success: true,
            result: lastResult,
            retryCount
          };
        }

        // 失敗の詳細をログ
        this.logger.warn(`[RetryManager] ${actionName} 失敗`, {
          ...context,
          attempt: retryCount + 1,
          result: lastResult
        });

      } catch (error) {
        lastError = error;
        this.logger.error(`[RetryManager] ${actionName} エラー`, {
          ...context,
          attempt: retryCount + 1,
          error: error.message
        });
      }

      // 最大リトライ回数に達した場合
      retryCount++;
      if (retryCount >= maxRetries) {
        this.logger.error(`[RetryManager] ❌ ${actionName} が${maxRetries}回失敗しました`, context);
        return {
          success: false,
          result: lastResult,
          error: lastError,
          retryCount
        };
      }

      // エクスポネンシャル・バックオフで待機
      const delay = Math.min(initialDelay * Math.pow(2, retryCount - 1), maxDelay);
      await this.delay(delay);
    }

    return {
      success: false,
      result: lastResult,
      error: lastError,
      retryCount
    };
  }

  /**
   * シンプルなリトライ（固定間隔）
   * @param {Object} config - リトライ設定
   * @param {Function} config.action - 実行する処理
   * @param {Function} config.isSuccess - 成功判定関数
   * @param {number} config.maxRetries - 最大リトライ回数（デフォルト: 10）
   * @param {number} config.interval - リトライ間隔（ミリ秒、デフォルト: 1000）
   * @param {string} config.actionName - 処理名（ログ用）
   * @param {Object} config.context - 処理のコンテキスト情報
   * @returns {Promise<Object>} 処理結果
   */
  async executeSimpleRetry(config) {
    const {
      action,
      isSuccess = (result) => result !== undefined && result !== null,
      maxRetries = 10,
      interval = 1000,
      actionName = '処理',
      context = {}
    } = config;

    let retryCount = 0;
    let lastResult = null;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        // 処理を実行
        lastResult = await action();

        // 成功判定
        if (isSuccess(lastResult)) {
          if (retryCount > 0) {
            this.logger.log(`[RetryManager] ✅ ${actionName} 成功（${retryCount + 1}/${maxRetries}回目）`, context);
          }
          return {
            success: true,
            result: lastResult,
            retryCount
          };
        }

      } catch (error) {
        lastError = error;
        if (retryCount === 0) {
          this.logger.log(`[RetryManager] ${actionName} 初回エラー、リトライ開始`, context);
        }
      }

      retryCount++;
      if (retryCount >= maxRetries) {
        this.logger.error(`[RetryManager] ❌ ${actionName} が${maxRetries}回失敗しました`, context);
        return {
          success: false,
          result: lastResult,
          error: lastError,
          retryCount
        };
      }

      // 固定間隔で待機
      await this.delay(interval);
    }

    return {
      success: false,
      result: lastResult,
      error: lastError,
      retryCount
    };
  }

  /**
   * 【AI操作時に即座に記録】処理失敗タスクを記録
   * AI処理でエラーが発生した瞬間に記録される
   * @param {string} groupId - グループID
   * @param {Object} task - タスク情報
   */
  recordFailedTask(groupId, task) {
    if (!this.groupFailedTasks.has(groupId)) {
      this.groupFailedTasks.set(groupId, new Map());
    }
    const columnMap = this.groupFailedTasks.get(groupId);
    
    if (!columnMap.has(task.column)) {
      columnMap.set(task.column, new Set());
    }
    columnMap.get(task.column).add(task);
    
    this.logger.log(`[RetryManager] 失敗タスクを記録: グループ${groupId} - ${task.column}${task.row}`);
  }

  /**
   * 【グループ完了後にチェック】空白セルを記録
   * グループ内の全タスク処理完了後にチェックされる
   * @param {string} groupId - グループID
   * @param {Object} task - タスク情報
   */
  recordEmptyTask(groupId, task) {
    if (!this.groupEmptyTasks.has(groupId)) {
      this.groupEmptyTasks.set(groupId, new Map());
    }
    const columnMap = this.groupEmptyTasks.get(groupId);
    
    if (!columnMap.has(task.column)) {
      columnMap.set(task.column, new Set());
    }
    columnMap.get(task.column).add(task);
    
    this.logger.log(`[RetryManager] 空白セルを記録: グループ${groupId} - ${task.column}${task.row}`);
  }

  /**
   * 【AI操作時に即座に記録】応答取得失敗を記録
   * スプレッドシート書き込みエラーが発生した瞬間に記録される
   * @param {string} groupId - グループID
   * @param {Object} task - タスク情報
   */
  recordResponseFailure(groupId, task) {
    if (!this.groupResponseFailures.has(groupId)) {
      this.groupResponseFailures.set(groupId, new Map());
    }
    const columnMap = this.groupResponseFailures.get(groupId);
    
    if (!columnMap.has(task.column)) {
      columnMap.set(task.column, new Set());
    }
    columnMap.get(task.column).add(task);
    
    this.logger.log(`[RetryManager] 応答取得失敗を記録: グループ${groupId} - ${task.column}${task.row}`);
  }

  /**
   * 【グループ完了後にチェック】テキストが待機パターンに一致するかチェック
   * グループ内の全タスク処理完了後、5秒間隔で最大10分間チェックされる
   * 排他制御マーカー（現在操作中です_タイムスタンプ_PC_機能）も待機対象として扱う
   * @param {string} text - チェック対象のテキスト
   * @returns {boolean} 待機パターンに一致する場合true
   */
  isWaitingText(text) {
    if (!text) return false;
    
    // 排他制御マーカー（前方一致）をチェック
    if (text.startsWith('現在操作中です_')) {
      // マーカー形式: 現在操作中です_timestamp_pcId_function
      const parts = text.split('_');
      if (parts.length >= 3) {
        const markerPcId = parts[2];
        
        // 自分のPCのマーカーなら待機しない
        if (markerPcId === this.pcId) {
          this.logger.log(`[RetryManager] 自分のマーカーをスキップ: ${markerPcId}`);
          return false;
        }
      }
      
      // 他のPCのマーカーなら待機
      this.logger.log(`[RetryManager] 他のPCの処理を待機: ${text.substring(0, 50)}...`);
      return true;
    }
    
    // その他の待機テキストは完全一致でチェック
    return this.waitingTextPatterns.some(pattern => text === pattern);
  }

  /**
   * タスクがリトライ対象かチェック
   * @param {Object} task - タスク情報
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {boolean} リトライが必要な場合true
   */
  shouldRetryTask(task, spreadsheetData) {
    const answer = this.getCurrentAnswer(task, spreadsheetData);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // リトライ条件判定（OR条件）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // 条件1: 空白セル
    // - 回答が存在しない
    // - 空文字列
    // - 空白文字のみ
    if (!answer || answer.trim() === '') {
      this.logger.log(`[RetryManager] リトライ対象（空白）: ${task.column}${task.row}`);
      return true;
    }
    
    // 条件2: 待機テキストパターン
    // - 「お待ちください...」（完全一致）
    // - 「現在操作中です」（完全一致）
    // - 設定ファイルで追加されたパターン（完全一致）
    if (this.isWaitingText(answer)) {
      this.logger.log(`[RetryManager] リトライ対象（待機テキスト）: ${task.column}${task.row} - "${answer}"`);
      return true;
    }
    
    // 条件3: 文字数が閾値以下
    // - AIの回答が不完全な可能性がある
    // - デフォルトは100文字以下
    if (answer.length <= this.minCharacterThreshold) {
      this.logger.log(`[RetryManager] リトライ対象（文字数不足）: ${task.column}${task.row} - ${answer.length}文字`);
      return true;
    }
    
    // 条件4: 応答取得失敗はrecordResponseFailureで別途記録
    // ここではチェックしない（executeGroupRetriesで処理）
    
    return false;
  }

  /**
   * グループ内の全タスクが完了するまで待機
   * @param {string} groupId - グループID
   * @param {Function} checkFunc - 完了チェック関数
   * @param {number} checkInterval - チェック間隔（ミリ秒）
   * @param {number} maxWaitTime - 最大待機時間（ミリ秒）
   * @returns {Promise<boolean>} 完了した場合true
   */
  async waitForGroupCompletion(groupId, checkFunc, checkInterval = 5000, maxWaitTime = 600000) {
    const startTime = Date.now();
    
    this.logger.log(`[RetryManager] グループ${groupId}の完了を待機中...`);
    
    while (Date.now() - startTime < maxWaitTime) {
      const isComplete = await checkFunc(groupId);
      
      if (isComplete) {
        this.logger.log(`[RetryManager] グループ${groupId}が完了しました`);
        return true;
      }
      
      // 待機
      await this.delay(checkInterval);
    }
    
    this.logger.warn(`[RetryManager] グループ${groupId}の完了待機がタイムアウトしました（${maxWaitTime / 1000}秒）`);
    return false;
  }

  /**
   * グループ完了時に呼び出される統合リトライ処理
   * @param {string} groupId - グループID
   * @param {Function} processColumnFunc - 列処理関数
   * @param {boolean} isTestMode - テストモード
   * @param {Object} spreadsheetData - 最新のスプレッドシートデータ
   * @returns {Promise<Object>} リトライ結果
   */
  async executeGroupRetries(groupId, processColumnFunc, isTestMode = false, spreadsheetData = null) {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ステップ1: リトライ対象タスクの収集
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const failedTasks = this.groupFailedTasks.get(groupId);
    const emptyTasks = this.groupEmptyTasks.get(groupId);
    const responseFailed = this.groupResponseFailures.get(groupId);
    
    // リトライ対象タスクを収集
    const allRetryTasks = new Map(); // column -> Set<task>
    
    // 失敗タスクを追加
    if (failedTasks) {
      for (const [column, tasks] of failedTasks) {
        if (!allRetryTasks.has(column)) {
          allRetryTasks.set(column, new Set());
        }
        for (const task of tasks) {
          allRetryTasks.get(column).add(task);
        }
      }
    }
    
    // 空白セルを追加
    if (emptyTasks) {
      for (const [column, tasks] of emptyTasks) {
        if (!allRetryTasks.has(column)) {
          allRetryTasks.set(column, new Set());
        }
        for (const task of tasks) {
          allRetryTasks.get(column).add(task);
        }
      }
    }
    
    // 応答取得失敗タスクを追加
    if (responseFailed) {
      for (const [column, tasks] of responseFailed) {
        if (!allRetryTasks.has(column)) {
          allRetryTasks.set(column, new Set());
        }
        for (const task of tasks) {
          allRetryTasks.get(column).add(task);
        }
      }
    }
    
    // スプレッドシートから待機テキストのタスクをチェック
    if (spreadsheetData) {
      // すべてのタスクについて待機テキストをチェック
      for (const [column, tasks] of allRetryTasks) {
        for (const task of tasks) {
          if (this.shouldRetryTask(task, spreadsheetData)) {
            // すでに追加されているが、ログのために記録
            this.logger.log(`[RetryManager] 待機テキスト検出: ${task.column}${task.row}`);
          }
        }
      }
    }
    
    // リトライ対象がない場合
    if (allRetryTasks.size === 0) {
      return {
        hasRetries: false,
        successful: 0,
        failed: 0,
        total: 0
      };
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ステップ2: リトライ回数チェック
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const retryCount = this.groupRetryCount.get(groupId) || 0;
    if (retryCount >= this.maxGroupRetryCount) {
      this.logger.error(`[RetryManager] ⛔ グループ${groupId}の再実行回数上限に達しました (${retryCount}/${this.maxGroupRetryCount}回)`);
      this.logger.error(`[RetryManager] ⛔ 未完了タスクが残っているため、処理を停止します`);
      
      // 未完了タスクの詳細をログ
      for (const [column, tasks] of allRetryTasks) {
        const taskList = Array.from(tasks).map(t => `${t.column}${t.row}`).join(', ');
        this.logger.error(`[RetryManager] ⛔ ${column}列の未完了タスク: ${taskList}`);
      }
      
      return {
        hasRetries: false,
        successful: 0,
        failed: this.countTasks(allRetryTasks),
        total: this.countTasks(allRetryTasks),
        reachedLimit: true,
        shouldStopProcessing: true  // ← 処理停止フラグ
      };
    }
    
    // リトライ回数をインクリメント
    this.groupRetryCount.set(groupId, retryCount + 1);
    
    // 統計情報を初期化
    if (!this.groupRetryStats.has(groupId)) {
      this.groupRetryStats.set(groupId, {
        totalRetries: 0,
        successfulRetries: 0,
        failedRetries: 0,
        retriesByColumn: new Map()
      });
    }
    const stats = this.groupRetryStats.get(groupId);
    stats.totalRetries++;
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ステップ3: 遅延時間の決定
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // retryCount: 0 → 5秒
    // retryCount: 1 → 10秒
    // retryCount: 2 → 30秒
    // ... （段階的に増加）
    const delayMs = this.groupRetryDelays[retryCount] || this.groupRetryDelays[this.groupRetryDelays.length - 1];
    const delaySeconds = Math.round(delayMs / 1000);
    const delayDisplay = delaySeconds < 60 ? `${delaySeconds}秒` : `${Math.round(delaySeconds / 60)}分`;
    
    // タスク総数を計算
    const totalTasks = this.countTasks(allRetryTasks);
    
    this.logger.log(`[RetryManager] 🔄 グループ${groupId}のリトライ開始 (${retryCount + 1}/${this.maxGroupRetryCount}回目)`);
    this.logger.log(`[RetryManager] ⏰ ${delayDisplay}後に${totalTasks}個のタスクを再実行します`);
    
    // 既存のタイマーがあればクリア
    if (this.groupRetryTimers.has(groupId)) {
      clearTimeout(this.groupRetryTimers.get(groupId));
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ステップ4: 遅延実行タイマーの設定
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        this.logger.log(`[RetryManager] 🔄 グループ${groupId}の遅延再実行開始 (${delayDisplay}後)`);
        
        let successCount = 0;
        let failCount = 0;
        
        // 各列のタスクを処理
        for (const [column, tasks] of allRetryTasks) {
          const tasksArray = Array.from(tasks);
          
          // 列ごとの統計を更新
          if (!stats.retriesByColumn.has(column)) {
            stats.retriesByColumn.set(column, { attempts: 0, successes: 0 });
          }
          stats.retriesByColumn.get(column).attempts++;
          
          try {
            this.logger.log(`[RetryManager] ${column}列の${tasksArray.length}個のタスクを再実行`);
            await processColumnFunc(column, tasksArray, isTestMode);
            
            successCount += tasksArray.length;
            stats.retriesByColumn.get(column).successes++;
            stats.successfulRetries++;
          } catch (error) {
            this.logger.error(`[RetryManager] ${column}列の再実行エラー:`, error);
            failCount += tasksArray.length;
            stats.failedRetries++;
          }
        }
        
        // タイマーをクリア
        this.groupRetryTimers.delete(groupId);
        
        // 再実行後にタスクリストをクリア
        this.groupFailedTasks.delete(groupId);
        this.groupEmptyTasks.delete(groupId);
        
        // 統計情報を表示
        this.logGroupRetryStats(groupId);
        
        // 実行後の未完了チェック
        const hasUncompletedTasks = failCount > 0;
        const isLastRetry = (retryCount + 1) >= this.maxGroupRetryCount;
        
        resolve({
          hasRetries: true,
          successful: successCount,
          failed: failCount,
          total: totalTasks,
          shouldStopProcessing: hasUncompletedTasks && isLastRetry  // 未完了かつ最終リトライの場合停止
        });
      }, delayMs);
      
      // タイマーを保存
      this.groupRetryTimers.set(groupId, timer);
    });
  }

  /**
   * タスク数をカウント
   * @private
   */
  countTasks(taskMap) {
    let count = 0;
    for (const [column, tasks] of taskMap) {
      count += tasks.size;
    }
    return count;
  }

  /**
   * グループの最終完了状態をチェック
   * @param {string} groupId - グループID
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Object} 完了状態
   */
  checkFinalGroupStatus(groupId, spreadsheetData) {
    const uncompletedTasks = [];
    
    // 記録されているすべてのタスクをチェック
    const allTasks = new Set();
    
    // 各Mapからタスクを収集
    [this.groupFailedTasks, this.groupEmptyTasks, this.groupResponseFailures].forEach(map => {
      const tasksMap = map.get(groupId);
      if (tasksMap) {
        for (const [, taskSet] of tasksMap) {
          taskSet.forEach(task => allTasks.add(task));
        }
      }
    });
    
    // 各タスクの最終状態をチェック
    for (const task of allTasks) {
      if (this.shouldRetryTask(task, spreadsheetData)) {
        uncompletedTasks.push(task);
      }
    }
    
    return {
      isComplete: uncompletedTasks.length === 0,
      uncompletedTasks: uncompletedTasks,
      uncompletedCount: uncompletedTasks.length
    };
  }

  /**
   * グループリトライ統計を表示
   * @param {string} groupId - グループID
   */
  logGroupRetryStats(groupId) {
    const stats = this.groupRetryStats.get(groupId);
    if (!stats || stats.totalRetries === 0) {
      return;
    }
    
    this.logger.log(`[RetryManager] 📊 グループ${groupId}の再実行統計:`);
    this.logger.log(`  - 総再実行回数: ${stats.totalRetries}`);
    this.logger.log(`  - 成功: ${stats.successfulRetries}`);
    this.logger.log(`  - 失敗: ${stats.failedRetries}`);
    this.logger.log(`  - 成功率: ${stats.totalRetries > 0 ? Math.round((stats.successfulRetries / stats.totalRetries) * 100) : 0}%`);
    
    if (stats.retriesByColumn.size > 0) {
      this.logger.log(`  - 列別統計:`);
      for (const [column, columnStats] of stats.retriesByColumn) {
        const successRate = columnStats.attempts > 0 ? Math.round((columnStats.successes / columnStats.attempts) * 100) : 0;
        this.logger.log(`    ${column}列: ${columnStats.attempts}回実行, ${columnStats.successes}回成功 (${successRate}%)`);
      }
    }
  }

  /**
   * グループのリトライタイマーをキャンセル
   * @param {string} groupId - グループID
   */
  cancelGroupRetryTimer(groupId) {
    if (!this.groupRetryTimers.has(groupId)) {
      return;
    }
    
    clearTimeout(this.groupRetryTimers.get(groupId));
    this.groupRetryTimers.delete(groupId);
    this.logger.log(`[RetryManager] グループ${groupId}の再実行タイマーをキャンセル`);
  }

  /**
   * すべてのグループリトライタイマーをキャンセル
   */
  cancelAllGroupRetryTimers() {
    if (this.groupRetryTimers.size === 0) {
      return;
    }
    
    this.logger.log(`[RetryManager] ${this.groupRetryTimers.size}個のグループ再実行タイマーをキャンセルします`);
    
    for (const [groupId, timer] of this.groupRetryTimers) {
      clearTimeout(timer);
      this.logger.log(`[RetryManager] グループ${groupId}の再実行タイマーをキャンセル`);
    }
    
    this.groupRetryTimers.clear();
  }

  /**
   * 現在の回答を取得（スプレッドシートから）
   * @param {Object} task - タスク情報
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {string} 現在の回答
   */
  getCurrentAnswer(task, spreadsheetData) {
    if (!spreadsheetData || !spreadsheetData.data) {
      return '';
    }
    
    const rowData = spreadsheetData.data[task.row - 1];
    if (!rowData) {
      return '';
    }
    
    // 列インデックスを計算
    const columnIndex = this.columnToIndex(task.column);
    return rowData[columnIndex] || '';
  }

  /**
   * 列名をインデックスに変換
   * @private
   */
  columnToIndex(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 65) + 1;
    }
    return index - 1;
  }

  /**
   * AI自動切り替え機能付きリトライ
   * @param {Object} config - リトライ設定
   * @param {Function} config.executeTask - タスク実行関数
   * @param {Function} config.isSuccess - 成功判定関数
   * @param {Function} config.createFallbackTask - フォールバックタスク作成関数
   * @param {Object} config.originalTask - 元のタスク情報
   * @param {string} config.fallbackAI - フォールバック先AI
   * @param {string} config.fallbackModel - フォールバック先モデル
   * @param {string} config.fallbackFunction - フォールバック先機能
   * @param {Function} config.onAISwitchLog - AI切り替えログ関数
   * @returns {Promise<Object>} 実行結果
   */
  async executeWithAIFallback(config) {
    const {
      executeTask,
      isSuccess = (result) => result && result.success !== false,
      createFallbackTask,
      originalTask,
      fallbackAI = 'Claude',
      fallbackModel = '', // 空文字で最上位モデルを自動選択
      fallbackFunction = 'じっくり考える',
      onAISwitchLog,
      maxRetries = 1
    } = config;

    try {
      // 最初のAIで実行
      const originalResult = await executeTask(originalTask);
      
      // 成功判定
      if (isSuccess(originalResult)) {
        this.logger.log(`[RetryManager] ✅ ${originalTask.aiType}での実行成功`);
        return {
          success: true,
          result: originalResult,
          aiSwitched: false,
          finalAI: originalTask.aiType
        };
      }

      // 失敗時のフォールバック処理
      this.logger.log(`[RetryManager] ❌ ${originalTask.aiType}での実行失敗、${fallbackAI}に切り替えます`);
      
      // AI切り替えログ
      if (onAISwitchLog) {
        await onAISwitchLog({
          cell: `${originalTask.column}${originalTask.row}`,
          fromAI: originalTask.aiType,
          toAI: fallbackAI,
          fromFunction: originalTask.function || '通常',
          toFunction: fallbackFunction,
          toModel: fallbackModel || '最上位モデル',
          reason: 'AI処理失敗による自動切り替え',
          taskId: originalTask.taskId
        });
      }

      // フォールバックタスクを作成
      const fallbackTask = createFallbackTask ? 
        createFallbackTask(originalTask, fallbackAI, fallbackModel, fallbackFunction) :
        {
          ...originalTask,
          aiType: fallbackAI,
          model: fallbackModel,
          function: fallbackFunction
        };

      // フォールバックAIで実行
      const fallbackResult = await executeTask(fallbackTask);
      
      if (isSuccess(fallbackResult)) {
        this.logger.log(`[RetryManager] ✅ ${fallbackAI}での実行成功`);
        return {
          success: true,
          result: fallbackResult,
          aiSwitched: true,
          finalAI: fallbackAI,
          originalAI: originalTask.aiType
        };
      } else {
        this.logger.error(`[RetryManager] ❌ ${fallbackAI}での実行も失敗`);
        return {
          success: false,
          result: fallbackResult,
          aiSwitched: true,
          finalAI: fallbackAI,
          originalAI: originalTask.aiType,
          error: 'フォールバックAIも失敗'
        };
      }

    } catch (error) {
      this.logger.error(`[RetryManager] AIフォールバック実行エラー:`, error);
      return {
        success: false,
        error: error.message,
        aiSwitched: false
      };
    }
  }
}

// デフォルトインスタンスをエクスポート
export const retryManager = new RetryManager();