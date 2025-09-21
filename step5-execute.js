// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('logLevel', (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
    }
  });
}

// ログユーティリティ
const log = {
  error: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR && console.error(...args),
  warn: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN && console.warn(...args),
  info: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO && console.log(...args),
  debug: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG && console.log(...args)
};


/**
 * @fileoverview Step5 Execute - ステップ5実行処理
 *
 * このファイルは、ステップ5の実行に必要な補助クラスと
 * executeStep5関数を提供します。
 *
 * WindowControllerとexecuteStep4はstep4-tasklist.jsに移動しました。
 */

// ========================================
// ロガー設定
// ========================================
const ExecuteLogger = {
  info: (...args) => log.debug(`[step5-execute.js]`, ...args),
  debug: (...args) => {}, // DEBUG logs disabled
  warn: (...args) => log.warn(`[step5-execute.js]`, ...args),
  error: (...args) => log.error(`[step5-execute.js]`, ...args),
};

// ========================================
// SimpleSheetsClient: stepフォルダ内で完結するSheets APIクライアント
// ========================================
class SimpleSheetsClient {
  constructor() {
    this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    this.sheetNameCache = new Map(); // GID -> シート名のキャッシュ
  }

  /**
   * 認証トークン取得
   */
  async getAuthToken() {
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.identity) {
        reject(new Error("Chrome Identity APIが利用できません"));
        return;
      }

      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }

  /**
   * スプレッドシートから値を取得
   */
  async getValues(spreadsheetId, range) {
    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values/${range}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`データ取得失敗: ${response.statusText}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  /**
   * スプレッドシートに値を書き込み（単一セル）
   */
  async updateValue(spreadsheetId, range, value) {
    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [[value]],
      }),
    });

    if (!response.ok) {
      throw new Error(`データ書き込み失敗: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * GIDからシート名を取得
   */
  async getSheetNameFromGid(spreadsheetId, gid) {
    // キャッシュチェック
    const cacheKey = `${spreadsheetId}-${gid}`;
    if (this.sheetNameCache.has(cacheKey)) {
      return this.sheetNameCache.get(cacheKey);
    }

    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`スプレッドシート情報取得失敗: ${response.statusText}`);
    }

    const data = await response.json();
    const sheets = data.sheets || [];

    for (const sheet of sheets) {
      if (sheet.properties && sheet.properties.sheetId == gid) {
        const sheetName = sheet.properties.title;
        this.sheetNameCache.set(cacheKey, sheetName);
        return sheetName;
      }
    }

    throw new Error(`GID ${gid} のシートが見つかりません`);
  }

  /**
   * レンジからセル参照を作成
   */
  createRangeFromCell(sheetName, column, row) {
    return `'${sheetName}'!${column}${row}`;
  }
}

// グローバルインスタンス
window.simpleSheetsClient = new SimpleSheetsClient();

// ========================================
// AI自動化ファイルローダークラス
// ========================================
class AIAutomationLoader {
  constructor() {
    this.loadedAIFiles = new Set();
    this.loadingPromises = new Map();
  }

