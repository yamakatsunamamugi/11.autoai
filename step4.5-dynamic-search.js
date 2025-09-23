/**
 * @fileoverview Step 4.5: 動的タスク検索システム
 *
 * 役割：個別タスク単位での動的なタスク検索と管理
 * - step3-loop.jsのグループ単位処理を個別タスク用に改良
 * - 1タスク完了 → 即座に次の1タスク開始を実現
 *
 * 主な機能：
 * 1. スプレッドシートから最新タスクリストを動的に取得
 * 2. 作業中マーカーによる排他制御
 * 3. 個別タスク単位での次タスク検索
 * 4. タスク完了状態の管理
 */

// ========================================
// ログ設定
// ========================================
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO;

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
    }
  });
}

const DynamicSearchLogger = {
  error: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) {
      console.error("[DynamicSearch]", ...args);
    }
  },
  warn: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) {
      console.warn("[DynamicSearch]", ...args);
    }
  },
  info: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) {
      console.log("[DynamicSearch]", ...args);
    }
  },
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) {
      console.log("[DynamicSearch-DEBUG]", ...args);
    }
  },
};

const log = DynamicSearchLogger;

// ========================================
// DynamicTaskSearch クラス
// ========================================
class DynamicTaskSearch {
  constructor() {
    this.cache = {
      spreadsheetData: null,
      lastFetchTime: null,
      cacheTimeout: 5000, // 5秒
    };

    this.processingTasks = new Set(); // 処理中タスクのID管理
    this.completedTasks = new Set(); // 完了タスクのID管理

    log.info("✅ DynamicTaskSearch 初期化完了");
  }

