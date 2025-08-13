/**
 * @fileoverview テスト共通ユーティリティ
 * 
 * テストコード間で重複している機能を統合し、
 * 再利用可能な関数群を提供する。
 * 
 * 主な機能:
 * - タスク生成の統一化
 * - ログ出力の標準化
 * - ウィンドウ管理の共通化
 * - 設定管理の統一化
 */

/**
 * テスト設定のデフォルト値
 */
export const DEFAULT_TEST_CONFIG = {
  // AI設定
  aiTypes: ['chatgpt', 'claude', 'gemini'],
  defaultAiSelections: {
    chatgpt: true,
    claude: true,
    gemini: true
  },
  
  // ウィンドウ設定
  maxWindows: 4,
  windowPositions: [0, 1, 2, 3], // 左上、右上、左下、右下
  windowColumns: ['C', 'F', 'I', 'L'],
  
  // テスト実行設定
  defaultRepeatCount: 3,
  defaultWaitTime: { min: 5, max: 15 }, // 秒
  defaultTasksPerWindow: 3,
  
  // プロンプト設定
  testPrompts: [
    '今日は何日ですか？',
    '1+1は何ですか？',
    'こんにちは、調子はどうですか？'
  ]
};

/**
 * ウィンドウ位置名マッピング
 */
export const WINDOW_POSITION_NAMES = ['左上', '右上', '左下', '右下'];

/**
 * ログレベル定義
 */
export const LOG_LEVELS = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
};

/**
 * テスト用タスクデータ生成クラス
 */
export class TestTaskBuilder {
  constructor(config = {}) {
    this.config = { ...DEFAULT_TEST_CONFIG, ...config };
  }