  /**
   * AI自動化ファイルを動的にロード
   * @param {string} aiType - AI種別（chatgpt/claude/gemini/genspark/report）
   */
  async loadAIFile(aiType) {
    const aiTypeNormalized = aiType.toLowerCase();

    // 既にロード済みか確認
    if (this.loadedAIFiles.has(aiTypeNormalized)) {
      ExecuteLogger.info(
        `✅ ${aiTypeNormalized} 自動化ファイルは既にロード済み`,
      );
      return true;
    }

    // ローディング中の場合は既存のPromiseを返す
    if (this.loadingPromises.has(aiTypeNormalized)) {
      ExecuteLogger.info(
        `⏳ ${aiTypeNormalized} 自動化ファイルは現在ロード中...`,
      );
      return this.loadingPromises.get(aiTypeNormalized);
    }

    // ファイルマッピング
    const fileMap = {
      chatgpt: "4-1-chatgpt-automation.js",
      claude: "4-2-claude-automation.js",
      gemini: "4-3-gemini-automation.js",
      report: "4-4-report-automation.js",
      genspark: "4-5-genspark-automation.js",
    };

    const fileName = fileMap[aiTypeNormalized];
    if (!fileName) {
      ExecuteLogger.error(`❌ 未対応のAI種別: ${aiType}`);
      return false;
    }

    // ローディングPromiseを作成
    const loadingPromise = new Promise((resolve) => {
      ExecuteLogger.info(
        `📂 ${aiTypeNormalized} 自動化ファイルをロード中: ${fileName}`,
      );

      const script = document.createElement("script");
      script.type = "module";
      script.src = chrome.runtime.getURL(fileName);

      script.onload = () => {
        this.loadedAIFiles.add(aiTypeNormalized);
        this.loadingPromises.delete(aiTypeNormalized);
        ExecuteLogger.info(
          `✅ ${aiTypeNormalized} 自動化ファイルロード完了: ${fileName}`,
        );
        resolve(true);
      };

      script.onerror = (error) => {
        this.loadingPromises.delete(aiTypeNormalized);
        ExecuteLogger.error(
          `❌ ${aiTypeNormalized} 自動化ファイルロード失敗: ${fileName}`,
          error,
        );
        resolve(false);
      };

      document.head.appendChild(script);
    });

    this.loadingPromises.set(aiTypeNormalized, loadingPromise);
    return loadingPromise;
  }

  /**
   * 必要なすべてのAIファイルを一度にロード
   * @param {Array<string>} aiTypes - AI種別の配列
   */
  async loadAllRequiredFiles(aiTypes) {
    const promises = aiTypes.map((aiType) => this.loadAIFile(aiType));
    const results = await Promise.all(promises);
    return results.every((result) => result === true);
  }

  /**
   * AIが利用可能か確認
   * @param {string} aiType - AI種別
   */
  isAIAvailable(aiType) {
    const aiTypeNormalized = aiType.toLowerCase();

    return this.loadedAIFiles.has(aiTypeNormalized);
  }
}

// グローバルインスタンス作成
window.aiAutomationLoader = new AIAutomationLoader();

// ========================================
// タスクグループタイプ判定クラス
// ========================================
class TaskGroupTypeDetector {
  constructor() {
    // グループタイプの定義
    this.groupTypes = {
      NORMAL: "通常処理",
      THREE_AI: "3種類AI（ChatGPT・Claude・Gemini）",
      REPORT: "レポート化",
      GENSPARK: "Genspark質問",
      MIXED: "混在",
    };
  }

  /**
   * タスクリストからグループタイプを判定
   * @param {Array} taskList - タスクリスト
   * @returns {Object} グループタイプ情報
   */
  detectGroupType(taskList) {
    if (!taskList || taskList.length === 0) {
      return {
        type: this.groupTypes.NORMAL,
        aiTypes: [],
        description: "タスクが空のため通常処理として扱います",
      };
    }

    const aiTypes = new Set();
    let hasThreeAI = false;
    let hasReport = false;
    let hasGenspark = false;
    let hasNormal = false;

    // 各タスクのAIタイプを収集
    taskList.forEach((task) => {
      const aiType = task.aiType || task.ai || "";

      if (aiType === "3種類（ChatGPT・Gemini・Claude）") {
        hasThreeAI = true;
        aiTypes.add("chatgpt");
        aiTypes.add("claude");
        aiTypes.add("gemini");
      } else if (aiType.toLowerCase() === "report" || aiType === "レポート化") {
        hasReport = true;
        aiTypes.add("report");
      } else if (aiType.toLowerCase() === "genspark") {
        hasGenspark = true;
        aiTypes.add("genspark");
      } else if (aiType) {
        hasNormal = true;
        aiTypes.add(aiType.toLowerCase());
      }
    });

    // グループタイプを判定
    let groupType;
    let description;

    if (hasThreeAI && !hasReport && !hasGenspark && !hasNormal) {
      groupType = this.groupTypes.THREE_AI;
      description = "3種類のAI（ChatGPT・Claude・Gemini）を並列実行";
    } else if (hasReport && !hasThreeAI && !hasGenspark && !hasNormal) {
      groupType = this.groupTypes.REPORT;
      description = "レポート作成処理";
    } else if (hasGenspark && !hasThreeAI && !hasReport && !hasNormal) {
      groupType = this.groupTypes.GENSPARK;
      description = "Genspark質問処理";
    } else if (
      hasNormal &&
      !hasThreeAI &&
      !hasReport &&
      !hasGenspark &&
      aiTypes.size <= 3
    ) {
      groupType = this.groupTypes.NORMAL;
      description = `通常処理（${Array.from(aiTypes).join(", ")}）`;
    } else {
      groupType = this.groupTypes.MIXED;
      description = `混在処理（${Array.from(aiTypes).join(", ")}）`;
    }

    return {
      type: groupType,
      aiTypes: Array.from(aiTypes),
      hasThreeAI,
      hasReport,
      hasGenspark,
      hasNormal,
      description,
      taskCount: taskList.length,
    };
  }

