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
      console.log("[DynamicSearch]", ...args);
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
      cacheTimeout: 0, // 🔍 【修正】キャッシュを完全無効化（常に最新データ取得）
    };

    this.processingTasks = new Set(); // 処理中タスクのID管理
    this.completedTasks = new Set(); // 完了タスクのID管理

    // 【追加】currentGroup変更の監視
    this.initializeCurrentGroupListener();
  }

  /**
   * currentGroup変更監視リスナーの初期化
   * 【追加】統一管理システムとの連携
   */
  initializeCurrentGroupListener() {
    if (window.addCurrentGroupListener) {
      const listener = (changeEvent) => {
        log.warn(
          "🔄 [DynamicTaskSearch] currentGroup変更:",
          changeEvent.currentGroup?.groupNumber,
        );

        // グループ変更時にキャッシュをクリア
        this.cache.spreadsheetData = null;
        this.cache.lastFetchTime = null;

        // 新しいグループに関連しない処理中タスクをクリア
        if (
          changeEvent.currentGroup?.groupNumber !==
          changeEvent.previousGroup?.groupNumber
        ) {
          this.processingTasks.clear(); // 前のグループの処理中タスクをクリア
        }
      };

      window.addCurrentGroupListener(listener);
      this._currentGroupListener = listener; // クリーンアップ用に保存
    } else {
    }
  }

  /**
   * スプレッドシートから最新データを取得（キャッシュ付き + リトライ機能）
   * step3-loop.jsのreadFullSpreadsheetを参考に実装
   * 【修正】書き込み完了後の最新データ取得を確実にするためリトライ機能追加
   */
  async fetchLatestSpreadsheetData(forceRefresh = false) {
    const now = Date.now();

    // 🔍 【修正】キャッシュ完全無効化 - 常に最新データを取得
    if (
      !forceRefresh &&
      this.cache.spreadsheetData &&
      this.cache.lastFetchTime &&
      this.cache.cacheTimeout > 0 && // cacheTimeout=0なら常に新規取得
      now - this.cache.lastFetchTime < this.cache.cacheTimeout
    ) {
      return this.cache.spreadsheetData;
    }

    console.log(`🔍 [DYNAMIC-SEARCH] キャッシュ無効化により最新データ取得`);

    log.info("🔄 スプレッドシート最新データ取得中...");

    // 【追加】書き込み完了後の最新データ取得のためのリトライ機能
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1秒待機

    while (retryCount <= maxRetries) {
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

        // 【追加】書き込み完了待機：初回以外は待機してから取得
        if (retryCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
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

        // 【追加】データ変更確認：前回と比較して変更があるかチェック
        const hasSignificantChange = this.validateDataFreshness(values);
        if (retryCount > 0 && !hasSignificantChange) {
          retryCount++;
          continue;
        }

        // キャッシュ更新
        this.cache.spreadsheetData = values;
        this.cache.lastFetchTime = now;

        log.info(
          `✅ データ取得成功: ${values.length}行 (試行: ${retryCount + 1})`,
        );
        return values;
      } catch (error) {
        retryCount++;
        if (retryCount > maxRetries) {
          log.error("❌ スプレッドシートデータ取得エラー:", error);
          throw error;
        }
        log.warn(
          `⚠️ データ取得失敗、リトライ中... (${retryCount}/${maxRetries}):`,
          error.message,
        );
      }
    }
  }

  /**
   * データの新しさを検証（書き込み完了の確認）
   * 【追加】完了タスクの結果がスプレッドシートに反映されているかチェック
   */
  validateDataFreshness(newData) {
    if (!this.cache.spreadsheetData || !newData) {
      return true; // 初回取得またはデータなしの場合は有効とみなす
    }

    // 簡単な変更検出：行数または内容の変化をチェック
    if (newData.length !== this.cache.spreadsheetData.length) {
      return true;
    }

    // 最近完了したタスクのセルをチェック
    for (const taskId of this.completedTasks) {
      // taskIdの形式: "U9" -> U列9行
      const match = taskId.match(/([A-Z]+)(\d+)/);
      if (match) {
        const [, column, row] = match;
        const rowIndex = parseInt(row) - 1;
        const colIndex = this.columnToIndex(column);

        if (newData[rowIndex] && newData[rowIndex][colIndex]) {
          const cellValue = newData[rowIndex][colIndex];
          if (cellValue && !cellValue.startsWith("作業中")) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 次の利用可能なタスクを1つ検索
   * @returns {Object|null} 次のタスク、または null
   */
  async findNextTask() {
    log.info("🔍 次のタスク検索開始");

    try {
      // 【修正】統一管理システムから現在のグループ情報を取得
      const currentGroup = window.getCurrentGroup
        ? window.getCurrentGroup()
        : window.globalState?.currentGroup;
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

      // 【修正】タスクが見つからない場合の制御移譲シグナル実装
      log.info("📭 現在のグループ内に利用可能なタスクなし");

      // グループ完了状態を確認・記録
      const isGroupCompleted = await this.checkAndRecordGroupCompletion(
        currentGroup,
        spreadsheetData,
      );

      if (isGroupCompleted) {
        log.info(
          `🏁 グループ${currentGroup.groupNumber}完了 - step3メインループに制御移譲`,
        );

        // 【修正】統一移行協調システムを使用
        await this.initiateGroupTransition(currentGroup);

        // 【追加】グループ完了をglobalStateに記録（step3との協調用）
        if (window.globalState) {
          window.globalState.dynamicSearchStatus = {
            groupCompleted: true,
            completedGroupNumber: currentGroup.groupNumber,
            transferControlToStep3: true,
            timestamp: new Date().toISOString(),
          };
        }

        // 【追加】step3メインループに制御移譲イベントを送信
        this.notifyGroupCompletionToStep3(currentGroup);
      } else {
      }

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
    const answerColumns = this.getAnswerColumns(columns.answer, taskGroup);

    // 【無限ループ防止】カウンター追加
    let tasksChecked = 0;
    let completedTasksFound = 0;
    let availableTasksFound = 0;
    let skippedTasks = [];
    const maxTasksToCheck = 200;

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

          tasksChecked++;

          // 【無限ループ防止】チェック数制限
          if (tasksChecked > maxTasksToCheck) {
            log.warn(
              `⚠️ タスクチェック制限に達しました (${maxTasksToCheck}個)`,
            );
            return null;
          }

          // 完了済みタスクをカウント（詳細ログなしで高速チェック）
          if (this.completedTasks.has(taskId)) {
            completedTasksFound++;
            continue; // スキップして次へ
          }

          // このタスクが処理可能かチェック
          const isAvailable = await this.isTaskAvailable(taskId, answerValue);


          if (isAvailable) {
            availableTasksFound++;
            // 【デバッグ追加】logCell生成確認
            const logCellValue = taskGroup.columns?.log
              ? `${taskGroup.columns.log}${rowNumber}`
              : null;

            log.warn("🔍 [DynamicSearch] タスク生成時のlogCell:", {
              taskId: taskId,
              logCellValue: logCellValue,
              logCellType: typeof logCellValue,
              taskGroupColumns: taskGroup.columns,
              logColumnExists: taskGroup.columns?.log ? true : false,
              logColumn: taskGroup.columns?.log || "未設定",
              rowNumber: rowNumber,
              finalTaskLogCell: logCellValue,
              logCellCalculation: `${taskGroup.columns?.log}${rowNumber}`,
            });

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
              logCell: logCellValue,
            };
        }
      }
    }


    // 【無限ループ防止】統計情報ログ
    log.info(`📊 タスク検索完了:`, {
      チェック済み: tasksChecked,
      完了済み発見: completedTasksFound,
      利用可能タスク: availableTasksFound + "個",
      グループ: taskGroup.groupNumber,
    });

    return null;
  }

  /**
   * 回答列の情報を取得
   * スプレッドシートのAI行から実際のAI種別を取得
   */
  getAnswerColumns(answerConfig, taskGroup) {
    const columns = [];

    if (typeof answerConfig === "object" && answerConfig !== null) {
      // 通常の場合：primaryカラムとそのAI種別を取得
      if (answerConfig.primary) {
        const column = answerConfig.primary;
        // 回答列に対応するプロンプト列を特定してからAI種別を取得
        const promptColumn = this.getPromptColumnForAnswer(column, taskGroup);
        const aiType = this.getAITypeForColumn(promptColumn);

        if (!aiType) {
          console.error(
            `❌ [DynamicSearch] 列${column}のAI種別が取得できません`,
            {
              column,
              taskGroup: taskGroup?.groupNumber,
              availableAIData: window.globalState?.aiRowData,
            },
          );
          throw new Error(
            `列${column}のAI種別が特定できません。スプレッドシートのAI行を確認してください。`,
          );
        }

        columns.push({ column: column, aiType: aiType });
      }
    } else if (typeof answerConfig === "string") {
      // 文字列形式（通常パターン）
      // 回答列に対応するプロンプト列を特定してからAI種別を取得
      const promptColumn = this.getPromptColumnForAnswer(
        answerConfig,
        taskGroup,
      );
      const aiType = this.getAITypeForColumn(promptColumn);

      if (!aiType) {
        console.error(
          `❌ [DynamicSearch] 列${answerConfig}のAI種別が取得できません`,
        );
        throw new Error(
          `列${answerConfig}のAI種別が特定できません。スプレッドシートのAI行を確認してください。`,
        );
      }

      columns.push({ column: answerConfig, aiType: aiType });
    }

    return columns;
  }

  /**
   * 回答列に対応するプロンプト列を取得
   */
  getPromptColumnForAnswer(answerColumn, taskGroup) {
    // タスクグループの列設定から対応関係を判定
    const { columns } = taskGroup;

    // プロンプト列が配列の場合、最後のプロンプト列を使用（通常パターン）
    if (columns?.prompts && Array.isArray(columns.prompts)) {
      const lastPromptColumn = columns.prompts[columns.prompts.length - 1];
      console.log(
        `✅ [DynamicSearch] 回答列${answerColumn}に対応するプロンプト列: ${lastPromptColumn}`,
      );
      return lastPromptColumn;
    }

    // フォールバック：回答列の1つ前の列をプロンプト列と仮定
    const answerIndex = this.columnToIndex(answerColumn);
    const promptIndex = answerIndex - 1;
    const promptColumn = this.indexToColumn(promptIndex);
    console.log(
      `⚠️ [DynamicSearch] プロンプト列を推定: ${promptColumn} (回答列${answerColumn}の1つ前)`,
    );
    return promptColumn;
  }

  /**
   * インデックスを列文字に変換
   */
  indexToColumn(index) {
    let column = "";
    while (index >= 0) {
      column = String.fromCharCode((index % 26) + 65) + column;
      index = Math.floor(index / 26) - 1;
    }
    return column;
  }

  /**
   * 列からAI種別を取得（スプレッドシートのAI行を参照）
   */
  getAITypeForColumn(column) {
    try {
      // globalStateから保存されたAI行データを取得
      const aiRowData = window.globalState?.aiRowData;
      if (!aiRowData) {
        console.error("❌ AI行データが取得できません");
        return null;
      }

      // 列インデックスを計算
      const colIndex = this.columnToIndex(column);

      // AI行データから該当列のAI種別を取得
      const aiValue = aiRowData[colIndex];

      if (!aiValue) {
        console.error(
          `❌ プロンプト列${column}(インデックス${colIndex})のAI種別が空です`,
        );
        return null;
      }

      // AI種別を正規化（小文字に変換）
      const normalizedAI = aiValue.toLowerCase().trim();

      // 有効なAI種別かチェック
      const validAITypes = ["claude", "chatgpt", "gemini", "genspark"];
      if (!validAITypes.includes(normalizedAI)) {
        console.error(`❌ 無効なAI種別: ${aiValue}`);
        return null;
      }

      console.log(`✅ [DynamicSearch] 列${column}のAI種別: ${normalizedAI}`);
      return normalizedAI;
    } catch (error) {
      console.error(`❌ AI種別取得エラー:`, error);
      return null;
    }
  }

  /**
   * 🔍 【追加】指定されたAIを優先するAIタイプ配列を生成
   * @param {Object} taskGroup - タスクグループ情報
   * @returns {Array<string>} AI タイプの配列（指定AI優先順）
   */
  getAiTypesOrderByPreference(taskGroup) {
    // Claudeをデフォルトで最優先に変更
    const defaultOrder = ["claude", "chatgpt", "gemini"];

    // タスクグループからAI指定があるかチェック
    let preferredAI = null;

    if (taskGroup?.aiPreference) {
      preferredAI = taskGroup.aiPreference.toLowerCase();
    } else if (taskGroup?.groupType?.includes("claude")) {
      preferredAI = "claude";
    } else if (taskGroup?.groupType?.includes("chatgpt")) {
      preferredAI = "chatgpt";
    } else if (taskGroup?.groupType?.includes("gemini")) {
      preferredAI = "gemini";
    }

    // 指定されたAIを最初に配置
    if (preferredAI && defaultOrder.includes(preferredAI)) {
      const reorderedTypes = [
        preferredAI,
        ...defaultOrder.filter((ai) => ai !== preferredAI),
      ];

      log.debug(`🔍 [AI-SELECTION] AI優先順序を調整: ${preferredAI}優先`);

      return reorderedTypes;
    }

    log.debug(`🔍 [AI-SELECTION] デフォルト順序を使用`);

    return defaultOrder;
  }

  /**
   * タスクが実行可能かチェック
   * 【修正】重複実行防止のための厳密なチェック
   */
  async isTaskAvailable(taskId, cellValue) {
    const startTimestamp = new Date().toISOString();
    const callId = `${taskId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // 🔍 【詳細デバッグ】Group 2のタスク可用性詳細チェック
    // 競合状態検知のための内部記録のみ（ログ出力削除）

    // エラー相関トラッカーへのイベント記録
    if (window.errorCorrelationTracker) {
      window.errorCorrelationTracker.recordEvent(
        "task_availability_check_start",
        {
          taskId,
          callId,
          cellValue: cellValue ? "has_content" : "empty",
          completedTasksHas: this.completedTasks.has(taskId),
          processingTasksHas: this.processingTasks.has(taskId),
        },
      );
    }


    // 【修正1】すでに完了済みならスキップ（優先度：最高）
    if (this.completedTasks.has(taskId)) {
      return false;
    }

    // 【修正2】現在処理中ならスキップ（優先度：最高）
    if (this.processingTasks.has(taskId)) {
      log.debug(`❌ タスク実行拒否 - 処理中: ${taskId}`);
      return false;
    }

    // 【修正2.5】セル位置ベースの重複チェック（より確実な重複防止）
    const cellPosition = this.extractCellPosition(taskId);
    if (cellPosition) {
      for (const processingTaskId of this.processingTasks) {
        const processingCellPosition =
          this.extractCellPosition(processingTaskId);
        if (
          processingCellPosition &&
          processingCellPosition.column === cellPosition.column &&
          processingCellPosition.row === cellPosition.row
        ) {
          log.debug(`❌ セル位置重複によりタスク実行拒否: ${taskId}`);
          return false;
        }
      }
    }

    // 【修正3】最新データ再取得による二重確認
    // セル値が空の場合、スプレッドシートから最新値を再確認
    if (!cellValue || !cellValue.trim()) {
      log.debug(`⚠️ セル空検出 - 最新データ再確認: ${taskId}`);

      try {
        // 最新のスプレッドシートデータを強制取得
        const latestData = await this.fetchLatestSpreadsheetData(true); // forceRefresh=true

        // 該当セルの最新値を確認
        const match = taskId.match(/([A-Z]+)(\d+)/);
        if (match && latestData) {
          const [, column, row] = match;
          const rowIndex = parseInt(row) - 1;
          const colIndex = this.columnToIndex(column);

          if (latestData[rowIndex] && latestData[rowIndex][colIndex]) {
            const latestCellValue = latestData[rowIndex][colIndex];

            // 最新セル値の内部確認

            // 最新データに内容がある場合は実行拒否
            if (latestCellValue && latestCellValue.trim()) {
              if (latestCellValue.startsWith("作業中")) {
                return false;
              }

              // 実際の回答がある場合
              this.completedTasks.add(taskId); // 完了済みとしてマーク
              log.debug(`✅ 最新確認で回答発見 - 重複防止: ${taskId}`);
              return false;
            }
          }
        }
      } catch (error) {
        log.debug(`⚠️ 最新データ確認エラー: ${error.message}`);
        // エラーの場合は慎重にスキップ
        return false;
      }
    }

    // セルに値がある場合
    if (cellValue && cellValue.trim()) {
      // 作業中マーカーの場合
      if (cellValue.startsWith("作業中")) {
        // タイムアウトチェック（必要に応じて実装）
        return false;
      }

      // すでに回答がある場合
      this.completedTasks.add(taskId); // 完了済みとしてマーク
      return false;
    }

    // 【修正4】最終確認：処理中状態を再度チェック
    if (this.processingTasks.has(taskId)) {
      log.debug(`❌ 最終チェックで処理中検出 - 重複防止: ${taskId}`);
      return false;
    }

    // セルが本当に空の場合のみ実行可能
    const result = true;
    const endTimestamp = new Date().toISOString();

    // 最終判定結果の内部記録のみ（ログ出力削除）


    log.info(`✅ タスク実行許可: ${taskId}`);
    return result;
  }

  /**
   * タスクを処理中としてマーク
   */
  markTaskAsProcessing(task) {
    this.processingTasks.add(task.id);
    log.debug(`✅ タスク処理開始: ${task.id}`);

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
   * 【修正】重複防止の強化とデータ整合性確保
   */
  registerTaskCompletion(taskId) {
    // 重複完了登録の防止
    if (this.completedTasks.has(taskId)) {
      log.debug(`⚠️ 重複完了登録をスキップ: ${taskId}`);
      return;
    }

    // 処理中リストから削除
    this.processingTasks.delete(taskId);

    // 完了リストに追加
    this.completedTasks.add(taskId);

    log.info(`✅ タスク完了登録: ${taskId}`);

    // window.currentTaskListも更新
    if (window.currentTaskList && Array.isArray(window.currentTaskList)) {
      const task = window.currentTaskList.find((t) => t.id === taskId);
      if (task) {
        task.processing = false;
        task.completed = true;
        task.completedAt = new Date().toISOString(); // 完了時刻を記録
      }
    }

    // 【修正】キャッシュクリアの強化
    this.cache.spreadsheetData = null;
    this.cache.lastFetchTime = null; // 完全リセット

    // 【追加】グローバル状態への完了通知
    if (window.globalState && window.globalState.completedTasksRegistry) {
      window.globalState.completedTasksRegistry.add(taskId);
    }
  }

  /**
   * グループ完了状態を確認・記録
   * 【追加】ハイブリッド協調モデル: グループ完了判定の実装
   */
  async checkAndRecordGroupCompletion(currentGroup, spreadsheetData) {
    try {
      const { columns, dataStartRow } = currentGroup;
      if (!columns || !dataStartRow) {
        log.warn("⚠️ グループ情報不完全", { currentGroup });
        return false;
      }


      const promptColumns = columns.prompts || [];
      const answerColumns = this.getAnswerColumns(columns.answer, currentGroup);


      let totalTasks = 0;
      let completedTasks = 0;
      let debugRows = [];

      // グループ範囲内の全タスクをチェック
      for (
        let rowIndex = dataStartRow - 1;
        rowIndex < spreadsheetData.length;
        rowIndex++
      ) {
        const row = spreadsheetData[rowIndex];
        if (!row) continue;

        const rowNumber = rowIndex + 1;

        // プロンプト存在確認
        let hasPrompt = false;
        let promptDetails = [];
        for (const promptCol of promptColumns) {
          const colIndex = this.columnToIndex(promptCol);
          const promptValue = row[colIndex];
          promptDetails.push({
            column: promptCol,
            index: colIndex,
            value: promptValue ? promptValue.substring(0, 50) + "..." : "empty",
          });
          if (promptValue && promptValue.trim()) {
            hasPrompt = true;
            break;
          }
        }


        if (!hasPrompt) continue;

        // 各回答列の完了状態をチェック
        let rowTasks = [];
        for (const answerCol of answerColumns) {
          totalTasks++;
          const answerIndex = this.columnToIndex(answerCol.column);
          const answerValue = row[answerIndex] || "";

          const isCompleted =
            answerValue &&
            answerValue.trim() &&
            !answerValue.startsWith("作業中");

          if (isCompleted) {
            completedTasks++;
          }

        }


        debugRows.push({
          rowNumber,
          hasPrompt,
          tasks: rowTasks.length,
          completed: rowTasks.filter((t) => t.isCompleted).length,
        });
      }

      const isCompleted = totalTasks > 0 && completedTasks === totalTasks;
      const completionRate =
        totalTasks > 0
          ? ((completedTasks / totalTasks) * 100).toFixed(1)
          : "0.0";


      log.info(`📊 グループ${currentGroup.groupNumber}完了状態:`, {
        totalTasks,
        completedTasks,
        completionRate: `${completionRate}%`,
        isCompleted,
      });

      return isCompleted;
    } catch (error) {
      log.error("❌ グループ完了状態確認エラー:", error);
      return false;
    }
  }

  /**
   * グループ移行の協調実行
   * 【追加】統一移行協調システムを使用したグループ移行
   */
  async initiateGroupTransition(completedGroup) {
    try {
      log.info("🔀 [DynamicTaskSearch] グループ移行協調開始:", {
        completedGroup: completedGroup.groupNumber,
        initiator: "DynamicSearch",
      });

      // 統一移行協調システムが利用可能かチェック
      if (!window.executeGroupTransition) {
        log.warn(
          "⚠️ [DynamicTaskSearch] グループ移行協調システム未利用可能 - 従来通知のみ",
        );
        return false;
      }

      // 次のグループを決定（step3-loop.jsと同じロジック）
      const nextGroup = this.determineNextGroup(completedGroup);

      if (!nextGroup) {
        log.info("📋 [DynamicTaskSearch] 次のグループなし - 全体完了");
        return true;
      }

      // 統一移行協調システムを使用して移行実行
      const transitionSuccess = await window.executeGroupTransition(
        completedGroup,
        nextGroup,
        "DynamicSearch",
      );

      if (transitionSuccess) {
        log.info("✅ [DynamicTaskSearch] グループ移行協調成功:", {
          from: completedGroup.groupNumber,
          to: nextGroup.groupNumber,
        });
      } else {
        log.warn("❌ [DynamicTaskSearch] グループ移行協調失敗:", {
          from: completedGroup.groupNumber,
          to: nextGroup.groupNumber,
        });
      }

      return transitionSuccess;
    } catch (error) {
      log.error("❌ [DynamicTaskSearch] グループ移行協調エラー:", error);
      return false;
    }
  }

  /**
   * 次のグループを決定
   * 【追加】step3-loop.jsのグループ順序と整合性を保つ
   */
  determineNextGroup(currentGroup) {
    try {
      const taskGroups = window.globalState?.taskGroups;
      if (!taskGroups || !Array.isArray(taskGroups)) {
        log.warn("⚠️ [DynamicTaskSearch] taskGroups未定義");
        return null;
      }

      // 現在のグループのインデックスを検索
      const currentIndex = taskGroups.findIndex(
        (group) => group.groupNumber === currentGroup.groupNumber,
      );

      if (currentIndex === -1) {
        log.warn(
          "⚠️ [DynamicTaskSearch] 現在のグループがtaskGroups内に見つからない",
        );
        return null;
      }

      // 次のグループを取得
      const nextIndex = currentIndex + 1;
      if (nextIndex >= taskGroups.length) {
        log.info(
          "📋 [DynamicTaskSearch] 最後のグループ完了 - 次のグループなし",
        );
        return null;
      }

      const nextGroup = taskGroups[nextIndex];

      return nextGroup;
    } catch (error) {
      log.error("❌ [DynamicTaskSearch] 次のグループ決定エラー:", error);
      return null;
    }
  }

  /**
   * step3メインループに制御移譲を通知
   * 【追加】ハイブリッド協調モデル: step3との協調プロトコル
   */
  notifyGroupCompletionToStep3(completedGroup) {
    try {
      log.info(
        `📡 step3メインループに制御移譲通知送信: グループ${completedGroup.groupNumber}`,
      );

      // 【方法1】カスタムイベントによる通知
      if (typeof window !== "undefined" && window.dispatchEvent) {
        const event = new CustomEvent("dynamicSearchGroupCompleted", {
          detail: {
            groupNumber: completedGroup.groupNumber,
            groupType: completedGroup.groupType,
            transferControl: true,
            timestamp: new Date().toISOString(),
            source: "DynamicSearch",
          },
        });
        window.dispatchEvent(event);
      }

      // 【方法2】グローバル状態による通知
      if (window.globalState) {
        window.globalState.dynamicSearchNotification = {
          type: "GROUP_COMPLETED",
          groupNumber: completedGroup.groupNumber,
          requestControlTransfer: true,
          timestamp: new Date().toISOString(),
        };
      }

      // 【方法3】直接コールバック（利用可能な場合）
      if (typeof window.onDynamicSearchGroupCompleted === "function") {
        window.onDynamicSearchGroupCompleted({
          groupNumber: completedGroup.groupNumber,
          groupData: completedGroup,
        });
      }
    } catch (error) {
      log.error("❌ step3制御移譲通知エラー:", error);
    }
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

    // 【追加】currentGroupリスナーのクリーンアップ
    if (this._currentGroupListener && window.removeCurrentGroupListener) {
      window.removeCurrentGroupListener(this._currentGroupListener);
      this._currentGroupListener = null;
    }

    log.info("🔄 DynamicTaskSearchをリセットしました");
  }

  /**
   * タスクIDからセル位置を抽出するヘルパーメソッド
   * @param {string} taskId - タスクID（例: "Y25", "task_2_25_1758775278465"）
   * @returns {Object|null} - {column: string, row: number} または null
   */
  extractCellPosition(taskId) {
    if (!taskId || typeof taskId !== "string") return null;

    // パターン1: "Y25" 形式
    const simpleMatch = taskId.match(/^([A-Z]+)(\d+)$/);
    if (simpleMatch) {
      return {
        column: simpleMatch[1],
        row: parseInt(simpleMatch[2], 10),
      };
    }

    // パターン2: "task_2_25_1758775278465" 形式から行番号を抽出
    const complexMatch = taskId.match(/task_\d+_(\d+)_\d+/);
    if (complexMatch) {
      const row = parseInt(complexMatch[1], 10);
      // この場合、列は現在のグループのデータから取得する必要がある
      const currentGroup = window.globalState?.currentGroup;
      if (currentGroup && window.globalState?.taskGroups) {
        const taskGroup = window.globalState.taskGroups.find(
          (g) => g.groupNumber === currentGroup,
        );
        if (taskGroup && taskGroup.columns && taskGroup.columns.answer) {
          return {
            column: taskGroup.columns.answer,
            row: row,
          };
        }
      }
    }

    return null;
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
    log.info(`🔍 [TASK-FLOW-TRACE] registerTaskCompletionDynamic呼び出し:`, {
      taskId: taskId,
      taskIdType: typeof taskId,
      呼び出し時刻: new Date().toISOString(),
    });

    const instance = getDynamicTaskSearchInstance();

    log.info(`🔍 [TASK-FLOW-TRACE] DynamicTaskSearchインスタンス確認:`, {
      taskId: taskId,
      hasInstance: !!instance,
      instanceType: typeof instance,
      インスタンス確認時刻: new Date().toISOString(),
    });

    if (!instance) {
      log.error(
        `❌ [TASK-FLOW-TRACE] DynamicTaskSearchインスタンス初期化失敗:`,
        {
          taskId: taskId,
          globalStateExists: !!window.globalState,
          currentGroup: window.globalState?.currentGroup,
          エラー時刻: new Date().toISOString(),
        },
      );
      return null;
    }

    try {
      const result = instance.registerTaskCompletion(taskId);
      log.info(`✅ [TASK-FLOW-TRACE] タスク完了登録成功:`, {
        taskId: taskId,
        result: result,
        登録成功時刻: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      log.error(`❌ [TASK-FLOW-TRACE] タスク完了登録エラー:`, {
        taskId: taskId,
        error: error.message,
        stack: error.stack,
        エラー発生時刻: new Date().toISOString(),
      });
      throw error;
    }
  };
}

// ========================================
// モジュールエクスポート（Node.js環境用）
// ========================================
if (typeof module !== "undefined" && module.exports) {
  module.exports = DynamicTaskSearch;
}

log.info("✅ [step4.5-dynamic-search.js] ファイル読み込み完了");
