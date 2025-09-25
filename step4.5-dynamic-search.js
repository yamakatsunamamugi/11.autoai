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
    }
  },
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) {
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

    // 【追加】currentGroup変更の監視
    this.initializeCurrentGroupListener();

    log.info("✅ DynamicTaskSearch 初期化完了");
  }

  /**
   * currentGroup変更監視リスナーの初期化
   * 【追加】統一管理システムとの連携
   */
  initializeCurrentGroupListener() {
    if (window.addCurrentGroupListener) {
      const listener = (changeEvent) => {
        log.info("🔄 [DynamicTaskSearch] currentGroup変更通知受信:", {
          previousGroup: changeEvent.previousGroup?.groupNumber,
          currentGroup: changeEvent.currentGroup?.groupNumber,
          source: changeEvent.source,
          timestamp: changeEvent.timestamp,
        });

        // グループ変更時にキャッシュをクリア
        this.cache.spreadsheetData = null;
        this.cache.lastFetchTime = null;

        // 新しいグループに関連しない処理中タスクをクリア
        if (
          changeEvent.currentGroup?.groupNumber !==
          changeEvent.previousGroup?.groupNumber
        ) {
          log.debug("🧹 [DynamicTaskSearch] グループ変更 - 処理状態をリセット");
          this.processingTasks.clear(); // 前のグループの処理中タスクをクリア
        }
      };

      window.addCurrentGroupListener(listener);
      this._currentGroupListener = listener; // クリーンアップ用に保存

      log.debug("👂 [DynamicTaskSearch] currentGroup変更リスナー登録完了");
    } else {
      log.debug(
        "⚠️ [DynamicTaskSearch] currentGroup統一管理システム未利用可能",
      );
    }
  }

  /**
   * スプレッドシートから最新データを取得（キャッシュ付き + リトライ機能）
   * step3-loop.jsのreadFullSpreadsheetを参考に実装
   * 【修正】書き込み完了後の最新データ取得を確実にするためリトライ機能追加
   */
  async fetchLatestSpreadsheetData(forceRefresh = false) {
    const now = Date.now();

    // 【修正】重複実行防止：キャッシュ時間を短縮し、最新データ取得を優先
    if (
      !forceRefresh &&
      this.cache.spreadsheetData &&
      this.cache.lastFetchTime &&
      now - this.cache.lastFetchTime < 1000 // 1秒に短縮
    ) {
      log.debug("📋 キャッシュからデータ取得");
      return this.cache.spreadsheetData;
    }

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
          log.debug(`⏳ データ反映待機中... (${retryCount}/${maxRetries})`);
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
          log.debug(
            `🔄 データ未更新確認、リトライ継続 (${retryCount}/${maxRetries})`,
          );
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
      log.debug("📊 行数変化検出 - データ更新確認");
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
            log.debug(
              `📊 完了タスク反映確認: ${taskId} = ${cellValue.substring(0, 50)}...`,
            );
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
        log.debug("📋 グループ未完了 - 一時的にタスクなし");
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

    // taskGroup内容確認

    if (!columns || !dataStartRow) {
      log.error("グループ情報が不完全");
      return null;
    }

    // プロンプト列を確認
    const promptColumns = columns.prompts || [];
    const answerColumns = this.getAnswerColumns(columns.answer, taskGroup);

    log.debug("検索範囲:", {
      プロンプト列: promptColumns,
      回答列: answerColumns,
      開始行: dataStartRow,
    });

    // 【無限ループ防止】カウンター追加
    let tasksChecked = 0;
    let completedTasksFound = 0;
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
          if (await this.isTaskAvailable(taskId, answerValue)) {
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
    }

    // 【無限ループ防止】統計情報ログ
    log.info(`📊 タスク検索完了:`, {
      チェック済み: tasksChecked,
      完了済み発見: completedTasksFound,
      利用可能タスク: "0個",
      グループ: taskGroup.groupNumber,
    });

    return null;
  }

  /**
   * 回答列の情報を取得
   * step4-tasklist.jsのgetAnswerCell関数と同じロジックを使用
   */
  getAnswerColumns(answerConfig, taskGroup) {
    const columns = [];

    if (typeof answerConfig === "object" && answerConfig !== null) {
      // step4-tasklist.jsと同じロジックを使用
      const aiTypes = ["chatgpt", "claude", "gemini"];

      for (const aiType of aiTypes) {
        let column;

        if (taskGroup && taskGroup.groupType === "3種類AI") {
          // 3種類AIの場合：各AI専用の列を使用
          column = answerConfig[aiType];
        } else {
          // 通常の場合：primaryカラムを使用
          column = answerConfig.primary;
        }

        // 有効な列が見つかった場合のみ追加
        if (column && column !== undefined) {
          columns.push({ column: column, aiType: aiType });
        }
      }

      // primaryが存在する場合の従来互換性
      if (answerConfig.primary && !taskGroup?.groupType) {
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
   * 【修正】重複実行防止のための厳密なチェック
   */
  async isTaskAvailable(taskId, cellValue) {
    // 【修正1】すでに完了済みならスキップ（優先度：最高）
    if (this.completedTasks.has(taskId)) {
      // 【無限ループ防止】過剰ログを削減し、デバッグレベルに変更
      log.debug(`⏭️ スキップ（完了済み）: ${taskId}`);
      return false;
    }

    // 【修正2】現在処理中ならスキップ（優先度：最高）
    if (this.processingTasks.has(taskId)) {
      log.debug(`⏳ スキップ（処理中）: ${taskId}`);
      console.warn(`❌ [重複検証] タスク実行拒否 - 処理中:`, {
        taskId: taskId,
        reason: "processingTasks.has(taskId)",
        processingTasks: Array.from(this.processingTasks),
        criticalDuplicationPrevention: true,
      });
      return false;
    }

    // 【修正3】最新データ再取得による二重確認
    // セル値が空の場合、スプレッドシートから最新値を再確認
    if (!cellValue || !cellValue.trim()) {
      console.warn(
        `⚠️ [重複検証] セル空検出 - 最新データ再確認開始: ${taskId}`,
      );

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

            console.warn(`🔍 [重複検証] 最新セル値確認:`, {
              taskId: taskId,
              originalCellValue: cellValue || "empty",
              latestCellValue: latestCellValue,
              cellHasContent: !!(latestCellValue && latestCellValue.trim()),
              preventDuplication: true,
            });

            // 最新データに内容がある場合は実行拒否
            if (latestCellValue && latestCellValue.trim()) {
              if (latestCellValue.startsWith("作業中")) {
                log.debug(`⏳ スキップ（最新確認：作業中マーカー）: ${taskId}`);
                return false;
              }

              // 実際の回答がある場合
              log.debug(`✓ スキップ（最新確認：回答済み）: ${taskId}`);
              this.completedTasks.add(taskId); // 完了済みとしてマーク
              console.warn(`✅ [重複検証] 最新確認で回答発見 - 重複防止成功:`, {
                taskId: taskId,
                latestCellValue: latestCellValue.substring(0, 100) + "...",
                duplicationPrevented: true,
              });
              return false;
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [重複検証] 最新データ確認エラー: ${error.message}`);
        // エラーの場合は慎重にスキップ
        return false;
      }
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

    // 【修正4】最終確認：処理中状態を再度チェック
    if (this.processingTasks.has(taskId)) {
      console.warn(`❌ [重複検証] 最終チェックで処理中検出 - 重複防止:`, {
        taskId: taskId,
        reason: "Final processing check",
        duplicationPrevented: true,
      });
      return false;
    }

    // セルが本当に空の場合のみ実行可能
    console.warn(`✅ [重複検証] タスク実行許可 - 全チェック通過:`, {
      taskId: taskId,
      cellValue: cellValue || "empty",
      latestDataChecked: true,
      reason: "セルが空で全検証を通過",
      willReturn: true,
      safeguardsApplied: [
        "completed check",
        "processing check",
        "latest data check",
        "final check",
      ],
    });
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
   * 【修正】重複防止の強化とデータ整合性確保
   */
  registerTaskCompletion(taskId) {
    // 完了登録前の状態チェック

    // 【修正】重複完了登録の防止
    if (this.completedTasks.has(taskId)) {
      // 重複完了タスク - 登録スキップ
      return; // 重複登録を防止
    }

    // 処理中リストから削除
    const wasProcessing = this.processingTasks.delete(taskId);

    // 完了リストに追加
    this.completedTasks.add(taskId);

    log.info(`✅ タスク完了登録: ${taskId}`);

    // 【修正】完了登録後の詳細状態ログ
    console.warn(`✅ [重複検証] registerTaskCompletion完了:`, {
      taskId: taskId,
      wasProcessing: wasProcessing,
      processingTasksAfter: Array.from(this.processingTasks),
      completedTasksAfter: Array.from(this.completedTasks),
      taskNowCompleted: this.completedTasks.has(taskId),
      taskNoLongerProcessing: !this.processingTasks.has(taskId),
      completionTimestamp: new Date().toISOString(),
      duplicationPrevented: true,
    });

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
      log.debug(`🔍 グループ${currentGroup.groupNumber}完了状態確認開始`);

      const { columns, dataStartRow } = currentGroup;
      if (!columns || !dataStartRow) {
        log.warn("⚠️ グループ情報不完全", { currentGroup });
        return false;
      }

      const promptColumns = columns.prompts || [];
      const answerColumns = this.getAnswerColumns(columns.answer, currentGroup);

      let totalTasks = 0;
      let completedTasks = 0;

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
        for (const promptCol of promptColumns) {
          const colIndex = this.columnToIndex(promptCol);
          const promptValue = row[colIndex];
          if (promptValue && promptValue.trim()) {
            hasPrompt = true;
            break;
          }
        }

        if (!hasPrompt) continue;

        // 各回答列の完了状態をチェック
        for (const answerCol of answerColumns) {
          totalTasks++;
          const answerIndex = this.columnToIndex(answerCol.column);
          const answerValue = row[answerIndex] || "";

          // 完了判定：セルに値があり、作業中マーカーでない場合
          if (
            answerValue &&
            answerValue.trim() &&
            !answerValue.startsWith("作業中")
          ) {
            completedTasks++;
          }
        }
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
      log.debug("➡️ [DynamicTaskSearch] 次のグループ決定:", {
        currentGroup: currentGroup.groupNumber,
        nextGroup: nextGroup.groupNumber,
        currentIndex,
        nextIndex,
      });

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
        log.debug("✅ カスタムイベント送信完了: dynamicSearchGroupCompleted");
      }

      // 【方法2】グローバル状態による通知
      if (window.globalState) {
        window.globalState.dynamicSearchNotification = {
          type: "GROUP_COMPLETED",
          groupNumber: completedGroup.groupNumber,
          requestControlTransfer: true,
          timestamp: new Date().toISOString(),
        };
        log.debug("✅ globalState通知設定完了");
      }

      // 【方法3】直接コールバック（利用可能な場合）
      if (typeof window.onDynamicSearchGroupCompleted === "function") {
        window.onDynamicSearchGroupCompleted({
          groupNumber: completedGroup.groupNumber,
          groupData: completedGroup,
        });
        log.debug("✅ 直接コールバック実行完了");
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
      log.debug("🗑️ [DynamicTaskSearch] currentGroupリスナー削除完了");
    }

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