  /**
   * タスクの順序からウィンドウ配置を決定
   * @param {Array} taskList - タスクリスト
   * @returns {Array} ウィンドウ配置情報
   */
  getWindowLayoutFromTasks(taskList) {
    const layout = [];

    // タスク数に応じてウィンドウを生成（最大3つまで）
    for (let i = 0; i < Math.min(taskList.length, 3); i++) {
      const task = taskList[i];
      const aiType = task.aiType || task.ai || "";
      const normalizedType = aiType.toLowerCase();

      if (normalizedType) {
        layout.push({
          aiType: normalizedType,
          position: i, // 0=左上, 1=右上, 2=左下
        });
      }
    }

    return layout;
  }

  /**
   * グループタイプに基づくウィンドウ配置を生成
   * @deprecated getWindowLayoutFromTasksを使用してください
   */
  getWindowLayout(groupTypeInfo) {
    const layout = [];

    // グループタイプに基づく配置
    switch (groupTypeInfo.type) {
      case this.groupTypes.THREE_AI:
        // 3種類AI: ChatGPT左上、Claude右上、Gemini左下
        layout.push({ aiType: "chatgpt", position: 0 }); // 左上
        layout.push({ aiType: "claude", position: 1 }); // 右上
        layout.push({ aiType: "gemini", position: 2 }); // 左下
        break;

      case this.groupTypes.NORMAL:
        // 通常処理: 検出されたAIを順番に配置
        groupTypeInfo.aiTypes.slice(0, 3).forEach((aiType, index) => {
          layout.push({ aiType, position: index });
        });
        break;

      case this.groupTypes.REPORT:
        // レポート処理: レポートウィンドウのみ
        layout.push({ aiType: "report", position: 0 });
        break;

      case this.groupTypes.GENSPARK:
        // Genspark処理: Gensparkウィンドウのみ
        layout.push({ aiType: "genspark", position: 0 });
        break;

      case this.groupTypes.MIXED:
        // 混在処理: 最大3つまで配置
        groupTypeInfo.aiTypes.slice(0, 3).forEach((aiType, index) => {
          layout.push({ aiType, position: index });
        });
        break;
    }

    return layout;
  }
}

// グローバルインスタンス作成
window.taskGroupTypeDetector = new TaskGroupTypeDetector();

// ========================================
// スプレッドシートデータ管理クラス
// ========================================
class SpreadsheetDataManager {
  constructor() {
    this.cachedData = new Map(); // キャッシュ管理
    this.cacheTimeout = 5 * 60 * 1000; // 5分
  }