  /**
   * スプレッドシートから最新データを取得（キャッシュ付き）
   * step3-loop.jsのreadFullSpreadsheetを参考に実装
   */
  async fetchLatestSpreadsheetData(forceRefresh = false) {
    const now = Date.now();

    // キャッシュが有効な場合は再利用
    if (
      !forceRefresh &&
      this.cache.spreadsheetData &&
      this.cache.lastFetchTime &&
      now - this.cache.lastFetchTime < this.cache.cacheTimeout
    ) {
      log.debug("📋 キャッシュからデータ取得");
      return this.cache.spreadsheetData;
    }

    log.info("🔄 スプレッドシート最新データ取得中...");

    try {
      // 依存関係チェック
      if (!window.fetchWithTokenRefresh) {
        throw new Error("fetchWithTokenRefresh が初期化されていません");
      }

      // グローバル状態から必要な情報を取得
      const spreadsheetId = window.globalState?.spreadsheetId;
      const authToken = window.globalState?.authToken;
      const gid = window.globalState?.gid;

      if (!spreadsheetId || !authToken) {
        throw new Error("認証情報またはスプレッドシートIDが見つかりません");
      }

      // 全体データ取得（A1:Z1000）
      const range = "A1:Z1000";
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

      const response = await window.fetchWithTokenRefresh(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `API応答エラー: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const values = data.values || [];

      // キャッシュ更新
      this.cache.spreadsheetData = values;
      this.cache.lastFetchTime = now;

      log.info(`✅ データ取得成功: ${values.length}行`);
      return values;
    } catch (error) {
      log.error("❌ スプレッドシートデータ取得エラー:", error);
      throw error;
    }
  }

  /**
   * 次の利用可能なタスクを1つ検索
   * @returns {Object|null} 次のタスク、または null
   */
  async findNextTask() {
    log.info("🔍 次のタスク検索開始");

    try {
      // 現在のグループ情報を取得
      const currentGroup = window.globalState?.currentGroup;
      if (!currentGroup) {
        log.warn("⚠️ 現在のグループ情報が見つかりません");
        return null;
      }

      // 最新のスプレッドシートデータを取得
      const spreadsheetData = await this.fetchLatestSpreadsheetData();

      // グループの範囲内でタスクを検索
      const availableTask = await this.searchTaskInGroup(
        spreadsheetData,
        currentGroup,
      );

      if (availableTask) {
        log.info("✅ 利用可能なタスク発見:", {
          taskId: availableTask.id,
          row: availableTask.row,
          column: availableTask.column,
          aiType: availableTask.aiType,
        });

        // 処理中としてマーク
        this.markTaskAsProcessing(availableTask);
        return availableTask;
      }

      log.debug("📭 利用可能なタスクなし");
      return null;
    } catch (error) {
      log.error("❌ タスク検索エラー:", error);
      return null;
    }
  }

  /**
   * グループ内でタスクを検索
   * step3-loop.jsのcreateTaskListロジックを個別タスク用に改良
   */
  async searchTaskInGroup(spreadsheetData, taskGroup) {
    const { columns, dataStartRow } = taskGroup;

    if (!columns || !dataStartRow) {
      log.error("グループ情報が不完全");
      return null;
    }

    // プロンプト列を確認
    const promptColumns = columns.prompts || [];
    const answerColumns = this.getAnswerColumns(columns.answer);

    log.debug("検索範囲:", {
      プロンプト列: promptColumns,
      回答列: answerColumns,
      開始行: dataStartRow,
    });

    // データ行を順番にチェック
    for (
      let rowIndex = dataStartRow - 1;
      rowIndex < spreadsheetData.length;
      rowIndex++
    ) {
      const row = spreadsheetData[rowIndex];
      if (!row) continue;

      const rowNumber = rowIndex + 1; // 1-based行番号

      // 各プロンプト列をチェック
      for (const promptCol of promptColumns) {
        const colIndex = this.columnToIndex(promptCol);
        const promptValue = row[colIndex];

        // プロンプトが存在しない場合はスキップ
        if (!promptValue || !promptValue.trim()) continue;

        // 対応する回答列をチェック
        for (const answerCol of answerColumns) {
          const answerIndex = this.columnToIndex(answerCol.column);
          const answerValue = row[answerIndex] || "";

          // タスクIDを生成
          const taskId = `${answerCol.column}${rowNumber}`;

          // このタスクが処理可能かチェック
          if (this.isTaskAvailable(taskId, answerValue)) {
            // 利用可能なタスクを返す
            return {
              id: taskId,
              row: rowNumber,
              column: answerCol.column,
              prompt: promptValue.trim(),
              aiType: answerCol.aiType,
              spreadsheetId: window.globalState?.spreadsheetId,
              gid: window.globalState?.gid,
              groupNumber: taskGroup.groupNumber,
              // 追加情報
              cellRef: `${answerCol.column}${rowNumber}`,
              answerCell: `${answerCol.column}${rowNumber}`,
              logCell: `A${rowNumber}`, // ログは通常A列
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * 回答列の情報を取得
   */
  getAnswerColumns(answerConfig) {
    const columns = [];

    if (typeof answerConfig === "object" && answerConfig !== null) {
      // オブジェクト形式（3種類AIパターンなど）
      if (answerConfig.chatgpt) {
        columns.push({ column: answerConfig.chatgpt, aiType: "chatgpt" });
      }
      if (answerConfig.claude) {
        columns.push({ column: answerConfig.claude, aiType: "claude" });
      }
      if (answerConfig.gemini) {
        columns.push({ column: answerConfig.gemini, aiType: "gemini" });
      }
      if (answerConfig.primary) {
        columns.push({ column: answerConfig.primary, aiType: "claude" });
      }
    } else if (typeof answerConfig === "string") {
      // 文字列形式（通常パターン）
      columns.push({ column: answerConfig, aiType: "claude" });
    }

    return columns;
  }

  /**
   * タスクが実行可能かチェック
   */
  isTaskAvailable(taskId, cellValue) {
    // すでに完了済みならスキップ
    if (this.completedTasks.has(taskId)) {
      log.debug(`⏭️ スキップ（完了済み）: ${taskId}`);
      return false;
    }

    // 現在処理中ならスキップ
    if (this.processingTasks.has(taskId)) {
      log.debug(`⏳ スキップ（処理中）: ${taskId}`);
      return false;
    }

    // セルに値がある場合
    if (cellValue && cellValue.trim()) {
      // 作業中マーカーの場合
      if (cellValue.startsWith("作業中")) {
        // タイムアウトチェック（必要に応じて実装）
        log.debug(`⏳ スキップ（作業中マーカー）: ${taskId}`);
        return false;
      }

      // すでに回答がある場合
      log.debug(`✓ スキップ（回答済み）: ${taskId}`);
      this.completedTasks.add(taskId); // 完了済みとしてマーク
      return false;
    }

    // セルが空の場合は実行可能
    return true;
  }

  /**
   * タスクを処理中としてマーク
   */
  markTaskAsProcessing(task) {
    this.processingTasks.add(task.id);
    log.debug(`🔄 処理中マーク: ${task.id}`);

    // window.currentTaskListも更新
    if (window.currentTaskList && Array.isArray(window.currentTaskList)) {
      const existingTask = window.currentTaskList.find((t) => t.id === task.id);
      if (existingTask) {
        existingTask.processing = true;
      } else {
        window.currentTaskList.push({
          ...task,
          processing: true,
        });
      }
    }
  }

  /**
   * タスク完了を登録
   */
  registerTaskCompletion(taskId) {
    this.processingTasks.delete(taskId);
    this.completedTasks.add(taskId);

    log.info(`✅ タスク完了登録: ${taskId}`);

    // window.currentTaskListも更新
    if (window.currentTaskList && Array.isArray(window.currentTaskList)) {
      const task = window.currentTaskList.find((t) => t.id === taskId);
      if (task) {
        task.processing = false;
        task.completed = true;
      }
    }

    // キャッシュをクリアして次回最新データを取得
    this.cache.spreadsheetData = null;
  }

  /**
   * 列文字をインデックスに変換（A→0, B→1, C→2...）
   */
  columnToIndex(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * インデックスを列文字に変換（0→A, 1→B, 2→C...）
   */
  indexToColumn(index) {
    let column = "";
    let num = index;

    while (num >= 0) {
      column = String.fromCharCode(65 + (num % 26)) + column;
      num = Math.floor(num / 26) - 1;
      if (num < 0) break;
    }

    return column;
  }

  /**
   * システムリセット（デバッグ用）
   */
  reset() {
    this.processingTasks.clear();
    this.completedTasks.clear();
    this.cache.spreadsheetData = null;
    this.cache.lastFetchTime = null;
    log.info("🔄 DynamicTaskSearchをリセットしました");
  }
}

// ========================================
// Lazy Initialization関数
// ========================================
function getDynamicTaskSearchInstance() {
  // 必要な依存関係がそろっているかチェック
  if (!window.fetchWithTokenRefresh) {
    log.warn(
      "⚠️ fetchWithTokenRefresh が未初期化のため、DynamicTaskSearchを作成できません",
    );
    return null;
  }

  if (!window.globalState) {
    log.warn(
      "⚠️ globalState が未初期化のため、DynamicTaskSearchを作成できません",
    );
    return null;
  }

  // シングルトンインスタンスとして作成
  if (!window.DynamicTaskSearch) {
    window.DynamicTaskSearch = new DynamicTaskSearch();
    log.info("📦 window.DynamicTaskSearch を遅延初期化");
  }

  return window.DynamicTaskSearch;
}

// ========================================
// グローバル関数のエクスポート
// ========================================
if (typeof window !== "undefined") {
  // 互換性のための関数エクスポート（遅延初期化対応）
  window.findNextAvailableTaskDynamic = async function () {
    const instance = getDynamicTaskSearchInstance();
    if (!instance) {
      log.error("❌ DynamicTaskSearchインスタンスを初期化できません");
      return null;
    }
    return await instance.findNextTask();
  };

  window.registerTaskCompletionDynamic = function (taskId) {
    const instance = getDynamicTaskSearchInstance();
    if (!instance) {
      log.error("❌ DynamicTaskSearchインスタンスを初期化できません");
      return null;
    }
    return instance.registerTaskCompletion(taskId);
  };
}

// ========================================
// モジュールエクスポート（Node.js環境用）
// ========================================
if (typeof module !== "undefined" && module.exports) {
  module.exports = DynamicTaskSearch;
}

log.info("✅ [step4.5-dynamic-search.js] ファイル読み込み完了");
