/**
 * @fileoverview StreamProcessor V2 - 動的タスクグループ処理システム（整理版）
 *
 * ============================================================================
 * 概要:
 * ============================================================================
 * このクラスは、Googleスプレッドシートのタスクを動的に処理するためのコアシステムです。
 * タスクグループを順次処理し、各グループ内では並列処理を行います。
 *
 * ============================================================================
 * 主要機能:
 * ============================================================================
 * 1. 動的タスク生成: スプレッドシートの内容に基づいてリアルタイムでタスクを生成
 * 2. グループ順次処理: タスクグループを依存関係に従って順番に処理
 * 3. 並列バッチ処理: グループ内では3タスクずつ並列実行
 * 4. 特殊グループ対応: レポート化、Genspark等の特殊処理
 * 5. リトライ機能: 失敗したタスクの自動リトライ
 *
 * ============================================================================
 * 処理フロー:
 * ============================================================================
 * 1. processDynamicTaskGroups() - エントリーポイント
 *    ↓
 * 2. processGroupsSequentiallyV3() - グループ順次処理
 *    ↓
 * 3. scanGroupTasks() - 動的タスク生成
 *    ↓
 * 4. processColumn() / process3TypeAIGroup() - タスク実行
 *    ↓
 * 5. executeGroupRetryLogic() - リトライ処理
 *
 * ============================================================================
 * Version: 2.0.0
 * Created: 2024
 * Last Modified: 2025-09-14
 * ============================================================================
 */

import { AITaskExecutor } from '../../core/ai-task-executor.js';
import { WindowService } from '../../services/window-service.js';
import { aiUrlManager } from '../../core/ai-url-manager.js';
import { RetryManager } from '../../utils/retry-manager.js';
import TaskGeneratorV2 from './generator-v2.js';
import { GroupCompletionChecker } from './group-completion-checker.js';
import { TaskWaitManager } from './task-wait-manager.js';
import { TaskGroupScanner } from './task-group-scanner.js';
import { ExclusiveControlManager } from '../../utils/exclusive-control-manager.js';
import { ExclusiveControlLoggerHelper } from '../../utils/exclusive-control-logger-helper.js';
import { sleep } from '../../utils/sleep-utils.js';
import EXCLUSIVE_CONTROL_CONFIG, {
  getTimeoutForFunction,
  getRetryIntervalForFunction
} from '../../config/exclusive-control-config.js';
import { pcIdentifier } from '../../utils/pc-identifier.js';

// SpreadsheetLoggerをキャッシュ
let SpreadsheetLogger = null;

/**
 * SpreadsheetLoggerの動的取得
 * Service Worker環境では動的インポートが制限されるため、
 * グローバル空間に事前に登録されたクラスを使用
 */