  /**
   * タスクリストを拡張（スプレッドシートデータを付加）
   * @param {Array} taskList - 元のタスクリスト
   * @returns {Array} 拡張されたタスクリスト
   */
  async enrichTaskList(taskList) {
    if (!taskList || taskList.length === 0) {
      return taskList;
    }

    // スプレッドシートID/GIDを取得（最初のタスクから）
    const firstTask = taskList[0];
    const spreadsheetId =
      firstTask.spreadsheetId || window.globalState?.spreadsheetId;
    const gid = firstTask.gid || window.globalState?.gid;

    if (!spreadsheetId) {
      ExecuteLogger.warn("⚠️ スプレッドシートIDが取得できません");
      return taskList;
    }

    try {
      // データ取得範囲を決定
      const rows = taskList
        .map((t) => t.row || t.cellInfo?.row)
        .filter(Boolean);
      const minRow = Math.min(...rows);
      const maxRow = Math.max(...rows);
      const range = `A${minRow}:Z${maxRow}`;

      // データ取得
      const sheetData = await this.fetchSpreadsheetData(
        spreadsheetId,
        gid,
        range,
      );

      // 各タスクにデータを付加
      return taskList.map((task) => {
        const row = task.row || task.cellInfo?.row;
        if (row && sheetData[row - minRow]) {
          task.spreadsheetData = {
            row: row,
            values: sheetData[row - minRow],
            columns: this.mapColumnsToObject(sheetData[row - minRow]),
          };
        }
        return task;
      });
    } catch (error) {
      ExecuteLogger.error("❌ スプレッドシートデータ取得エラー:", error);
      return taskList;
    }
  }

  /**
   * スプレッドシートデータをフェッチ
   */
  async fetchSpreadsheetData(spreadsheetId, gid, range) {
    const cacheKey = `${spreadsheetId}-${gid}-${range}`;

    // キャッシュチェック
    if (this.cachedData.has(cacheKey)) {
      const cached = this.cachedData.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        ExecuteLogger.info("📦 キャッシュからデータ取得");
        return cached.data;
      }
    }

    // APIから取得
    ExecuteLogger.info(`📊 スプレッドシートデータ取得: ${range}`);
    const data = await window.simpleSheetsClient.getValues(
      spreadsheetId,
      range,
    );

    // キャッシュ更新
    this.cachedData.set(cacheKey, {
      data: data,
      timestamp: Date.now(),
    });

    return data;
  }

  /**
   * 配列をカラム名でマッピング
   */
  mapColumnsToObject(rowValues) {
    const columnMap = {};
    const columns = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    rowValues.forEach((value, index) => {
      if (index < columns.length) {
        columnMap[columns[index]] = value;
      }
    });

    return columnMap;
  }

  /**
   * キャッシュをクリア
   */
  clearCache() {
    this.cachedData.clear();
    ExecuteLogger.info("🗑️ スプレッドシートキャッシュをクリアしました");
  }
}

// グローバルインスタンス作成
window.spreadsheetDataManager = new SpreadsheetDataManager();

// ========================================
// 詳細ログ管理クラス
// ========================================
class DetailedLogManager {
  constructor() {
    this.taskLogs = new Map(); // タスクID -> ログ情報
    this.currentBatch = null;
  }

  /**
   * タスク開始を記録
   */
  recordTaskStart(task, windowInfo) {
    const taskId = task.id || task.taskId;
    const now = new Date();

    this.taskLogs.set(taskId, {
      taskId: taskId,
      aiType: task.aiType || task.ai,
      prompt: task.prompt,
      startTime: now,
      startTimeStr: now.toISOString(),
      windowInfo: windowInfo,
      status: "started",
    });

    ExecuteLogger.info(`📝 ログ記録: タスク開始 ${taskId}`);
  }

  /**
   * 送信時刻を記録
   */
  recordSendTime(taskId, aiUrl) {
    const log = this.taskLogs.get(taskId);
    if (log) {
      const now = new Date();
      log.sendTime = now;
      log.sendTimeStr = now.toISOString();
      log.aiUrl = aiUrl;
      log.status = "sent";
      ExecuteLogger.info(`📤 ログ記録: 送信完了 ${taskId}`);
    }
  }

  /**
   * タスク完了を記録
   */
  recordTaskComplete(taskId, result) {
    const log = this.taskLogs.get(taskId);
    if (log) {
      const now = new Date();
      log.completeTime = now;
      log.completeTimeStr = now.toISOString();
      log.result = result;
      log.status = result.success ? "completed" : "failed";
      log.response = result.response || result.error || "";

      // 実行時間計算
      if (log.startTime) {
        log.executionTimeMs = now - log.startTime;
        log.executionTimeSec = (log.executionTimeMs / 1000).toFixed(2);
      }

      ExecuteLogger.info(
        `✅ ログ記録: タスク完了 ${taskId} (${log.executionTimeSec}秒)`,
      );
    }
  }

