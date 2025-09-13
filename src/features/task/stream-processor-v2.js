/**
 * @fileoverview StreamProcessor V2 - 動的タスクグループ処理システム
 *
 * 【ステップ構成】
 * ステップ0: 初期化・コンストラクタ
 * ステップ1: SpreadsheetLogger初期化
 * ステップ2: メインエントリーポイント（スリープ防止・データ検証）
 * ステップ3: V3グループ順次処理（動的構造解析）
 * ステップ4: 特殊グループ処理（レポート化・Genspark）
 * ステップ5: タスク生成・整理
 * ステップ6: 標準タスク実行（列・バッチ・個別処理）
 * ステップ7: 特殊タスク実行（3種類AI並列処理）
 * ステップ8: リトライ・エラー処理
 * ステップ9: ユーティリティ・ヘルパー関数
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
 * @version 3.0.0
 * @updated 2025-09-14 ステップ番号体系統一、コード整理
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
  // ========================================
  // ステップ0: 初期化・コンストラクタ
  // ========================================

  /**
   * コンストラクタ
   *
   * StreamProcessorV2のインスタンスを初期化します。
   * ChatGPTのステップ構成を参考に、明確なステップで初期化を実行します。
   *
   * @param {Object} logger - ログ出力用オブジェクト（デフォルト: console）
   * @param {Object} config - 設定オブジェクト
   */
  constructor(logger = console, config = {}) {
    // ========================================
    // ステップ0-1: 基本サービス初期化（最優先）
    // ========================================
    // 最初にloggerを設定（this.log()を使用するため）
    this.logger = logger;

    // ログ関数が使用可能になった後に初期化ログ出力
    this.log('StreamProcessorV2 初期化開始', 'step', '0');
    this.log('基本サービスを初期化', 'info', '0-1');
    this.aiTaskExecutor = new AITaskExecutor(logger);
    this.retryManager = new RetryManager(logger);

    // ========================================
    // ステップ0-2: タスク生成・管理系初期化
    // ========================================
    this.log('タスク生成・管理系コンポーネントを初期化', 'info', '0-2');
    this.taskGenerator = new TaskGeneratorV2(logger);
    this.completionChecker = new GroupCompletionChecker(this.retryManager, logger);
    this.waitManager = new TaskWaitManager(logger);
    this.windowService = WindowService;
    this.completedTasks = new Set();

    // ========================================
    // ステップ0-3: 排他制御システム初期化
    // ========================================
    this.log('排他制御システムを初期化', 'info', '0-3');
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

    // ========================================
    // ステップ0-4: タスクスキャナー初期化
    // ========================================
    this.log('動的タスクスキャナーを初期化', 'info', '0-4');
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

    // ========================================
    // ステップ0-5: 設定・状態管理初期化
    // ========================================
    this.log('設定と状態管理を初期化', 'info', '0-5');
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

    this.log('StreamProcessorV2 初期化完了', 'success', '0');
  }

  // ========================================
  // 統一ログ関数（ChatGPT方式）
  // ========================================
  /**
   * 統一ログ出力関数
   * @param {string} message - ログメッセージ
   * @param {string} type - ログタイプ (info, error, success, warning, step)
   * @param {string} step - ステップ番号（オプション）
   */
  log(message, type = 'info', step = null) {
    const timestamp = new Date().toLocaleTimeString('ja-JP', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const prefix = `[${timestamp}]`;
    const stepPrefix = step ? `[Step ${step}]` : '';

    switch(type) {
      case 'error':
        this.logger.error(`${prefix} ${stepPrefix} ❌ ${message}`);
        break;
      case 'success':
        this.logger.log(`${prefix} ${stepPrefix} ✅ ${message}`);
        break;
      case 'warning':
        this.logger.warn(`${prefix} ${stepPrefix} ⚠️ ${message}`);
        break;
      case 'step':
        this.logger.log(`${prefix} ${stepPrefix} 📍 ${message}`);
        break;
      default:
        this.logger.log(`${prefix} ${stepPrefix} ℹ️ ${message}`);
    }
  }

  // ========================================
  // ステップ1: SpreadsheetLogger初期化
  // ========================================
  /**
   * SpreadsheetLoggerの初期化
   *
   * スプレッドシートへのログ出力機能を初期化します。
   * Service Worker環境では動的インポートが制限されるため、
   * グローバルスペースから取得します。
   */
  async initializeSpreadsheetLogger() {
    this.log('SpreadsheetLogger初期化開始', 'step', '1');

    // ステップ1-1: 既存インスタンスチェック
    if (this.spreadsheetLogger) {
      this.log('SpreadsheetLogger既に初期化済み', 'info', '1-1');
      return;
    }

    try {
      // ステップ1-2: SpreadsheetLoggerクラス取得
      this.log('SpreadsheetLoggerクラスを取得', 'info', '1-2');
      const SpreadsheetLoggerClass = await getSpreadsheetLogger();

      if (SpreadsheetLoggerClass && this.spreadsheetUrl) {
        // ステップ1-3: インスタンス作成
        this.log('SpreadsheetLoggerインスタンスを作成', 'info', '1-3');
        this.spreadsheetLogger = new SpreadsheetLoggerClass({
          spreadsheetUrl: this.spreadsheetUrl,
          logger: this.logger
        });

        // ステップ1-4: SheetsClient参照取得
        if (this.spreadsheetLogger.sheetsClient) {
          this.sheetsClient = this.spreadsheetLogger.sheetsClient;
          this.log('SheetsClient参照取得完了', 'info', '1-4');
        }

        this.log('SpreadsheetLogger初期化完了', 'success', '1');
      } else {
        this.log('SpreadsheetLoggerClass または spreadsheetUrl が未設定', 'warning', '1');
      }
    } catch (error) {
      this.log(`SpreadsheetLogger初期化エラー: ${error.message}`, 'error', '1');
    }
  }

  // ========================================
  // ステップ2: メインエントリーポイント
  // ========================================

  /**
   * 動的タスクグループ処理（メインエントリーポイント）
   *
   * 全体の処理フローを制御するメイン関数です。
   * ChatGPTのステップ構成を参考に、明確な段階で処理を実行します。
   *
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - 処理オプション
   * @returns {Promise<Object>} 処理結果
   */
  async processDynamicTaskGroups(spreadsheetData, options = {}) {
    this.log('動的タスクグループ処理開始', 'step', '2');
    const startTime = Date.now();
    let totalCompleted = 0;
    let totalFailed = 0;

    // ========================================
    // ステップ2-1: スリープ防止開始
    // ========================================
    this.log('スリープ防止を開始', 'info', '2-1');
    try {
      if (globalThis.powerManager) {
        await globalThis.powerManager.startProtection('stream-processor-dynamic');
        this.log('PowerManager保護開始', 'success', '2-1');
      }
    } catch (error) {
      this.log(`スリープ防止開始エラー: ${error.message}`, 'error', '2-1');
    }

    // ========================================
    // ステップ2-2: データ保存・初期化
    // ========================================
    this.log('スプレッドシートデータを保存・初期化', 'info', '2-2');
    this.spreadsheetData = spreadsheetData;
    this.spreadsheetUrl = spreadsheetData?.spreadsheetUrl;

    // SpreadsheetLoggerを初期化
    await this.initializeSpreadsheetLogger();

    // ========================================
    // ステップ2-3: タスクグループ検証
    // ========================================
    this.log('タスクグループを検証', 'info', '2-3');
    const taskGroups = options.taskGroups || [];

    if (!taskGroups || taskGroups.length === 0) {
      this.log('タスクグループが見つからない - 早期終了', 'warning', '2-3');
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

    this.log(`タスクグループ検証完了: ${taskGroups.length}グループ`, 'success', '2-3');

    // ========================================
    // ステップ2-4: 最初のグループ特定
    // ========================================
    this.log('最初のタスクありグループを特定', 'info', '2-4');
    const firstTaskGroupIndex = this.findFirstTaskGroupIndex(taskGroups, spreadsheetData);

    if (firstTaskGroupIndex === -1) {
      this.log('処理対象グループなし - 正常終了', 'info', '2-4');
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

    this.log(`処理開始インデックス: ${firstTaskGroupIndex}`, 'success', '2-4');

    // ========================================
    // ステップ2-5: グループ処理実行
    // ========================================
    this.log('V3グループ順次処理を実行', 'info', '2-5');
    try {
      const result = await this.processGroupsSequentiallyV3(spreadsheetData, options.testMode);
      totalCompleted = result.completed || 0;
      totalFailed = result.failed || 0;
      this.log(`グループ処理完了: 成功${totalCompleted}件, 失敗${totalFailed}件`, 'success', '2-5');
    } catch (error) {
      this.log(`グループ処理エラー: ${error.message}`, 'error', '2-5');
      totalFailed++;
    }

    // ========================================
    // ステップ2-6: クリーンアップ・結果返却
    // ========================================
    this.log('クリーンアップと結果返却', 'info', '2-6');
    await this.cleanupAndStopProtection('処理完了');

    const totalTime = this.formatTime(Date.now() - startTime);
    const result = {
      success: totalFailed === 0,
      total: totalCompleted + totalFailed,
      completed: totalCompleted,
      failed: totalFailed,
      totalTime: totalTime,
      message: `処理完了: 成功${totalCompleted}件, 失敗${totalFailed}件`
    };

    this.log(`動的タスクグループ処理完了 (${totalTime})`, 'success', '2');
    return result;
  }

  // ========================================
  // ステップ3: V3グループ順次処理
  // ========================================

  /**
   * V3グループ順次処理（メインループ）
   *
   * 動的にグループ構造を解析し、依存関係に従って順次処理します。
   * ChatGPTのステップ構成を参考に、明確な段階で処理を実行します。
   *
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {boolean} isTestMode - テストモードフラグ
   * @returns {Promise<Object>} 処理結果
   */
  async processGroupsSequentiallyV3(spreadsheetData, isTestMode) {
    this.log('V3グループ順次処理開始（動的タスク生成モード）', 'step', '3');

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

  // ========================================
  // ステップ4: 特殊グループ処理
  // ========================================

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

  // ========================================
  // ステップ5: タスク生成・整理
  // ========================================

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

  // ========================================
  // ステップ6: 標準タスク実行
  // ========================================

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

  // ========================================
  // ステップ7: 特殊タスク実行（3種類AI並列処理）
  // ========================================

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
    this.log('3種類AIグループ処理開始', 'step', '7');

    // ステップ7-1: 列並列処理の準備
    this.log('各列を並列処理用に準備', 'info', '7-1');
    const columnPromises = [];
    let position = 0;

    for (const [column, tasks] of columnGroups) {
      // ステップ7-2: 位置割り当て（最大3列）
      const columnPosition = position % 3;
      position++;

      this.log(`${column}列をポジション${columnPosition}で処理準備`, 'info', '7-2');
      columnPromises.push(
        this.processColumnFor3TypeAI(column, tasks, isTestMode, columnPosition)
      );
    }

    // ステップ7-3: 並列実行と待機
    this.log(`${columnPromises.length}列の並列処理を開始`, 'info', '7-3');
    await Promise.allSettled(columnPromises);

    this.log('3種類AIグループ処理完了', 'success', '7');
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
    this.log(`${column}列の3種類AI処理開始 (${tasks.length}タスク)`, 'info', '7-4');

    for (const task of tasks) {
      try {
        await this.processTask(task, isTestMode, position);
        this.log(`${column}列タスク完了: ${task.column}${task.row}`, 'success', '7-4');
      } catch (error) {
        this.log(`${column}列タスクエラー (${task.column}${task.row}): ${error.message}`, 'error', '7-4');
      }
    }

    this.log(`${column}列の3種類AI処理完了`, 'success', '7-4');
  }

  // ========================================
  // ステップ8: リトライ・エラー処理
  // ========================================

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

  // ========================================
  // ステップ9: ユーティリティ・ヘルパー関数
  // ========================================

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

  // ========================================
  // ステップ0-補助: 不足メソッド実装
  // ========================================

  /**
   * グループ処理前のチェック処理
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {number} groupIndex - グループインデックス
   */
  async performPreGroupChecks(spreadsheetData, groupIndex) {
    this.log(`グループ${groupIndex + 1}の前処理チェックを実行`, 'info', `3-1`);

    try {
      // スプレッドシートの最新状態確認
      if (this.sheetsClient && this.sheetsClient.checkConnection) {
        await this.sheetsClient.checkConnection();
      }

      // 排他制御状態の確認
      if (this.exclusiveManager && this.exclusiveManager.checkStatus) {
        await this.exclusiveManager.checkStatus();
      }

      this.log(`グループ${groupIndex + 1}前処理チェック完了`, 'success', `3-1`);
    } catch (error) {
      this.log(`グループ${groupIndex + 1}前処理チェックエラー: ${error.message}`, 'error', `3-1`);
    }
  }

  /**
   * 列制御のチェック処理
   * @param {Object} controls - 制御情報
   * @param {number} groupIndex - グループインデックス
   * @param {Object} promptGroup - プロンプトグループ
   * @returns {boolean} 停止すべきかどうか
   */
  async checkColumnControl(controls, groupIndex, promptGroup) {
    this.log(`グループ${groupIndex + 1}の列制御をチェック`, 'info', `3-3`);

    try {
      // 列制御の「この列で停止」チェック
      if (controls && controls.column) {
        for (const control of controls.column) {
          if (control.action === 'stop' && control.targetColumn) {
            const targetColumn = this.columnToIndex(control.targetColumn);
            if (promptGroup.promptColumns.includes(targetColumn)) {
              this.log(`列制御により停止: ${control.targetColumn}列`, 'warning', `3-3`);
              return true;
            }
          }
        }
      }

      this.log(`列制御チェック完了 - 継続`, 'success', `3-3`);
      return false;
    } catch (error) {
      this.log(`列制御チェックエラー: ${error.message}`, 'error', `3-3`);
      return false;
    }
  }

  /**
   * 最初のタスクありグループを特定
   * @param {Array} taskGroups - タスクグループリスト
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {number} グループインデックス（-1は見つからない）
   */
  findFirstTaskGroupIndex(taskGroups, spreadsheetData) {
    this.log('最初のタスクありグループを検索', 'info', '2-4');

    try {
      for (let i = 0; i < taskGroups.length; i++) {
        const group = taskGroups[i];

        // グループに未処理タスクがあるかチェック
        if (group && group.columnRange && group.columnRange.promptColumns) {
          // 簡易チェック: プロンプト列が存在すれば処理対象とする
          if (group.columnRange.promptColumns.length > 0) {
            this.log(`タスクありグループ発見: インデックス${i}`, 'success', '2-4');
            return i;
          }
        }
      }

      this.log('タスクありグループが見つかりません', 'warning', '2-4');
      return -1;
    } catch (error) {
      this.log(`グループ検索エラー: ${error.message}`, 'error', '2-4');
      return -1;
    }
  }

  /**
   * スプレッドシートデータの再読み込み
   * @param {Object} spreadsheetData - スプレッドシートデータ
   */
  async reloadSpreadsheetData(spreadsheetData) {
    this.log('スプレッドシートデータを再読み込み', 'info', '3-7');

    try {
      if (this.sheetsClient && this.sheetsClient.reloadData) {
        await this.sheetsClient.reloadData();
        this.log('スプレッドシートデータ再読み込み完了', 'success', '3-7');
      } else {
        this.log('SheetsClientが未初期化 - 再読み込みスキップ', 'warning', '3-7');
      }
    } catch (error) {
      this.log(`データ再読み込みエラー: ${error.message}`, 'error', '3-7');
    }
  }

  /**
   * 行処理判定（プレースホルダー実装）
   */
  shouldProcessRow(rowIndex) {
    return rowIndex >= 9; // 通常9行目から開始
  }

  /**
   * 列処理判定 - タスクグループの列制御チェック
   */
  shouldProcessColumn(promptGroup, columnControls) {
    // パラメータがない場合は処理対象とする
    if (!promptGroup || !columnControls) {
      return true;
    }

    // promptGroupがオブジェクトでない場合（後方互換性）
    if (typeof promptGroup === 'number') {
      return promptGroup >= 0;
    }

    // プロンプト列とアンサー列の制御チェック
    const { promptColumns, answerColumns } = promptGroup;

    // プロンプト列の制御チェック
    if (promptColumns && promptColumns.length > 0) {
      for (const col of promptColumns) {
        const colIndex = typeof col === 'string' ? this.columnToIndex(col) : col;
        if (colIndex >= 0) {
          return true; // 有効な列が1つでもあれば処理対象
        }
      }
    }

    // アンサー列の制御チェック
    if (answerColumns && answerColumns.length > 0) {
      for (const col of answerColumns) {
        const colIndex = typeof col === 'string' ? this.columnToIndex(col) : col;
        if (colIndex >= 0) {
          return true; // 有効な列が1つでもあれば処理対象
        }
      }
    }

    return false; // 有効な列がない場合はスキップ
  }

  /**
   * 行制御取得（プレースホルダー実装）
   */
  getRowControl(rowIndex) {
    return null; // 実装時に制御ロジックを追加
  }

  /**
   * 列制御取得（プレースホルダー実装）
   */
  getColumnControl(columnIndex) {
    return null; // 実装時に制御ロジックを追加
  }

  /**
   * プロンプト行スキャン - 既読み込み済みデータからプロンプトがある行を検出
   */
  scanPromptRows(promptColumns, spreadsheetData) {
    this.log(`🔍 scanPromptRows が呼ばれました: ${JSON.stringify(promptColumns)}`, 'info', '3-4-4');

    if (!promptColumns || !Array.isArray(promptColumns)) {
      this.log(`無効なプロンプト列指定`, 'warn', '3-4-4');
      return [];
    }

    if (!spreadsheetData?.values) {
      this.log(`無効なスプレッドシートデータ`, 'warn', '3-4-4');
      return [];
    }

    const promptRows = [];
    const values = spreadsheetData.values;

    try {
      // 各プロンプト列をスキャン
      for (const col of promptColumns) {
        const colIndex = typeof col === 'string' ? this.columnToIndex(col) : col;
        if (colIndex < 0) continue;

        const columnLetter = this.indexToColumn(colIndex);
        this.log(`${columnLetter}列をスキャン中...`, 'info', '3-4-4');

        // 作業行の範囲でプロンプト列をチェック（行9以降から検索、0ベース）
        const startRow = 8; // 0ベース（9行目）
        const endRow = Math.min(values.length, 600); // データ範囲まで

        for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
          const row = values[rowIndex];
          if (!row || !Array.isArray(row)) continue;

          const cellValue = row[colIndex];
          if (cellValue && typeof cellValue === 'string' && cellValue.trim().length > 0) {
            // プロンプトが見つかった行を記録
            if (!promptRows.includes(rowIndex)) {
              promptRows.push(rowIndex);
              this.log(`${columnLetter}${rowIndex + 1}でプロンプト発見: "${cellValue.substring(0, 50)}..."`, 'info', '3-4-4');
            }
          }
        }
      }

      this.log(`スキャン完了 - ${promptRows.length}行のプロンプトを発見`, 'success', '3-4-4');
      return promptRows.sort((a, b) => a - b);

    } catch (error) {
      this.log(`scanPromptRows エラー: ${error.message}`, 'error', '3-4-4');
      return [];
    }
  }

  /**
   * 追加行読み込み（プレースホルダー実装）
   */
  async loadAdditionalRows(currentRows) {
    return currentRows; // 実装時に追加読み込みロジックを追加
  }
}