  /**
   * ウィンドウ開閉テスト用のタスクリストを生成
   * 
   * @param {Object} options - 生成オプション
   * @param {Array<string>} options.aiTypes - 使用するAIタイプ
   * @param {number} options.windowCount - ウィンドウ数
   * @param {number} options.tasksPerWindow - ウィンドウあたりのタスク数
   * @returns {Array} タスクデータ配列
   */
  createWindowTestTasks(options = {}) {
    const {
      aiTypes = this.config.aiTypes,
      windowCount = this.config.maxWindows,
      tasksPerWindow = this.config.defaultTasksPerWindow
    } = options;

    const tasks = [];
    const columns = this.config.windowColumns;

    for (let i = 0; i < windowCount; i++) {
      const column = columns[i % columns.length];
      const aiType = aiTypes[i % aiTypes.length];

      for (let taskNum = 1; taskNum <= tasksPerWindow; taskNum++) {
        const taskData = {
          id: `test_${column}${taskNum}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          column: column,
          promptColumn: column,
          row: taskNum + 1,
          aiType: aiType,
          taskType: 'ai',
          prompt: `テストプロンプト${taskNum} for ${aiType} (${column}列)`,
          groupId: `test_group_${column}_${aiType}`,
          groupInfo: {
            type: 'single',
            columns: [column],
            promptColumn: column
          },
          // テストモード設定
          waitResponse: false,
          getResponse: false
        };

        tasks.push(taskData);
      }
    }

    return tasks;
  }

  /**
   * 3連続テスト用のタスクリストを生成
   * 
   * @param {string} aiType - 対象AIタイプ
   * @param {Array<string>} prompts - テスト用プロンプト
   * @returns {Array} タスクデータ配列
   */
  createConsecutiveTestTasks(aiType, prompts = this.config.testPrompts) {
    const tasks = [];
    const baseColumns = ['D', 'E', 'F'];
    const windowPositions = [0, 1, 2];

    prompts.forEach((prompt, promptIndex) => {
      baseColumns.forEach((promptColumn, columnIndex) => {
        const answerColumn = String.fromCharCode(promptColumn.charCodeAt(0) + 1);

        for (let repeat = 0; repeat < 3; repeat++) {
          tasks.push({
            id: `${aiType}_test_${promptIndex + 1}_col${columnIndex}_rep${repeat + 1}_${Date.now()}`,
            column: answerColumn,
            row: (repeat * prompts.length) + promptIndex + 2,
            promptColumn: promptColumn,
            prompt: prompt,
            aiType: aiType.toLowerCase(),
            taskType: 'ai',
            preferredPosition: windowPositions[columnIndex],
            groupId: `test_group_${aiType}_${promptColumn}`,
            groupInfo: {
              type: 'single',
              columns: ['C', promptColumn, answerColumn],
              promptColumn: promptColumn
            },
            logColumns: {
              log: 'C',
              layout: 'single'
            }
          });
        }
      });
    });

    return tasks;
  }

  /**
   * 最小限のスプレッドシートデータを生成
   * 
   * @param {string} spreadsheetId - スプレッドシートID
   * @returns {Object} スプレッドシートデータ
   */
  createMinimalSpreadsheetData(spreadsheetId = 'test_spreadsheet') {
    return {
      spreadsheetId,
      values: [],
      aiColumns: {}
    };
  }
}

/**
 * ログ管理クラス
 */
export class TestLogger {
  constructor(container = null) {
    this.container = container;
    this.entries = [];
  }

  /**
   * ログエントリを追加
   * 
   * @param {string} message - ログメッセージ
   * @param {string} level - ログレベル
   * @param {Object} options - オプション
   */
  log(message, level = LOG_LEVELS.INFO, options = {}) {
    const timestamp = new Date().toLocaleTimeString('ja-JP');
    const entry = {
      timestamp,
      message,
      level,
      ...options
    };

    this.entries.push(entry);
    console.log(`[${level.toUpperCase()}] ${message}`);

    if (this.container) {
      this._renderLogEntry(entry);
    }
  }

  /**
   * ログエントリをDOMにレンダリング
   * 
   * @param {Object} entry - ログエントリ
   * @private
   */
  _renderLogEntry(entry) {
    const logElement = document.createElement('div');
    logElement.className = `log-entry ${entry.level}`;
    logElement.innerHTML = `<span class="log-time">[${entry.timestamp}]</span>${entry.message}`;
    
    this.container.appendChild(logElement);
    this.container.scrollTop = this.container.scrollHeight;
  }

  /**
   * ログをクリア
   */
  clear() {
    this.entries = [];
    if (this.container) {
      this.container.innerHTML = `
        <div class="log-entry info">
          <span class="log-time">[${new Date().toLocaleTimeString('ja-JP')}]</span>
          ログをクリアしました
        </div>
      `;
    }
  }

  /**
   * 便利メソッド
   */
  info(message, options) { this.log(message, LOG_LEVELS.INFO, options); }
  success(message, options) { this.log(message, LOG_LEVELS.SUCCESS, options); }
  warning(message, options) { this.log(message, LOG_LEVELS.WARNING, options); }
  error(message, options) { this.log(message, LOG_LEVELS.ERROR, options); }
}

/**
 * ウィンドウ管理ユーティリティ
 */
export class WindowManager {
  constructor() {
    this.activeWindows = new Map();
  }

  /**
   * 位置名を取得
   * 
   * @param {number} position - 位置番号
   * @returns {string} 位置名
   */
  getPositionName(position) {
    return WINDOW_POSITION_NAMES[position % WINDOW_POSITION_NAMES.length];
  }

  /**
   * ウィンドウ情報を更新
   * 
   * @param {Map} streamProcessorWindows - StreamProcessorのウィンドウ情報
   */
  updateFromStreamProcessor(streamProcessorWindows) {
    this.activeWindows.clear();
    if (streamProcessorWindows) {
      streamProcessorWindows.forEach((windowInfo, windowId) => {
        this.activeWindows.set(windowId, windowInfo);
      });
    }
  }

  /**
   * ウィンドウグリッドHTMLを生成
   * 
   * @returns {string} HTML文字列
   */
  generateWindowGridHTML() {
    if (this.activeWindows.size === 0) {
      return `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">🪟</div>
          <div class="empty-state-text">ウィンドウがまだ開かれていません</div>
        </div>
      `;
    }

    const sortedWindows = Array.from(this.activeWindows.values())
      .sort((a, b) => a.position - b.position);

    return sortedWindows.map(windowInfo => `
      <div class="window-card active">
        <div class="window-position">${this.getPositionName(windowInfo.position)}</div>
        <h4>列 ${windowInfo.column}</h4>
        <div class="window-info">
          <div class="window-info-row">
            <span class="window-info-label">AI タイプ</span>
            <span class="window-info-value">${windowInfo.aiType}</span>
          </div>
          <div class="window-info-row">
            <span class="window-info-label">ウィンドウ ID</span>
            <span class="window-info-value">${windowInfo.windowId}</span>
          </div>
          <div class="window-info-row">
            <span class="window-info-label">作成時刻</span>
            <span class="window-info-value">${windowInfo.createdAt.toLocaleTimeString('ja-JP')}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * アクティブウィンドウ数を取得
   * 
   * @returns {number} ウィンドウ数
   */
  getActiveWindowCount() {
    return this.activeWindows.size;
  }

  /**
   * 全ウィンドウをクリア
   */
  clear() {
    this.activeWindows.clear();
  }
}

/**
 * モジュールインポートヘルパー
 */
export class ModuleLoader {
  constructor() {
    this.cache = new Map();
  }

  /**
   * 必要なモジュールを一括インポート
   * 
   * @returns {Promise<Object>} インポートされたモジュール群
   */
  async loadTestModules() {
    if (this.cache.has('testModules')) {
      return this.cache.get('testModules');
    }

    const [streamModule, modelsModule] = await Promise.all([
      import('../features/task/stream-processor.js'),
      import('../features/task/models.js')
    ]);

    const modules = {
      StreamProcessor: streamModule.default,
      Task: modelsModule.Task,
      TaskList: modelsModule.TaskList,
      TaskFactory: modelsModule.TaskFactory
    };

    this.cache.set('testModules', modules);
    return modules;
  }
}

/**
 * UI更新ヘルパー
 */
export class UIUpdater {
  constructor(elements = {}) {
    this.elements = elements;
  }

  /**
   * ステータスを更新
   * 
   * @param {string} text - ステータステキスト
   * @param {string} type - ステータスタイプ
   * @param {number} startTime - 開始時間
   */
  updateStatus(text, type = 'idle', startTime = null) {
    if (this.elements.statusText) {
      this.elements.statusText.textContent = text;
    }

    if (this.elements.statusIndicator) {
      this.elements.statusIndicator.className = 'status-indicator';
      if (type === 'active') {
        this.elements.statusIndicator.classList.add('active');
      } else if (type === 'error') {
        this.elements.statusIndicator.classList.add('error');
      }
    }

    // 経過時間更新
    if (startTime && this.elements.statusTime) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      this.elements.statusTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * ウィンドウ数を更新
   * 
   * @param {number} count - ウィンドウ数
   */
  updateWindowCount(count) {
    if (this.elements.activeWindows) {
      this.elements.activeWindows.textContent = count.toString();
    }
  }

  /**
   * タスク数を更新
   * 
   * @param {number} total - 総タスク数
   * @param {number} processed - 処理済みタスク数
   */
  updateTaskCount(total, processed = 0) {
    if (this.elements.totalTasks) {
      this.elements.totalTasks.textContent = total.toString();
    }
    if (this.elements.processedTasks) {
      this.elements.processedTasks.textContent = processed.toString();
    }
  }
}

/**
 * ユーティリティ関数
 */

/**
 * 指定時間待機
 * 
 * @param {number} ms - 待機時間（ミリ秒）
 * @returns {Promise} 待機Promise
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ランダムな待機時間を生成
 * 
 * @param {number} min - 最小時間（秒）
 * @param {number} max - 最大時間（秒）
 * @returns {number} 待機時間（ミリ秒）
 */
export function randomWaitTime(min = 5, max = 15) {
  return Math.floor(Math.random() * ((max - min) * 1000 + 1)) + (min * 1000);
}

/**
 * 選択されたAI設定を取得
 * 
 * @param {Object} elements - DOM要素オブジェクト
 * @returns {Array<string>} 選択されたAIタイプ配列
 */
export function getSelectedAIs(elements) {
  const selectedAIs = [];
  
  if (elements.useChatGPT?.checked) selectedAIs.push('chatgpt');
  if (elements.useClaude?.checked) selectedAIs.push('claude');
  if (elements.useGemini?.checked) selectedAIs.push('gemini');
  
  return selectedAIs;
}

/**
 * エラーハンドリングのラッパー
 * 
 * @param {Function} fn - 実行する関数
 * @param {TestLogger} logger - ログ出力先
 * @param {string} context - エラーコンテキスト
 * @returns {Promise} 実行結果
 */
export async function withErrorHandling(fn, logger, context = '処理') {
  try {
    return await fn();
  } catch (error) {
    const errorMessage = `${context}エラー: ${error.message}`;
    logger.error(errorMessage);
    logger.error(`スタック: ${error.stack}`);
    console.error(`${context}エラー:`, error);
    throw error;
  }
}