  /**
   * ログをスプレッドシートに書き込み
   */
  async writeLogToSpreadsheet(taskId, cellRef) {
    const log = this.taskLogs.get(taskId);
    if (!log) return;

    try {
      const spreadsheetId = window.globalState?.spreadsheetId;
      if (!spreadsheetId) {
        ExecuteLogger.warn("⚠️ スプレッドシートIDが設定されていません");
        return;
      }

      // ログフォーマット
      const logText = this.formatLog(log);

      // スプレッドシート更新
      await window.simpleSheetsClient.updateValue(
        spreadsheetId,
        cellRef,
        logText,
      );

      ExecuteLogger.info(`📊 ログ書き込み完了: ${cellRef}`);
    } catch (error) {
      ExecuteLogger.error(`❌ ログ書き込みエラー: ${cellRef}`, error);
    }
  }

  /**
   * 回答をスプレッドシートに書き込み
   */
  async writeAnswerToSpreadsheet(taskId, cellRef) {
    const log = this.taskLogs.get(taskId);
    if (!log || !log.response) return;

    try {
      const spreadsheetId = window.globalState?.spreadsheetId;
      if (!spreadsheetId) {
        ExecuteLogger.warn("⚠️ スプレッドシートIDが設定されていません");
        return;
      }

      // スプレッドシート更新
      await window.simpleSheetsClient.updateValue(
        spreadsheetId,
        cellRef,
        log.response,
      );

      ExecuteLogger.info(`📊 回答書き込み完了: ${cellRef}`);
    } catch (error) {
      ExecuteLogger.error(`❌ 回答書き込みエラー: ${cellRef}`, error);
    }
  }

  /**
   * ログをフォーマット
   */
  formatLog(log) {
    const parts = [];

    // 実行時刻
    if (log.startTimeStr) {
      parts.push(`開始: ${log.startTimeStr}`);
    }

    // AI種別
    if (log.aiType) {
      parts.push(`AI: ${log.aiType}`);
    }

    // 実行時間
    if (log.executionTimeSec) {
      parts.push(`実行時間: ${log.executionTimeSec}秒`);
    }

    // ステータス
    parts.push(`ステータス: ${log.status || "unknown"}`);

    // エラーメッセージ
    if (log.status === "failed" && log.result?.error) {
      parts.push(`エラー: ${log.result.error}`);
    }

    return parts.join(" | ");
  }

  /**
   * すべてのログをクリア
   */
  clearLogs() {
    this.taskLogs.clear();
    ExecuteLogger.info("🗑️ 詳細ログをクリアしました");
  }
}

// グローバルインスタンス作成
window.detailedLogManager = new DetailedLogManager();

// ========================================
// ウィンドウライフサイクル管理クラス
// ========================================
class WindowLifecycleManager {
  constructor() {
    this.activeWindows = new Map(); // aiType -> windowInfo
    this.taskQueues = new Map(); // aiType -> タスクキュー
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2秒
  }

  /**
   * ライフサイクルマネージャーの初期化
   */
  async initializeLifecycleManager() {
    ExecuteLogger.info("🔄 ウィンドウライフサイクルマネージャー初期化");
    this.activeWindows.clear();
    this.taskQueues.clear();
    return true;
  }

  /**
   * ウィンドウを登録
   */
  registerWindow(aiType, windowInfo) {
    const normalizedAiType = aiType ? aiType.toLowerCase().trim() : "claude";
    this.activeWindows.set(normalizedAiType, {
      ...windowInfo,
      status: "ready",
      taskCount: 0,
      lastActivity: Date.now(),
      originalAiType: aiType, // 元のaiTypeも保持
    });

    if (!this.taskQueues.has(normalizedAiType)) {
      this.taskQueues.set(normalizedAiType, []);
    }

    ExecuteLogger.info(`📌 ウィンドウ登録: ${aiType}`);
  }

