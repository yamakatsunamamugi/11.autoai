/**
 * @fileoverview Step 4 Execute - AI自動化制御ファイル
 *
 * 各AI専用自動化ファイルを読み込んで制御します：
 * - 4-1-chatgpt-automation.js: ChatGPT専用処理
 * - 4-2-claude-automation.js: Claude専用処理
 * - 4-3-gemini-automation.js: Gemini専用処理
 * - 4-4-report-automation.js: Report専用処理
 * - 4-5-genspark-automation.js: Genspark専用処理
 *
 * @version 2.0.0
 * @date 2025-09-20
 */

// =======================================
// 簡易ログシステム（ClaudeLoggerと互換）
// =======================================
const ExecuteLogger = {
  logLevel: "INFO",
  logLevels: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 },

  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  },

  error(msg, data) {},

  warn(msg, data) {},

  info(msg, data) {},

  debug(msg, data) {},
};

// デフォルトログレベル設定
const isDebugMode = localStorage.getItem("executeLogLevel") === "DEBUG";
ExecuteLogger.logLevel = isDebugMode ? "DEBUG" : "INFO";

// ========================================
// AI専用ファイル読み込み管理
// ========================================
class AIAutomationLoader {
  constructor() {
    this.loadedFiles = new Set();
    this.aiFileMap = {
      chatgpt: chrome.runtime.getURL("4-1-chatgpt-automation.js"),
      claude: chrome.runtime.getURL("4-2-claude-automation.js"),
      gemini: chrome.runtime.getURL("4-3-gemini-automation.js"),
      report: chrome.runtime.getURL("4-4-report-automation.js"),
      genspark: chrome.runtime.getURL("4-5-genspark-automation.js"),
    };
  }

  /**
   * AI専用ファイルを動的に読み込み
   */
  async loadAIFile(aiType) {
    const normalizedType = aiType.toLowerCase();
    const filePath = this.aiFileMap[normalizedType];

    if (!filePath) {
      throw new Error(`未対応のAI種別: ${aiType}`);
    }

    if (this.loadedFiles.has(normalizedType)) {
      ExecuteLogger.info(
        `[step4-execute.js→AILoader] ${aiType} は既に読み込み済み`,
      );
      return;
    }

    try {
      ExecuteLogger.info(
        `[step4-execute.js→AILoader] ${aiType} 自動化ファイル読み込み開始`,
      );
      ExecuteLogger.debug(`[AILoader] [DEBUG] 元のfilePath: ${filePath}`);
      ExecuteLogger.debug(
        `[AILoader] [DEBUG] 現在のページURL: ${window.location.href}`,
      );
      ExecuteLogger.debug(
        `[AILoader] [DEBUG] chrome.runtime.getURL使用: ${typeof chrome !== "undefined" && chrome.runtime}`,
      );
      ExecuteLogger.debug(
        `[AILoader] [DEBUG] 最終的なスクリプトURL: ${filePath}`,
      );
      ExecuteLogger.debug(
        `[AILoader] [DEBUG] 読み込み前のwindow.ClaudeAutomation: ${typeof window.ClaudeAutomation}`,
      );

      // スクリプトタグで動的読み込み
      const script = document.createElement("script");
      script.src = filePath;
      script.type = "text/javascript";

      await new Promise((resolve, reject) => {
        script.onload = () => {
          ExecuteLogger.info(
            `[step4-execute.js→AILoader] ✅ ${aiType} 読み込み完了`,
          );
          ExecuteLogger.debug(
            `[AILoader] [DEBUG] 読み込み後のwindow.ClaudeAutomation: ${typeof window.ClaudeAutomation}`,
          );
          if (normalizedType === "claude") {
            ExecuteLogger.debug(
              `[AILoader] [DEBUG] ClaudeAutomation.executeTask存在: ${window.ClaudeAutomation && typeof window.ClaudeAutomation.executeTask === "function"}`,
            );
          }
          this.loadedFiles.add(normalizedType);
          resolve();
        };
        script.onerror = (error) => {
          ExecuteLogger.error(
            `[AILoader] ❌ ${aiType} 読み込み失敗: ${filePath}`,
          );
          ExecuteLogger.error(`[AILoader] [DEBUG] エラー詳細:`, error);
          ExecuteLogger.error(`[AILoader] [DEBUG] script.src: ${script.src}`);
          reject(new Error(`${aiType} 自動化ファイルの読み込みに失敗しました`));
        };
        document.head.appendChild(script);
      });
    } catch (error) {
      ExecuteLogger.error(`[AILoader] ${aiType} 読み込みエラー:`, error);
      throw error;
    }
  }

  /**
   * AI自動化が利用可能かチェック
   */
  isAIAvailable(aiType) {
    const normalizedType = aiType.toLowerCase();
    ExecuteLogger.debug(
      `[AILoader] [DEBUG] AI利用可能チェック: ${normalizedType}`,
    );

    switch (normalizedType) {
      case "chatgpt":
        return (
          window.ChatGPTAutomationV2 &&
          typeof window.ChatGPTAutomationV2.executeTask === "function"
        );
      case "claude":
        const isAvailable =
          window.ClaudeAutomation &&
          typeof window.ClaudeAutomation.executeTask === "function";
        ExecuteLogger.debug(
          `[AILoader] [DEBUG] ClaudeAutomation利用可能: ${isAvailable}, 存在: ${!!window.ClaudeAutomation}, executeTask: ${window.ClaudeAutomation && typeof window.ClaudeAutomation.executeTask}`,
        );
        return isAvailable;
      case "gemini":
        return (
          window.GeminiAutomation &&
          typeof window.GeminiAutomation.executeTask === "function"
        );
      case "report":
        return (
          window.ReportAutomation &&
          typeof window.ReportAutomation.executeTask === "function"
        );
      case "genspark":
        return (
          window.GensparkAutomationV2 &&
          typeof window.GensparkAutomationV2.executeTask === "function"
        );
      default:
        return false;
    }
  }
}

// グローバルインスタンス作成
window.aiAutomationLoader = new AIAutomationLoader();

// ========================================
// Step 4-0-3: 【3種類AI機能】制御クラス
// AI行に「3種類（ChatGPT・Gemini・Claude）」と記載された場合の処理
// - B列のプロンプトを3つのAIに同時送信
// - F列→ChatGPT、G列→Claude、H列→Geminiに結果格納
// ========================================
class ThreeAIController {
  constructor() {
    // Step 4-0-3-1: 列とAIの対応表初期化（src/core/ai-task-executor.jsから移植）
    this.columnToAI = {
      F: "chatgpt",
      G: "claude",
      H: "gemini",
    };
  }

  /**
   * Step 4-0-3-2: 3種類AIタスクかどうかを判定
   * @param {Object} taskData - タスクデータ
   * @returns {boolean}
   */
  isThreeTypeAI(taskData) {
    const result = taskData.aiType === "3種類（ChatGPT・Gemini・Claude）";
    if (result) {
      ExecuteLogger.info("[step4-execute.js] Step 4-0-3-2: 3種類AI判定 → true");
    }
    return result;
  }

  /**
   * Step 4-0-3-3: セル位置から対応するAIタイプを取得
   * @param {string} cellPosition - セル位置（例: "F10"）
   * @returns {string} AIタイプ
   */
  getAITypeByColumn(cellPosition) {
    ExecuteLogger.info("[step4-execute.js] Step 4-0-3-3: 列判定開始");
    const column = cellPosition.charAt(0);
    const aiType = this.columnToAI[column] || "chatgpt";
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-0-3-3: 列${column} → ${aiType}`,
    );
    return aiType;
  }

  /**
   * Step 4-0-3-4: 3種類AI並列実行
   * @param {Object} baseTaskData - 基本タスクデータ
   * @returns {Promise<Array>} 実行結果の配列
   */
  async executeThreeTypeAI(baseTaskData) {
    ExecuteLogger.info(
      "🚀 [step4-execute.js] Step 4-0-3-4: 3種類AI並列実行開始",
      {
        prompt: baseTaskData.prompt?.substring(0, 50) + "...",
        model: baseTaskData.model,
        function: baseTaskData.function,
      },
    );

    const promises = [];

    // Step 4-0-3-4-1: 各列のタスクを生成して並列実行
    ExecuteLogger.info("[step4-execute.js] Step 4-0-3-4-1: タスク生成");
    for (const [column, aiType] of Object.entries(this.columnToAI)) {
      const task = {
        ...baseTaskData,
        aiType: aiType,
        cellInfo: {
          ...baseTaskData.cellInfo,
          column: column,
        },
      };
      ExecuteLogger.info(
        `[step4-execute.js] Step 4-0-3-4-2: ${column}列用タスク生成 → ${aiType}`,
      );
      promises.push(this.executeSingleAI(task, aiType));
    }

    // Step 4-0-3-4-3: 並列実行と結果待機
    ExecuteLogger.info(
      "[step4-execute.js] Step 4-0-3-4-3: 3つのAI並列実行中...",
    );
    const results = await Promise.allSettled(promises);

    // Step 4-0-3-4-4: 実行結果集計
    ExecuteLogger.info("✅ [step4-execute.js] Step 4-0-3-4-4: 並列実行完了", {
      成功: results.filter((r) => r.status === "fulfilled").length,
      失敗: results.filter((r) => r.status === "rejected").length,
    });

    return results;
  }

  /**
   * Step 4-0-3-5: 単一AIの実行
   * @param {Object} task - タスクデータ
   * @param {string} aiType - AIタイプ
   * @returns {Promise<Object>} 実行結果
   */
  async executeSingleAI(task, aiType) {
    ExecuteLogger.info(`[step4-execute.js] Step 4-0-3-5: ${aiType}実行準備`);

    // Step 4-0-3-5-1: タブ通信 vs ローカル実行の判定
    if (task.tabId && typeof chrome !== "undefined" && chrome.tabs) {
      // Step 4-0-3-5-2: タブ通信でタスクを実行
      ExecuteLogger.info(
        `[step4-execute.js] Step 4-0-3-5-2: ${aiType}をタブ通信で実行 (tabId: ${task.tabId})`,
      );

      try {
        const response = await chrome.tabs.sendMessage(task.tabId, {
          type: "CLAUDE_EXECUTE_TASK",
          task: task,
          aiType: aiType,
        });

        if (chrome.runtime.lastError) {
          throw new Error(
            `タブ通信エラー: ${chrome.runtime.lastError.message}`,
          );
        }

        if (!response || !response.success) {
          throw new Error(
            `タスク実行失敗: ${response?.error || "不明なエラー"}`,
          );
        }

        ExecuteLogger.info(
          `[step4-execute.js] Step 4-0-3-5-2: ${aiType}タブ通信実行完了`,
        );
        return response;
      } catch (error) {
        ExecuteLogger.error(
          `[step4-execute.js] Step 4-0-3-5-2: ${aiType}タブ通信失敗 - フォールバックを試行`,
          error,
        );
        // フォールバックとしてローカル実行を試行
      }
    }

    // Step 4-0-3-5-3: フォールバック: ローカルAutomationオブジェクトで実行
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-0-3-5-3: ${aiType}をローカル実行で処理`,
    );

    const automations = {
      chatgpt: window.ChatGPTAutomationV2 || window.ChatGPTAutomation,
      claude: window.ClaudeAutomation,
      gemini: window.GeminiAutomation,
    };

    const automation = automations[aiType];
    if (!automation?.executeTask) {
      ExecuteLogger.error(
        `[step4-execute.js] Step 4-0-3-5-3: ${aiType}のAutomationオブジェクトが利用できません`,
      );
      throw new Error(`${aiType}のAutomationオブジェクトが利用できません`);
    }

    return await automation.executeTask(task);
  }
}

// グローバルインスタンス作成
window.threeAIController = new ThreeAIController();

// ========================================
// グループタイプ判定クラス
// ========================================
class TaskGroupTypeDetector {
  constructor() {
    this.threeTypeAIs = ["chatgpt", "claude", "gemini"];
  }