async function getSpreadsheetLogger() {
  if (!SpreadsheetLogger) {
    try {
      if (globalThis.SpreadsheetLogger) {
        SpreadsheetLogger = globalThis.SpreadsheetLogger;
      } else if (globalThis.spreadsheetLogger) {
        SpreadsheetLogger = globalThis.spreadsheetLogger.constructor;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }
  return SpreadsheetLogger;
}

export default class StreamProcessorV2 {
  // ========================================================================
  // セクション1: 初期化とコンストラクタ
  // ========================================================================

  /**
   * コンストラクタ
   *
   * StreamProcessorV2のインスタンスを初期化します。
   * 各種サービスとマネージャーのインスタンスを作成し、設定を行います。
   *
   * @param {Object} logger - ログ出力用オブジェクト（デフォルト: console）
   * @param {Object} config - 設定オブジェクト
   */
  constructor(logger = console, config = {}) {
    // ===== Step 1.1: 基本サービスの初期化 =====
    // ログ、タスク実行、リトライ管理の基本サービスを設定
    this.logger = logger;
    this.aiTaskExecutor = new AITaskExecutor(logger);
    this.retryManager = new RetryManager(logger);

    // ===== Step 1.2: タスク生成・管理系の初期化 =====
    // タスクの生成、完了チェック、待機管理を行うコンポーネント
    this.taskGenerator = new TaskGeneratorV2(logger);
    this.completionChecker = new GroupCompletionChecker(this.retryManager, logger);
    this.waitManager = new TaskWaitManager(logger);
    this.windowService = WindowService;
    this.completedTasks = new Set();

    // ===== Step 1.3: 排他制御の初期化 =====
    // 複数プロセス間でのタスク競合を防ぐための排他制御機構
    this.exclusiveManager = new ExclusiveControlManager({
      controlConfig: {
        timeouts: EXCLUSIVE_CONTROL_CONFIG.timeouts,
        markerFormat: EXCLUSIVE_CONTROL_CONFIG.markerFormat,
        ...config.exclusiveControl
      },
      logger: this.logger
    });

    this.exclusiveLoggerHelper = new ExclusiveControlLoggerHelper({
      logger: this.logger
    });

    // ===== Step 1.4: タスクスキャナーの初期化 =====
    // 動的タスク生成のためのスキャナーを設定
    this.taskScanner = new TaskGroupScanner({
      logger: this.logger,
      exclusiveManager: this.exclusiveManager,
      waitManager: this.waitManager,
      processedAnswerCells: this.processedAnswerCells,
      // ヘルパーメソッドの参照を渡す
      indexToColumn: this.indexToColumn.bind(this),
      columnToIndex: this.columnToIndex.bind(this),
      shouldProcessRow: this.shouldProcessRow.bind(this),
      shouldProcessColumn: this.shouldProcessColumn.bind(this),
      getRowControl: this.getRowControl.bind(this),
      getColumnControl: this.getColumnControl.bind(this),
      scanPromptRows: this.scanPromptRows.bind(this),
      loadAdditionalRows: this.loadAdditionalRows.bind(this)
    });

    // ===== Step 1.5: 設定とステート管理 =====
    this.config = {
      exclusiveControl: EXCLUSIVE_CONTROL_CONFIG,
      ...config
    };
    this.failedTasks = new Set();
    this.processedRows = new Set();
    this.processedAnswerCells = new Set();
    this.completedWindows = new Set();
    this.activeWindows = new Map();
    this.currentGroupId = null;
    this.spreadsheetLogger = null;
    this.sheetsClient = null;
    this.spreadsheetData = null;
    this.spreadsheetUrl = null;
  }

  /**
   * SpreadsheetLoggerの初期化
   *
   * スプレッドシートへのログ出力機能を初期化します。
   * Service Worker環境では動的インポートが制限されるため、
   * グローバルスペースから取得します。
   */
  async initializeSpreadsheetLogger() {
    if (this.spreadsheetLogger) {
      return;
    }

    try {
      const SpreadsheetLoggerClass = await getSpreadsheetLogger();

      if (SpreadsheetLoggerClass && this.spreadsheetUrl) {
        this.spreadsheetLogger = new SpreadsheetLoggerClass({
          spreadsheetUrl: this.spreadsheetUrl,
          logger: this.logger
        });

        if (this.spreadsheetLogger.sheetsClient) {
          this.sheetsClient = this.spreadsheetLogger.sheetsClient;
        }

        this.logger.log('[StreamProcessorV2] SpreadsheetLogger初期化完了');
      }
    } catch (error) {
      this.logger.warn('[StreamProcessorV2] SpreadsheetLogger初期化エラー:', error);
    }
  }

  // ========================================================================
  // セクション2: メインエントリーポイント
  // ========================================================================

  /**
   * 動的タスクグループ処理（メインエントリーポイント）
   *
   * ============================================
   * 処理の流れ:
   * ============================================
   * 1. スリープ防止を開始
   * 2. タスクグループ情報を取得
   * 3. 最初のタスクありグループを特定
   * 4. グループごとに順次処理
   * 5. 完了後、スリープ防止を解除
   *
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - 処理オプション
   * @returns {Promise<Object>} 処理結果
   */
  async processDynamicTaskGroups(spreadsheetData, options = {}) {
    const startTime = Date.now();
    let totalCompleted = 0;
    let totalFailed = 0;

    // ===== Step 1: スリープ防止を開始 =====
    // 長時間の処理中にPCがスリープしないように保護
    try {
      if (globalThis.powerManager) {
        await globalThis.powerManager.startProtection('stream-processor-dynamic');
        this.logger.log('[StreamProcessorV2] 🛡️ 動的タスクグループ処理: スリープ防止を開始');
      }
    } catch (error) {
      this.logger.error('[StreamProcessorV2] スリープ防止開始エラー:', error);
    }

    // ===== Step 2: データの保存と初期化 =====
    // スプレッドシートデータをインスタンス変数に保存
    this.spreadsheetData = spreadsheetData;
    this.spreadsheetUrl = spreadsheetData?.spreadsheetUrl;

    // SpreadsheetLoggerを初期化
    await this.initializeSpreadsheetLogger();

    // ===== Step 3: タスクグループの取得と検証 =====
    const taskGroups = options.taskGroups || [];

    if (!taskGroups || taskGroups.length === 0) {
      this.logger.warn('[StreamProcessorV2] タスクグループが見つかりません');

      // スリープ防止を解除（早期リターン時）
      await this.cleanupAndStopProtection('早期リターン');

      return {
        success: false,
        total: 0,
        completed: 0,
        failed: 0,
        totalTime: '0秒',
        error: 'タスクグループが見つかりません'
      };
    }

    this.logger.log(`[StreamProcessorV2] 🚀 動的タスクグループ処理開始: ${taskGroups.length}グループ`);

    // ===== Step 4: 最初のタスクありグループを特定 =====
    const firstTaskGroupIndex = this.findFirstTaskGroupIndex(taskGroups, spreadsheetData);

    if (firstTaskGroupIndex === -1) {
      this.logger.log(`[StreamProcessorV2] 📊 処理対象グループなし、処理を終了`);
      await this.cleanupAndStopProtection('処理完了');

      return {
        success: true,
        total: 0,
        completed: 0,
        failed: 0,
        totalTime: this.formatTime(Date.now() - startTime),
        message: '処理対象となるタスクが見つかりませんでした'
      };
    }

    // ===== Step 5: グループごとの処理を実行 =====
    this.logger.log(`[StreamProcessorV2] 📋 処理開始インデックス: ${firstTaskGroupIndex}`);

    try {
      // V3処理（動的タスク生成）を使用
      const result = await this.processGroupsSequentiallyV3(spreadsheetData, options.testMode);

      totalCompleted = result.completed || 0;
      totalFailed = result.failed || 0;

    } catch (error) {
      this.logger.error('[StreamProcessorV2] 処理エラー:', error);
      totalFailed++;
    }

    // ===== Step 6: クリーンアップと結果返却 =====
    await this.cleanupAndStopProtection('処理完了');

    const totalTime = this.formatTime(Date.now() - startTime);

    return {
      success: totalFailed === 0,
      total: totalCompleted + totalFailed,
      completed: totalCompleted,
      failed: totalFailed,
      totalTime: totalTime,
      message: `処理完了: 成功${totalCompleted}件, 失敗${totalFailed}件`
    };
  }

  /**
   * V3グループ順次処理（メインループ）
   *
   * ============================================
   * 処理の特徴:
   * ============================================
   * - 動的にグループ構造を再解析
   * - 依存関係に従って順次処理
   * - 特殊グループ（レポート化、Genspark）に対応
   * - リトライ機能付き
   *
   * ============================================
   * 処理ステップ:
   * ============================================
   * 1. グループ前チェック
   * 2. 構造の動的再解析
   * 3. 依存関係チェック
   * 4. 特殊グループ判定と処理
   * 5. 通常グループのタスク生成と実行
   * 6. リトライ処理
   * 7. 次グループへ移行
   *
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {boolean} isTestMode - テストモードフラグ
   * @returns {Promise<Object>} 処理結果
   */
  async processGroupsSequentiallyV3(spreadsheetData, isTestMode) {
    this.logger.log('[StreamProcessorV2] 🚀 V3グループ順次処理開始（動的タスク生成モード）');

    let totalProcessed = 0;
    let totalFailed = 0;

    // 処理済みグループを追跡（重複処理防止）
    const processedGroupKeys = new Set();
    let groupIndex = 0;

    // 無限ループ防止のため最大グループ数を設定
    const MAX_GROUPS = 50;

    while (groupIndex < MAX_GROUPS) {
      // ===== Step 1: グループ開始前の動的チェック =====
      // スプレッドシートの最新状態を確認
      await this.performPreGroupChecks(spreadsheetData, groupIndex);

      // ===== Step 2: 構造の動的再解析 =====
      // 毎回構造を再解析して、動的にグループを発見
      this.logger.log(`[StreamProcessorV2] 📊 構造を再解析中（イテレーション${groupIndex + 1}）...`);
      const structure = this.taskGenerator.analyzeStructure(spreadsheetData);
      const { promptGroups, controls, workRows } = structure;

      // 初回のみ構造情報をログ出力
      if (groupIndex === 0) {
        this.logger.log(`[StreamProcessorV2] 📊 初期構造解析完了:`, {
          グループ数: promptGroups.length,
          作業行数: workRows ? workRows.length : 0,
          行制御: controls.row.length,
          列制御: controls.column.length
        });
      }

      // 処理可能なグループがなければ終了
      if (groupIndex >= promptGroups.length) {
        this.logger.log(`[StreamProcessorV2] ✅ すべてのグループ処理完了（合計${groupIndex}グループ）`);
        break;
      }

      const promptGroup = promptGroups[groupIndex];

      // ===== Step 3: 依存関係チェック =====
      let canProcessGroup = true;
      let taskGroupInfo = null;

      if (spreadsheetData.taskGroups && spreadsheetData.taskGroups.length > groupIndex) {
        taskGroupInfo = spreadsheetData.taskGroups[groupIndex];

        // 依存関係のチェック
        if (taskGroupInfo.dependencies && taskGroupInfo.dependencies.length > 0) {
          for (const dependencyId of taskGroupInfo.dependencies) {
            if (!processedGroupKeys.has(dependencyId)) {
              this.logger.log(`[StreamProcessorV2] ⏳ グループ${groupIndex + 1}(${taskGroupInfo.id})は依存関係待ち: ${dependencyId}が未完了`);
              canProcessGroup = false;
              break;
            }
          }
        }

        if (canProcessGroup) {
          this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}(${taskGroupInfo.id})の依存関係クリア`);
        }
      }

      // 依存関係が満たされていない場合は次のイテレーションで再試行
      if (!canProcessGroup) {
        await this.wait(5000); // 5秒待機
        continue;
      }

      // グループのキーを生成（重複処理防止）
      const groupKey = taskGroupInfo ? taskGroupInfo.id : promptGroup.promptColumns.join(',');
      if (processedGroupKeys.has(groupKey)) {
        this.logger.log(`[StreamProcessorV2] ⚠️ グループ${groupIndex + 1}は既に処理済み、スキップ`);
        groupIndex++;
        continue;
      }

      // ===== Step 4: 特殊グループタイプの処理 =====
      // レポート化、Genspark（スライド）、Genspark（ファクトチェック）の処理
      if (taskGroupInfo && taskGroupInfo.groupType) {
        const specialGroupTypes = ['report', 'genspark_slide', 'genspark_factcheck'];

        if (specialGroupTypes.includes(taskGroupInfo.groupType)) {
          this.logger.log(`[StreamProcessorV2] 🎯 特殊グループ検出: ${taskGroupInfo.groupType} (${taskGroupInfo.name})`);

          // 特殊グループ用の処理を実行
          let specialResult = null;

          if (taskGroupInfo.groupType === 'report') {
            // レポート化処理
            specialResult = await this.processReportGroup(taskGroupInfo, spreadsheetData);
          } else if (taskGroupInfo.groupType === 'genspark_slide' || taskGroupInfo.groupType === 'genspark_factcheck') {
            // Genspark処理（スライドまたはファクトチェック）
            specialResult = await this.processGensparkGroup(taskGroupInfo, spreadsheetData);
          }

          // 処理済みとしてマーク
          processedGroupKeys.add(groupKey);

          if (specialResult && specialResult.success) {
            this.logger.log(`[StreamProcessorV2] ✅ 特殊グループ${groupIndex + 1}の処理完了`);
            totalProcessed++;
          } else {
            this.logger.error(`[StreamProcessorV2] ❌ 特殊グループ${groupIndex + 1}の処理失敗`);
            totalFailed++;
          }

          groupIndex++;
          continue; // 次のグループへ
        }
      }

      // ===== Step 5: 通常グループの処理 =====
      // 列制御をチェック（「この列で停止」があるか確認）
      const shouldStop = await this.checkColumnControl(controls, groupIndex, promptGroup);
      if (shouldStop) {
        break;
      }

      this.logger.log(`[StreamProcessorV2] 📋 グループ${groupIndex + 1}/${promptGroups.length}の処理開始`);

      // 動的タスク生成
      const promptCols = promptGroup.promptColumns;
      const answerCols = promptGroup.answerColumns.map(col => col.index);
      const tasks = await this.taskScanner.scanGroupTasks(spreadsheetData, promptCols, answerCols);

      if (!tasks || tasks.length === 0) {
        this.logger.log(`[StreamProcessorV2] グループ${groupIndex + 1}にタスクなし（すべて回答済み）`);
        processedGroupKeys.add(groupKey);
        groupIndex++;
        continue;
      }

      this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}のタスク生成完了: ${tasks.length}個`);

      // 現在のグループIDを設定（リトライ管理用）
      this.currentGroupId = groupKey;

      // 3種類AIかどうかを判定
      const is3TypeAI = promptGroup.aiType &&
        (promptGroup.aiType.includes('3種類') || promptGroup.aiType.includes('３種類'));

      if (is3TypeAI) {
        // 3種類AI: 列ごとにグループ化して特別処理
        this.logger.log(`[StreamProcessorV2] 🎯 3種類AIモードで処理`);
        const columnGroups = this.organizeTasksByColumn(tasks);
        await this.process3TypeAIGroup(columnGroups, isTestMode);
        totalProcessed += tasks.length;
      } else {
        // 通常AI: 各列を順次処理（列内は3行バッチ並列）
        this.logger.log(`[StreamProcessorV2] 🎯 通常モードで処理（列ごと順次処理）`);
        const columnGroups = this.organizeTasksByColumn(tasks);

        for (const [column, columnTasks] of columnGroups) {
          try {
            await this.processColumn(column, columnTasks, isTestMode);
            totalProcessed += columnTasks.length;
          } catch (error) {
            this.logger.error(`[StreamProcessorV2] ${column}列処理エラー:`, error);
            totalFailed += columnTasks.length;
          }
        }
      }

      // このグループを処理済みとしてマーク
      processedGroupKeys.add(groupKey);

      this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}の処理完了`);

      // ===== Step 6: グループ完了後のリトライ処理 =====
      if (this.retryManager) {
        const retryResults = await this.executeGroupRetryLogic(
          groupKey,
          `グループ${groupIndex + 1}`,
          spreadsheetData,
          async (column, tasks) => this.processColumn(column, tasks, isTestMode),
          isTestMode
        );

        if (retryResults.shouldStopProcessing) {
          this.logger.error(`[StreamProcessorV2] ⛔ グループ${groupIndex + 1}に未完了タスクが残っています`);
          break;
        }
      }

      // ===== Step 7: 次グループへ移行 =====
      groupIndex++;

      // スプレッドシートを再読み込み（次のグループのタスクを動的に発見するため）
      if (groupIndex < promptGroups.length && this.sheetsClient) {
        await this.reloadSpreadsheetData(spreadsheetData);
      }
    }

    this.logger.log('[StreamProcessorV2] 🎉 V3グループ順次処理完了（動的タスク生成）', {
      総処理タスク: totalProcessed,
      失敗タスク: totalFailed,
      処理グループ数: processedGroupKeys.size
    });

    return {
      completed: totalProcessed,
      failed: totalFailed
    };
  }

  // ========================================================================
  // セクション3: タスクグループ処理
  // ========================================================================

  /**
   * レポートグループの専用処理
   *
   * レポート化列の処理を行います。
   * 左隣のAI回答列からテキストを取得し、
   * Googleドキュメントを生成してURLを記録します。
   *
   * @param {Object} group - タスクグループ情報
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} 処理結果
   */
  async processReportGroup(group, spreadsheetData) {
    this.logger.log(`[StreamProcessorV2] 📄 レポートグループ${group.id}の処理開始`);

    try {
      // レポート化列の位置を取得
      const reportColumn = group.columnRange.promptColumns[0];
      const reportColumnLetter = this.indexToColumn(reportColumn);

      // 左隣の列（AI回答列）を特定
      const answerColumnLetter = this.indexToColumn(reportColumn - 1);

      this.logger.log(`[StreamProcessorV2] 📋 レポート化列: ${reportColumnLetter}, AI回答列: ${answerColumnLetter}`);

      // 作業行範囲を取得
      const workRowRange = this.getWorkRowRange();
      const results = { total: 0, completed: 0, failed: 0 };

      // 各行を処理
      for (let rowIndex = workRowRange.start; rowIndex <= workRowRange.end; rowIndex++) {
        try {
          // AI回答を取得
          const aiAnswerText = await this.getCellValue(spreadsheetData, answerColumnLetter, rowIndex);

          if (!aiAnswerText || aiAnswerText.trim() === '') {
            continue; // 空のセルはスキップ
          }

          // すでにレポート化済みかチェック
          const existingReport = await this.getCellValue(spreadsheetData, reportColumnLetter, rowIndex);
          if (existingReport && existingReport.trim() !== '') {
            this.logger.log(`[StreamProcessorV2] 行${rowIndex}: すでにレポート化済み`);
            continue;
          }

          results.total++;

          // レポート生成処理（タスクとしてメッセージ送信）
          const task = {
            taskType: 'report',
            row: rowIndex,
            sourceColumn: answerColumnLetter,
            reportColumn: reportColumnLetter,
            spreadsheetId: spreadsheetData.spreadsheetId,
            sheetGid: spreadsheetData.gid,
            text: aiAnswerText,
            createdAt: Date.now()
          };

          // タスクをbackgroundに送信
          const response = await chrome.runtime.sendMessage({
            action: 'executeReportTask',
            task: task
          });

          if (response && response.success) {
            results.completed++;
            this.logger.log(`[StreamProcessorV2] ✅ 行${rowIndex}: レポート作成完了`);

            // URLをスプレッドシートに書き込み
            if (response.url) {
              await this.writeCellValue(spreadsheetData, reportColumnLetter, rowIndex, response.url);
            }
          } else {
            results.failed++;
            this.logger.error(`[StreamProcessorV2] ❌ 行${rowIndex}: レポート作成失敗`);
          }

        } catch (rowError) {
          results.failed++;
          this.logger.error(`[StreamProcessorV2] ❌ 行${rowIndex}処理エラー:`, rowError);
        }
      }

      this.logger.log(`[StreamProcessorV2] ✅ レポートグループ${group.id}完了: ${results.completed}/${results.total}件`);
      return { success: true, type: 'report', results: results };

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ❌ レポートグループ${group.id}エラー:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gensparkグループの専用処理
   *
   * Genspark（スライド生成/ファクトチェック）の処理を行います。
   * 左隣のAI回答列からテキストを取得し、
   * Gensparkで処理してURLを記録します。
   *
   * @param {Object} group - タスクグループ情報
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} 処理結果
   */
  async processGensparkGroup(group, spreadsheetData) {
    this.logger.log(`[StreamProcessorV2] ⚡ Gensparkグループ${group.id}の処理開始 (タイプ: ${group.groupType}, AIタイプ: ${group.aiType})`);

    try {
      // Gensparkの種別に応じた機能設定
      let functionType = 'slides'; // デフォルト

      if (group.groupType === 'genspark_slide' || group.aiType === 'Genspark-Slides') {
        functionType = 'slides';
        this.logger.log(`[StreamProcessorV2] 🎨 スライド生成モードで処理`);
      } else if (group.groupType === 'genspark_factcheck' || group.aiType === 'Genspark-FactCheck') {
        functionType = 'factcheck';
        this.logger.log(`[StreamProcessorV2] ✅ ファクトチェックモードで処理`);
      }

      // Genspark列の位置を取得
      const gensparkColumn = group.columnRange.promptColumns[0];
      const gensparkColumnLetter = this.indexToColumn(gensparkColumn);

      // 左隣の列（AI回答列）を特定
      const answerColumnLetter = this.indexToColumn(gensparkColumn - 1);

      this.logger.log(`[StreamProcessorV2] 📋 Genspark列: ${gensparkColumnLetter}, AI回答列: ${answerColumnLetter}`);

      // 作業行範囲を取得
      const workRowRange = this.getWorkRowRange();
      const results = { total: 0, completed: 0, failed: 0 };

      for (let rowIndex = workRowRange.start; rowIndex <= workRowRange.end; rowIndex++) {
        try {
          // AI回答を取得
          const aiAnswerText = await this.getCellValue(spreadsheetData, answerColumnLetter, rowIndex);

          if (!aiAnswerText || aiAnswerText.trim() === '') {
            continue; // 空のセルはスキップ
          }

          // すでにGenspark処理済みかチェック
          const existingResult = await this.getCellValue(spreadsheetData, gensparkColumnLetter, rowIndex);
          if (existingResult && existingResult.trim() !== '') {
            this.logger.log(`[StreamProcessorV2] 行${rowIndex}: すでにGenspark処理済み`);
            continue;
          }

          results.total++;

          // Gensparkタスクを作成
          const task = {
            taskType: 'genspark',
            functionType: functionType,
            row: rowIndex,
            column: gensparkColumnLetter,
            sourceColumn: answerColumnLetter,
            spreadsheetId: spreadsheetData.spreadsheetId,
            sheetGid: spreadsheetData.gid,
            text: aiAnswerText,
            aiType: 'Genspark',
            createdAt: Date.now()
          };

          // タスクをbackgroundに送信してGenspark処理を実行
          const response = await chrome.runtime.sendMessage({
            action: 'executeGensparkTask',
            task: task
          });

          if (response && response.success) {
            results.completed++;
            this.logger.log(`[StreamProcessorV2] ✅ 行${rowIndex}: Genspark処理完了`);

            // 結果をスプレッドシートに書き込み
            const resultText = response.url || response.text || `Genspark${functionType === 'slides' ? 'スライド' : 'ファクトチェック'}完了`;
            await this.writeCellValue(spreadsheetData, gensparkColumnLetter, rowIndex, resultText);
          } else {
            results.failed++;
            this.logger.error(`[StreamProcessorV2] ❌ 行${rowIndex}: Genspark処理失敗 - ${response?.error || 'Unknown error'}`);
          }

        } catch (rowError) {
          results.failed++;
          this.logger.error(`[StreamProcessorV2] ❌ 行${rowIndex}処理エラー:`, rowError);
        }
      }

      this.logger.log(`[StreamProcessorV2] ✅ Gensparkグループ${group.id}完了: ${results.completed}/${results.total}行`);
      return { success: true, type: 'genspark', functionType: functionType, results: results };

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ❌ Gensparkグループ${group.id}エラー:`, error);
      return { success: false, error: error.message };
    }
  }

  // ========================================================================
  // セクション4: タスク生成
  // ========================================================================

  /**
   * タスクを列ごとに整理
   *
   * タスクリストを列ごとにグループ化します。
   * これにより、列単位での処理が可能になります。
   *
   * @param {Array} tasks - タスクリスト
   * @returns {Map} 列ごとのタスクマップ
   */
  organizeTasksByColumn(tasks) {
    const columnGroups = new Map();

    for (const task of tasks) {
      const column = task.column;
      if (!columnGroups.has(column)) {
        columnGroups.set(column, []);
      }
      columnGroups.get(column).push(task);
    }

    return columnGroups;
  }

  // ========================================================================
  // セクション5: タスク実行
  // ========================================================================

  /**
   * 列単位でタスクを処理
   *
   * 特定の列のタスクを3行ずつバッチで並列処理します。
   *
   * 処理の流れ:
   * 1. タスクを3つずつのバッチに分割
   * 2. 各バッチを並列で実行
   * 3. 全バッチ完了まで待機
   *
   * @param {string} column - 処理する列
   * @param {Array} tasks - タスクリスト
   * @param {boolean} isTestMode - テストモード
   */
  async processColumn(column, tasks, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 📊 ${column}列の処理開始: ${tasks.length}タスク`);

    // 3タスクずつのバッチに分割
    const batchSize = 3;
    const batches = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }

    // 各バッチを順次処理
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.log(`[StreamProcessorV2] バッチ${i + 1}/${batches.length}を処理中 (${batch.length}タスク)`);

      try {
        await this.processBatch(batch, isTestMode);
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] バッチ${i + 1}処理エラー:`, error);
      }
    }

    this.logger.log(`[StreamProcessorV2] ✅ ${column}列の処理完了`);
  }

  /**
   * バッチ単位でタスクを並列処理
   *
   * 最大3つのタスクを同時に実行します。
   * 各タスクは別ウィンドウで処理されます。
   *
   * @param {Array} batch - タスクバッチ（最大3タスク）
   * @param {boolean} isTestMode - テストモード
   */
  async processBatch(batch, isTestMode) {
    const promises = batch.map((task, index) =>
      this.processTask(task, isTestMode, index)
    );

    const results = await Promise.allSettled(promises);

    // 結果をログ
    results.forEach((result, index) => {
      const task = batch[index];
      if (result.status === 'fulfilled') {
        this.logger.log(`[StreamProcessorV2] ✅ タスク完了: ${task.column}${task.row}`);
      } else {
        this.logger.error(`[StreamProcessorV2] ❌ タスク失敗: ${task.column}${task.row}`, result.reason);
        this.failedTasks.add(`${task.column}${task.row}`);
      }
    });
  }

  /**
   * 個別タスクの処理
   *
   * 単一のタスクを実行します。
   * ウィンドウ作成、AI実行、結果取得までの全プロセスを管理します。
   *
   * @param {Object} task - 処理するタスク
   * @param {boolean} isTestMode - テストモード
   * @param {number} position - ウィンドウ位置（0, 1, 2）
   * @returns {Promise<Object>} 処理結果
   */
  async processTask(task, isTestMode, position = 0) {
    try {
      // ウィンドウを作成
      const windowInfo = await this.createWindowForTask(task, position);

      // タスクを実行
      const result = await this.aiTaskExecutor.executeTask(task, {
        tabId: windowInfo.tabId,
        windowId: windowInfo.windowId,
        isTestMode: isTestMode
      });

      // ウィンドウをクローズ
      await this.windowService.closeWindow(windowInfo.windowId);

      return result;

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] タスク処理エラー (${task.column}${task.row}):`, error);
      throw error;
    }
  }

  /**
   * 3種類AIグループの処理
   *
   * ChatGPT、Claude、Geminiの3つのAIを同時に使用する特殊処理です。
   * 各AIタイプごとに別ウィンドウで並列処理を行います。
   *
   * @param {Map} columnGroups - 列ごとのタスクグループ
   * @param {boolean} isTestMode - テストモード
   */
  async process3TypeAIGroup(columnGroups, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 🎯 3種類AIグループの処理開始`);

    // 各列を並列で処理
    const columnPromises = [];
    let position = 0;

    for (const [column, tasks] of columnGroups) {
      // 各列に位置を割り当て（最大3列）
      const columnPosition = position % 3;
      position++;

      columnPromises.push(
        this.processColumnFor3TypeAI(column, tasks, isTestMode, columnPosition)
      );
    }

    // すべての列の処理を待機
    await Promise.allSettled(columnPromises);

    this.logger.log(`[StreamProcessorV2] ✅ 3種類AIグループの処理完了`);
  }

  /**
   * 3種類AI用の列処理
   *
   * @param {string} column - 処理する列
   * @param {Array} tasks - タスクリスト
   * @param {boolean} isTestMode - テストモード
   * @param {number} position - ウィンドウ位置
   */
  async processColumnFor3TypeAI(column, tasks, isTestMode, position) {
    for (const task of tasks) {
      try {
        await this.processTask(task, isTestMode, position);
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] 3種類AI処理エラー (${task.column}${task.row}):`, error);
      }
    }
  }

  // ========================================================================
  // セクション6: リトライ・エラー処理
  // ========================================================================

  /**
   * グループ完了後のリトライ処理
   *
   * グループ内のすべてのタスクが完了した後、
   * 失敗したタスクや待機中のタスクをリトライします。
   *
   * @param {string} groupId - グループID
   * @param {string} groupName - グループ名
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Function} processFunc - 処理関数
   * @param {boolean} isTestMode - テストモード
   * @returns {Promise<Object>} リトライ結果
   */
  async executeGroupRetryLogic(groupId, groupName, spreadsheetData, processFunc, isTestMode = false) {
    this.logger.log(`[StreamProcessorV2] 🔄 ${groupName}のリトライ処理を開始`);

    try {
      // 待機テキストがクリアされるまで待機
      await this.waitManager.waitForClearance(spreadsheetData);

      // 失敗タスクを収集
      const failedTasks = this.retryManager.getFailedTasks(groupId);

      if (failedTasks.length === 0) {
        this.logger.log(`[StreamProcessorV2] ${groupName}: リトライ対象なし`);
        return { shouldStopProcessing: false };
      }

      // リトライ実行
      this.logger.log(`[StreamProcessorV2] ${groupName}: ${failedTasks.length}件をリトライ`);

      for (const task of failedTasks) {
        await processFunc(task.column, [task]);
      }

      // 完了チェック
      const stillFailed = this.retryManager.getFailedTasks(groupId);

      if (stillFailed.length > 0) {
        this.logger.error(`[StreamProcessorV2] ${groupName}: ${stillFailed.length}件が依然として失敗`);
        return { shouldStopProcessing: true };
      }

      return { shouldStopProcessing: false };

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] リトライ処理エラー:`, error);
      return { shouldStopProcessing: true };
    }
  }

  // ========================================================================
  // セクション7: ユーティリティメソッド
  // ========================================================================

  /**
   * 待機処理
   * @param {number} ms - 待機時間（ミリ秒）
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 作業行範囲を取得
   * @returns {Object} 開始行と終了行
   */
  getWorkRowRange() {
    // デフォルトの作業行範囲
    // 実際の値はspreadsheetDataから取得する必要がある
    return {
      start: 9,  // 通常、9行目から開始
      end: 500   // 最大500行まで
    };
  }

  /**
   * 列インデックスを列文字に変換
   * @param {number} index - 列インデックス（0ベース）
   * @returns {string} 列文字（A, B, C...）
   */
  indexToColumn(index) {
    let column = '';
    while (index >= 0) {
      column = String.fromCharCode((index % 26) + 65) + column;
      index = Math.floor(index / 26) - 1;
    }
    return column;
  }

  /**
   * 列文字を列インデックスに変換
   * @param {string} column - 列文字
   * @returns {number} 列インデックス（0ベース）
   */
  columnToIndex(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 65 + 1);
    }
    return index - 1;
  }

  /**
   * セル値を取得
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {string} columnLetter - 列文字
   * @param {number} rowIndex - 行番号
   * @returns {Promise<string>} セル値
   */
  async getCellValue(spreadsheetData, columnLetter, rowIndex) {
    try {
      if (spreadsheetData.values && spreadsheetData.values[rowIndex - 1]) {
        const columnIndex = this.columnToIndex(columnLetter);
        return spreadsheetData.values[rowIndex - 1][columnIndex] || '';
      }
      return '';
    } catch (error) {
      this.logger.warn(`[StreamProcessorV2] セル取得エラー (${columnLetter}${rowIndex}):`, error);
      return '';
    }
  }

  /**
   * セル値を書き込み
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {string} columnLetter - 列文字
   * @param {number} rowIndex - 行番号
   * @param {string} value - 書き込む値
   */
  async writeCellValue(spreadsheetData, columnLetter, rowIndex, value) {
    try {
      // SheetsClientを使用してセルに書き込み
      if (this.sheetsClient && this.sheetsClient.updateCell) {
        const range = `${columnLetter}${rowIndex}`;
        await this.sheetsClient.updateCell(range, value);
      }
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] セル書き込みエラー (${columnLetter}${rowIndex}):`, error);
    }
  }

  /**
   * タスク用のウィンドウを作成
   * @param {Object} task - タスク
   * @param {number} position - ウィンドウ位置
   * @returns {Promise<Object>} ウィンドウ情報
   */
  async createWindowForTask(task, position = 0) {
    const url = aiUrlManager.getUrlForTask(task);
    const windowOptions = this.getWindowOptions(position);

    const windowInfo = await this.windowService.createWindow({
      url: url,
      ...windowOptions
    });

    return windowInfo;
  }

  /**
   * ウィンドウオプションを取得
   * @param {number} position - ウィンドウ位置（0, 1, 2）
   * @returns {Object} ウィンドウオプション
   */
  getWindowOptions(position) {
    const baseLeft = 100;
    const windowWidth = 600;
    const spacing = 50;

    return {
      left: baseLeft + (position * (windowWidth + spacing)),
      top: 100,
      width: windowWidth,
      height: 800,
      type: 'normal',
      focused: false
    };
  }

  /**
   * 時間をフォーマット
   * @param {number} ms - ミリ秒
   * @returns {string} フォーマット済み時間
   */
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}時間${minutes % 60}分${seconds % 60}秒`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  /**
   * クリーンアップとスリープ防止解除
   * @param {string} reason - 解除理由
   */
  async cleanupAndStopProtection(reason) {
    try {
      if (globalThis.powerManager) {
        await globalThis.powerManager.stopProtection('stream-processor-dynamic');
        this.logger.log(`[StreamProcessorV2] 🔓 ${reason}: スリープ防止を解除`);
      }
    } catch (error) {
      this.logger.error('[StreamProcessorV2] スリープ防止解除エラー:', error);
    }
  }

  // その他の既存メソッドは、適切なセクションに配置する必要があります
  // （行制御、列制御、ヘルパーメソッドなど）
}