  /**
   * タスクをキューに追加
   */
  queueTask(aiType, task) {
    if (!this.taskQueues.has(aiType)) {
      this.taskQueues.set(aiType, []);
    }
    this.taskQueues.get(aiType).push(task);
    ExecuteLogger.info(
      `📥 タスクキュー追加: ${aiType} (キュー長: ${this.taskQueues.get(aiType).length})`,
    );
  }

  /**
   * ウィンドウのステータスを更新
   */
  updateWindowStatus(aiType, status) {
    const window = this.activeWindows.get(aiType);
    if (window) {
      window.status = status;
      window.lastActivity = Date.now();
      ExecuteLogger.info(`🔄 ウィンドウステータス更新: ${aiType} -> ${status}`);
    }
  }

  /**
   * タスク実行をリトライ機能付きで実行
   */
  async executeWithRetry(taskFunction, task, description) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        ExecuteLogger.info(
          `🔄 実行試行 ${attempt}/${this.maxRetries}: ${description}`,
        );
        const result = await taskFunction();

        if (result.success) {
          return result;
        }

        // 失敗だが、リトライ可能なエラーか判定
        if (this.isRetriableError(result.error)) {
          lastError = result.error;
          if (attempt < this.maxRetries) {
            ExecuteLogger.warn(
              `⚠️ リトライ可能なエラー。${this.retryDelay}ms後に再試行...`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, this.retryDelay),
            );
            continue;
          }
        }

        // リトライ不可能なエラー
        return result;
      } catch (error) {
        lastError = error;
        ExecuteLogger.error(`❌ 実行エラー (試行 ${attempt}):`, error);

        if (attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    // すべての試行が失敗
    return {
      success: false,
      error: lastError?.message || "最大リトライ回数を超えました",
    };
  }

  /**
   * リトライ可能なエラーか判定
   */
  isRetriableError(error) {
    if (!error) return false;

    const retriablePatterns = [
      /timeout/i,
      /network/i,
      /temporarily unavailable/i,
      /rate limit/i,
      /connection/i,
    ];

    const errorStr = typeof error === "string" ? error : error.toString();
    return retriablePatterns.some((pattern) => pattern.test(errorStr));
  }

  /**
   * ウィンドウをクローズ
   */
  async closeWindow(aiType) {
    // step4-tasklist.jsと同じ正規化関数を使用
    const normalizedAiType = aiType ? aiType.toLowerCase().trim() : "claude";
    const windowInfo = this.activeWindows.get(normalizedAiType);
    if (!windowInfo) {
      ExecuteLogger.warn(
        `⚠️ ウィンドウ情報が見つかりません: ${aiType} (正規化: ${normalizedAiType})`,
      );
      return;
    }

    try {
      if (windowInfo.windowId) {
        await chrome.windows.remove(windowInfo.windowId);
        ExecuteLogger.info(`✅ ウィンドウクローズ完了: ${aiType}`);
      }
    } catch (error) {
      ExecuteLogger.error(`❌ ウィンドウクローズエラー: ${aiType}`, error);
    } finally {
      this.activeWindows.delete(aiType);
      this.taskQueues.delete(aiType);
    }
  }

  /**
   * すべてのウィンドウをクリーンアップ
   */
  async cleanupAllWindows() {
    ExecuteLogger.info("🧹 全ウィンドウクリーンアップ開始");

    const closePromises = Array.from(this.activeWindows.keys()).map((aiType) =>
      this.closeWindow(aiType),
    );

    await Promise.allSettled(closePromises);
    ExecuteLogger.info("✅ 全ウィンドウクリーンアップ完了");
  }

  /**
   * タスク完了を処理
   */
  async handleTaskCompletion(task, result) {
    const aiType = task.aiType || task.ai;
    const window = this.activeWindows.get(aiType);

    if (window) {
      window.taskCount++;
      window.lastActivity = Date.now();

      if (result.success) {
        ExecuteLogger.info(
          `✅ タスク完了: ${aiType} (合計: ${window.taskCount}タスク)`,
        );
      } else {
        ExecuteLogger.warn(`⚠️ タスク失敗: ${aiType} - ${result.error}`);
      }
    }
  }

  /**
   * アクティブウィンドウのステータスを取得
   */
  getWindowsStatus() {
    const status = {};
    this.activeWindows.forEach((info, aiType) => {
      status[aiType] = {
        status: info.status,
        taskCount: info.taskCount,
        queueLength: this.taskQueues.get(aiType)?.length || 0,
        lastActivity: new Date(info.lastActivity).toISOString(),
      };
    });
    return status;
  }
}

