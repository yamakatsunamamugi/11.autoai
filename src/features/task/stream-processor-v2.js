/**
 * @fileoverview StreamProcessor V2 - 動的タスクグループ処理システム
 *
 * 【ステップ構成】
 * Step 0: 初期化・コンストラクタ - システムの基本設定とサービス初期化
 * Step 1: SpreadsheetLogger初期化 - スプレッドシートへのログ出力機能の準備
 * Step 2: メインエントリーポイント - スリープ防止とデータ検証を行う処理の開始点
 * Step 3: V3グループ順次処理 - 動的にタスクグループを解析し依存関係に従って実行
 * Step 4: 制御系メソッド - 行制御・列制御による処理範囲の制限機能
 * Step 5: 構造解析系メソッド - スプレッドシートの構造を分析しタスクグループを生成
 * Step 6: タスク生成・整理 - プロンプトと回答列からタスクを動的に生成
 * Step 7: 特殊グループ処理 - レポート化やGensparkなど特別な処理を実行
 * Step 8: 標準タスク実行 - 通常のAIタスクを列ごと・バッチごとに処理
 * Step 9: 特殊タスク実行 - ChatGPT/Claude/Geminiの3種類AIを並列実行
 * Step 10: リトライ・エラー処理 - 失敗したタスクの自動リトライとエラー管理
 * Step 11: ユーティリティ・ヘルパー関数 - 共通で使用する補助関数群
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
  // Step 0: 初期化・コンストラクタ
  // システム全体の基本設定と各種サービスの初期化を行う
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
    // Step 0-1: 基本サービス初期化（最優先）
    // ========================================
    // 最初にloggerを設定（this.log()を使用するため）
    this.logger = logger;

    // ログ関数が使用可能になった後に初期化ログ出力
    this.log('StreamProcessorV2 初期化開始', 'step', 'Step 0');
    this.log('基本サービスを初期化', 'info', 'Step 0-1');
    this.aiTaskExecutor = new AITaskExecutor(logger);
    this.retryManager = new RetryManager(logger);

    // ========================================
    // Step 0-2: タスク生成・管理系初期化
    // ========================================
    this.log('タスク生成・管理系コンポーネントを初期化', 'info', 'Step 0-2');
    this.windowService = WindowService;
    this.completedTasks = new Set();

    // ========================================
    // Step 0-3: 排他制御システム初期化
    // ========================================
    this.log('排他制御システムを初期化', 'info', 'Step 0-3');
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
    // Step 0-4: 内部状態初期化
    // ========================================
    this.log('内部状態を初期化', 'info', 'Step 0-4');
    // TaskGroupScannerの機能は統合されたため、直接メソッドを使用

    // ========================================
    // Step 0-5: 設定・状態管理初期化
    // ========================================
    this.log('設定と状態管理を初期化', 'info', 'Step 0-5');
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

    this.log('StreamProcessorV2 初期化完了', 'success', 'Step 0');
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
  // Step 1: SpreadsheetLogger初期化
  // スプレッドシートへのログ出力機能を初期化し、
  // SheetsClientへの参照を取得する
  // ========================================
  /**
   * SpreadsheetLoggerの初期化
   *
   * スプレッドシートへのログ出力機能を初期化します。
   * Service Worker環境では動的インポートが制限されるため、
   * グローバルスペースから取得します。
   */
  async initializeSpreadsheetLogger() {
    this.log('SpreadsheetLogger初期化開始', 'step', 'Step 1');

    // Step 1-1: 既存インスタンスチェック
    if (this.spreadsheetLogger) {
      this.log('SpreadsheetLogger既に初期化済み', 'info', 'Step 1-1');
      return;
    }

    try {
      // Step 1-2: SpreadsheetLoggerクラス取得
      this.log('SpreadsheetLoggerクラスを取得', 'info', 'Step 1-2');
      const SpreadsheetLoggerClass = await getSpreadsheetLogger();

      if (SpreadsheetLoggerClass && this.spreadsheetUrl) {
        // Step 1-3: インスタンス作成
        this.log('SpreadsheetLoggerインスタンスを作成', 'info', 'Step 1-3');
        this.spreadsheetLogger = new SpreadsheetLoggerClass({
          spreadsheetUrl: this.spreadsheetUrl,
          logger: this.logger
        });

        // Step 1-4: SheetsClient参照取得
        if (this.spreadsheetLogger.sheetsClient) {
          this.sheetsClient = this.spreadsheetLogger.sheetsClient;
          this.log('SheetsClient参照取得完了', 'info', 'Step 1-4');
        }

        this.log('SpreadsheetLogger初期化完了', 'success', 'Step 1');
      } else {
        this.log('SpreadsheetLoggerClass または spreadsheetUrl が未設定', 'warning', 'Step 1');
      }
    } catch (error) {
      this.log(`SpreadsheetLogger初期化エラー: ${error.message}`, 'error', 'Step 1');
    }
  }

  // ========================================
  // Step 2: メインエントリーポイント
  // スリープ防止を開始し、データを検証してから
  // V3グループ順次処理を呼び出すメイン処理
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
    this.log('動的タスクグループ処理開始', 'step', 'Step 2');
    const startTime = Date.now();
    let totalCompleted = 0;
    let totalFailed = 0;

    // ========================================
    // Step 2-1: スリープ防止開始
    // ========================================
    this.log('スリープ防止を開始', 'info', 'Step 2-1');
    try {
      if (globalThis.powerManager) {
        await globalThis.powerManager.startProtection('stream-processor-dynamic');
        this.log('PowerManager保護開始', 'success', 'Step 2-1');
      }
    } catch (error) {
      this.log(`スリープ防止開始エラー: ${error.message}`, 'error', 'Step 2-1');
    }

    // ========================================
    // Step 2-2: データ保存・初期化
    // ========================================
    this.log('スプレッドシートデータを保存・初期化', 'info', 'Step 2-2');
    this.spreadsheetData = spreadsheetData;
    this.spreadsheetUrl = spreadsheetData?.spreadsheetUrl;

    // SpreadsheetLoggerを初期化
    await this.initializeSpreadsheetLogger();

    // ========================================
    // Step 2-3: タスクグループ検証
    // ========================================
    this.log('タスクグループを検証', 'info', 'Step 2-3');
    const taskGroups = options.taskGroups || [];

    if (!taskGroups || taskGroups.length === 0) {
      this.log('タスクグループが見つからない - 早期終了', 'warning', 'Step 2-3');
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

    this.log(`タスクグループ検証完了: ${taskGroups.length}グループ`, 'success', 'Step 2-3');

    // ========================================
    // Step 2-4: 最初のグループ特定
    // ========================================
    this.log('最初のタスクありグループを特定', 'info', 'Step 2-4');
    const firstTaskGroupIndex = this.findFirstTaskGroupIndex(taskGroups, spreadsheetData);

    if (firstTaskGroupIndex === -1) {
      this.log('処理対象グループなし - 正常終了', 'info', 'Step 2-4');
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

    this.log(`処理開始インデックス: ${firstTaskGroupIndex}`, 'success', 'Step 2-4');

    // ========================================
    // Step 2-5: グループ処理実行
    // ========================================
    this.log('V3グループ順次処理を実行', 'info', 'Step 2-5');
    try {
      const result = await this.processGroupsSequentiallyV3(spreadsheetData, options.testMode);
      totalCompleted = result.completed || 0;
      totalFailed = result.failed || 0;
      this.log(`グループ処理完了: 成功${totalCompleted}件, 失敗${totalFailed}件`, 'success', 'Step 2-5');
    } catch (error) {
      this.log(`グループ処理エラー: ${error.message}`, 'error', 'Step 2-5');
      totalFailed++;
    }

    // ========================================
    // Step 2-6: クリーンアップ・結果返却
    // ========================================
    this.log('クリーンアップと結果返却', 'info', 'Step 2-6');
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

    this.log(`動的タスクグループ処理完了 (${totalTime})`, 'success', 'Step 2');
    return result;
  }

  // ========================================
  // Step 3: V3グループ順次処理
  // 動的にタスクグループを解析し、依存関係に従って
  // 順番にグループを処理していくメインループ
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
    this.log('V3グループ順次処理開始（動的タスク生成モード）', 'step', 'Step 3');

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

      // データサイズを確認
      if (groupIndex === 0) {
        console.log(`[DEBUG] StreamProcessor: spreadsheetData.values.length=${spreadsheetData.values ? spreadsheetData.values.length : 'undefined'}`);
        if (spreadsheetData.values) {
          const nonEmptyRows = spreadsheetData.values.filter(row => row && row.some(cell => cell)).length;
          console.log(`[DEBUG] StreamProcessor: 非空行数=${nonEmptyRows}`);
        }
      }

      const structure = this.analyzeStructure(spreadsheetData);
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
      const tasks = await this.scanGroupTasks(spreadsheetData, promptCols, answerCols, promptGroup);

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
  // Step 7: 特殊グループ処理
  // レポート化やGenspark（スライド/ファクトチェック）など
  // 特別な処理が必要なグループを専用ロジックで処理
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
  // Step 6: タスク生成・整理
  // プロンプトと回答列から動的にタスクを生成し、
  // バッチ処理用に整理・グループ化する
  // ========================================

  /**
   * タスクグループをスキャンして処理対象を見つける
   * ステップ5-1: タスクグループスキャン
   *
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} promptCols - プロンプト列のインデックス配列
   * @param {Array} answerCols - 回答列のインデックス配列
   * @param {Object} promptGroup - プロンプトグループ情報
   * @returns {Promise<Array>} 見つかったタスクの配列
   *
   * このメソッドは以下の処理を行います：
   * 1. プロンプトがある行を検出
   * 2. 回答がまだないセルを特定
   * 3. 排他制御を行いながらタスクを生成
   * 4. モデルと機能情報を適切に設定
   */
  async scanGroupTasks(spreadsheetData, promptCols, answerCols, promptGroup = {}) {
    this.log('タスクグループスキャン開始', 'info', 'Step 6-1');
    const tasks = [];
    const MAX_TASKS_PER_BATCH = 3; // バッチあたりの最大タスク数

    // ステップ5-1-1: パラメータ検証
    if (!spreadsheetData?.values || !Array.isArray(spreadsheetData.values)) {
      this.log('無効なスプレッドシートデータ', 'warn', 'Step 6-1');
      return tasks;
    }

    if (!promptCols || !Array.isArray(promptCols) || promptCols.length === 0) {
      this.log('無効なプロンプト列データ', 'warn', 'Step 6-1');
      return tasks;
    }

    if (!answerCols || !Array.isArray(answerCols) || answerCols.length === 0) {
      this.log('無効な回答列データ', 'warn', 'Step 6-1');
      return tasks;
    }

    // ステップ5-1-2: 制御情報取得
    let rowControls = this.getRowControl(spreadsheetData);
    const columnControls = this.getColumnControl(spreadsheetData);

    // 現在のグループ情報を作成（列制御チェック用）
    const currentGroup = {
      promptColumns: promptCols,
      answerColumns: answerCols
    };

    // 列制御チェック（グループ全体）
    if (!this.shouldProcessColumn(currentGroup, columnControls)) {
      this.log('このグループは列制御によりスキップ', 'info', 'Step 6-1');
      return tasks;
    }

    // ステップ5-1-3: プロンプト行の検出
    this.log('プロンプト行を検出中...', 'info', 'Step 6-1');
    const promptRows = this.scanPromptRows(promptCols, spreadsheetData);

    if (!promptRows || promptRows.length === 0) {
      this.log('プロンプトが見つかりません', 'warn', 'Step 6-1');
      return tasks;
    }

    const maxPromptRow = Math.max(...promptRows);
    this.log(`プロンプト発見: ${promptRows.length}行、最大行: ${maxPromptRow + 1}`, 'success', 'Step 6-1');

    // ステップ5-1-4: バッチで回答状態をチェック
    this.log(`バッチチェック開始: ${promptRows.length}行 × ${answerCols.length}列`, 'info', 'Step 6-1');
    const answerStatusMap = await this.batchCheckAnswers(spreadsheetData, promptRows, answerCols);

    // ステップ5-1-5: タスク生成
    const startRow = 8; // 0ベース（9行目）
    const endRow = Math.min(maxPromptRow + 1, spreadsheetData.values.length);

    // 処理対象行とスキップ行を収集
    const processedRows = [];
    const skippedRows = [];

    for (const rowIndex of promptRows) {
      // 最大タスク数に達したら終了
      if (tasks.length >= MAX_TASKS_PER_BATCH) {
        this.log(`最大タスク数(${MAX_TASKS_PER_BATCH})に達したため、スキャン終了`, 'info', 'Step 6-1');
        break;
      }

      // 範囲外チェック
      if (rowIndex < startRow || rowIndex >= endRow) continue;

      // 行制御チェック
      const rowNumber = rowIndex + 1;
      if (!this.shouldProcessRow(rowNumber, rowControls, true)) {
        skippedRows.push(rowNumber);
        continue;
      }
      processedRows.push(rowNumber);

      // 対応する回答列をチェック
      for (const answerColIndex of answerCols) {
        // 最大タスク数に達したら内側ループも終了
        if (tasks.length >= MAX_TASKS_PER_BATCH) {
          break;
        }

        // バッチチェック結果から回答状態を取得
        const answerStatusKey = `${rowIndex}-${answerColIndex}`;
        const answerStatus = answerStatusMap.get(answerStatusKey);

        let hasAnswer = false;
        if (answerStatus) {
          hasAnswer = answerStatus.hasAnswer;
        } else {
          // フォールバック：直接チェック
          const answerValue = spreadsheetData.values[rowIndex]?.[answerColIndex];
          hasAnswer = this.checkIfHasAnswer(answerValue);
        }

        // 処理済みセルチェック（重複処理防止）
        const cellKey = `${this.indexToColumn(answerColIndex)}${rowIndex + 1}`;
        if (this.processedAnswerCells.has(cellKey)) {
          continue;
        }

        if (!hasAnswer) {
          // プロンプトあり＆回答なし = タスクを生成
          const taskCell = `${this.indexToColumn(answerColIndex)}${rowIndex + 1}`;
          const taskId = `${taskCell}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // プロンプトを取得
          let prompt = '';
          try {
            const promptTexts = [];
            for (const promptColIndex of promptCols) {
              const promptValue = spreadsheetData.values[rowIndex]?.[promptColIndex];
              if (promptValue && typeof promptValue === 'string' && promptValue.trim()) {
                promptTexts.push(promptValue.trim());
              }
            }
            prompt = promptTexts.join('\n\n');
          } catch (error) {
            this.log(`プロンプト取得エラー ${taskCell}: ${error.message}`, 'warn', 'Step 6-1');
          }

          // モデルと機能を取得（重要：ここを修正）
          const answerColInfo = {
            index: answerColIndex,
            column: this.indexToColumn(answerColIndex),
            type: promptGroup.aiType || 'claude'
          };

          const model = this.getModel(spreadsheetData, answerColInfo, promptCols);
          const functionValue = this.getFunction(spreadsheetData, answerColInfo, promptCols);

          tasks.push({
            // 基本情報
            taskId: taskId,
            row: rowIndex + 1,
            column: this.indexToColumn(answerColIndex),
            columnIndex: answerColIndex,

            // AI情報（修正：適切なモデルと機能を設定）
            aiType: promptGroup.aiType || 'claude',
            model: model,  // getModelから取得した値
            function: functionValue,  // getFunctionから取得した値

            // プロンプト情報
            prompt: prompt,
            promptColumns: promptCols || [],

            // セル情報
            cellInfo: {
              row: rowIndex + 1,
              column: this.indexToColumn(answerColIndex),
              columnIndex: answerColIndex
            },

            // タスク設定
            taskType: 'ai',
            waitResponse: true,
            getResponse: true,
            createdAt: Date.now(),
            version: '2.0'
          });

          this.processedAnswerCells.add(taskCell);
        }
      }
    }

    // 処理対象行とスキップ行のサマリーログ
    if (processedRows.length > 0) {
      const displayRows = processedRows.length > 10
        ? `行${processedRows[0]}-${processedRows[processedRows.length - 1]}（${processedRows.length}行）`
        : `行${processedRows.join(', ')}`;
      this.log(`処理対象: ${displayRows}`, 'success', '3-4-5');
    }

    if (skippedRows.length > 0) {
      const displaySkipped = skippedRows.length > 10
        ? `行${skippedRows[0]}-${skippedRows[skippedRows.length - 1]}（${skippedRows.length}行）`
        : `行${skippedRows.join(', ')}`;
      this.log(`制御によりスキップ: ${displaySkipped}`, 'info', '3-4-5-4');
    }

    // ステップ5-1-6: 結果ログ
    this.log(`スキャン完了: ${tasks.length}件のタスクを生成`, 'success', 'Step 6-1');

    if (tasks.length > 0) {
      const taskRanges = tasks.map(t => `${t.column}${t.row}`).join(', ');
      this.log(`処理対象: ${taskRanges}`, 'info', 'Step 6-1');
    }

    return tasks;
  }

  /**
   * バッチで複数セルの回答状態をチェック
   * ステップ5-2: バッチ回答チェック
   *
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} promptRows - プロンプトがある行のインデックス配列
   * @param {Array} answerCols - 回答列のインデックス配列
   * @returns {Promise<Map>} セル位置 -> 回答状態のマップ
   *
   * Google Sheets APIを使用して、複数のセルを効率的にチェックします。
   * 100セルずつバッチ処理してAPI制限を回避します。
   */
  async batchCheckAnswers(spreadsheetData, promptRows, answerCols) {
    this.log('バッチ回答チェック開始', 'info', 'Step 6-2');
    const answerStatusMap = new Map();

    if (!globalThis.sheetsClient) {
      this.log('sheetsClientが利用できません', 'warn', 'Step 6-2');
      return answerStatusMap;
    }

    try {
      // ステップ5-2-1: バッチ取得する範囲を構築
      const ranges = [];
      const cellToRange = new Map();

      for (const rowIndex of promptRows) {
        for (const colIndex of answerCols) {
          const colLetter = this.indexToColumn(colIndex);
          const range = `${colLetter}${rowIndex + 1}`;
          ranges.push(range);
          cellToRange.set(range, { rowIndex, colIndex });
        }
      }

      if (ranges.length === 0) {
        return answerStatusMap;
      }

      // ステップ5-2-2: 100セルずつバッチ取得（API制限対策）
      const batchSize = 100;
      for (let i = 0; i < ranges.length; i += batchSize) {
        const batchRanges = ranges.slice(i, i + batchSize);

        try {
          const batchResult = await globalThis.sheetsClient.batchGetSheetData(
            spreadsheetData.spreadsheetId,
            batchRanges,
            spreadsheetData.sheetName
          );

          // ステップ5-2-3: 結果を解析
          if (batchResult) {
            batchRanges.forEach((range) => {
              const { rowIndex, colIndex } = cellToRange.get(range);
              const cellData = batchResult[range] || [];
              const value = cellData[0] || '';

              // 回答状態を判定
              const hasAnswer = this.checkIfHasAnswer(value);
              answerStatusMap.set(`${rowIndex}-${colIndex}`, {
                value,
                hasAnswer,
                rowIndex,
                colIndex
              });
            });
          }
        } catch (error) {
          this.log(`バッチ取得エラー: ${error.message}`, 'warn', 'Step 6-2');
        }
      }

      this.log(`${answerStatusMap.size}セルの状態をチェック完了`, 'success', 'Step 6-2');

    } catch (error) {
      this.log(`バッチチェックエラー: ${error.message}`, 'error', 'Step 6-2');
    }

    return answerStatusMap;
  }

  /**
   * セルの値が回答済みかチェック
   * ステップ5-3: 回答存在確認
   *
   * @param {string} value - チェックする値
   * @returns {boolean} 回答済みの場合true
   *
   * 以下の値は「未回答」として扱います：
   * - 空文字、null、undefined
   * - 'お待ちください...'、'現在操作中です'、'処理完了'などの特殊マーカー
   * - '現在操作中です_'で始まる排他制御マーカー（タイムアウト判定あり）
   */
  checkIfHasAnswer(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim();

    // 空文字は未回答
    if (!trimmed) {
      return false;
    }

    // 特定のマーカーは未回答とみなす
    const noAnswerMarkers = [
      'お待ちください...',
      '現在操作中です',
      '処理完了',
      'TODO',
      'PENDING',
      '-',
      'N/A',
      '未回答',
      '未処理',
      '処理中',
      'エラー',
      'ERROR'
    ];

    if (noAnswerMarkers.includes(trimmed)) {
      return false;
    }

    // 排他制御マーカーのチェック
    if (trimmed.startsWith('現在操作中です_')) {
      // タイムアウト判定が必要な場合はここで実装
      // 現在はシンプルに未回答扱い
      return false;
    }

    return true;
  }

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
  // Step 8: 標準タスク実行
  // 通常のAIタスクを列ごとに順次処理し、
  // 列内では3タスクずつバッチで並列実行
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
      const result = await this.aiTaskExecutor.executeAITask(windowInfo.tabId, task);

      // ウィンドウをクローズ
      await this.windowService.closeWindow(windowInfo.windowId);

      return result;

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] タスク処理エラー (${task.column}${task.row}):`, error);
      throw error;
    }
  }

  // ========================================
  // Step 9: 特殊タスク実行（3種類AI並列処理）
  // ChatGPT、Claude、Geminiの3つのAIを同時に使用し、
  // 同じプロンプトを並列で処理する特殊モード
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
    this.log('3種類AIグループ処理開始', 'step', 'Step 9');

    // ステップ7-1: 列並列処理の準備
    this.log('各列を並列処理用に準備', 'info', 'Step 9-1');
    const columnPromises = [];
    let position = 0;

    for (const [column, tasks] of columnGroups) {
      // ステップ7-2: 位置割り当て（最大3列）
      const columnPosition = position % 3;
      position++;

      this.log(`${column}列をポジション${columnPosition}で処理準備`, 'info', 'Step 9-2');
      columnPromises.push(
        this.processColumnFor3TypeAI(column, tasks, isTestMode, columnPosition)
      );
    }

    // ステップ7-3: 並列実行と待機
    this.log(`${columnPromises.length}列の並列処理を開始`, 'info', 'Step 9-3');
    await Promise.allSettled(columnPromises);

    this.log('3種類AIグループ処理完了', 'success', 'Step 9');
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
    this.log(`${column}列の3種類AI処理開始 (${tasks.length}タスク)`, 'info', 'Step 9-4');

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
  // Step 10: リトライ・エラー処理
  // 失敗したタスクの自動リトライやエラー情報の記録、
  // グループ完了後のリトライロジックを管理
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
      // TODO: waitForClearanceメソッドが実装されていないため一時的にコメントアウト

      // 失敗タスクを収集（RetryManagerのデータ構造から直接取得）
      const failedTasks = this.retryManager.groupFailedTasks.get(groupId) || new Map();
      const emptyTasks = this.retryManager.groupEmptyTasks.get(groupId) || new Map();
      const responseFailed = this.retryManager.groupResponseFailures.get(groupId) || new Map();

      // 全ての失敗タスク数をカウント
      let totalFailedCount = 0;
      for (const [, tasks] of failedTasks) totalFailedCount += tasks.size;
      for (const [, tasks] of emptyTasks) totalFailedCount += tasks.size;
      for (const [, tasks] of responseFailed) totalFailedCount += tasks.size;

      if (totalFailedCount === 0) {
        this.logger.log(`[StreamProcessorV2] ${groupName}: リトライ対象なし`);
        return { shouldStopProcessing: false };
      }

      // リトライ実行
      this.logger.log(`[StreamProcessorV2] ${groupName}: ${totalFailedCount}件をリトライ`);

      // 各カテゴリのタスクをリトライ実行
      for (const [column, tasks] of failedTasks) {
        const taskArray = Array.from(tasks);
        if (taskArray.length > 0) {
          await processFunc(column, taskArray);
        }
      }
      for (const [column, tasks] of emptyTasks) {
        const taskArray = Array.from(tasks);
        if (taskArray.length > 0) {
          await processFunc(column, taskArray);
        }
      }
      for (const [column, tasks] of responseFailed) {
        const taskArray = Array.from(tasks);
        if (taskArray.length > 0) {
          await processFunc(column, taskArray);
        }
      }

      // 完了チェック（同様にデータ構造を直接参照）
      const stillFailedTasks = this.retryManager.groupFailedTasks.get(groupId) || new Map();
      const stillEmptyTasks = this.retryManager.groupEmptyTasks.get(groupId) || new Map();
      const stillResponseFailed = this.retryManager.groupResponseFailures.get(groupId) || new Map();

      // 残った失敗タスク数をカウント
      let stillFailedCount = 0;
      for (const [, tasks] of stillFailedTasks) stillFailedCount += tasks.size;
      for (const [, tasks] of stillEmptyTasks) stillFailedCount += tasks.size;
      for (const [, tasks] of stillResponseFailed) stillFailedCount += tasks.size;

      if (stillFailedCount > 0) {
        this.logger.error(`[StreamProcessorV2] ${groupName}: ${stillFailedCount}件が依然として失敗`);
        return { shouldStopProcessing: true };
      }

      return { shouldStopProcessing: false };

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] リトライ処理エラー:`, error);
      return { shouldStopProcessing: true };
    }
  }

  // ========================================
  // Step 11: ユーティリティ・ヘルパー関数
  // 全体で共通して使用する補助関数群
  // 文字列変換、数値計算、データ処理等のユーティリティ
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
   * @param {number} position - ウィンドウ位置（0=左上, 1=右上, 2=左下）
   * @returns {Promise<Object>} ウィンドウ情報
   */
  async createWindowForTask(task, position = 0) {
    const url = aiUrlManager.getUrl(task.aiType);

    // WindowServiceのcreateWindowWithPositionを使用（Claudeと同じ方式）
    const window = await WindowService.createWindowWithPosition(url, position, {
      type: 'popup',
      aiType: task.aiType
    });

    return {
      ...window,
      tabId: window.tabs && window.tabs.length > 0 ? window.tabs[0].id : null,
      windowId: window.id
    };
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
   * Step 4-5: 列制御による停止判定
   * @param {Object} controls - 制御情報
   * @param {number} groupIndex - グループインデックス
   * @param {Object} promptGroup - プロンプトグループ
   * @returns {boolean} 停止すべきかどうか
   */
  async checkColumnControl(controls, groupIndex, promptGroup) {
    this.log(`グループ${groupIndex + 1}の列制御をチェック`, 'info', 'Step 4-5');

    try {
      // 列制御の「この列で停止」チェック
      if (controls && controls.column) {
        for (const control of controls.column) {
          if (control.action === 'stop' && control.targetColumn) {
            const targetColumn = this.columnToIndex(control.targetColumn);
            if (promptGroup.promptColumns.includes(targetColumn)) {
              this.log(`列制御により停止: ${control.targetColumn}列`, 'warning', 'Step 4-5');
              return true;
            }
          }
        }
      }

      this.log(`列制御チェック完了 - 継続`, 'success', 'Step 4-5');
      return false;
    } catch (error) {
      this.log(`列制御チェックエラー: ${error.message}`, 'error', 'Step 4-5');
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
    this.log('最初のタスクありグループを検索', 'info', 'Step 2-4');

    try {
      for (let i = 0; i < taskGroups.length; i++) {
        const group = taskGroups[i];

        // グループに未処理タスクがあるかチェック
        if (group && group.columnRange && group.columnRange.promptColumns) {
          // 簡易チェック: プロンプト列が存在すれば処理対象とする
          if (group.columnRange.promptColumns.length > 0) {
            this.log(`タスクありグループ発見: インデックス${i}`, 'success', 'Step 2-4');
            return i;
          }
        }
      }

      this.log('タスクありグループが見つかりません', 'warning', 'Step 2-4');
      return -1;
    } catch (error) {
      this.log(`グループ検索エラー: ${error.message}`, 'error', 'Step 2-4');
      return -1;
    }
  }

  /**
   * スプレッドシートデータの再読み込み
   * @param {Object} spreadsheetData - スプレッドシートデータ
   */
  async reloadSpreadsheetData(spreadsheetData) {
    this.log('スプレッドシートデータを再読み込み', 'info', 'Step 3-7');

    try {
      if (this.sheetsClient && this.sheetsClient.reloadData) {
        await this.sheetsClient.reloadData();
        this.log('スプレッドシートデータ再読み込み完了', 'success', 'Step 3-7');
      } else {
        this.log('SheetsClientが未初期化 - 再読み込みスキップ', 'warning', 'Step 3-7');
      }
    } catch (error) {
      this.log(`データ再読み込みエラー: ${error.message}`, 'error', '3-7');
    }
  }

  // ========================================
  // Step 4: 制御系メソッド（行制御・列制御）
  // スプレッドシート内の制御指示に基づいて
  // 処理範囲を制限・調整する機能群
  // ========================================

  /**
   * 行処理判定 - 行制御に基づいて処理対象かチェック
   * Step 4-1: 行制御による処理対象判定
   */
  shouldProcessRow(rowNumber, rowControls, silent = false) {
    // Step 4-1-1: 行制御がない場合は全て処理
    if (!rowControls || rowControls.length === 0) {
      if (!silent) this.log(`行制御なし - 行${rowNumber}を処理対象とする`, 'info', 'Step 4-1-1');
      return true;
    }

    // Step 4-1-2: "この行のみ処理"が優先
    const onlyControls = rowControls.filter(c => c.type === 'only');
    if (onlyControls.length > 0) {
      const shouldProcess = onlyControls.some(c => c.row === rowNumber);
      if (!silent) this.log(`"この行のみ処理"制御: 行${rowNumber} = ${shouldProcess}`, 'info', '3-4-5-2');
      return shouldProcess;
    }

    // Step 4-1-3: "この行から処理"チェック
    const fromControl = rowControls.find(c => c.type === 'from');
    if (fromControl) {
      if (rowNumber < fromControl.row) {
        if (!silent) this.log(`"この行から処理"制御: 行${rowNumber} < ${fromControl.row} = スキップ`, 'info', '3-4-5-3');
        return false;
      }
    }

    // Step 4-1-4: "この行で停止"チェック
    const untilControl = rowControls.find(c => c.type === 'until');
    if (untilControl) {
      if (rowNumber > untilControl.row) {
        if (!silent) this.log(`"この行で停止"制御: 行${rowNumber} > ${untilControl.row} = スキップ`, 'info', '3-4-5-4');
        return false;
      }
    }

    if (!silent) this.log(`行${rowNumber}は処理対象`, 'success', '3-4-5');
    return true;
  }

  /**
   * 列処理判定 - タスクグループの列制御チェック
   * Step 4-2: 列制御による処理対象判定
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
   * 行制御取得 - スプレッドシートのB列から行制御を解析
   * Step 4-3: 行制御情報の取得
   */
  getRowControl(data) {
    this.log('行制御を取得中...', 'info', 'Step 4-3');
    const controls = [];

    if (!data || !data.values) {
      this.log('データなし - 行制御なし', 'warn', 'Step 4-3-1');
      return controls;
    }

    // Step 4-3-1: B列で制御文字列を探す
    for (let i = 0; i < data.values.length; i++) {
      const row = data.values[i];
      if (!row) continue;

      const cellB = row[1]; // B列
      if (cellB && typeof cellB === 'string') {
        // Step 4-3-2: "この行から処理"チェック
        if (cellB.includes('この行から処理')) {
          controls.push({ type: 'from', row: i + 1 });
          this.log(`行制御検出: "この行から処理" at 行${i + 1}`, 'success', 'Step 4-3-2');
        }
        // Step 4-3-3: "この行で停止"チェック
        else if (cellB.includes('この行で停止') || cellB.includes('この行の処理後に停止')) {
          controls.push({ type: 'until', row: i + 1 });
          this.log(`行制御検出: "この行で停止" at 行${i + 1}`, 'success', 'Step 4-3-3');
        }
        // Step 4-3-4: "この行のみ処理"チェック
        else if (cellB.includes('この行のみ処理')) {
          controls.push({ type: 'only', row: i + 1 });
          this.log(`行制御検出: "この行のみ処理" at 行${i + 1}`, 'success', 'Step 4-3-4');
        }
      }
    }

    if (controls.length > 0) {
      this.log(`行制御検出結果: ${controls.length}件`, 'success', 'Step 4-3');
      controls.forEach(c => {
        this.log(`  - ${c.type}: 行${c.row}`, 'info', 'Step 4-3');
      });
    } else {
      this.log('行制御なし', 'info', 'Step 4-3');
    }

    return controls;
  }

  /**
   * 列制御取得 - スプレッドシートから列制御を解析
   * Step 4-4: 列制御情報の取得
   */
  getColumnControl(data) {
    this.log('列制御を取得中...', 'info', 'Step 4-4');
    const controls = [];

    if (!data || !data.values) {
      this.log('データなし - 列制御なし', 'warn', 'Step 4-4-1');
      return controls;
    }

    // Step 4-4-1: 制御行1-10で制御文字列を探す
    for (let i = 0; i < Math.min(10, data.values.length); i++) {
      const row = data.values[i];
      if (!row) continue;

      for (let j = 0; j < row.length; j++) {
        const cell = row[j];
        if (cell && typeof cell === 'string') {
          const column = this.indexToColumn(j);

          // Step 4-4-2: "この列から処理"チェック
          if (cell.includes('この列から処理')) {
            controls.push({ type: 'from', column, index: j });
            this.log(`列制御検出: "この列から処理" at ${column}列`, 'success', 'Step 4-4-2');
          }
          // Step 4-4-3: "この列で停止"チェック
          else if (cell.includes('この列で停止') || cell.includes('この列の処理後に停止')) {
            controls.push({ type: 'until', column, index: j });
            this.log(`列制御検出: "この列で停止" at ${column}列`, 'success', 'Step 4-4-3');
          }
          // Step 4-4-4: "この列のみ処理"チェック
          else if (cell.includes('この列のみ処理')) {
            controls.push({ type: 'only', column, index: j });
            this.log(`列制御検出: "この列のみ処理" at ${column}列`, 'success', 'Step 4-4-4');
          }
        }
      }
    }

    if (controls.length > 0) {
      this.log(`列制御検出結果: ${controls.length}件`, 'success', 'Step 4-4');
    } else {
      this.log('列制御なし', 'info', 'Step 4-4');
    }

    return controls;
  }

  /**
   * ========================================
   * Step 5: 構造解析系メソッド
   * スプレッドシートの構造を分析し、AI列、タスクグループ、
   * プロンプトグループ等を識別してデータ構造を作成
   * ========================================
   */

  /**
   * スプレッドシート構造を解析（processSpreadsheetData統合版）
   * Step 5: メイン構造解析
   *
   * background.jsのprocessSpreadsheetData機能を統合:
   * - AI列の検出
   * - 列マッピングの作成
   * - タスクグループの生成
   * - 特殊グループ（レポート化、Genspark）の検出
   */
  analyzeStructure(data) {
    this.log('スプレッドシート構造を解析中...', 'info', 'Step 5');

    const rows = {
      menu: null,
      ai: null,
      model: null,
      function: null
    };

    // Step 5-1: 制御行を検索
    for (let i = 0; i < Math.min(10, data.values.length); i++) {
      const firstCell = data.values[i][0];
      if (!firstCell) continue;

      const cellValue = String(firstCell).toLowerCase();

      if (cellValue.includes('メニュー')) {
        rows.menu = i;
        this.log(`メニュー行検出: 行${i + 1}`, 'info', 'Step 5-1');
      } else if (cellValue === 'ai') {
        rows.ai = i;
        this.log(`AI行検出: 行${i + 1}`, 'info', 'Step 5-1');
      } else if (cellValue === 'モデル' || cellValue === 'model') {
        rows.model = i;
        this.log(`モデル行検出: 行${i + 1}`, 'info', 'Step 5-1');
      } else if (cellValue === '機能' || cellValue === 'function') {
        rows.function = i;
        this.log(`機能行検出: 行${i + 1}`, 'info', 'Step 5-1');
      }
    }

    // Step 5-2: AI列情報を収集
    const aiColumns = this.detectAIColumns(data, rows);
    this.log(`AI列: ${Object.keys(aiColumns).length}列検出`, 'success', 'Step 5-2');

    // Step 5-3: 列マッピングを作成
    const columnMapping = this.createColumnMapping(data, rows);
    this.log(`列マッピング: ${Object.keys(columnMapping).length}個作成`, 'success', 'Step 5-3');

    // Step 5-4: タスクグループを生成（processSpreadsheetData互換）
    const taskGroups = this.generateTaskGroups(data, rows, aiColumns);
    this.log(`タスクグループ: ${taskGroups.length}個生成`, 'success', 'Step 5-4');

    // Step 5-5: プロンプトグループを特定（従来のロジック）
    const promptGroups = this.identifyPromptGroups(data, rows);
    this.log(`プロンプトグループ: ${promptGroups.length}個検出`, 'success', 'Step 5-5');

    // Step 5-6: 制御情報を取得
    const controls = {
      row: this.getRowControl(data),
      column: this.getColumnControl(data)
    };

    // Step 5-7: 作業行を特定
    const workRows = this.identifyWorkRows(data, rows);
    this.log(`作業行: ${workRows.length}行検出`, 'success', 'Step 5-7');

    // processSpreadsheetData互換のために追加フィールドを含める
    return {
      rows,
      promptGroups,
      controls,
      workRows,
      aiColumns,       // processSpreadsheetData互換
      columnMapping,   // processSpreadsheetData互換
      taskGroups,      // processSpreadsheetData互換
      ...data          // 元のデータも保持
    };
  }

  /**
   * processSpreadsheetData互換メソッド
   * background.jsからの移行を容易にするためのラッパー
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Object} processSpreadsheetData互換の結果
   */
  processSpreadsheetData(spreadsheetData) {
    this.log('processSpreadsheetDataラッパー実行', 'info', 'Step 5');

    // analyzeStructureを呼び出して結果を返す
    const result = this.analyzeStructure(spreadsheetData);

    // background.jsのprocessSpreadsheetDataと同じ形式で返す
    return {
      ...spreadsheetData,
      ...result,
      aiColumns: result.aiColumns || {},
      columnMapping: result.columnMapping || {},
      taskGroups: result.taskGroups || []
    };
  }

  /**
   * AI列情報を検出
   * Step 5-2: AI列の検出と情報収集
   */
  detectAIColumns(data, rows) {
    this.log('AI列情報を検出中...', 'info', 'Step 5-2');
    const aiColumns = {};

    if (!rows.menu || !data.values[rows.menu]) {
      return aiColumns;
    }

    const menuRow = data.values[rows.menu];
    const aiRow = rows.ai ? data.values[rows.ai] : [];
    const detectedAIColumns = []; // AI列情報を収集

    menuRow.forEach((header, index) => {
      const columnLetter = this.indexToColumn(index);
      const trimmedHeader = header ? header.trim() : '';
      const aiValue = aiRow[index] ? aiRow[index].trim() : '';

      // AI関連列を検出
      if (trimmedHeader.includes('回答') || trimmedHeader.includes('答') ||
          trimmedHeader.includes('ChatGPT') || trimmedHeader.includes('Claude') ||
          trimmedHeader.includes('Gemini') || trimmedHeader.includes('Genspark')) {

        let aiType = 'Claude'; // デフォルト

        // AIタイプを判定
        const headerLower = trimmedHeader.toLowerCase();
        if (headerLower.includes('chatgpt') || headerLower.includes('gpt')) {
          aiType = 'ChatGPT';
        } else if (headerLower.includes('claude')) {
          aiType = 'Claude';
        } else if (headerLower.includes('gemini')) {
          aiType = 'Gemini';
        } else if (headerLower.includes('genspark')) {
          aiType = 'Genspark';
        } else if (aiValue) {
          // AI行の値から判定
          aiType = aiValue;
        }

        aiColumns[columnLetter] = {
          index,
          header: trimmedHeader,
          aiType,
          aiValue
        };

        detectedAIColumns.push(`${columnLetter}(${aiType})`);
      }
    });

    // AI列検出のサマリーログ
    if (detectedAIColumns.length > 0) {
      this.log(`AI列検出: ${detectedAIColumns.join(', ')}`, 'info', 'Step 5-2');
    }

    return aiColumns;
  }

  /**
   * 列マッピングを作成
   * Step 5-3: 列情報のマッピング作成
   */
  createColumnMapping(data, rows) {
    this.log('列マッピングを作成中...', 'info', 'Step 5-3');
    const columnMapping = {};

    if (!rows.menu || !data.values[rows.menu]) {
      return columnMapping;
    }

    const menuRow = data.values[rows.menu];

    menuRow.forEach((header, index) => {
      const columnLetter = this.indexToColumn(index);
      const trimmedHeader = header ? header.trim() : '';

      columnMapping[columnLetter] = {
        index,
        header: trimmedHeader,
        type: this.determineColumnType(trimmedHeader)
      };
    });

    return columnMapping;
  }

  /**
   * 列タイプを判定
   */
  determineColumnType(header) {
    if (!header) return 'unknown';

    const h = header.toLowerCase();
    if (h.includes('プロンプト')) return 'prompt';
    if (h.includes('回答') || h.includes('答')) return 'answer';
    if (h.includes('ログ')) return 'log';
    if (h.includes('レポート')) return 'report';
    if (h.includes('genspark')) return 'genspark';
    return 'other';
  }

  /**
   * タスクグループを生成（processSpreadsheetData互換）
   * Step 5-4: タスクグループの生成
   */
  generateTaskGroups(data, rows, aiColumns) {
    this.log('タスクグループを生成中...', 'info', 'Step 5-4');
    const taskGroups = [];
    let currentGroup = null;
    let groupCounter = 1;

    if (!rows.menu || !data.values[rows.menu]) {
      return taskGroups;
    }

    const menuRow = data.values[rows.menu];
    const aiRow = rows.ai ? data.values[rows.ai] : [];

    menuRow.forEach((header, index) => {
      const columnLetter = this.indexToColumn(index);
      const trimmedHeader = header ? header.trim() : '';
      const aiValue = aiRow[index] ? aiRow[index].trim() : '';

      // ログ列の検出（常に新しいグループを開始）
      if (trimmedHeader === 'ログ') {
        // 前のグループがあれば完了させる
        if (currentGroup && currentGroup.columnRange.answerColumns.length > 0) {
          taskGroups.push(currentGroup);
          groupCounter++;
        }

        // 新しいグループを開始
        currentGroup = {
          id: `group_${groupCounter}`,
          name: `タスクグループ${groupCounter}`,
          startColumn: columnLetter,
          endColumn: columnLetter,
          columnRange: {
            logColumn: columnLetter,
            promptColumns: [],
            answerColumns: []
          },
          groupType: 'single',
          aiType: 'Claude',
          dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
          sequenceOrder: groupCounter
        };
      }

      // 特殊グループの検出（レポート化、Genspark）
      if (trimmedHeader === 'レポート化' ||
          trimmedHeader.includes('Genspark（スライド）') ||
          trimmedHeader.includes('Genspark（ファクトチェック）')) {

        // 前のグループがあれば完了させる
        if (currentGroup) {
          if (currentGroup.columnRange.answerColumns.length > 0 ||
              ['report', 'genspark_slide', 'genspark_factcheck'].includes(currentGroup.groupType)) {
            taskGroups.push(currentGroup);
            groupCounter++;
          }
        }

        // 特殊グループを作成
        const specialGroup = {
          id: `group_${groupCounter}`,
          name: `タスクグループ${groupCounter}`,
          startColumn: columnLetter,
          endColumn: columnLetter,
          columnRange: {
            logColumn: null,
            promptColumns: [columnLetter],
            answerColumns: []
          },
          groupType: this.determineGroupType(trimmedHeader),
          aiType: this.determineAIType(trimmedHeader),
          dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
          sequenceOrder: groupCounter,
          isSpecialGroup: true
        };

        taskGroups.push(specialGroup);
        groupCounter++;
        currentGroup = null;

        this.log(`特殊グループ検出: ${trimmedHeader} (${columnLetter}列)`, 'info', 'Step 5-4');
      }

      // プロンプト列の検出
      if (trimmedHeader.includes('プロンプト')) {
        // 前のグループが完成していれば新しいグループを開始
        if (currentGroup && currentGroup.columnRange.promptColumns.length > 0 &&
            currentGroup.columnRange.answerColumns.length > 0) {
          taskGroups.push(currentGroup);
          groupCounter++;
          currentGroup = null;
        }

        // 現在のグループがない場合、新しいグループを開始
        if (!currentGroup) {
          currentGroup = {
            id: `group_${groupCounter}`,
            name: `タスクグループ${groupCounter}`,
            startColumn: columnLetter,
            endColumn: columnLetter,
            columnRange: {
              logColumn: null,
              promptColumns: [columnLetter],
              answerColumns: []
            },
            groupType: 'single',
            aiType: 'Claude',
            dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
            sequenceOrder: groupCounter
          };
        } else {
          // 既存のグループにプロンプト列を追加
          currentGroup.columnRange.promptColumns.push(columnLetter);
        }

        // AI行の値からグループタイプを判定
        if (aiValue.includes('3種類')) {
          currentGroup.groupType = '3type';
          currentGroup.aiType = aiValue;
        } else if (aiValue) {
          currentGroup.groupType = 'single';
          currentGroup.aiType = aiValue;
        }
      }

      // 回答列の検出
      if (currentGroup && (trimmedHeader.includes('回答') || trimmedHeader.includes('答'))) {
        currentGroup.columnRange.answerColumns.push({
          column: columnLetter,
          index: index,
          aiType: this.detectAITypeFromHeader(trimmedHeader, currentGroup.groupType)
        });
        currentGroup.endColumn = columnLetter;
      }
    });

    // 最後のグループを追加
    if (currentGroup && currentGroup.columnRange.answerColumns.length > 0) {
      taskGroups.push(currentGroup);
    }

    return taskGroups;
  }

  /**
   * グループタイプを判定
   */
  determineGroupType(header) {
    if (header.includes('レポート化')) return 'report';
    if (header.includes('Genspark（スライド）')) return 'genspark_slide';
    if (header.includes('Genspark（ファクトチェック）')) return 'genspark_factcheck';
    return 'single';
  }

  /**
   * AIタイプを判定
   */
  determineAIType(header) {
    const h = header.toLowerCase();
    if (h.includes('genspark')) {
      if (h.includes('スライド')) return 'Genspark-Slides';
      if (h.includes('ファクトチェック')) return 'Genspark-FactCheck';
      return 'Genspark';
    }
    if (h.includes('レポート')) return 'Report';
    return 'Claude';
  }

  /**
   * ヘッダーからAIタイプを検出
   */
  detectAITypeFromHeader(header, groupType) {
    if (groupType === '3type') {
      const h = header.toLowerCase();
      if (h.includes('chatgpt') || h.includes('gpt')) return 'ChatGPT';
      if (h.includes('claude')) return 'Claude';
      if (h.includes('gemini')) return 'Gemini';
      if (h.includes('genspark')) return 'Genspark';
    }
    return 'Claude';
  }

  /**
   * プロンプトグループを特定
   * Step 5-5: プロンプトグループ識別（従来ロジック）
   */
  identifyPromptGroups(data, rows) {
    this.log('プロンプトグループを識別中...', 'info', 'Step 5-5');

    // processSpreadsheetData()で生成されたtaskGroups情報があればそれを使用
    if (data.taskGroups && data.taskGroups.length > 0) {
      this.log('taskGroups情報を使用してプロンプトグループを構築', 'info', 'Step 5-5');
      return this.convertTaskGroupsToPromptGroups(data.taskGroups);
    }

    // フォールバック: 従来のロジックで解析
    this.log('taskGroups情報がないため、従来のロジックで觢析', 'info', 'Step 5-5');
    const groups = [];

    if (!rows.menu || !rows.ai) {
      return groups;
    }

    const menuRow = data.values[rows.menu];
    const aiRow = data.values[rows.ai];

    // 構造解析のデバッグログ（簡潔版）
    const menuNonEmpty = menuRow.filter(cell => cell && cell.trim()).length;
    const aiNonEmpty = aiRow.filter(cell => cell && cell.trim()).length;
    this.log(`構造解析: メニュー行${menuNonEmpty}列, AI行${aiNonEmpty}列`, 'info', '3-5-1');

    let currentGroup = null;

    for (let i = 0; i < menuRow.length; i++) {
      const menuCell = menuRow[i];
      const aiCell = aiRow[i];

      // プロンプト列を検出
      if (menuCell && menuCell.includes('プロンプト')) {
        if (!currentGroup) {
          currentGroup = {
            promptColumns: [],
            answerColumns: [],
            aiType: aiCell || 'Claude'
          };
        }
        currentGroup.promptColumns.push(i);
      }
      // 回答列を検出
      else if (menuCell && (menuCell.includes('回答') || menuCell.includes('答'))) {
        if (currentGroup) {
          // AIタイプを判定
          let aiType = 'ChatGPT';

          if (aiCell && aiCell.trim() !== '') {
            const aiCellLower = aiCell.toLowerCase();
            if (aiCellLower.includes('chatgpt') || aiCellLower.includes('gpt')) {
              aiType = 'ChatGPT';
            } else if (aiCellLower.includes('claude')) {
              aiType = 'Claude';
            } else if (aiCellLower.includes('gemini')) {
              aiType = 'Gemini';
            }
          } else {
            const menuCellLower = menuCell.toLowerCase();
            if (menuCellLower.includes('chatgpt') || menuCellLower.includes('gpt')) {
              aiType = 'ChatGPT';
            } else if (menuCellLower.includes('claude')) {
              aiType = 'Claude';
            } else if (menuCellLower.includes('gemini')) {
              aiType = 'Gemini';
            }
          }

          currentGroup.answerColumns.push({
            index: i,
            column: this.indexToColumn(i),
            type: aiType
          });
        }
      }
      // グループの終了を検出
      else if (currentGroup && currentGroup.promptColumns.length > 0) {
        if (currentGroup.answerColumns.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = null;
      }
    }

    // 最後のグループを追加
    if (currentGroup && currentGroup.answerColumns.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * taskGroups情報をpromptGroups形式に変換
   * ステップ3-5-3: タスクグループ変換
   */
  convertTaskGroupsToPromptGroups(taskGroups) {
    this.log('taskGroupsをpromptGroups形式に変換中...', 'info', 'Step 3-5-3');
    const promptGroups = [];

    try {
      if (!taskGroups || !Array.isArray(taskGroups)) {
        this.log('taskGroupsが無効です', 'warn', 'Step 3-5-3');
        return promptGroups;
      }

      for (const taskGroup of taskGroups) {
        try {
          // タスクグループの必須フィールドをチェック
          if (!taskGroup.columnRange || !taskGroup.columnRange.promptColumns || !taskGroup.columnRange.answerColumns) {
            this.log('無効なtaskGroup構造をスキップ', 'warn', 'Step 3-5-3');
            continue;
          }

          // プロンプト列のインデックスを取得
          const promptColumns = taskGroup.columnRange.promptColumns.map(col => {
            if (typeof col === 'string') {
              return this.columnToIndex(col);
            }
            return col;
          });

          // 回答列情報を変換
          const answerColumns = taskGroup.columnRange.answerColumns.map(answerCol => {
            if (typeof answerCol === 'object' && answerCol.column) {
              return {
                index: answerCol.index !== undefined ? answerCol.index : this.columnToIndex(answerCol.column),
                column: answerCol.column,
                type: answerCol.aiType || 'Claude'
              };
            }
            // フォールバック処理
            return {
              index: this.columnToIndex(answerCol),
              column: answerCol,
              type: 'Claude'
            };
          });

          // promptGroup形式に変換
          const promptGroup = {
            promptColumns: promptColumns,
            answerColumns: answerColumns,
            aiType: taskGroup.aiType || 'Claude',
            groupId: taskGroup.id || `group_${promptGroups.length + 1}`,
            groupType: taskGroup.groupType || 'single',
            sequenceOrder: taskGroup.sequenceOrder || promptGroups.length + 1
          };

          promptGroups.push(promptGroup);

          this.log(`taskGroup ${promptGroup.groupId} を変換完了`, 'success', '3-5-3');

        } catch (groupError) {
          this.log(`taskGroup変換エラー: ${groupError.message}`, 'error', '3-5-3');
          continue;
        }
      }

    } catch (error) {
      this.log(`convertTaskGroupsToPromptGroups エラー: ${error.message}`, 'error', '3-5-3');
    }

    return promptGroups;
  }

  /**
   * 作業行を特定
   * ステップ3-5-2: 作業行識別
   */
  identifyWorkRows(data, rows) {
    this.log('作業行を特定中...', 'info', 'Step 3-5-2');

    const workRows = [];
    const startRow = Math.max(
      (rows.menu || 0) + 1,
      (rows.ai || 0) + 1,
      (rows.model || 0) + 1,
      (rows.function || 0) + 1,
      8  // 最低でも9行目から
    );

    this.log(`作業行開始: 行${startRow + 1}から`, 'info', '3-5-2');

    for (let i = startRow; i < data.values.length; i++) {
      const row = data.values[i];

      // 空行はスキップ
      if (!row || row.every(cell => !cell)) {
        continue;
      }

      workRows.push({
        index: i,
        number: i + 1  // 1-based行番号
      });
    }

    this.log(`作業行検出完了: ${workRows.length}行`, 'success', 'Step 5-7');
    if (workRows.length < 10) {
      this.log(`検出した作業行: ${workRows.map(w => `行${w.number}`).join(', ')}`, 'info', 'Step 5-7');
    }

    return workRows;
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
    const promptDetails = []; // プロンプトの詳細情報を保存

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
              promptDetails.push(`${columnLetter}${rowIndex + 1}`);
            }
          }
        }
      }

      // まとめてログ出力
      if (promptDetails.length > 0) {
        const MAX_DISPLAY = 10; // 最初の10個だけ表示
        const displayCells = promptDetails.slice(0, MAX_DISPLAY).join(', ');
        const remainingCount = promptDetails.length - MAX_DISPLAY;

        if (remainingCount > 0) {
          this.log(`プロンプトを検出: ${displayCells} ... 他${remainingCount}セル`, 'info', '3-4-4');
        } else {
          this.log(`プロンプトを検出: ${displayCells}`, 'info', '3-4-4');
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

  /**
   * ========================================
   * ステップ9-2: データアクセス系ヘルパーメソッド
   * ========================================
   *
   * このセクションには、スプレッドシートのデータにアクセスし、
   * 値を取得・判定するためのユーティリティメソッドが含まれています。
   * これらのメソッドは他のメソッドから頻繁に呼び出される基本的な機能です。
   */

  /**
   * プロンプトが存在するかチェック（内容は取得しない）
   * ステップ9-2-1: プロンプト存在確認
   *
   * @param {Object} data - スプレッドシートデータ
   * @param {Object} workRow - 作業行情報（index: 0ベース行番号, number: 1ベース行番号）
   * @param {Object} promptGroup - プロンプトグループ（promptColumnsを含む）
   * @returns {boolean} プロンプトが存在する場合true
   *
   * 例：行10のG列〜I列にプロンプトがあるかチェック
   */
  hasPromptInRow(data, workRow, promptGroup) {
    // プロンプト列を1つずつチェック
    for (const colIndex of promptGroup.promptColumns) {
      const cell = this.getCellValue(data, workRow.index, colIndex);

      // セルに有効な値があるかチェック
      // 空文字列や"null"文字列は無視
      if (cell && cell !== "" && cell !== "null" && cell.trim()) {
        return true; // プロンプトが見つかった
      }
    }
    return false; // プロンプトが見つからなかった
  }

  /**
   * セルの値を取得
   * ステップ9-2-2: セル値取得
   *
   * @param {Object} data - スプレッドシートデータ
   * @param {number} rowIndex - 行インデックス（0ベース）
   * @param {number} colIndex - 列インデックス（0ベース）
   * @returns {string|null} セルの値、存在しない場合はnullまたは空文字
   *
   * 例：10行目のG列（列インデックス6）の値を取得
   */
  getCellValue(data, rowIndex, colIndex) {
    // 行が存在しない場合
    if (!data.values[rowIndex]) {
      this.log(`行${rowIndex}が存在しません`, 'warn', '9-2-2');
      return null;
    }

    // 列が範囲外の場合
    if (colIndex >= data.values[rowIndex].length) {
      // 範囲外の場合は空文字を返す（エラーではなく正常な動作）
      return "";
    }

    // セルの値を返す（値がない場合はnull）
    return data.values[rowIndex][colIndex] || null;
  }

  /**
   * 回答が既に存在するかチェック
   * ステップ9-2-3: 回答存在確認
   *
   * @param {string} value - チェックする値
   * @returns {boolean} 有効な回答が存在する場合true
   *
   * このメソッドは以下の値を「回答なし」として扱います：
   * - 空文字、null、undefined
   * - '処理完了'（処理済みマーカー）
   * - '現在操作中です_'で始まる文字列（排他制御マーカー）
   * - エラーマーカー（'error', 'エラー', 'failed', '失敗', '×'）
   */
  hasAnswer(value) {
    // 値がない場合
    if (!value) return false;

    const trimmed = value.trim();
    if (!trimmed) return false;

    // 「処理完了」は未回答として扱う（再処理可能にするため）
    if (trimmed === '処理完了') {
      this.log(`「処理完了」を検出 → 未回答として扱う`, 'info', '9-2-3');
      return false;
    }

    // 排他制御マーカーは未回答として扱う
    // 例："現在操作中です_2024-01-01_10-00-00_PC001"
    if (trimmed.startsWith('現在操作中です_')) {
      this.log(`排他制御マーカーを検出 → 未回答として扱う`, 'info', '9-2-3');
      return false;
    }

    // エラーマーカーは回答なしとして扱う（再処理が必要）
    const errorMarkers = ['error', 'エラー', 'failed', '失敗', '×'];
    for (const marker of errorMarkers) {
      if (trimmed.toLowerCase().includes(marker)) {
        this.log(`エラーマーカーを検出 → 未回答として扱う: "${trimmed}"`, 'info', '9-2-3');
        return false;
      }
    }

    // 上記以外は有効な回答として扱う
    return true;
  }

  /**
   * モデル情報を取得
   * ステップ9-2-4: モデル情報取得
   *
   * @param {Object} data - スプレッドシートデータ
   * @param {Object} answerCol - 回答列情報
   * @param {Array} promptColumns - プロンプト列のインデックス配列（通常処理用）
   * @returns {string} モデル名（例：'Claude Opus 4.1', 'GPT-4'）
   *
   * モデル行から対応する列のモデル情報を取得します。
   * 機能が「通常」の場合はプロンプト列から、それ以外は回答列から取得。
   */
  getModel(data, answerCol, promptColumns = null) {
    // モデル行を探す（A列が「モデル」または「model」）
    const modelRow = data.values.find(row =>
      row[0] && (row[0] === 'モデル' || row[0].toLowerCase() === 'model')
    );

    if (modelRow) {
      // 機能行も確認
      const functionRow = data.values.find(row =>
        row[0] && (row[0] === '機能' || row[0].toLowerCase() === 'function')
      );

      const functionValue = functionRow ? functionRow[answerCol.index] : null;

      // 機能が「通常」の場合、プロンプト列からモデルを取得
      if (functionValue === '通常' && promptColumns && promptColumns.length > 0) {
        const promptModelValue = modelRow[promptColumns[0]];
        if (promptModelValue) {
          return promptModelValue;
        }
      }

      // それ以外は回答列から取得
      const modelValue = modelRow[answerCol.index];
      if (modelValue) {
        return modelValue;
      }
    }

    // デフォルトモデル（AI種別に応じて）
    const defaultModels = {
      'claude': 'Claude Opus 4.1',
      'chatgpt': 'GPT-4',
      'gemini': 'Gemini Pro',
      'genspark': 'Genspark'
    };

    const aiTypeLower = answerCol.type ? answerCol.type.toLowerCase() : 'claude';
    return defaultModels[aiTypeLower] || 'Claude Opus 4.1';
  }

  /**
   * 機能情報を取得
   * ステップ9-2-5: 機能情報取得
   *
   * @param {Object} data - スプレッドシートデータ
   * @param {Object} answerCol - 回答列情報
   * @param {Array} promptColumns - プロンプト列のインデックス配列（通常処理用）
   * @returns {string} 機能名（例：'通常', 'チャット', 'レポート化'）
   *
   * 機能行から対応する列の機能情報を取得します。
   */
  getFunction(data, answerCol, promptColumns = null) {
    // 機能行を探す（A列が「機能」または「function」）
    const functionRow = data.values.find(row =>
      row[0] && (row[0] === '機能' || row[0].toLowerCase() === 'function')
    );

    if (functionRow) {
      // まず回答列の値を確認
      const functionValue = functionRow[answerCol.index];
      if (functionValue) {
        return functionValue;
      }

      // 回答列が空の場合、プロンプト列から取得を試みる
      if (promptColumns && promptColumns.length > 0) {
        const promptFunctionValue = functionRow[promptColumns[0]];
        if (promptFunctionValue) {
          return promptFunctionValue;
        }
      }
    }

    // デフォルトは「通常」
    return '通常';
  }

  /**
   * 制御値をパース（カンマ区切りや範囲指定を解析）
   * ステップ9-2-6: 制御値パース
   *
   * @param {string} str - パースする文字列（例："1,3,5-7,10"）
   * @returns {Array<number>} 数値の配列（例：[1,3,5,6,7,10]）
   *
   * 以下の形式をサポート：
   * - 単一の数値: "5" → [5]
   * - カンマ区切り: "1,3,5" → [1,3,5]
   * - 範囲指定: "5-8" → [5,6,7,8]
   * - 組み合わせ: "1,3-5,8" → [1,3,4,5,8]
   */
  parseControlValues(str) {
    const values = [];
    const parts = str.split(',');

    for (const part of parts) {
      const trimmed = part.trim();

      // 単一の数値
      if (/^\d+$/.test(trimmed)) {
        values.push(parseInt(trimmed, 10));
      }
      // 範囲指定（例："5-8"）
      else if (/^\d+-\d+$/.test(trimmed)) {
        const [start, end] = trimmed.split('-').map(n => parseInt(n, 10));
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      }
    }

    return values;
  }

  /**
   * タスクIDを生成
   * ステップ9-2-7: タスクID生成
   *
   * @param {string} column - 列名（例：'G'）
   * @param {number} row - 行番号（1ベース、例：10）
   * @returns {string} ユニークなタスクID（例："G10_1704067200000_abc123"）
   *
   * タスクIDは以下の要素で構成されます：
   * - セル位置（列名+行番号）
   * - タイムスタンプ（ミリ秒）
   * - ランダム文字列（重複防止）
   */
  generateTaskId(column, row) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${column}${row}_${timestamp}_${random}`;
  }
}