  /**
   * タスクリストからグループタイプを判定
   * @param {Array} taskList - タスクリスト
   * @returns {Object} - {type: 'normal' | 'threeTypes', aiTypes: Array}
   */
  detectGroupType(taskList) {
    ExecuteLogger.info("🔍 [GroupTypeDetector] タスクリスト分析開始", taskList);

    if (!taskList || taskList.length === 0) {
      ExecuteLogger.info(
        "🔍 [GroupTypeDetector] 空のタスクリスト - デフォルト: normal",
      );
      return { type: "normal", aiTypes: [] };
    }

    // 【3種類AI判定】追加: aiTypeが「3種類（ChatGPT・Gemini・Claude）」の場合
    const hasThreeTypeAI = taskList.some(
      (task) => task.aiType === "3種類（ChatGPT・Gemini・Claude）",
    );

    if (hasThreeTypeAI) {
      ExecuteLogger.info(
        "🎯 [GroupTypeDetector] グループタイプ: 3種類AI（aiType検出）",
      );
      return {
        type: "threeTypes",
        aiTypes: ["chatgpt", "claude", "gemini"], // 固定順序
      };
    }

    // タスクリストからAI種別を抽出
    const aiTypes = [
      ...new Set(
        taskList.map((task) => {
          let aiType = task.aiType;
          // AI種別の正規化
          if (aiType === "single" || !aiType) {
            aiType = "claude";
          }
          return aiType.toLowerCase();
        }),
      ),
    ];

    ExecuteLogger.info("🔍 [GroupTypeDetector] 検出されたAI種別:", aiTypes);

    // 3種類AI判定: ChatGPT、Claude、Geminiが全て含まれているか
    const hasAllThreeTypes = this.threeTypeAIs.every((aiType) =>
      aiTypes.includes(aiType),
    );

    if (hasAllThreeTypes && aiTypes.length === 3) {
      ExecuteLogger.info("🎯 [GroupTypeDetector] グループタイプ: 3種類AI");
      return {
        type: "threeTypes",
        aiTypes: ["chatgpt", "claude", "gemini"], // 固定順序
      };
    } else {
      ExecuteLogger.info("🎯 [GroupTypeDetector] グループタイプ: 通常処理");
      return {
        type: "normal",
        aiTypes: aiTypes.slice(0, 3), // 最大3つまで
      };
    }
  }

  /**
   * タスクの順番に応じたウィンドウ配置を取得
   * @param {Array} taskList - タスクリスト
   * @returns {Array} - [{aiType, position, taskIndex}] 形式の配置情報
   */
  getWindowLayoutFromTasks(taskList) {
    ExecuteLogger.info(
      "🖼️ [GroupTypeDetector] タスク順序ベースのウィンドウ配置計算:",
      {
        taskCount: taskList.length,
      },
    );

    // 位置の順序：右上(1) → 左上(0) → 左下(2)
    const positionSequence = [1, 0, 2]; // 右上、左上、左下

    // タスクリストから実際に使用されるAI種別を抽出（順序を保持）
    const usedAITypes = [];
    const seenAITypes = new Set();

    taskList.forEach((task) => {
      // スプレッドシートで指定されたAI種別を取得
      let aiType = task.aiType || task.ai;

      // AI種別の正規化
      if (aiType === "single" || !aiType) {
        aiType = "claude";
      }

      // 3種類AIの場合は展開
      if (aiType === "3種類（ChatGPT・Gemini・Claude）") {
        ["chatgpt", "claude", "gemini"].forEach((ai) => {
          if (!seenAITypes.has(ai)) {
            usedAITypes.push(ai);
            seenAITypes.add(ai);
          }
        });
      } else {
        const normalizedAI = aiType.toLowerCase();
        if (!seenAITypes.has(normalizedAI)) {
          usedAITypes.push(normalizedAI);
          seenAITypes.add(normalizedAI);
        }
      }
    });

    // 必要なAI種別のみにウィンドウ位置を割り当て
    const windowLayout = usedAITypes.slice(0, 3).map((aiType, index) => ({
      aiType: aiType,
      position: positionSequence[index],
      taskIndex: index,
      requiredForTasks: taskList
        .filter((task) => {
          const taskAI = (task.aiType || task.ai || "claude").toLowerCase();
          return (
            taskAI === aiType ||
            (taskAI === "single" && aiType === "claude") ||
            (taskAI === "3種類（chatgpt・gemini・claude）" &&
              ["chatgpt", "claude", "gemini"].includes(aiType))
          );
        })
        .map((t) => t.id || t.taskId),
    }));

    ExecuteLogger.info("🖼️ [GroupTypeDetector] 配置結果:", {
      totalTasks: taskList.length,
      uniqueAIs: usedAITypes.length,
      windowCount: windowLayout.length,
      layout: windowLayout
        .map((w) => `${w.aiType}(位置${w.position})`)
        .join(" → "),
      taskMapping: windowLayout
        .map((w) => `${w.aiType}: ${w.requiredForTasks.length}タスク`)
        .join(", "),
    });

    return windowLayout;
  }

  /**
   * 旧式のグループタイプ配置（後方互換用）
   * @deprecated getWindowLayoutFromTasks()を使用してください
   */
  getWindowLayout(groupType, aiTypes) {
    ExecuteLogger.warn(
      "⚠️ [GroupTypeDetector] 非推奨のgetWindowLayout()が呼び出されました",
    );

    // 旧式の場合はタスク順序ベースに変換
    const dummyTasks = aiTypes.slice(0, 3).map((aiType, index) => ({
      id: `dummy_${index}`,
      aiType: aiType,
    }));

    return this.getWindowLayoutFromTasks(dummyTasks);
  }
}

// グローバルインスタンス作成
window.taskGroupTypeDetector = new TaskGroupTypeDetector();

// ========================================
// Step 4-1: ウィンドウ制御クラス
// ========================================
class WindowController {
  constructor() {
    this.openedWindows = new Map(); // aiType -> windowInfo
    this.windowService = null; // WindowServiceへの参照
  }