// グローバルインスタンス作成
window.windowLifecycleManager = new WindowLifecycleManager();

// ========================================
// 特別タスク処理クラス
// ========================================
class SpecialTaskProcessor {
  constructor() {
    this.specialTypes = {
      REPORT: "レポート化",
      GENSPARK: "Genspark",
      SCREENSHOT: "スクリーンショット",
    };
  }

  /**
   * 特別なタスクか判定
   */
  identifySpecialTask(task) {
    const prompt = task.prompt || "";
    const aiType = task.aiType || task.ai || "";

    // レポート化タスク
    if (
      aiType.toLowerCase() === "report" ||
      aiType === "レポート化" ||
      prompt.includes("レポート化")
    ) {
      return {
        isSpecial: true,
        type: this.specialTypes.REPORT,
        requiresData: true,
      };
    }

    // Gensparkタスク
    if (aiType.toLowerCase() === "genspark") {
      return {
        isSpecial: true,
        type: this.specialTypes.GENSPARK,
        requiresData: false,
      };
    }

    // スクリーンショットタスク
    if (
      prompt.includes("スクリーンショット") ||
      prompt.includes("画面キャプチャ")
    ) {
      return {
        isSpecial: true,
        type: this.specialTypes.SCREENSHOT,
        requiresData: false,
      };
    }

    return {
      isSpecial: false,
      type: null,
      requiresData: false,
    };
  }

  /**
   * 特別タスクを実行
   */
  async executeSpecialTask(task, specialInfo, windowInfo) {
    ExecuteLogger.info(`🔧 特別タスク実行: ${specialInfo.type}`);

    switch (specialInfo.type) {
      case this.specialTypes.REPORT:
        return await this.executeReportTask(task, windowInfo);

      case this.specialTypes.GENSPARK:
        return await this.executeGensparkTask(task, windowInfo);

      case this.specialTypes.SCREENSHOT:
        return await this.executeScreenshotTask(task, windowInfo);

      default:
        return {
          success: false,
          error: `未対応の特別タスク: ${specialInfo.type}`,
        };
    }
  }

  /**
   * レポート化タスクを実行
   */
  async executeReportTask(task, windowInfo) {
    try {
      // レポート自動化が利用可能か確認
      if (!window.ReportAutomation) {
        await window.aiAutomationLoader.loadAIFile("report");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!window.ReportAutomation) {
        throw new Error("レポート自動化が利用できません");
      }

      // スプレッドシートデータが必要
      const spreadsheetData = task.spreadsheetData || {};
      const result = await window.ReportAutomation.executeTask(
        task,
        spreadsheetData,
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: `レポートタスク実行エラー: ${error.message}`,
      };
    }
  }

  /**
   * Gensparkタスクを実行
   */
  async executeGensparkTask(task, windowInfo) {
    try {
      // Genspark自動化が利用可能か確認
      if (!window.GensparkAutomationV2) {
        await window.aiAutomationLoader.loadAIFile("genspark");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!window.GensparkAutomationV2) {
        throw new Error("Genspark自動化が利用できません");
      }

      const result = await window.GensparkAutomationV2.executeTask(task);
      return result;
    } catch (error) {
      return {
        success: false,
        error: `Gensparkタスク実行エラー: ${error.message}`,
      };
    }
  }