  /**
   * Step 4-1-1: WindowServiceの初期化
   */
  async initializeWindowService() {
    ExecuteLogger.info(
      "🪟 [WindowController] Step 4-1-1: WindowService初期化開始",
    );

    // WindowServiceの読み込みを少し待つ（ui.htmlの非同期読み込みを考慮）
    let retryCount = 0;
    const maxRetries = 10;

    while (retryCount < maxRetries) {
      // 🔍 [DEBUG] WindowService存在確認（詳細版）
      ExecuteLogger.info(
        `🔍 [DEBUG] WindowService詳細チェック (試行 ${retryCount + 1}/${maxRetries}):`,
        {
          typeofWindowService: typeof WindowService,
          windowWindowService: typeof window.WindowService,
          globalWindowService: typeof globalThis.WindowService,
          windowKeys: Object.keys(window).filter((k) => k.includes("Window")),
          windowServiceConstructor: window.WindowService?.constructor?.name,
          windowServicePrototype: window.WindowService?.prototype,
        },
      );

      // window.WindowServiceが存在すれば使用
      if (window.WindowService) {
        this.windowService = window.WindowService;
        ExecuteLogger.info("✅ [DEBUG] window.WindowService発見・使用", {
          type: typeof this.windowService,
          name: this.windowService?.name,
          methods: Object.getOwnPropertyNames(
            this.windowService.prototype || {},
          ),
        });
        ExecuteLogger.info(
          "✅ [WindowController] Step 4-1-1: WindowService初期化完了",
        );
        return;
      }

      // 短い待機
      if (retryCount < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      retryCount++;
    }

    // WindowServiceがグローバルに存在するかチェック
    if (window.WindowService) {
      // 既存のwindow.WindowServiceを使用
      this.windowService = window.WindowService;
    } else if (typeof WindowService !== "undefined") {
      // グローバルのWindowServiceを使用
      this.windowService = WindowService;
    } else {
      // 内部のWindowControllerを使用（step5-execute.js内で完結）
      ExecuteLogger.debug("✅ [DEBUG] 内部WindowController機能を使用");
      this.windowService = null; // WindowControllerクラスを直接使用
    }

    ExecuteLogger.debug("✅ [DEBUG] WindowService設定完了", {
      hasWindowService: !!this.windowService,
      serviceType: typeof this.windowService,
      useInternalController: !this.windowService,
    });

    ExecuteLogger.info(
      "✅ [WindowController] Step 4-1-1: WindowService初期化完了",
    );
  }

  /**
   * Step 4-1-2: 4分割ウィンドウを開く
   * @param {Array} windowLayout - [{aiType, position}] 形式の配置情報
   */
  async openWindows(windowLayout) {
    ExecuteLogger.info(
      "🪟 [WindowController] Step 4-1-2: 4分割ウィンドウ開始",
      windowLayout,
    );

    // WindowService初期化確認
    if (!this.windowService) {
      await this.initializeWindowService();
    }

    const results = [];

    for (const layout of windowLayout) {
      try {
        ExecuteLogger.info(
          `🪟 [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウを${layout.position}番目に開く`,
        );

        // AI種別に応じたURLを取得
        const url = this.getAIUrl(layout.aiType);

        // 🔍 [DEBUG] WindowService呼び出し前の詳細チェック
        ExecuteLogger.info(`🔍 [DEBUG] ウィンドウ作成前チェック:`, {
          windowServiceExists: !!this.windowService,
          methodExists: !!this.windowService?.createWindowWithPosition,
          windowServiceType: typeof this.windowService,
          windowServiceName: this.windowService?.constructor?.name,
          availableMethods: this.windowService
            ? Object.getOwnPropertyNames(
                this.windowService.constructor.prototype,
              )
            : [],
          url: url,
          position: layout.position,
        });

        // WindowServiceを使用してウィンドウ作成（正しいメソッドを使用）
        const windowInfo = await this.windowService.createWindowWithPosition(
          url,
          layout.position, // 0=左上, 1=右上, 2=左下
          {
            type: "popup",
            aiType: layout.aiType,
          },
        );

        if (windowInfo && windowInfo.id) {
          this.openedWindows.set(layout.aiType, {
            windowId: windowInfo.id,
            tabId: windowInfo.tabs?.[0]?.id,
            url: url,
            position: layout.position,
            aiType: layout.aiType,
          });

          results.push({
            aiType: layout.aiType,
            success: true,
            windowId: windowInfo.id,
            position: layout.position,
          });

          ExecuteLogger.info(
            `✅ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成成功`,
          );
        } else {
          throw new Error(`ウィンドウ作成に失敗: ${layout.aiType}`);
        }
      } catch (error) {
        ExecuteLogger.error(
          `❌ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成失敗:`,
          error,
        );
        results.push({
          aiType: layout.aiType,
          success: false,
          error: error.message,
          position: layout.position,
        });
      }

      // ウィンドウ間の待機時間
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    ExecuteLogger.info(
      "🏁 [WindowController] Step 4-1-2: 4分割ウィンドウ開く完了",
      results,
    );
    return results;
  }

  /**
   * Step 4-1-3: ウィンドウチェック（テキスト入力欄・モデル表示・機能表示）
   * @param {Array} aiTypes - チェック対象のAI種別リスト
   */
  async checkWindows(aiTypes) {
    ExecuteLogger.info(
      "🔍 [WindowController] Step 4-1-3: ウィンドウチェック開始",
      aiTypes,
    );

    const checkResults = [];

    for (const aiType of aiTypes) {
      const windowInfo = this.openedWindows.get(aiType);
      if (!windowInfo) {
        ExecuteLogger.warn(
          `⚠️ [Step 4-1-3] ${aiType}のウィンドウが見つかりません`,
        );
        checkResults.push({
          aiType: aiType,
          success: false,
          error: "ウィンドウが開かれていません",
        });
        continue;
      }

      try {
        ExecuteLogger.info(
          `🔍 [Step 4-1-3] ${aiType}ウィンドウをチェック中...`,
        );

        // タブをアクティブにしてからチェック
        if (windowInfo.tabId) {
          await chrome.tabs.update(windowInfo.tabId, { active: true });
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 読み込み待機
        }

        // AI種別に応じたチェック処理
        const checkResult = await this.performWindowCheck(
          aiType,
          windowInfo.tabId,
        );

        checkResults.push({
          aiType: aiType,
          success: checkResult.success,
          checks: checkResult.checks,
          error: checkResult.error,
        });

        ExecuteLogger.info(
          `✅ [Step 4-1-3] ${aiType}ウィンドウチェック完了:`,
          checkResult,
        );
      } catch (error) {
        ExecuteLogger.error(
          `❌ [Step 4-1-3] ${aiType}ウィンドウチェック失敗:`,
          error,
        );
        checkResults.push({
          aiType: aiType,
          success: false,
          error: error.message,
        });
      }
    }

    ExecuteLogger.info(
      "🏁 [WindowController] Step 4-1-3: ウィンドウチェック完了",
      checkResults,
    );
    return checkResults;
  }

  /**
   * AI種別に応じたURLを取得
   */
  getAIUrl(aiType) {
    const urls = {
      chatgpt: "https://chatgpt.com/",
      claude: "https://claude.ai/",
      gemini: "https://gemini.google.com/",
      genspark: "https://www.genspark.ai/",
      report: "about:blank", // レポート用は空白ページ
    };
    return urls[aiType.toLowerCase()] || "about:blank";
  }

  /**
   * 個別ウィンドウのチェック処理
   */
  async performWindowCheck(aiType, tabId) {
    const checks = {
      textInput: false,
      modelDisplay: false,
      functionDisplay: false,
    };

    try {
      // Content scriptにチェック要求を送信
      const response = await chrome.tabs.sendMessage(tabId, {
        action: "CHECK_UI_ELEMENTS",
        aiType: aiType,
      });

      // Chrome runtime.lastErrorのチェック
      if (chrome.runtime.lastError) {
        console.warn(
          `[step5-execute.js] タブ通信エラー (tabId: ${tabId}):`,
          chrome.runtime.lastError.message,
        );
        return checks; // デフォルト値で復帰
      }

      if (response && response.success) {
        checks.textInput = response.checks.textInput || false;
        checks.modelDisplay = response.checks.modelDisplay || false;
        checks.functionDisplay = response.checks.functionDisplay || false;
      }

      const allChecksPass = Object.values(checks).every((check) => check);

      return {
        success: allChecksPass,
        checks: checks,
        error: allChecksPass ? null : "UI要素の一部が見つかりません",
      };
    } catch (error) {
      return {
        success: false,
        checks: checks,
        error: error.message,
      };
    }
  }

  /**
   * 開かれたウィンドウ情報を取得
   */
  getOpenedWindows() {
    return Array.from(this.openedWindows.entries()).map(([aiType, info]) => ({
      aiType,
      ...info,
    }));
  }

  /**
   * Step 4-1-4: ウィンドウを閉じる
   */
  async closeWindows(aiTypes = null) {
    ExecuteLogger.info(
      "🔒 [WindowController] Step 4-1-4: ウィンドウクローズ開始",
      aiTypes,
    );

    const targetAiTypes = aiTypes || Array.from(this.openedWindows.keys());

    for (const aiType of targetAiTypes) {
      const windowInfo = this.openedWindows.get(aiType);
      if (windowInfo && windowInfo.windowId) {
        try {
          await chrome.windows.remove(windowInfo.windowId);
          this.openedWindows.delete(aiType);
          ExecuteLogger.info(`✅ [Step 4-1-4] ${aiType}ウィンドウクローズ完了`);
        } catch (error) {
          ExecuteLogger.error(
            `❌ [Step 4-1-4] ${aiType}ウィンドウクローズ失敗:`,
            error,
          );
        }
      }
    }

    ExecuteLogger.info(
      "🏁 [WindowController] Step 4-1-4: ウィンドウクローズ完了",
    );
  }
}

// グローバルインスタンス作成
window.windowController = new WindowController();

// ========================================
// SimpleSheetsClient: stepフォルダ内で完結するSheets APIクライアント
// ========================================
class SimpleSheetsClient {
  constructor() {
    this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    this.sheetNameCache = new Map(); // GID -> シート名のキャッシュ
  }

  /**
   * 認証トークンの取得
   */
  async getAuthToken() {
    if (window.globalState?.authToken) {
      return window.globalState.authToken;
    }
    throw new Error("認証トークンが利用できません");
  }

  /**
   * GIDから実際のシート名を取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのGID
   * @returns {Promise<string|null>} 実際のシート名
   */
  async getSheetNameFromGid(spreadsheetId, gid) {
    if (!gid) return null;

    // キャッシュチェック
    const cacheKey = `${spreadsheetId}_${gid}`;
    if (this.sheetNameCache.has(cacheKey)) {
      return this.sheetNameCache.get(cacheKey);
    }

    try {
      const token = await this.getAuthToken();
      const url = `${this.baseUrl}/${spreadsheetId}?fields=sheets(properties)`;

      const response = await window.fetchWithTokenRefresh(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return null;
      }

      const metadata = await response.json();
      const targetGidNumber = parseInt(gid);
      const sheet = metadata.sheets?.find(
        (s) => s.properties.sheetId === targetGidNumber,
      );

      if (sheet) {
        const sheetName = sheet.properties.title;
        // キャッシュに保存
        this.sheetNameCache.set(cacheKey, sheetName);
        return sheetName;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * セルの値を取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} sheetName - シート名
   * @param {string} range - セル範囲（例: "A1" または "A1:B10"）
   * @returns {Promise<Object>} APIレスポンス
   */
  async getCellValues(spreadsheetId, sheetName, range) {
    try {
      const token = await this.getAuthToken();

      // シート名の処理
      let fullRange;

      // シート名がない場合
      if (!sheetName) {
        fullRange = range;
      }
      // スペースや特殊文字を含む場合
      else if (sheetName.match(/[\s\-]/)) {
        fullRange = `'${sheetName}'!${range}`;
      }
      // その他（日本語を含む場合も）
      else {
        // Google Sheets APIは日本語シート名をシングルクォートなしで受け付ける
        fullRange = `${sheetName}!${range}`;
      }

      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?valueRenderOption=FORMATTED_VALUE`;

      const response = await window.fetchWithTokenRefresh(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Failed to get cell range ${range}: ${error.error.message}`,
        );
      }

      const data = await response.json();

      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * セルに値を書き込み
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} sheetName - シート名
   * @param {string} range - セル範囲
   * @param {Array<Array>} values - 書き込む値
   * @returns {Promise<Object>} APIレスポンス
   */
  async updateCells(spreadsheetId, sheetName, range, values) {
    try {
      const token = await this.getAuthToken();

      // シート名の処理（getCellValuesと同様）
      let fullRange;
      if (
        sheetName &&
        sheetName.match(/[^\x00-\x7F]/) &&
        window.globalState?.gid
      ) {
        fullRange = range;
      } else if (sheetName) {
        if (sheetName.match(/[\s\-]/)) {
          fullRange = `'${sheetName}'!${range}`;
        } else {
          fullRange = `${sheetName}!${range}`;
        }
      } else {
        fullRange = range;
      }

      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?valueInputOption=USER_ENTERED`;

      const response = await window.fetchWithTokenRefresh(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Failed to update cell range ${range}: ${error.error.message}`,
        );
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }
}

// ========================================
// Step 4-2: スプレッドシートデータ動的取得クラス
// ========================================
class SpreadsheetDataManager {
  constructor() {
    this.sheetsClient = null;
    this.spreadsheetData = null;
  }

  /**
   * Step 4-2-1: SheetsClientの初期化
   */
  async initializeSheetsClient() {
    ExecuteLogger.info(
      "📊 [SpreadsheetDataManager] Step 4-2-1: SheetsClient初期化開始",
    );

    // SimpleSheetsClientを直接使用（動的インポート不要）
    try {
      this.sheetsClient = new SimpleSheetsClient();
      ExecuteLogger.info(
        "✅ [SpreadsheetDataManager] Step 4-2-1: SimpleSheetsClient初期化完了",
      );
    } catch (instantiationError) {
      throw new Error(
        `SimpleSheetsClientインスタンス化失敗: ${instantiationError.message}`,
      );
    }
  }

  /**
   * Step 4-2-2: スプレッドシート設定データの取得
   */
  async getSpreadsheetConfig() {
    ExecuteLogger.info(
      "📊 [SpreadsheetDataManager] Step 4-2-2: スプレッドシート設定取得開始",
    );

    // 🔧 [DEBUG] 統一化：window.globalState状態をログ出力
    ExecuteLogger.info("🔍 [DEBUG] window.globalState状態チェック:", {
      windowGlobalStateExists: typeof window.globalState !== "undefined",
      spreadsheetId: window.globalState?.spreadsheetId,
      windowGlobalStateData: window.globalState,
    });

    // 🔧 [UNIFIED] window.globalStateを直接使用（統一化）
    ExecuteLogger.info("🔍 [DEBUG] window.globalState状態チェック:", {
      exists: typeof window.globalState !== "undefined",
      spreadsheetId: window.globalState?.spreadsheetId,
      gid: window.globalState?.gid,
    });

    if (!window.globalState || !window.globalState.spreadsheetId) {
      ExecuteLogger.error(
        "❌ [DEBUG] window.globalState または spreadsheetId が存在しません",
      );
      ExecuteLogger.error("   - window.globalState:", window.globalState);
      throw new Error(
        "window.globalStateが設定されていません。step1-setup.jsを先に実行してください。",
      );
    }

    // window.globalStateから直接データを構築（統一化）
    const spreadsheetId = window.globalState.spreadsheetId;
    const gid = window.globalState.gid || "0";

    // GIDから実際のシート名を取得
    let actualSheetName = `シート${gid}`; // デフォルト値

    try {
      const sheetNameFromGid = await this.sheetsClient.getSheetNameFromGid(
        spreadsheetId,
        gid,
      );
      if (sheetNameFromGid) {
        actualSheetName = sheetNameFromGid;
        ExecuteLogger.info(
          "✅ [SpreadsheetDataManager] 実際のシート名を取得:",
          {
            gid: gid,
            sheetName: actualSheetName,
          },
        );
      } else {
        ExecuteLogger.warn(
          "⚠️ [SpreadsheetDataManager] シート名を取得できませんでした。デフォルト値を使用:",
          actualSheetName,
        );
      }
    } catch (error) {
      ExecuteLogger.error(
        "❌ [SpreadsheetDataManager] シート名取得エラー:",
        error,
      );
      // エラーの場合はデフォルト値を使用
    }

    this.spreadsheetData = {
      spreadsheetId: spreadsheetId,
      gid: gid,
      sheetName: actualSheetName,
      apiHeaders: window.globalState.apiHeaders || {},
      sheetsApiBase:
        window.globalState.sheetsApiBase ||
        "https://sheets.googleapis.com/v4/spreadsheets",
      specialRows: window.globalState.specialRows || {},
      authToken: window.globalState.authToken || null,
    };

    ExecuteLogger.debug(
      "✅ [DEBUG] 統一化データ構築完了:",
      this.spreadsheetData,
    );
    ExecuteLogger.info(
      "✅ [SpreadsheetDataManager] Step 4-2-2: スプレッドシート設定取得完了",
      {
        spreadsheetId: this.spreadsheetData.spreadsheetId,
        sheetName: this.spreadsheetData.sheetName,
      },
    );

    return this.spreadsheetData;
  }

  /**
   * Step 4-2-3: タスクリストから動的データを取得
   * @param {Array} taskList - タスクリスト
   * @returns {Array} - 拡張されたタスクリスト（AI・モデル・機能・プロンプト含む）
   */
  async enrichTaskList(taskList) {
    ExecuteLogger.info(
      "📊 [SpreadsheetDataManager] Step 4-2-3: タスクリスト動的データ取得開始",
      taskList,
    );

    // SheetsClient初期化確認
    if (!this.sheetsClient) {
      await this.initializeSheetsClient();
    }

    // スプレッドシート設定確認
    if (!this.spreadsheetData) {
      await this.getSpreadsheetConfig();
    }

    const enrichedTaskList = [];

    for (const task of taskList) {
      try {
        ExecuteLogger.info(
          `📊 [Step 4-2-3] タスク ${task.id || task.taskId} の動的データ取得中...`,
        );

        // タスクのセル位置情報から動的データを取得
        const enrichedTask = await this.getTaskDynamicData(task);

        enrichedTaskList.push(enrichedTask);
        ExecuteLogger.info(
          `✅ [Step 4-2-3] タスク ${task.id || task.taskId} の動的データ取得完了`,
        );
      } catch (error) {
        ExecuteLogger.error(
          `❌ [Step 4-2-3] タスク ${task.id || task.taskId} の動的データ取得失敗:`,
          error,
        );
        // エラーの場合は元のタスクデータを使用
        enrichedTaskList.push(task);
      }
    }

    ExecuteLogger.info(
      "🏁 [SpreadsheetDataManager] Step 4-2-3: タスクリスト動的データ取得完了",
      enrichedTaskList,
    );
    return enrichedTaskList;
  }

  /**
   * Step 4-2-4: 個別タスクの動的データ取得
   * @param {Object} task - タスクデータ
   * @returns {Object} - 拡張されたタスクデータ
   */
  async getTaskDynamicData(task) {
    const enrichedTask = { ...task };

    try {
      // 【シンプル化】Step3の値をそのまま代入
      enrichedTask.answerCell = task.answerCell;
      enrichedTask.logCell = task.logCell;
      enrichedTask.workCell = task.workCell;

      // 特殊タスク（レポート化、Genspark）の場合
      if (task.groupType === "report" || task.groupType === "genspark") {
        ExecuteLogger.info(
          `📊 [Step 4-2-4] 特殊タスク - 作業セル: ${enrichedTask.workCell}`,
        );
        return enrichedTask;
      }

      // 【fallback削除】Step3で設定された値をそのまま使用
      const cellRef = task.answerCell;

      if (!cellRef) {
        ExecuteLogger.warn(`⚠️ [Step 4-2-4] answerCellが未設定: ${task.id}`);
        return enrichedTask;
      }

      ExecuteLogger.info(
        `📊 [Step 4-2-4] セル ${cellRef} から動的データ取得中...`,
      );

      // Step 4-2-4-1: プロンプトデータの取得
      const promptData = await this.getPromptData(cellRef);
      if (promptData) {
        enrichedTask.prompt = promptData.prompt;
        enrichedTask.aiType = promptData.aiType || task.aiType;
      }

      // Step 4-2-4-2: モデル情報の取得
      const modelData = await this.getModelData(cellRef);
      if (modelData) {
        enrichedTask.model = modelData.model;
        enrichedTask.modelDisplay = modelData.display;
      }

      // Step 4-2-4-3: 機能情報の取得
      const functionData = await this.getFunctionData(cellRef);
      if (functionData) {
        enrichedTask.function = functionData.function;
        enrichedTask.functionDisplay = functionData.display;
      }

      // Step 4-2-4-4: 作業セル位置情報の取得（レポート・Genspark用）
      const workCellData = await this.getWorkCellData(cellRef);
      if (workCellData) {
        enrichedTask.workCellRef = workCellData.cellRef;
        enrichedTask.workCellType = workCellData.type;
      }

      ExecuteLogger.info(
        `✅ [Step 4-2-4] セル ${cellRef} の動的データ取得完了:`,
        {
          prompt: !!enrichedTask.prompt,
          model: enrichedTask.model,
          function: enrichedTask.function,
          workCell: enrichedTask.workCellRef,
        },
      );
    } catch (error) {
      ExecuteLogger.error(`❌ [Step 4-2-4] セル動的データ取得エラー:`, error);
    }

    return enrichedTask;
  }

  /**
   * プロンプトデータの取得
   */
  async getPromptData(cellRef) {
    try {
      // 🔧 [FIX] 正しいメソッド名に修正: readRange → getCellValues
      ExecuteLogger.info("🔍 [DEBUG] getPromptData実行:", {
        spreadsheetId: this.spreadsheetData.spreadsheetId,
        sheetName: this.spreadsheetData.sheetName,
        cellRef: cellRef,
        fullRange: `${this.spreadsheetData.sheetName}!${cellRef}`,
      });

      // セルからプロンプトテキストを取得
      // SimpleSheetsClientが日本語シート名をハンドルするので、そのまま渡す
      const response = await this.sheetsClient.getCellValues(
        this.spreadsheetData.spreadsheetId,
        this.spreadsheetData.sheetName,
        cellRef,
      );

      if (response?.values?.[0]?.[0]) {
        const promptText = response.values[0][0];

        // プロンプトからAI種別を推定（プロンプト内に指定がある場合）
        let aiType = null;
        const aiKeywords = {
          chatgpt: ["chatgpt", "gpt", "openai"],
          claude: ["claude", "anthropic"],
          gemini: ["gemini", "google"],
          genspark: ["genspark", "スライド", "ファクトチェック"],
          report: ["レポート", "report"],
        };

        for (const [ai, keywords] of Object.entries(aiKeywords)) {
          if (
            keywords.some((keyword) =>
              promptText.toLowerCase().includes(keyword),
            )
          ) {
            aiType = ai;
            break;
          }
        }

        return {
          prompt: promptText,
          aiType: aiType,
        };
      }
    } catch (error) {
      ExecuteLogger.error("プロンプトデータ取得エラー:", error);
    }
    return null;
  }

  /**
   * モデル情報の取得（隣接セルやヘッダーから）
   */
  async getModelData(cellRef) {
    try {
      // 隣接セルやヘッダーからモデル情報を取得する仮実装
      // 実際の実装では、スプレッドシートの構造に応じて調整が必要
      return {
        model: "Claude Opus 4.1", // デフォルト値
        display: "Claude Opus 4.1",
      };
    } catch (error) {
      ExecuteLogger.error("モデルデータ取得エラー:", error);
    }
    return null;
  }

  /**
   * 機能情報の取得
   */
  async getFunctionData(cellRef) {
    try {
      // 機能情報の取得仮実装
      return {
        function: "通常", // デフォルト値
        display: "通常",
      };
    } catch (error) {
      ExecuteLogger.error("機能データ取得エラー:", error);
    }
    return null;
  }

  /**
   * 作業セル位置情報の取得
   */
  async getWorkCellData(cellRef) {
    try {
      // 作業セル位置の計算仮実装
      // レポートやGensparkの場合の作業セル位置を計算
      return {
        cellRef: cellRef, // 同じセルまたは隣接セル
        type: "normal",
      };
    } catch (error) {
      ExecuteLogger.error("作業セルデータ取得エラー:", error);
    }
    return null;
  }
}

// グローバルインスタンス作成
window.spreadsheetDataManager = new SpreadsheetDataManager();

// ========================================
// Step 4-3: 詳細ログ記載クラス
// ========================================
class DetailedLogManager {
  constructor() {
    this.taskLogs = new Map(); // taskId -> logData
    this.sheetsClient = null;
  }

  /**
   * Step 4-3-1: ログマネージャーの初期化
   */
  async initializeLogManager() {
    ExecuteLogger.info(
      "📝 [DetailedLogManager] Step 4-3-1: ログマネージャー初期化開始",
    );

    // SheetsClientの参照取得
    if (
      window.spreadsheetDataManager &&
      window.spreadsheetDataManager.sheetsClient
    ) {
      this.sheetsClient = window.spreadsheetDataManager.sheetsClient;
    } else if (typeof SheetsClient !== "undefined") {
      this.sheetsClient = new SheetsClient();
    } else {
      throw new Error("SheetsClientが利用できません");
    }

    ExecuteLogger.info(
      "✅ [DetailedLogManager] Step 4-3-1: ログマネージャー初期化完了",
    );
  }

  /**
   * Step 4-3-2: タスク開始時のログ記録
   * @param {Object} task - タスクデータ
   * @param {Object} windowInfo - ウィンドウ情報
   */
  recordTaskStart(task, windowInfo) {
    const taskId = task.id || task.taskId || `${task.column}${task.row}`;
    const startTime = new Date();

    ExecuteLogger.info(
      `📝 [DetailedLogManager] Step 4-3-2: タスク開始ログ記録 - ${taskId}`,
    );

    const logData = {
      taskId: taskId,
      aiType: task.aiType,
      model: {
        selected: task.model || "Claude Opus 4.1",
        display: task.modelDisplay || task.model || "Claude Opus 4.1",
      },
      function: {
        selected: task.function || "通常",
        display: task.functionDisplay || task.function || "通常",
      },
      url: windowInfo?.url || "",
      startTime: startTime,
      sendTime: null,
      completeTime: null,
      prompt: task.prompt || "",
      response: null,
      error: null,
    };

    this.taskLogs.set(taskId, logData);
    ExecuteLogger.info(`✅ [Step 4-3-2] タスク開始ログ記録完了 - ${taskId}`);
  }

  /**
   * Step 4-3-3: 送信時刻の記録
   * @param {string} taskId - タスクID
   * @param {string} url - 作業URL
   */
  recordSendTime(taskId, url = null) {
    ExecuteLogger.info(
      `📝 [DetailedLogManager] Step 4-3-3: 送信時刻記録 - ${taskId}`,
    );

    const logData = this.taskLogs.get(taskId);
    if (logData) {
      logData.sendTime = new Date();
      if (url) {
        logData.url = url;
      }
      ExecuteLogger.info(
        `✅ [Step 4-3-3] 送信時刻記録完了 - ${taskId}: ${logData.sendTime.toLocaleString("ja-JP")}`,
      );
    } else {
      ExecuteLogger.warn(
        `⚠️ [Step 4-3-3] タスクログが見つかりません - ${taskId}`,
      );
    }
  }

  /**
   * Step 4-3-4: 完了時刻と結果の記録
   * @param {string} taskId - タスクID
   * @param {Object} result - AI実行結果
   */
  recordTaskComplete(taskId, result) {
    ExecuteLogger.info(
      `📝 [DetailedLogManager] Step 4-3-4: 完了時刻記録 - ${taskId}`,
    );

    const logData = this.taskLogs.get(taskId);
    if (logData) {
      logData.completeTime = new Date();
      logData.response = result?.response || result?.result || null;
      logData.error = result?.error || null;

      ExecuteLogger.info(
        `✅ [Step 4-3-4] 完了時刻記録完了 - ${taskId}: ${logData.completeTime.toLocaleString("ja-JP")}`,
      );
    } else {
      ExecuteLogger.warn(
        `⚠️ [Step 4-3-4] タスクログが見つかりません - ${taskId}`,
      );
    }
  }

  /**
   * Step 4-3-5: 詳細ログフォーマットの生成
   * @param {string} taskId - タスクID
   * @returns {string} - フォーマットされたログテキスト
   */
  generateDetailedLog(taskId) {
    ExecuteLogger.info(
      `📝 [DetailedLogManager] Step 4-3-5: 詳細ログ生成 - ${taskId}`,
    );

    const logData = this.taskLogs.get(taskId);
    if (!logData) {
      ExecuteLogger.warn(
        `⚠️ [Step 4-3-5] タスクログが見つかりません - ${taskId}`,
      );
      return "";
    }

    // 時間差計算
    let timeDiff = "";
    if (logData.sendTime && logData.completeTime) {
      const diffMs =
        logData.completeTime.getTime() - logData.sendTime.getTime();
      const diffSeconds = Math.round(diffMs / 1000);
      timeDiff = ` (${diffSeconds}秒後)`;
    }

    // AI名の日本語変換
    const aiNameMap = {
      chatgpt: "ChatGPT",
      claude: "Claude",
      gemini: "Gemini",
      genspark: "Genspark",
      report: "Report",
    };
    const aiDisplayName =
      aiNameMap[logData.aiType?.toLowerCase()] || logData.aiType || "AI";

    // フォーマット生成
    const logText = `---------- ${aiDisplayName} ----------
モデル: 選択: ${logData.model.selected} / 表示: ${logData.model.display}
機能: 選択: ${logData.function.selected} / 表示: ${logData.function.display}
URL: ${logData.url}
送信時刻: ${logData.sendTime ? logData.sendTime.toLocaleString("ja-JP") : "未記録"}
記載時刻: ${logData.completeTime ? logData.completeTime.toLocaleString("ja-JP") : "未記録"}${timeDiff}`;

    ExecuteLogger.info(`✅ [Step 4-3-5] 詳細ログ生成完了 - ${taskId}`);
    return logText;
  }

  /**
   * Step 4-3-6: ログをスプレッドシートに記載
   * @param {string} taskId - タスクID
   * @param {string} logCellRef - ログ記載先セル位置
   */
  async writeLogToSpreadsheet(taskId, logCellRef) {
    ExecuteLogger.info(
      `📝 [DetailedLogManager] Step 4-3-6: ログスプレッドシート記載 - ${taskId} -> ${logCellRef}`,
    );

    try {
      // ログマネージャー初期化確認
      if (!this.sheetsClient) {
        await this.initializeLogManager();
      }

      // 詳細ログ生成
      const logText = this.generateDetailedLog(taskId);
      if (!logText) {
        throw new Error("ログデータが生成できませんでした");
      }

      // 🔧 [UNIFIED] window.globalStateを直接使用（統一化）
      ExecuteLogger.info("🔍 [DEBUG] ログ記載時のwindow.globalState状態:", {
        exists: typeof window.globalState !== "undefined",
        spreadsheetId: window.globalState?.spreadsheetId,
      });

      if (!window.globalState || !window.globalState.spreadsheetId) {
        ExecuteLogger.error(
          "❌ [DEBUG] ログ記載時のwindow.globalState未設定エラー",
        );
        throw new Error("window.globalStateが設定されていません");
      }

      const spreadsheetData = {
        spreadsheetId: window.globalState.spreadsheetId,
        sheetName: `シート${window.globalState.gid || "0"}`,
      };

      // 🔧 [FIX] 正しいメソッド名に修正: writeToRange → updateCell
      ExecuteLogger.info("🔍 [DEBUG] ログ書き込み実行:", {
        spreadsheetId: spreadsheetData.spreadsheetId,
        range: `${spreadsheetData.sheetName}!${logCellRef}`,
        logTextLength: logText.length,
      });

      // スプレッドシートに書き込み
      await this.sheetsClient.updateCell(
        spreadsheetData.spreadsheetId,
        `${spreadsheetData.sheetName}!${logCellRef}`,
        logText,
      );

      ExecuteLogger.info(
        `✅ [Step 4-3-6] ログスプレッドシート記載完了 - ${taskId} -> ${logCellRef}`,
      );
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-3-6] ログスプレッドシート記載失敗 - ${taskId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Step 4-3-7: 回答をスプレッドシートに記載
   * @param {string} taskId - タスクID
   * @param {string} answerCellRef - 回答記載先セル位置
   */
  async writeAnswerToSpreadsheet(taskId, answerCellRef) {
    ExecuteLogger.info(
      `📝 [DetailedLogManager] Step 4-3-7: 回答スプレッドシート記載 - ${taskId} -> ${answerCellRef}`,
    );

    try {
      const logData = this.taskLogs.get(taskId);
      if (!logData || !logData.response) {
        ExecuteLogger.warn(
          `⚠️ [Step 4-3-7] 回答データが見つかりません - ${taskId}`,
        );
        return;
      }

      // ログマネージャー初期化確認
      if (!this.sheetsClient) {
        await this.initializeLogManager();
      }

      // 🔧 [UNIFIED] window.globalStateを直接使用（統一化）
      ExecuteLogger.info("🔍 [DEBUG] 回答記載時のwindow.globalState状態:", {
        exists: typeof window.globalState !== "undefined",
        spreadsheetId: window.globalState?.spreadsheetId,
      });

      if (!window.globalState || !window.globalState.spreadsheetId) {
        ExecuteLogger.error(
          "❌ [DEBUG] 回答記載時のwindow.globalState未設定エラー",
        );
        throw new Error("window.globalStateが設定されていません");
      }

      const spreadsheetData = {
        spreadsheetId: window.globalState.spreadsheetId,
        sheetName: `シート${window.globalState.gid || "0"}`,
      };

      // 🔧 [FIX] 正しいメソッド名に修正: writeToRange → updateCell
      ExecuteLogger.info("🔍 [DEBUG] 回答書き込み実行:", {
        spreadsheetId: spreadsheetData.spreadsheetId,
        range: `${spreadsheetData.sheetName}!${answerCellRef}`,
        responseLength: logData.response.length,
      });

      // 回答をスプレッドシートに書き込み
      await this.sheetsClient.updateCell(
        spreadsheetData.spreadsheetId,
        `${spreadsheetData.sheetName}!${answerCellRef}`,
        logData.response,
      );

      ExecuteLogger.info(
        `✅ [Step 4-3-7] 回答スプレッドシート記載完了 - ${taskId} -> ${answerCellRef}`,
      );
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-3-7] 回答スプレッドシート記載失敗 - ${taskId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * タスクログデータの取得
   */
  getTaskLog(taskId) {
    return this.taskLogs.get(taskId);
  }

  /**
   * 全タスクログの取得
   */
  getAllTaskLogs() {
    return Array.from(this.taskLogs.entries()).map(([taskId, logData]) => ({
      taskId,
      ...logData,
    }));
  }
}

// グローバルインスタンス作成
window.detailedLogManager = new DetailedLogManager();

// ========================================
// Step 4-4: ウィンドウライフサイクル管理クラス
// ========================================
class WindowLifecycleManager {
  constructor() {
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 2000, // 2秒
      timeoutMs: 300000, // 5分
    };
    this.activeWindows = new Set(); // 現在アクティブなウィンドウを追跡
  }

  /**
   * Step 4-4-1: ライフサイクル管理の初期化
   */
  async initializeLifecycleManager() {
    ExecuteLogger.info(
      "🔄 [WindowLifecycleManager] Step 4-4-1: ライフサイクル管理初期化開始",
    );

    // 既存ウィンドウの確認
    try {
      const windows = await chrome.windows.getAll();
      ExecuteLogger.info(`📊 [Step 4-4-1] 既存ウィンドウ: ${windows.length}個`);
    } catch (error) {
      ExecuteLogger.warn(`⚠️ [Step 4-4-1] ウィンドウ確認エラー:`, error);
    }

    ExecuteLogger.info(
      "✅ [WindowLifecycleManager] Step 4-4-1: ライフサイクル管理初期化完了",
    );
  }

  /**
   * Step 4-4-2: ウィンドウの登録と追跡開始
   * @param {string} aiType - AI種別
   * @param {Object} windowInfo - ウィンドウ情報
   */
  registerWindow(aiType, windowInfo) {
    ExecuteLogger.info(
      `🔄 [WindowLifecycleManager] Step 4-4-2: ウィンドウ登録 - ${aiType}`,
    );

    const windowData = {
      aiType: aiType,
      windowId: windowInfo.windowId,
      tabId: windowInfo.tabId,
      url: windowInfo.url,
      registeredAt: new Date(),
      lastActivity: new Date(),
    };

    this.activeWindows.add(JSON.stringify(windowData));
    ExecuteLogger.info(
      `✅ [Step 4-4-2] ウィンドウ登録完了 - ${aiType}: ${windowInfo.windowId}`,
    );

    return windowData;
  }

  /**
   * Step 4-4-3: AI実行のRetry処理
   * @param {Function} executeFunction - 実行する関数
   * @param {Object} task - タスクデータ
   * @param {string} operationName - 操作名
   */
  async executeWithRetry(executeFunction, task, operationName = "AI実行") {
    ExecuteLogger.info(
      `🔄 [WindowLifecycleManager] Step 4-4-3: Retry処理開始 - ${operationName}`,
    );

    let lastError = null;
    let attempt = 0;

    while (attempt < this.retryConfig.maxRetries) {
      try {
        ExecuteLogger.info(
          `🔄 [Step 4-4-3] ${operationName} 試行 ${attempt + 1}/${this.retryConfig.maxRetries}`,
        );

        // タイムアウト付きで実行
        const result = await this.executeWithTimeout(
          executeFunction,
          this.retryConfig.timeoutMs,
        );

        ExecuteLogger.info(
          `✅ [Step 4-4-3] ${operationName} 成功 (試行 ${attempt + 1})`,
        );
        return result;
      } catch (error) {
        lastError = error;
        attempt++;

        ExecuteLogger.error(
          `❌ [Step 4-4-3] ${operationName} 失敗 (試行 ${attempt}):`,
          error.message,
        );

        // 最後の試行でない場合は待機
        if (attempt < this.retryConfig.maxRetries) {
          ExecuteLogger.info(
            `⏳ [Step 4-4-3] ${this.retryConfig.retryDelay}ms待機後に再試行...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryConfig.retryDelay),
          );

          // ウィンドウ状態の確認とリフレッシュ
          await this.refreshWindowIfNeeded(task);
        }
      }
    }

    ExecuteLogger.error(
      `❌ [Step 4-4-3] ${operationName} 最終失敗 (${this.retryConfig.maxRetries}回試行)`,
      lastError,
    );
    throw new Error(
      `${operationName} failed after ${this.retryConfig.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Step 4-4-4: タイムアウト付き実行
   */
  async executeWithTimeout(executeFunction, timeoutMs) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`操作がタイムアウトしました (${timeoutMs}ms)`)),
        timeoutMs,
      );
    });

    return Promise.race([executeFunction(), timeoutPromise]);
  }

  /**
   * Step 4-4-5: ウィンドウ状態確認とリフレッシュ
   * @param {Object} task - タスクデータ
   */
  async refreshWindowIfNeeded(task) {
    ExecuteLogger.info(
      `🔄 [WindowLifecycleManager] Step 4-4-5: ウィンドウ状態確認 - ${task.aiType}`,
    );

    try {
      // WindowControllerからウィンドウ情報を取得
      const windowInfo = window.windowController?.openedWindows?.get(
        task.aiType,
      );
      if (!windowInfo) {
        ExecuteLogger.warn(
          `⚠️ [Step 4-4-5] ウィンドウ情報が見つかりません - ${task.aiType}`,
        );
        return;
      }

      // ウィンドウの存在確認
      try {
        await chrome.windows.get(windowInfo.windowId);
        ExecuteLogger.info(
          `✅ [Step 4-4-5] ウィンドウ存在確認OK - ${task.aiType}`,
        );
      } catch (error) {
        ExecuteLogger.warn(
          `⚠️ [Step 4-4-5] ウィンドウが存在しません - ${task.aiType}:`,
          error,
        );

        // ウィンドウが存在しない場合は再作成
        await this.recreateWindow(task);
      }

      // タブをアクティブにする
      if (windowInfo.tabId) {
        try {
          await chrome.tabs.update(windowInfo.tabId, { active: true });
          ExecuteLogger.info(
            `✅ [Step 4-4-5] タブアクティブ化完了 - ${task.aiType}`,
          );
        } catch (error) {
          ExecuteLogger.warn(
            `⚠️ [Step 4-4-5] タブアクティブ化失敗 - ${task.aiType}:`,
            error,
          );
        }
      }
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-4-5] ウィンドウ状態確認エラー - ${task.aiType}:`,
        error,
      );
    }
  }

  /**
   * Step 4-4-6: ウィンドウの再作成
   * @param {Object} task - タスクデータ
   */
  async recreateWindow(task) {
    ExecuteLogger.info(
      `🔄 [WindowLifecycleManager] Step 4-4-6: ウィンドウ再作成 - ${task.aiType}`,
    );

    try {
      // WindowControllerを使用してウィンドウを再作成
      if (window.windowController) {
        const layout = [
          {
            aiType: task.aiType,
            position: 0, // 左上固定
          },
        ];

        const results = await window.windowController.openWindows(layout);
        if (results[0]?.success) {
          ExecuteLogger.info(
            `✅ [Step 4-4-6] ウィンドウ再作成成功 - ${task.aiType}`,
          );
        } else {
          throw new Error(`ウィンドウ再作成に失敗: ${results[0]?.error}`);
        }
      } else {
        throw new Error("WindowControllerが利用できません");
      }
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-4-6] ウィンドウ再作成失敗 - ${task.aiType}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Step 4-4-7: タスク完了後のウィンドウクローズ
   * @param {Object} task - タスクデータ
   * @param {Object} result - 実行結果
   */
  async handleTaskCompletion(task, result) {
    ExecuteLogger.info(
      `🔄 [WindowLifecycleManager] Step 4-4-7: タスク完了処理 - ${task.aiType}`,
    );

    try {
      const taskId = task.id || task.taskId || `${task.column}${task.row}`;

      // 完了ログ記録
      if (window.detailedLogManager) {
        window.detailedLogManager.recordTaskComplete(taskId, result);
      }

      // ウィンドウクローズ（設定により制御可能）
      const shouldCloseWindow = this.shouldCloseWindowAfterTask(task, result);
      if (shouldCloseWindow) {
        await this.closeTaskWindow(task);
      } else {
        ExecuteLogger.info(`📌 [Step 4-4-7] ウィンドウを保持 - ${task.aiType}`);
      }

      // ウィンドウ追跡から削除
      this.unregisterWindow(task.aiType);

      ExecuteLogger.info(`✅ [Step 4-4-7] タスク完了処理完了 - ${task.aiType}`);
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-4-7] タスク完了処理エラー - ${task.aiType}:`,
        error,
      );
    }
  }

  /**
   * ウィンドウクローズ判定
   */
  shouldCloseWindowAfterTask(task, result) {
    // エラーの場合はウィンドウを保持（デバッグ用）
    if (!result.success) {
      return false;
    }

    // レポートやGensparkの場合は保持（作業継続の可能性）
    const keepOpenTypes = ["report", "genspark"];
    if (keepOpenTypes.includes(task.aiType?.toLowerCase())) {
      return false;
    }

    // 通常のAIタスクは完了後にクローズ
    return true;
  }

  /**
   * Step 4-4-8: 個別ウィンドウのクローズ
   * @param {Object} task - タスクデータ
   */
  async closeTaskWindow(task) {
    ExecuteLogger.info(
      `🔄 [WindowLifecycleManager] Step 4-4-8: ウィンドウクローズ - ${task.aiType}`,
    );

    try {
      if (window.windowController) {
        await window.windowController.closeWindows([task.aiType]);
        ExecuteLogger.info(
          `✅ [Step 4-4-8] ウィンドウクローズ完了 - ${task.aiType}`,
        );
      } else {
        ExecuteLogger.warn(`⚠️ [Step 4-4-8] WindowControllerが利用できません`);
      }
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-4-8] ウィンドウクローズエラー - ${task.aiType}:`,
        error,
      );
    }
  }

  /**
   * Step 4-4-9: aiType文字列を受け取る個別ウィンドウクローズ
   * @param {string} aiType - AI種別
   */
  async closeWindow(aiType) {
    ExecuteLogger.info(
      `🔄 [WindowLifecycleManager] Step 4-4-9: ウィンドウクローズ(aiType指定) - ${aiType}`,
    );

    try {
      // TaskオブジェクトのMockを作成してcloseTaskWindowを呼び出し
      const mockTask = { aiType: aiType };
      await this.closeTaskWindow(mockTask);

      ExecuteLogger.info(
        `✅ [Step 4-4-9] ウィンドウクローズ完了(aiType指定) - ${aiType}`,
      );
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-4-9] ウィンドウクローズエラー(aiType指定) - ${aiType}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * ウィンドウ追跡からの削除
   */
  unregisterWindow(aiType) {
    // 該当するウィンドウデータを削除
    for (const windowDataStr of this.activeWindows) {
      try {
        const windowData = JSON.parse(windowDataStr);
        if (windowData.aiType === aiType) {
          this.activeWindows.delete(windowDataStr);
          ExecuteLogger.info(
            `🗑️ [WindowLifecycleManager] ウィンドウ追跡削除 - ${aiType}`,
          );
          break;
        }
      } catch (error) {
        ExecuteLogger.warn("ウィンドウデータの解析エラー:", error);
      }
    }
  }

  /**
   * 全ウィンドウのクリーンアップ
   */
  async cleanupAllWindows() {
    ExecuteLogger.info(
      "🧹 [WindowLifecycleManager] 全ウィンドウクリーンアップ開始",
    );

    if (window.windowController) {
      await window.windowController.closeWindows();
    }

    this.activeWindows.clear();
    ExecuteLogger.info(
      "✅ [WindowLifecycleManager] 全ウィンドウクリーンアップ完了",
    );
  }

  /**
   * アクティブウィンドウ状態の取得
   */
  getActiveWindowsStatus() {
    return Array.from(this.activeWindows).map((windowDataStr) => {
      try {
        return JSON.parse(windowDataStr);
      } catch (error) {
        return { error: "Parse error", data: windowDataStr };
      }
    });
  }
}

// グローバルインスタンス作成
window.windowLifecycleManager = new WindowLifecycleManager();

// ========================================
// Step 4-5: 特別処理機能クラス（レポート・Genspark）
// ========================================
class SpecialTaskProcessor {
  constructor() {
    this.supportedTypes = ["report", "genspark"];
    this.gensparkSubTypes = ["スライド", "ファクトチェック"];
  }

  /**
   * Step 4-5-1: 特別処理プロセッサーの初期化
   */
  async initializeProcessor() {
    ExecuteLogger.info(
      "🔧 [SpecialTaskProcessor] Step 4-5-1: 特別処理プロセッサー初期化開始",
    );

    // 必要なAutomationの確認
    const automationStatus = {
      report: typeof window.ReportAutomation !== "undefined",
      genspark: typeof window.GensparkAutomationV2 !== "undefined",
    };

    ExecuteLogger.info(
      "📊 [Step 4-5-1] Automation利用可能状況:",
      automationStatus,
    );
    ExecuteLogger.info(
      "✅ [SpecialTaskProcessor] Step 4-5-1: 特別処理プロセッサー初期化完了",
    );
  }

  /**
   * Step 4-5-2: 特別処理タスクの判定
   * @param {Object} task - タスクデータ
   * @returns {Object} - {isSpecial: boolean, type: string, subType: string}
   */
  identifySpecialTask(task) {
    ExecuteLogger.info(
      `🔧 [SpecialTaskProcessor] Step 4-5-2: 特別処理タスク判定`,
      {
        taskId: task.id,
        aiType: task.aiType,
        promptPreview: task.prompt?.substring(0, 50) + "...",
      },
    );

    const aiType = task.aiType?.toLowerCase();

    // レポート処理の判定（aiTypeのみで判定、プロンプト内容は使用しない）
    if (aiType === "report") {
      ExecuteLogger.info(`✅ [Step 4-5-2] レポート処理タスクを検出`, {
        reason: "aiTypeが'report'",
        taskId: task.id,
      });
      return {
        isSpecial: true,
        type: "report",
        subType: "standard",
      };
    }

    // Genspark処理の判定（aiTypeのみで判定）
    if (aiType === "genspark") {
      let subType = "standard";

      // サブタイプの判定
      if (task.prompt?.includes("スライド")) {
        subType = "slide";
      } else if (task.prompt?.includes("ファクトチェック")) {
        subType = "factcheck";
      }

      ExecuteLogger.info(
        `✅ [Step 4-5-2] Genspark処理タスクを検出 (${subType})`,
      );
      return {
        isSpecial: true,
        type: "genspark",
        subType: subType,
      };
    }

    ExecuteLogger.info(`📝 [Step 4-5-2] 通常タスクと判定`);
    return {
      isSpecial: false,
      type: "normal",
      subType: null,
    };
  }

  /**
   * Step 4-5-3: 特別処理タスクの実行
   * @param {Object} task - タスクデータ
   * @param {Object} specialInfo - 特別処理情報
   * @param {Object} windowInfo - ウィンドウ情報
   */
  async executeSpecialTask(task, specialInfo, windowInfo) {
    ExecuteLogger.info(
      `🔧 [SpecialTaskProcessor] Step 4-5-3: 特別処理実行 - ${specialInfo.type}`,
    );

    try {
      let result = null;

      switch (specialInfo.type) {
        case "report":
          result = await this.executeReportTask(task, windowInfo);
          break;

        case "genspark":
          result = await this.executeGensparkTask(
            task,
            specialInfo.subType,
            windowInfo,
          );
          break;

        default:
          throw new Error(`未対応の特別処理タイプ: ${specialInfo.type}`);
      }

      ExecuteLogger.info(
        `✅ [Step 4-5-3] 特別処理実行完了 - ${specialInfo.type}`,
      );
      return result;
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-5-3] 特別処理実行失敗 - ${specialInfo.type}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Step 4-5-4: レポート処理の実行
   * @param {Object} task - タスクデータ
   * @param {Object} windowInfo - ウィンドウ情報
   */
  async executeReportTask(task, windowInfo) {
    ExecuteLogger.info(
      `🔧 [SpecialTaskProcessor] Step 4-5-4: レポート処理実行開始`,
    );

    try {
      // ReportAutomation の確認
      if (!window.ReportAutomation) {
        throw new Error("ReportAutomation が利用できません");
      }

      // スプレッドシートデータの取得
      // 🔧 [UNIFIED] window.globalStateを直接使用（統一化）
      const spreadsheetData = task.spreadsheetData || {
        spreadsheetId: window.globalState?.spreadsheetId,
        sheetName: `シート${window.globalState?.gid || "0"}`,
      };
      if (!spreadsheetData) {
        throw new Error("スプレッドシートデータが設定されていません");
      }

      // レポート実行
      const result = await window.ReportAutomation.executeTask(
        task,
        spreadsheetData,
      );

      // 作業セルへの記載
      if (result.success && result.reportData) {
        await this.writeToWorkCell(task, result.reportData, "report");
      }

      ExecuteLogger.info(`✅ [Step 4-5-4] レポート処理実行完了`);
      return result;
    } catch (error) {
      ExecuteLogger.error(`❌ [Step 4-5-4] レポート処理実行失敗:`, error);
      throw error;
    }
  }

  /**
   * Step 4-5-5: Genspark処理の実行
   * @param {Object} task - タスクデータ
   * @param {string} subType - サブタイプ（slide, factcheck, standard）
   * @param {Object} windowInfo - ウィンドウ情報
   */
  async executeGensparkTask(task, subType, windowInfo) {
    ExecuteLogger.info(
      `🔧 [SpecialTaskProcessor] Step 4-5-5: Genspark処理実行開始 (${subType})`,
    );

    try {
      // GensparkAutomationV2 の確認
      if (!window.GensparkAutomationV2) {
        throw new Error("GensparkAutomationV2 が利用できません");
      }

      // サブタイプに応じたタスク調整
      const adjustedTask = { ...task };
      switch (subType) {
        case "slide":
          adjustedTask.gensparkType = "slide";
          adjustedTask.prompt = `スライド作成: ${task.prompt}`;
          break;

        case "factcheck":
          adjustedTask.gensparkType = "factcheck";
          adjustedTask.prompt = `ファクトチェック: ${task.prompt}`;
          break;

        default:
          adjustedTask.gensparkType = "standard";
          break;
      }

      // Genspark実行
      const result =
        await window.GensparkAutomationV2.executeTask(adjustedTask);

      // 作業セルへの記載
      if (result.success && result.generatedContent) {
        await this.writeToWorkCell(
          task,
          result.generatedContent,
          `genspark_${subType}`,
        );
      }

      ExecuteLogger.info(`✅ [Step 4-5-5] Genspark処理実行完了 (${subType})`);
      return result;
    } catch (error) {
      ExecuteLogger.error(`❌ [Step 4-5-5] Genspark処理実行失敗:`, error);
      throw error;
    }
  }

  /**
   * Step 4-5-6: 作業セルへのデータ記載
   * @param {Object} task - タスクデータ
   * @param {string} workData - 作業データ
   * @param {string} workType - 作業タイプ
   */
  async writeToWorkCell(task, workData, workType) {
    ExecuteLogger.info(
      `🔧 [SpecialTaskProcessor] Step 4-5-6: 作業セル記載開始 - ${workType}`,
    );

    try {
      // 作業セル位置の決定
      const workCellRef = this.determineWorkCellRef(task, workType);
      if (!workCellRef) {
        ExecuteLogger.warn(`⚠️ [Step 4-5-6] 作業セル位置が決定できません`);
        return;
      }

      // DetailedLogManagerのSheetsClientを使用
      let sheetsClient = null;
      if (window.detailedLogManager && window.detailedLogManager.sheetsClient) {
        sheetsClient = window.detailedLogManager.sheetsClient;
      } else if (
        window.spreadsheetDataManager &&
        window.spreadsheetDataManager.sheetsClient
      ) {
        sheetsClient = window.spreadsheetDataManager.sheetsClient;
      } else {
        throw new Error("SheetsClientが利用できません");
      }

      // 🔧 [UNIFIED] window.globalStateを直接使用（統一化）
      ExecuteLogger.info("🔍 [DEBUG] 作業セル記載時のwindow.globalState状態:", {
        exists: typeof window.globalState !== "undefined",
        spreadsheetId: window.globalState?.spreadsheetId,
      });

      if (!window.globalState || !window.globalState.spreadsheetId) {
        ExecuteLogger.error(
          "❌ [DEBUG] 作業セル記載時のwindow.globalState未設定エラー",
        );
        throw new Error("window.globalStateが設定されていません");
      }

      const spreadsheetData = {
        spreadsheetId: window.globalState.spreadsheetId,
        sheetName: `シート${window.globalState.gid || "0"}`,
      };

      // 作業データをフォーマット
      const formattedData = this.formatWorkData(workData, workType);

      // 🔧 [FIX] 正しいメソッド名に修正: writeToRange → updateCell
      ExecuteLogger.info("🔍 [DEBUG] 作業セル書き込み実行:", {
        spreadsheetId: spreadsheetData.spreadsheetId,
        range: `${spreadsheetData.sheetName}!${workCellRef}`,
        dataLength: formattedData.length,
      });

      // スプレッドシートに書き込み
      await sheetsClient.updateCell(
        spreadsheetData.spreadsheetId,
        `${spreadsheetData.sheetName}!${workCellRef}`,
        formattedData,
      );

      ExecuteLogger.info(`✅ [Step 4-5-6] 作業セル記載完了 - ${workCellRef}`);
    } catch (error) {
      ExecuteLogger.error(`❌ [Step 4-5-6] 作業セル記載失敗:`, error);
      throw error;
    }
  }

  /**
   * 作業セル位置の決定
   */
  determineWorkCellRef(task, workType) {
    // タスクに明示的に指定されている場合
    if (task.workCellRef) {
      return task.workCellRef;
    }

    // デフォルトの位置計算（元のセルの隣接セル）
    const cellRef = task.cellRef || `${task.column}${task.row}`;
    if (!cellRef) {
      return null;
    }

    // 列を1つ右にずらす（例: B3 -> C3）
    const match = cellRef.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return null;
    }

    const column = match[1];
    const row = match[2];

    // 列を1つ進める簡単な実装（A->B, B->C, etc.）
    let nextColumn = "";
    if (column === "A") nextColumn = "B";
    else if (column === "B") nextColumn = "C";
    else if (column === "C") nextColumn = "D";
    else if (column === "D") nextColumn = "E";
    else nextColumn = column + "W"; // フォールバック

    return `${nextColumn}${row}`;
  }

  /**
   * 作業データのフォーマット
   */
  formatWorkData(workData, workType) {
    const timestamp = new Date().toLocaleString("ja-JP");

    switch (workType) {
      case "report":
        return `[レポート作成結果 - ${timestamp}]\n${workData}`;

      case "genspark_slide":
        return `[Gensparkスライド作成結果 - ${timestamp}]\n${workData}`;

      case "genspark_factcheck":
        return `[Gensparkファクトチェック結果 - ${timestamp}]\n${workData}`;

      case "genspark_standard":
        return `[Genspark作業結果 - ${timestamp}]\n${workData}`;

      default:
        return `[作業結果 - ${timestamp}]\n${workData}`;
    }
  }

  /**
   * 特別処理対応確認
   */
  isSpecialTaskSupported(aiType) {
    const normalizedType = aiType?.toLowerCase();
    return this.supportedTypes.includes(normalizedType);
  }

  /**
   * 特別処理統計の取得
   */
  getSpecialTaskStats() {
    return {
      supportedTypes: this.supportedTypes,
      gensparkSubTypes: this.gensparkSubTypes,
      automationStatus: {
        report: typeof window.ReportAutomation !== "undefined",
        genspark: typeof window.GensparkAutomationV2 !== "undefined",
      },
    };
  }
}

// グローバルインスタンス作成
window.specialTaskProcessor = new SpecialTaskProcessor();

// ========================================
// Step 4-6: メイン実行関数（統合版）
// ========================================
async function executeStep4(taskList) {
  ExecuteLogger.debug("🔍 [DEBUG] executeStep4関数定義開始");
  ExecuteLogger.info("🚀 Step 4-6 Execute 統合実行開始", taskList);

  // 内部関数の存在確認（実行時チェック）
  ExecuteLogger.info("🔍 [DEBUG] 内部関数の定義状態確認:", {
    executeNormalAITask: typeof executeNormalAITask,
    processTaskResult: typeof processTaskResult,
    shouldPerformWindowCleanup: typeof shouldPerformWindowCleanup,
    calculateLogCellRef: typeof calculateLogCellRef,
  });

  const results = [];
  let windowLayoutInfo = null;
  let enrichedTaskList = null;

  try {
    // Step 4-6-0: 【3種類AIタスクの展開処理】
    ExecuteLogger.info(
      "📋 [step4-execute.js] Step 4-6-0: 3種類AIタスクの展開処理開始",
    );

    const expandedTaskList = [];
    for (const task of taskList) {
      if (task.aiType === "3種類（ChatGPT・Gemini・Claude）") {
        ExecuteLogger.info(
          `[step4-execute.js] Step 4-6-0-1: 3種類AIタスク検出！プロンプト: ${task.prompt?.substring(0, 30)}...`,
        );

        // 1つのタスクを3つに展開（元のai-task-executor.jsの動作を再現）
        const baseRow = task.row || task.cellInfo?.row;
        const expandedTasks = [
          {
            ...task,
            aiType: "chatgpt",
            column: "F",
            cellInfo: { ...task.cellInfo, column: "F", row: baseRow },
            originalAiType: "3種類（ChatGPT・Gemini・Claude）",
            taskGroup: task.id || task.taskId, // グループ化用
          },
          {
            ...task,
            aiType: "claude",
            column: "G",
            cellInfo: { ...task.cellInfo, column: "G", row: baseRow },
            originalAiType: "3種類（ChatGPT・Gemini・Claude）",
            taskGroup: task.id || task.taskId, // グループ化用
          },
          {
            ...task,
            aiType: "gemini",
            column: "H",
            cellInfo: { ...task.cellInfo, column: "H", row: baseRow },
            originalAiType: "3種類（ChatGPT・Gemini・Claude）",
            taskGroup: task.id || task.taskId, // グループ化用
          },
        ];

        ExecuteLogger.info(
          `[step4-execute.js] Step 4-6-0-2: 1つのタスクを3つに展開完了`,
        );
        expandedTaskList.push(...expandedTasks);
      } else {
        // 通常のタスクはそのまま追加
        expandedTaskList.push(task);
      }
    }

    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-0-3: タスク展開完了 - 元: ${taskList.length}個 → 展開後: ${expandedTaskList.length}個`,
    );

    // 展開後のタスクリストを使用
    const processTaskList = expandedTaskList;

    // Step 4-6-1: 初期化とグループタイプ判定
    ExecuteLogger.info(
      "📋 [step4-execute.js] Step 4-6-1: 初期化とグループタイプ判定開始",
    );

    // グループタイプの判定（展開後のタスクリストで判定）
    const groupTypeInfo =
      window.taskGroupTypeDetector.detectGroupType(processTaskList);
    ExecuteLogger.info(
      "🎯 [Step 4-6-1] グループタイプ判定結果:",
      groupTypeInfo,
    );

    // ウィンドウ配置情報の取得（タスク順序ベース）
    windowLayoutInfo =
      window.taskGroupTypeDetector.getWindowLayoutFromTasks(processTaskList);
    ExecuteLogger.info(
      "🖼️ [Step 4-6-1] ウィンドウ配置情報（タスク順序ベース）:",
      windowLayoutInfo,
    );

    // Step 4-6-2: スプレッドシートデータの動的取得
    ExecuteLogger.info("📊 [Step 4-6-2] スプレッドシートデータ動的取得開始");

    // 展開後のタスクリストを使用
    enrichedTaskList =
      await window.spreadsheetDataManager.enrichTaskList(processTaskList);
    ExecuteLogger.info(
      "✅ [Step 4-6-2] タスクリスト拡張完了:",
      enrichedTaskList.length,
      "個のタスク",
    );

    // Step 4-6-3: ウィンドウ開く
    ExecuteLogger.info("🪟 [Step 4-6-3] ウィンドウ開く処理開始");

    // タスクが0個の場合はウィンドウを開かずにスキップ
    let successfulWindows = [];
    if (processTaskList.length === 0) {
      ExecuteLogger.info(
        `⚠️ [Step 4-6-3] タスクが0個のため、ウィンドウ開く処理をスキップ`,
      );
    } else {
      const windowResults =
        await window.windowController.openWindows(windowLayoutInfo);
      successfulWindows = windowResults.filter((w) => w.success);
      ExecuteLogger.info(
        `✅ [Step 4-6-3] ウィンドウ開く完了: ${successfulWindows.length}/${windowResults.length}個成功`,
      );

      if (successfulWindows.length === 0 && processTaskList.length > 0) {
        throw new Error("ウィンドウを開くことができませんでした");
      }
    }

    // Step 4-6-3-1: ポップアップを右下に移動（step外と同じ動作）
    ExecuteLogger.info("🚀 [Step 4-6-3-1] ポップアップを右下に移動開始");
    try {
      // message-handler.jsのmovePopupToBottomRight()と同じ処理を実行
      const storage = await chrome.storage.local.get("extensionWindowId");
      if (storage.extensionWindowId) {
        try {
          const extensionWindow = await chrome.windows.get(
            storage.extensionWindowId,
          );

          // スクリーン情報を取得
          const displays = await chrome.system.display.getInfo();
          const primaryDisplay =
            displays.find((d) => d.isPrimary) || displays[0];

          // 4分割の右下に配置
          const screenWidth = primaryDisplay.workArea.width;
          const screenHeight = primaryDisplay.workArea.height;
          const screenLeft = primaryDisplay.workArea.left;
          const screenTop = primaryDisplay.workArea.top;

          const popupWidth = Math.floor(screenWidth / 2);
          const popupHeight = Math.floor(screenHeight / 2);
          const left = screenLeft + Math.floor(screenWidth / 2);
          const top = screenTop + Math.floor(screenHeight / 2);

          await chrome.windows.update(extensionWindow.id, {
            left: left,
            top: top,
            width: popupWidth,
            height: popupHeight,
            focused: false,
          });

          ExecuteLogger.info("✅ [Step 4-6-3-1] ポップアップ移動完了");
        } catch (e) {
          ExecuteLogger.warn(
            "⚠️ [Step 4-6-3-1] ポップアップウィンドウが見つかりません",
          );
        }
      }
    } catch (error) {
      ExecuteLogger.warn("⚠️ [Step 4-6-3-1] ポップアップ移動エラー:", error);
    }

    // Step 4-6-4: ウィンドウチェック
    ExecuteLogger.info("🔍 [Step 4-6-4] ウィンドウチェック開始");

    const aiTypes = successfulWindows.map((w) => w.aiType);
    const checkResults = await window.windowController.checkWindows(aiTypes);
    ExecuteLogger.info("✅ [Step 4-6-4] ウィンドウチェック完了:", checkResults);

    // Step 4-6-5: ライフサイクル管理初期化
    ExecuteLogger.info("🔄 [Step 4-6-5] ライフサイクル管理初期化");

    await window.windowLifecycleManager.initializeLifecycleManager();

    // 各ウィンドウを登録
    for (const windowResult of successfulWindows) {
      const windowInfo = window.windowController.openedWindows.get(
        windowResult.aiType,
      );
      if (windowInfo) {
        window.windowLifecycleManager.registerWindow(
          windowResult.aiType,
          windowInfo,
        );
      }
    }

    // Step 4-6-6: 各タスクの実行（統一バッチ処理: 3タスクずつ）
    ExecuteLogger.info(
      "⚡ [step4-execute.js] Step 4-6-6: タスク実行ループ開始",
    );

    // Step 4-6-6-0: 3タスクずつのバッチに分割
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-6-0: タスクをバッチ処理用に準備 - 合計${enrichedTaskList.length}タスク`,
    );

    const batchSize = 3;
    const batches = [];

    // 3タスクずつのバッチを作成
    for (let i = 0; i < enrichedTaskList.length; i += batchSize) {
      const batch = enrichedTaskList.slice(
        i,
        Math.min(i + batchSize, enrichedTaskList.length),
      );
      batches.push(batch);
    }

    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-6-1: ${batches.length}個のバッチ作成完了（各バッチ最大3タスク）`,
    );

    // バッチごとに処理
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      ExecuteLogger.info(
        `📦 [step4-execute.js] Step 4-6-6-${batchIndex + 2}: バッチ${batchIndex + 1}/${batches.length} 処理開始 - ${batch.length}タスク`,
      );

      // Step 4-6-6-A: バッチ用のウィンドウを開く
      const batchWindows = new Map(); // aiType -> windowInfo
      const windowPositions = ["左上", "右上", "左下"];

      for (let i = 0; i < batch.length; i++) {
        const task = batch[i];
        const aiType = task.aiType;
        const position = i; // 0=左上, 1=右上, 2=左下

        ExecuteLogger.info(
          `🪟 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-${i + 1}: ${aiType}ウィンドウを${windowPositions[position]}に開く`,
        );

        // 既存のウィンドウがあれば閉じる
        if (window.windowController.openedWindows.has(aiType)) {
          await window.windowLifecycleManager.closeWindow(aiType);
          await new Promise((resolve) => setTimeout(resolve, 500)); // ウィンドウクローズ待機
        }

        // 新しいウィンドウを開く
        const windowResults = await window.windowController.openWindows([
          {
            aiType: aiType,
            position: position,
          },
        ]);
        const windowResult = windowResults[0];
        if (windowResult && windowResult.success) {
          batchWindows.set(aiType, windowResult);
        } else {
          ExecuteLogger.error(`❌ ウィンドウオープン失敗: ${aiType}`);
        }
      }

      // Step 4-6-6-B: ウィンドウチェック
      ExecuteLogger.info(
        `🔍 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-B: ウィンドウチェック`,
      );
      const checkResults = await window.windowController.checkWindows(
        Array.from(batchWindows.keys()),
      );
      ExecuteLogger.info(`✅ チェック結果:`, checkResults);

      // Step 4-6-6-C: バッチ内のタスクを並列実行
      ExecuteLogger.info(
        `⚡ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C: ${batch.length}タスクを並列実行`,
      );

      const batchPromises = batch.map(async (task, index) => {
        const taskId = task.id || task.taskId || `${task.column}${task.row}`;
        const isThreeTypeTask =
          task.originalAiType === "3種類（ChatGPT・Gemini・Claude）";

        try {
          // スプレッドシートで指定されたAI種別をそのまま使用
          ExecuteLogger.info(
            `📝 [step4-execute.js] タスク実行: ${taskId} (AI: ${task.aiType}) ${isThreeTypeTask ? "[3種類AI]" : "[通常]"}`,
          );

          // 特別処理かチェック
          const specialInfo =
            window.specialTaskProcessor.identifySpecialTask(task);
          let result = null;

          if (specialInfo.isSpecial) {
            ExecuteLogger.info(`🔧 特別処理実行: ${specialInfo.type}`);
            const windowInfo = batchWindows.get(task.aiType);
            result = await window.specialTaskProcessor.executeSpecialTask(
              task,
              specialInfo,
              windowInfo,
            );
          } else {
            ExecuteLogger.info(`🤖 AI処理実行: ${task.aiType}`);
            result = await executeNormalAITask(task);
          }

          // 結果処理
          await processTaskResult(task, result, taskId);

          return {
            taskId: taskId,
            aiType: task.aiType,
            success: result.success,
            result: result,
            specialProcessing: specialInfo.isSpecial,
            isThreeType: isThreeTypeTask,
          };
        } catch (error) {
          ExecuteLogger.error(`❌ タスク失敗: ${taskId}`, error);
          await window.windowLifecycleManager.handleTaskCompletion(task, {
            success: false,
            error: error.message,
          });

          return {
            taskId: taskId,
            aiType: task.aiType,
            success: false,
            error: error.message,
            specialProcessing: false,
            isThreeType: isThreeTypeTask,
          };
        }
      });

      // 全タスクの完了を待機
      const batchResults = await Promise.allSettled(batchPromises);

      // 結果を収集
      let successCount = 0;
      let failCount = 0;

      batchResults.forEach((pr) => {
        if (pr.status === "fulfilled") {
          results.push(pr.value);
          if (pr.value.success) {
            successCount++;
          } else {
            failCount++;
          }
        } else {
          failCount++;
        }
      });

      ExecuteLogger.info(
        `✅ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-D: バッチ${batchIndex + 1}完了 - 成功: ${successCount}, 失敗: ${failCount}`,
      );

      // Step 4-6-6-E: バッチのウィンドウをクローズ
      ExecuteLogger.info(
        `🪟 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-E: ウィンドウクローズ`,
      );

      for (const [aiType, windowInfo] of batchWindows) {
        try {
          await window.windowLifecycleManager.closeWindow(aiType);
          ExecuteLogger.info(`✅ ${aiType}ウィンドウクローズ完了`);
        } catch (error) {
          ExecuteLogger.error(`⚠️ ${aiType}ウィンドウクローズエラー:`, error);
        }
      }

      // 失敗がある場合は処理を停止
      if (failCount > 0) {
        ExecuteLogger.error(
          `🛑 [step4-execute.js] バッチ${batchIndex + 1}で${failCount}個のタスクが失敗したため、処理を停止します`,
        );
        break;
      }

      // バッチ間の待機時間
      if (batchIndex < batches.length - 1) {
        ExecuteLogger.info(`⏳ 次のバッチまで1秒待機`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    ExecuteLogger.info("🏁 [Step 4-6-6] 全タスク実行完了");
  } catch (error) {
    ExecuteLogger.error("❌ [Step 4-6] メイン実行エラー:", error);
    results.push({
      taskId: "SYSTEM_ERROR",
      aiType: "SYSTEM",
      success: false,
      error: error.message,
    });
  } finally {
    // Step 4-6-7: クリーンアップ処理
    ExecuteLogger.info("🧹 [Step 4-6-7] クリーンアップ処理開始");

    try {
      // 全ウィンドウのクリーンアップ（設定により制御可能）
      ExecuteLogger.debug(
        `🔧 [DEBUG] shouldPerformWindowCleanup呼び出し前 - 関数存在確認:`,
        typeof shouldPerformWindowCleanup,
      );
      const shouldCleanupWindows = shouldPerformWindowCleanup(results);
      if (shouldCleanupWindows) {
        await window.windowLifecycleManager.cleanupAllWindows();
      }
    } catch (cleanupError) {
      ExecuteLogger.error(
        "⚠️ [Step 4-6-7] クリーンアップエラー:",
        cleanupError,
      );
    }
  }

  ExecuteLogger.info("🏁 Step 4-6 Execute 統合実行完了", {
    totalTasks: enrichedTaskList?.length || 0,
    successfulTasks: results.filter((r) => r.success).length,
    failedTasks: results.filter((r) => !r.success).length,
    windowLayout: windowLayoutInfo?.length || 0,
  });

  // ========================================
  // Step 4-6: サブ関数群
  // ========================================

  /**
   * Step 4-6-8: 通常AI処理の実行
   */
  async function executeNormalAITask(task) {
    ExecuteLogger.info(
      `🤖 [step4-execute.js] Step 4-6-8: 通常AI処理実行開始: ${task.aiType}`,
    );

    const taskId = task.id || task.taskId || `${task.column}${task.row}`;
    const cellPosition = `${task.column || task.cellInfo?.column}${task.row || task.cellInfo?.row}`;

    // 注: 3種類AI判定は Step 4-6-0 で既に展開済みのため、ここでは不要

    // Step 4-6-8-1: タスク開始ログ記録
    const windowInfo =
      task.tabId && task.windowId
        ? { tabId: task.tabId, windowId: task.windowId }
        : window.windowController.openedWindows.get(task.aiType);
    if (window.detailedLogManager) {
      window.detailedLogManager.recordTaskStart(task, windowInfo);
    }

    // Step 4-6-8-2: AI種別の正規化
    let normalizedAiType = task.aiType;
    if (task.aiType === "single" || !task.aiType) {
      ExecuteLogger.info(
        `[step4-execute.js] Step 4-6-8-2: AIタイプ '${task.aiType}' を 'Claude' に変換`,
      );
      normalizedAiType = "Claude";
    }

    // Step 4-6-8-3: AI自動化ファイルの読み込み確認
    const aiType = normalizedAiType.toLowerCase();
    if (!window.aiAutomationLoader.isAIAvailable(aiType)) {
      ExecuteLogger.info(
        `[step4-execute.js] Step 4-6-8-3: ${normalizedAiType} 自動化ファイルを読み込み中...`,
      );
      await window.aiAutomationLoader.loadAIFile(aiType);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Step 4-6-8-4: 送信時刻記録
    if (window.detailedLogManager) {
      window.detailedLogManager.recordSendTime(taskId, windowInfo?.url);
    }

    // Step 4-6-8-5: Retry機能付きでAI実行
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-8-5: ${normalizedAiType}実行準備`,
    );
    const executeFunction = async () => {
      switch (aiType) {
        case "chatgpt":
          ExecuteLogger.info(`[step4-execute.js] Step 4-6-8-5-1: ChatGPT実行`);
          if (!window.ChatGPTAutomationV2)
            throw new Error("ChatGPT Automation が利用できません");
          return await window.ChatGPTAutomationV2.executeTask(task);

        case "claude":
          ExecuteLogger.info(`[DEBUG] Claude実行前チェック:`, {
            windowClaudeAutomation: typeof window.ClaudeAutomation,
            executeTask:
              window.ClaudeAutomation &&
              typeof window.ClaudeAutomation.executeTask,
            isReady: window.ClaudeAutomation?.isReady,
            version: window.ClaudeAutomation?.version,
            loadedAt: window.ClaudeAutomation?.loadedAt,
          });

          // スクリプトのロード状態を確認
          const scriptElement = document.querySelector(
            'script[src*="4-2-claude-automation.js"]',
          );
          if (scriptElement) {
            ExecuteLogger.info(`[DEBUG] スクリプトタグ発見:`, {
              src: scriptElement.src,
              readyState: scriptElement.readyState,
              async: scriptElement.async,
              defer: scriptElement.defer,
            });
          } else {
            ExecuteLogger.warn(`[DEBUG] スクリプトタグが見つかりません`);
          }

          if (!window.ClaudeAutomation) {
            ExecuteLogger.error(`[DEBUG] ClaudeAutomationが未定義`);
            ExecuteLogger.error(
              `[DEBUG] 現在のwindowオブジェクトのClaud関連キー:`,
              Object.keys(window).filter((key) =>
                key.toLowerCase().includes("claude"),
              ),
            );
            ExecuteLogger.error(`[DEBUG] コンソールのエラーを確認してください`);
            throw new Error("Claude Automation が利用できません");
          }
          return await window.ClaudeAutomation.executeTask(task);

        case "gemini":
          if (!window.GeminiAutomation)
            throw new Error("Gemini Automation が利用できません");
          return await window.GeminiAutomation.executeTask(task);

        case "genspark":
          if (!window.GensparkAutomationV2)
            throw new Error("Genspark Automation が利用できません");
          return await window.GensparkAutomationV2.executeTask(task);

        case "report":
          if (!window.ReportAutomation)
            throw new Error("Report Automation が利用できません");
          return await window.ReportAutomation.executeTask(
            task,
            task.spreadsheetData || {},
          );

        default:
          throw new Error(`未対応のAI種別: ${normalizedAiType}`);
      }
    };

    const result = await window.windowLifecycleManager.executeWithRetry(
      executeFunction,
      task,
      `${normalizedAiType} AI実行`,
    );

    ExecuteLogger.info(`✅ [Step 4-6-8] 通常AI処理実行完了: ${task.aiType}`);
    return result;
  }

  /**
   * Step 4-6-9: タスク結果の処理
   */
  async function processTaskResult(task, result, taskId) {
    ExecuteLogger.info(`📋 [Step 4-6-9] タスク結果処理開始: ${taskId}`);

    try {
      // 完了時刻とログ記録
      if (window.detailedLogManager) {
        window.detailedLogManager.recordTaskComplete(taskId, result);
      }

      // 回答をスプレッドシートに記載
      if (result.success && result.response) {
        const answerCellRef =
          task.answerCellRef || task.cellRef || `${task.column}${task.row}`;
        if (window.detailedLogManager) {
          await window.detailedLogManager.writeAnswerToSpreadsheet(
            taskId,
            answerCellRef,
          );
        }
      }

      // ログをスプレッドシートに記載
      ExecuteLogger.debug(
        `🔧 [DEBUG] calculateLogCellRef呼び出し前 - 関数存在確認:`,
        typeof calculateLogCellRef,
      );
      const logCellRef = task.logCellRef || calculateLogCellRef(task);
      if (logCellRef && window.detailedLogManager) {
        await window.detailedLogManager.writeLogToSpreadsheet(
          taskId,
          logCellRef,
        );
      }

      // ライフサイクル完了処理
      await window.windowLifecycleManager.handleTaskCompletion(task, result);

      ExecuteLogger.info(`✅ [Step 4-6-9] タスク結果処理完了: ${taskId}`);
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-6-9] タスク結果処理エラー: ${taskId}`,
        error,
      );
    }
  }

  /**
   * ログセル位置の計算
   */
  function calculateLogCellRef(task) {
    const cellRef = task.cellRef || `${task.column}${task.row}`;
    if (!cellRef) return null;

    // 簡単な実装: A列をログ列として使用
    const match = cellRef.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      return `A${match[2]}`;
    }
    return null;
  }

  /**
   * ウィンドウクリーンアップ判定
   */
  function shouldPerformWindowCleanup(results) {
    // エラーが多い場合はウィンドウを保持（デバッグ用）
    const errorCount = results.filter((r) => !r.success).length;
    const totalCount = results.length;

    if (totalCount === 0) return true;

    const errorRate = errorCount / totalCount;
    return errorRate < 0.5; // エラー率50%未満の場合はクリーンアップ
  }

  ExecuteLogger.debug("✅ [DEBUG] executeStep4関数定義完了");
  return results;
}

// ステップ4実行関数をグローバルに公開
ExecuteLogger.debug("🔍 [DEBUG] window.executeStep4エクスポート実行");
ExecuteLogger.info("🔍 [DEBUG] エクスポート前のexecuteStep4関数状態:", {
  executeStep4Type: typeof executeStep4,
  executeStep4Exists: typeof executeStep4 === "function",
  executeStep4Name: executeStep4?.name,
});
window.executeStep4 = executeStep4;
ExecuteLogger.info("✅ [DEBUG] window.executeStep4エクスポート完了:", {
  windowExecuteStep4Type: typeof window.executeStep4,
  windowExecuteStep4Exists: typeof window.executeStep4 === "function",
  windowExecuteStep4Name: window.executeStep4?.name,
  globalAccess: typeof globalThis?.executeStep4 === "function",
});

ExecuteLogger.debug("🔍 [DEBUG] step4-execute.js 読み込み開始");

ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "AIAutomationLoader");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "TaskGroupTypeDetector");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "WindowController");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "SpreadsheetDataManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "DetailedLogManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "WindowLifecycleManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "SpecialTaskProcessor");

ExecuteLogger.info(
  "✅ Step 4-6 Execute - AI自動化制御ファイル準備完了（統合版）",
);
ExecuteLogger.info("🎯 利用可能機能:");
ExecuteLogger.info("  - グループタイプ自動判定（通常処理/3種類AI）");
ExecuteLogger.info("  - 4分割ウィンドウ自動配置");
ExecuteLogger.info("  - スプレッドシートデータ動的取得");
ExecuteLogger.info("  - 詳細ログ自動記載");
ExecuteLogger.info("  - ウィンドウライフサイクル管理");
ExecuteLogger.info("  - 特別処理（レポート/Genspark）");
ExecuteLogger.info(
  '📖 使用方法: executeStep4([{id: "task1", aiType: "ChatGPT", prompt: "Hello", column: "B", row: "3"}])',
);