  /**
   * スクリーンショットタスクを実行
   */
  async executeScreenshotTask(task, windowInfo) {
    try {
      ExecuteLogger.info("📸 スクリーンショット取得開始");

      // Chrome APIでスクリーンショットを取得
      const dataUrl = await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(
          windowInfo.windowId,
          { format: "png" },
          (dataUrl) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(dataUrl);
            }
          },
        );
      });

      return {
        success: true,
        response: dataUrl,
        metadata: {
          type: "screenshot",
          format: "png",
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `スクリーンショット取得エラー: ${error.message}`,
      };
    }
  }
}

// グローバルインスタンス作成
window.specialTaskProcessor = new SpecialTaskProcessor();

// ========================================
// Step 5: メイン実行関数
// ========================================
async function executeStep5(nextGroupData) {
  ExecuteLogger.info("🚀 Step 5 Execute - 次のグループ処理開始", nextGroupData);

  const results = {
    success: false,
    message: "",
    processedGroups: 0,
    errors: [],
  };

  try {
    // Step 5-1: 次のグループデータの検証
    if (!nextGroupData || !nextGroupData.hasNextGroup) {
      ExecuteLogger.info("✅ すべてのグループ処理が完了しました");
      results.success = true;
      results.message = "全グループ処理完了";
      return results;
    }

    // Step 5-2: 次のグループの準備
    ExecuteLogger.info(
      `📋 次のグループ: グループ${nextGroupData.nextGroupNumber}`,
    );

    // グローバル状態を更新
    if (window.globalState) {
      window.globalState.currentGroupNumber = nextGroupData.nextGroupNumber;
      window.globalState.totalGroups = nextGroupData.totalGroups;
      window.globalState.isLastGroup = nextGroupData.isLastGroup;
    }

    // Step 5-3: ウィンドウのクリーンアップ
    ExecuteLogger.info("🧹 前のグループのウィンドウをクリーンアップ");
    if (window.windowLifecycleManager) {
      await window.windowLifecycleManager.cleanupAllWindows();
    }

    // Step 5-4: 次のグループ処理の準備完了を通知
    ExecuteLogger.info("✅ Step 5: 次のグループ処理の準備が完了しました");
    results.success = true;
    results.message = `グループ${nextGroupData.nextGroupNumber}の処理準備完了`;
    results.processedGroups = 1;
    results.nextGroupReady = true;
    results.nextGroupNumber = nextGroupData.nextGroupNumber;

    // Step 5-5: UI更新のイベント発火（必要に応じて）
    if (typeof window !== "undefined" && window.dispatchEvent) {
      const event = new CustomEvent("nextGroupReady", {
        detail: {
          groupNumber: nextGroupData.nextGroupNumber,
          isLastGroup: nextGroupData.isLastGroup,
          totalGroups: nextGroupData.totalGroups,
        },
      });
      window.dispatchEvent(event);
    }
  } catch (error) {
    ExecuteLogger.error("❌ Step 5 実行エラー:", error);
    results.success = false;
    results.message = "次のグループ処理準備中にエラーが発生しました";
    results.errors.push(error.message);
  }

  ExecuteLogger.info("🏁 Step 5 Execute 完了", results);
  return results;
}

// ステップ5実行関数をグローバルに公開
window.executeStep5 = executeStep5;

// ========================================
// クラスのデバッグログ
// ========================================
// DEBUG: クラス定義完了

ExecuteLogger.info("✅ Step 5 Execute - 補助クラスとexecuteStep5関数準備完了");
ExecuteLogger.info("🎯 利用可能機能:");
ExecuteLogger.info("  - スプレッドシートデータ動的取得");
ExecuteLogger.info("  - 詳細ログ自動記載");
ExecuteLogger.info("  - ウィンドウライフサイクル管理");
ExecuteLogger.info("  - 特別処理（レポート/Genspark）");
ExecuteLogger.info("  - 次のグループ処理準備");
ExecuteLogger.info(
  "📖 使用方法: executeStep5({hasNextGroup: true, nextGroupNumber: 2, totalGroups: 3, isLastGroup: false})",
);

// ========================================
// スクリプト読み込み完了通知
// ========================================
log.debug("✅ [step5-execute.js] ロード完了");

// スクリプトトラッカーに登録
if (window.scriptLoadTracker) {
  window.scriptLoadTracker.addScript("step5-execute.js");
}
