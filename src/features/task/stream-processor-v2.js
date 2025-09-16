/**
 * @fileoverview StreamProcessor V2 - 動的タスクグループ処理システム
 *
 * 【ステップ構成】
 * Step 0: 初期化・コンストラクタ - システムの基本設定とサービス初期化
 *   Step 0-3: モニター管理システム初期化 - UI要素取得、設定読み込み、イベントリスナー設定
 * Step 1: SpreadsheetLogger初期化 - スプレッドシートへのログ出力機能の準備
 * Step 2: メインエントリーポイント - スリープ防止とデータ検証を行う処理の開始点
 *   Step 2-1拡張: ウィンドウ配置準備 - マルチモニター環境での配置準備
 * Step 3: V3グループ順次処理 - 動的にタスクグループを解析し依存関係に従って実行
 *   Step 3-0: マルチモニター4分割配置 - 処理開始前のウィンドウ最適配置
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
import { getService } from '../../core/service-registry.js';
import { ConsoleLogger } from '../../utils/console-logger.js';
// RetryManager機能はStep 10に統合済み
// ExclusiveControl機能はStep 0-4-1, 0-4-2に統合済み
// ExclusiveControlLoggerHelper機能はStep 1-6に統合済み
// Step 3: sleep-utils.jsから1-ai-common-base.jsに移行（グローバル関数として利用）
import '../../../automations/1-ai-common-base.js';
import EXCLUSIVE_CONTROL_CONFIG, {
  getTimeoutForFunction,
  getRetryIntervalForFunction
} from '../../config/exclusive-control-config.js';

// SpreadsheetLoggerをキャッシュ
let SpreadsheetLogger = null;

/**
 * SpreadsheetLoggerの動的取得
 * Service Worker環境では動的インポートが制限されるため、
 * グローバル空間に事前に登録されたクラスを使用
 */
async function getSpreadsheetLogger(SpreadsheetLoggerClass) {
  // 引数として受け取ったクラスを返す（グローバル変数を使わない）
  return SpreadsheetLoggerClass || null;
}

// シングルトンインスタンスを保持
let streamProcessorInstance = null;

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
    // シングルトンパターン：既存インスタンスがあれば返す
    if (streamProcessorInstance) {
      console.log('[StreamProcessorV2] 既存インスタンスを再利用');
      return streamProcessorInstance;
    }

    // ========================================
    // Step 0-1: 基本サービス初期化（最優先）
    // ========================================
    // ConsoleLoggerインスタンスを作成
    this.logger = new ConsoleLogger('stream-processor-v2', logger);
    this.initialized = false;

    // ログ関数が使用可能になった後に初期化ログ出力
    this.log('StreamProcessorV2 初期化開始', 'step', '0');
    this.log('基本サービスを初期化', 'debug', '0-1');  // debugレベルに変更
    this.aiTaskExecutor = new AITaskExecutor(logger);
    // RetryManager機能はStep 10に統合済み

    // ========================================
    // Step 0-1-3: PC識別システム初期化
    // ========================================
    this.log('PC識別システム初期化開始', 'info', '0-1-3');
    this.initializePCIdentifier();

    // ========================================
    // Step 0-1-4: 共通スリープユーティリティ初期化
    // ========================================
    this.log('共通スリープユーティリティ初期化開始', 'info', '0-1-4');
    // スリープユーティリティは別途読み込み済み

    // ========================================
    // Step 0-2: タスク生成・管理系初期化
    // ========================================
    this.log('タスク生成・管理系コンポーネントを初期化', 'info', '0-2');
    this.windowService = WindowService;
    this.completedTasks = new Set();

    // ========================================
    // Step 0-2-3: スプレッドシート設定初期化
    // ========================================
    this.log('スプレッドシート設定初期化開始', 'info', '0-2-3');
    this.initializeSpreadsheetConfig();

    // ========================================
    // Step 0-4-1: 排他制御ユーティリティ初期化
    // ========================================
    this.log('排他制御ユーティリティ初期化開始', 'info', '0-4-1');
    this.initializeExclusiveControl();

    // ========================================
    // Step 0-4-2: 排他制御マネージャー初期化
    // ========================================
    this.log('排他制御マネージャー初期化開始', 'info', '0-4-2');
    this.initializeExclusiveControlManager();

    // ========================================
    // Step 0-3: モニター管理システム初期化
    // ========================================
    this.log('モニター管理システム初期化開始', 'info', '0-3');
    // Service Worker環境ではDOM操作をスキップ
    if (typeof document !== 'undefined') {
      this.initializeMonitorSystem();
    } else {
      this.log('Service Worker環境のためモニター管理をスキップ', 'info', '0-3');
    }

    // ========================================
    // Step 0-4: 排他制御システム初期化
    // ========================================
    this.log('排他制御システムを初期化', 'info', '0-4');

    // Step 0-4-1: 排他制御ユーティリティ初期化（exclusive-control.js統合）
    this.log('排他制御ユーティリティ初期化開始', 'info', '0-4-1');
    this.initializeExclusiveControl();

    // Step 0-4-2: 排他制御マネージャー初期化（exclusive-control-manager.js統合）
    this.log('排他制御マネージャー初期化開始', 'info', '0-4-2');
    this.initializeExclusiveControlManager();

    // ========================================
    // Step 0-5: 内部状態初期化
    // ========================================
    this.log('内部状態を初期化', 'info', '0-5');
    // TaskGroupScannerの機能は統合されたため、直接メソッドを使用

    // ========================================
    // Step 0-6: 設定・状態管理初期化
    // ========================================
    this.log('設定と状態管理を初期化', 'info', '0-6');
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
    this.sheetsClient = config.sheetsClient || null;
    this.SpreadsheetLoggerClass = config.SpreadsheetLogger || null;
    this.spreadsheetData = null;
    this.spreadsheetUrl = null;

    this.log('StreamProcessorV2 初期化完了', 'success', '0');

    // 初期化完了フラグをセット
    this.initialized = true;

    // 構造解析キャッシュを初期化
    this.structureCache = new Map();

    // シングルトンインスタンスを保存
    streamProcessorInstance = this;
  }

  // ========================================
  /**
   * シングルトンインスタンスを取得
   * @param {Object} logger - ログ出力用オブジェクト
   * @param {Object} config - 設定オブジェクト
   * @returns {StreamProcessorV2} インスタンス
   */
  static getInstance(logger = console, config = {}) {
    if (!streamProcessorInstance) {
      streamProcessorInstance = new StreamProcessorV2(logger, config);
    }
    return streamProcessorInstance;
  }

  /**
   * シングルトンインスタンスをリセット（テスト用）
   */
  static resetInstance() {
    streamProcessorInstance = null;
  }

  /**
   * 依存性を後から設定するメソッド
   * シングルトンパターンで早期初期化された場合に使用
   * @param {Object} dependencies - 依存性オブジェクト
   * @param {Object} dependencies.sheetsClient - SheetsClientインスタンス
   * @param {Function} dependencies.SpreadsheetLogger - SpreadsheetLoggerクラス
   */
  async setDependencies(dependencies = {}) {
    // SheetsClientを設定
    if (dependencies.sheetsClient) {
      this.sheetsClient = dependencies.sheetsClient;
      this.log('SheetsClientを設定しました', 'info');
    } else if (!this.sheetsClient) {
      // SheetsClientが未設定でdependenciesにもない場合、Service Registry経由で取得を試行
      this.log('SheetsClientが未設定 - Service Registry経由で取得を試行', 'info');
      try {
        this.sheetsClient = await getService('sheetsClient');
        this.log('Service Registry経由でSheetsClientを取得しました', 'success');
      } catch (error) {
        this.log(`Service Registry経由のSheetsClient取得に失敗: ${error.message}`, 'warning');
      }
    }

    // SpreadsheetLoggerクラスを設定して再初期化
    if (dependencies.SpreadsheetLogger) {
      this.SpreadsheetLoggerClass = dependencies.SpreadsheetLogger;
      // 既存のspreadsheetLoggerがあれば、まずクリア
      this.spreadsheetLogger = null;
      // SpreadsheetLoggerを再初期化
      await this.initializeSpreadsheetLogger();
      this.log('SpreadsheetLoggerを再初期化しました', 'info');
    } else if (!this.SpreadsheetLoggerClass) {
      // SpreadsheetLoggerが未設定の場合、Service Registry経由で取得を試行
      this.log('SpreadsheetLoggerが未設定 - Service Registry経由で取得を試行', 'info');
      try {
        const spreadsheetLogger = await getService('spreadsheetLogger');
        if (spreadsheetLogger && spreadsheetLogger.constructor) {
          this.SpreadsheetLoggerClass = spreadsheetLogger.constructor;
          await this.initializeSpreadsheetLogger();
          this.log('Service Registry経由でSpreadsheetLoggerを取得しました', 'success');
        }
      } catch (error) {
        this.log(`Service Registry経由のSpreadsheetLogger取得に失敗: ${error.message}`, 'warning');
      }
    }
  }

  // 統一ログ関数（ChatGPT方式）
  // ========================================
  /**
   * 統一ログ出力関数
   * @param {string} message - ログメッセージ
   * @param {string} type - ログタイプ (info, error, success, warning, step, debug)
   * @param {string} step - ステップ番号（オプション）
   */
  log(message, type = 'info', step = null) {
    // デバッグレベルのログはスキップ（本番環境でのパフォーマンス向上）
    const LOG_LEVEL = globalThis.LOG_LEVEL || 'info'; // debug, info, warning, error
    const levels = { debug: 0, info: 1, warning: 2, error: 3, success: 1, step: 1 };

    if (levels[type] < levels[LOG_LEVEL]) {
      return; // ログレベルが低い場合はスキップ
    }

    const timestamp = new Date().toLocaleTimeString('ja-JP', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const prefix = `[${timestamp}]`;
    // Step番号の重複を防ぐ: 既に"Step"が含まれていれば[${step}]、なければ[Step ${step}]
    const stepPrefix = step ? (step.includes('Step') ? `[${step}]` : `[Step ${step}]`) : '';

    // ConsoleLoggerのメソッドを使用して統一されたログフォーマットを適用
    const stepNumber = step;
    const formattedMessage = `${prefix} ${message}`;

    switch(type) {
      case 'error':
        this.logger.error(stepNumber, `❌ ${formattedMessage}`);
        break;
      case 'success':
        this.logger.success(stepNumber, `✅ ${formattedMessage}`);
        break;
      case 'warning':
        this.logger.warn(stepNumber, `⚠️ ${formattedMessage}`);
        break;
      case 'step':
        this.logger.log(stepNumber, `📍 ${formattedMessage}`);
        break;
      case 'debug':
        this.logger.debug(stepNumber, `🔧 ${formattedMessage}`);
        break;
      default:
        this.logger.info(stepNumber, `ℹ️ ${formattedMessage}`);
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
    this.log('SpreadsheetLogger初期化開始', 'step', '1');

    // Step 1-1: 既存インスタンスチェック
    if (this.spreadsheetLogger) {
      this.log('SpreadsheetLogger既に初期化済み', 'info', '1-1');
      return;
    }

    try {
      // Step 1-2: SpreadsheetLoggerクラス取得（依存性注入から）
      this.log('SpreadsheetLoggerクラスを取得', 'info', '1-2');

      // SpreadsheetLoggerClassが設定されていない場合はService Registryから取得
      let SpreadsheetLoggerClass = this.SpreadsheetLoggerClass;
      if (!SpreadsheetLoggerClass) {
        this.log('SpreadsheetLoggerClass未設定 - Service Registry経由で取得試行', 'info', '1-2-1');
        try {
          const { default: ImportedSpreadsheetLogger } = await import('../logging/spreadsheet-logger.js');
          SpreadsheetLoggerClass = ImportedSpreadsheetLogger;
          this.SpreadsheetLoggerClass = SpreadsheetLoggerClass;
          this.log('SpreadsheetLoggerクラスをimportから取得', 'success', '1-2-2');
        } catch (importError) {
          this.log(`SpreadsheetLoggerクラスのimport失敗: ${importError.message}`, 'error', '1-2-3');
          return;
        }
      }

      if (SpreadsheetLoggerClass) {
        // Step 1-3: インスタンス作成（spreadsheetUrlの有無に関わらず作成）
        this.log('SpreadsheetLoggerインスタンスを作成', 'info', '1-3');
        // SpreadsheetLoggerにspreadsheetIdとgidを渡して初期化
        const loggerOptions = {
          spreadsheetId: this.spreadsheetData?.spreadsheetId || null,
          gid: this.spreadsheetData?.gid || '0'
        };
        this.spreadsheetLogger = new SpreadsheetLoggerClass(this.logger, loggerOptions);

        // Step 1-4: SheetsClient確認（コンストラクタで受け取ったものを使用）
        if (this.sheetsClient) {
          this.log('SheetsClientを確認', 'info', '1-4');
        } else {
          this.log('SheetsClientが未設定 - 必要時に設定してください', 'info', '1-4');
        }

        this.log('SpreadsheetLogger初期化完了', 'success', '1');

        // ========================================
        // Step 1-5: ChatGPTツール制御システム初期化
        // ========================================
        this.log('ChatGPTツール制御システム初期化開始', 'info', '1-5');
        this.initializeChatGPTToolControl();

        // ========================================
        // Step 1-6: 排他制御ログヘルパー初期化
        // ========================================
        this.log('排他制御ログヘルパー初期化開始', 'info', '1-6');
        this.initializeExclusiveControlLoggerHelper();
      } else {
        this.log(`SpreadsheetLoggerClass が取得できませんでした`, 'warn', '1-3');
      }
    } catch (error) {
      this.log(`SpreadsheetLogger初期化エラー: ${error.message}`, 'error', '1');
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
    this.log('動的タスクグループ処理開始', 'step', '2');
    const startTime = Date.now();
    let totalCompleted = 0;
    let totalFailed = 0;

    // ========================================
    // Step 2-1: スリープ防止開始
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
    // Step 2-2: データ保存・初期化
    // ========================================
    this.log('スプレッドシートデータを保存・初期化', 'info', '2-2');
    this.spreadsheetData = spreadsheetData;
    this.spreadsheetUrl = spreadsheetData?.spreadsheetUrl ||
                         spreadsheetData?.spreadsheetId ||
                         this.spreadsheetUrl;  // 既存値を保持

    // optionsを保存（taskGroups含む）
    this.currentOptions = options || {};
    this.log(`options保存完了: taskGroups数=${options?.taskGroups?.length || 0}`, 'info', '2-2');

    // SpreadsheetLoggerを初期化
    await this.initializeSpreadsheetLogger();

    // ========================================
    // Step 2-3: タスクグループ検証
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
    // Step 2-4: 最初のグループ特定
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
    // Step 2-4-1: SpreadsheetLoggerのログ記録機能は既に初期化済み
    // ========================================
    this.log('SpreadsheetLoggerは既にコンストラクタで初期化済み', 'info', '2-4-1');
    // initializeLoggingFeaturesの呼び出しを削除 - spreadsheetLoggerの二重初期化を防ぐ

    // ========================================
    // Step 2-5: グループ処理実行
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
    // Step 2-6: クリーンアップ・結果返却
    // ========================================
    this.log('クリーンアップと結果返却', 'info', '2-6');

    // ログバッファフラッシュ機能は削除
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
    this.log('V3グループ順次処理開始（動的タスク生成モード）', 'step', '3');

    // 🔍 [DEBUG] currentOptionsの状態を確認
    console.log(`🔍 [DEBUG] V3処理開始 - currentOptions状態:`);
    console.log(`- taskGroups数: ${this.currentOptions?.taskGroups?.length || 0}`);

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
      // 構造を解析（キャッシュがあれば再利用）
      this.log(`構造を解析中（イテレーション${groupIndex + 1}）...`, 'debug');

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

      // optionsから渡されたtaskGroupsを使用
      const taskGroups = this.currentOptions?.taskGroups || [];

      // デバッグ情報を追加
      this.logger.log(`[DEBUG] taskGroups情報:`, {
        taskGroupsLength: taskGroups.length,
        promptGroupsLength: promptGroups.length,
        currentGroupIndex: groupIndex,
        hasTaskGroups: taskGroups.length > 0
      });

      if (taskGroups && taskGroups.length > groupIndex) {
        taskGroupInfo = taskGroups[groupIndex];
        this.logger.log(`[DEBUG] taskGroupInfo取得成功: グループ${groupIndex + 1}`, {
          id: taskGroupInfo?.id,
          columnRange: taskGroupInfo?.columnRange,
          logColumn: taskGroupInfo?.columnRange?.logColumn
        });

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

            // ===== Step 4-1: 特殊グループ完了時のログ・回答記録 =====
            // 注意: この処理は重複しており、パフォーマンスを低下させるため無効化
            // AIタスク実行時に既にログ・回答は記録されている
            /*
            try {
              await this.writeGroupLogsAndResponses(taskGroupInfo, spreadsheetData);
              this.logger.log(`[StreamProcessorV2] 📝 特殊グループ${groupIndex + 1}のログ・回答記録完了`);
            } catch (recordError) {
              this.logger.error(`[StreamProcessorV2] ❌ 特殊グループ${groupIndex + 1}のログ・回答記録エラー:`, recordError);
            }
            */

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

      // 現在のグループIDを設定（リトライ管理用）
      this.currentGroupId = groupKey;

      // 3種類AIかどうかを判定
      const is3TypeAI = promptGroup.aiType &&
        (promptGroup.aiType.includes('3種類') || promptGroup.aiType.includes('３種類'));

      // グループ内でタスクがなくなるまでループ処理
      let groupTaskCount = 0;
      let groupBatchCount = 0;
      const MAX_BATCH_PER_GROUP = 100; // 無限ループ防止

      while (groupBatchCount < MAX_BATCH_PER_GROUP) {
        // 動的タスク生成
        const promptCols = promptGroup.promptColumns;
        const answerCols = promptGroup.answerColumns.map(col => col.index);

        // タスクグループのログ列情報をpromptGroupに追加
        if (taskGroupInfo && taskGroupInfo.columnRange) {
          promptGroup.logColumn = taskGroupInfo.columnRange.logColumn;
          this.logger.log(`[DEBUG] グループ${groupIndex + 1}のログ列設定: ${promptGroup.logColumn || 'なし'}`);
        } else {
          // taskGroupInfoがない場合はデフォルト値を使用
          this.logger.log(`[DEBUG] グループ${groupIndex + 1}のtaskGroupInfo未設定、デフォルト値使用`);
          // promptGroupのanswerColumnsから最初の列の1つ前をログ列として使用
          if (promptGroup.answerColumns && promptGroup.answerColumns.length > 0) {
            const firstAnswerCol = promptGroup.answerColumns[0].index;
            const logColIndex = this.columnToIndex(firstAnswerCol) - 1;
            promptGroup.logColumn = this.indexToColumn(logColIndex);
            this.logger.log(`[DEBUG] デフォルトログ列を設定: ${promptGroup.logColumn} (回答列${firstAnswerCol}の1つ前)`);
          }
        }

        const tasks = await this.scanGroupTasks(spreadsheetData, promptCols, answerCols, promptGroup);

        if (!tasks || tasks.length === 0) {
          if (groupBatchCount === 0) {
            this.logger.log(`[StreamProcessorV2] グループ${groupIndex + 1}にタスクなし（すべて回答済み）`);
          } else {
            this.logger.log(`[StreamProcessorV2] グループ${groupIndex + 1}の全タスク完了（計${groupTaskCount}タスク処理）`);
          }
          break; // このグループの処理完了
        }

        groupBatchCount++;
        this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}のバッチ${groupBatchCount}: ${tasks.length}個のタスク生成`);
        groupTaskCount += tasks.length;

        if (is3TypeAI) {
          // 3種類AI: 列ごとにグループ化して特別処理
          if (groupBatchCount === 1) {
            this.logger.log(`[StreamProcessorV2] 🎯 3種類AIモードで処理`);
          }
          const columnGroups = this.organizeTasksByColumn(tasks);
          await this.process3TypeAIGroup(columnGroups, isTestMode);
          totalProcessed += tasks.length;
        } else {
          // 通常AI: 各列を順次処理（列内は3行バッチ並列）
          if (groupBatchCount === 1) {
            this.logger.log(`[StreamProcessorV2] 🎯 通常モードで処理（列ごと順次処理）`);
          }
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

        // スプレッドシートを再読み込み（処理済みタスクを反映）
        if (this.sheetsClient) {
          await this.reloadSpreadsheetData(spreadsheetData);
        }
      }

      // このグループを処理済みとしてマーク
      processedGroupKeys.add(groupKey);

      this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}の処理完了`);

      // 🔍 [DEBUG] taskGroupInfo状態確認
      console.log(`🔍 [DEBUG] グループ${groupIndex + 1}完了時の状態:`);
      console.log(`- spreadsheetData.taskGroups存在: ${!!spreadsheetData.taskGroups}`);
      console.log(`- spreadsheetData.taskGroups.length: ${spreadsheetData.taskGroups?.length}`);
      console.log(`- options.taskGroups存在: ${!!(this.currentOptions && this.currentOptions.taskGroups)}`);
      console.log(`- options.taskGroups.length: ${this.currentOptions?.taskGroups?.length}`);
      console.log(`- groupIndex: ${groupIndex}`);
      console.log(`- taskGroupInfo: ${taskGroupInfo ? '存在' : 'null'}`);
      if (taskGroupInfo) {
        console.log(`- taskGroupInfo.id: ${taskGroupInfo.id}`);
        console.log(`- taskGroupInfo.name: ${taskGroupInfo.name}`);
      }

      // ===== Step 5-1: グループ完了時のログ・回答記録 =====
      // 注意: この処理は重複しており、パフォーマンスを低下させるため無効化
      // AIタスク実行時に既にログ・回答は記録されている
      /*
      if (taskGroupInfo) {
        try {
          await this.writeGroupLogsAndResponses(taskGroupInfo, spreadsheetData);
          this.logger.log(`[StreamProcessorV2] 📝 グループ${groupIndex + 1}のログ・回答記録完了`);
        } catch (recordError) {
          this.logger.error(`[StreamProcessorV2] ❌ グループ${groupIndex + 1}のログ・回答記録エラー:`, recordError);
        }
      }
      */

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
    this.log('タスクグループスキャン開始', 'info', '6-1');
    const tasks = [];
    // MAX_TASKS_PER_BATCHの制限を削除 - すべてのタスクをスキャン

    // ステップ5-1-1: パラメータ検証
    if (!spreadsheetData?.values || !Array.isArray(spreadsheetData.values)) {
      this.log('無効なスプレッドシートデータ', 'warn', '6-1');
      return tasks;
    }

    if (!promptCols || !Array.isArray(promptCols) || promptCols.length === 0) {
      this.log('無効なプロンプト列データ', 'warn', '6-1');
      return tasks;
    }

    if (!answerCols || !Array.isArray(answerCols) || answerCols.length === 0) {
      this.log('無効な回答列データ', 'warn', '6-1');
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
      this.log('このグループは列制御によりスキップ', 'info', '6-1');
      return tasks;
    }

    // ステップ5-1-3: プロンプト行の検出
    this.log('プロンプト行を検出中...', 'info', '6-1');
    const promptRows = this.scanPromptRows(promptCols, spreadsheetData);

    if (!promptRows || promptRows.length === 0) {
      this.log('プロンプトが見つかりません', 'warn', '6-1');
      return tasks;
    }

    const maxPromptRow = Math.max(...promptRows);
    this.log(`プロンプト発見: ${promptRows.length}行、最大行: ${maxPromptRow + 1}`, 'success', '6-1');

    // ステップ5-1-4: バッチで回答状態をチェック
    this.log(`バッチチェック開始: ${promptRows.length}行 × ${answerCols.length}列`, 'info', '6-1');
    const answerStatusMap = await this.batchCheckAnswers(spreadsheetData, promptRows, answerCols);

    // ステップ5-1-5: タスク生成
    const startRow = 8; // 0ベース（9行目）
    const endRow = Math.min(maxPromptRow + 1, spreadsheetData.values.length);

    // 処理対象行とスキップ行を収集
    const processedRows = [];
    const skippedRows = [];

    for (const rowIndex of promptRows) {
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
            this.log(`プロンプト取得エラー ${taskCell}: ${error.message}`, 'warn', '6-1');
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

            // ログ列情報
            logColumn: promptGroup.logColumn || null,

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
    this.log(`スキャン完了: ${tasks.length}件のタスクを生成`, 'success', '6-1');

    if (tasks.length > 0) {
      const taskRanges = tasks.map(t => `${t.column}${t.row}`).join(', ');
      this.log(`処理対象: ${taskRanges}`, 'info', '6-1');
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
    this.log('バッチ回答チェック開始', 'info', '6-2');
    const answerStatusMap = new Map();

    if (!this.sheetsClient) {
      this.log('sheetsClientが利用できません', 'warn', '6-2');
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
          const batchResult = await this.sheetsClient.batchGetSheetData(
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
          this.log(`バッチ取得代替処理エラー: ${error.message}`, 'warn', '6-2');
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
      // 🔍 [DEBUG] タスク実行前の排他制御状態確認
      console.log(`🔍 [DEBUG] タスク実行前 - ${task.column}${task.row}:`);
      console.log(`- 排他制御マネージャー存在: ${!!this.exclusiveManager}`);
      console.log(`- sheetsClient存在: ${!!this.sheetsClient}`);
      console.log(`- exclusiveLoggerConfig存在: ${!!this.exclusiveLoggerConfig}`);
      console.log(`- exclusiveLoggerConfig.enabled: ${this.exclusiveLoggerConfig?.enabled}`);

      // Step 8-1: タスク実行開始ログ記録
      if (this.spreadsheetLogger && this.spreadsheetLogger.logTaskExecution) {
        await this.spreadsheetLogger.logTaskExecution(task);
      }

      // Step 8-2: ウィンドウを作成
      const windowInfo = await this.createWindowForTask(task, position);

      // Step 8-3: SPREADSHEET_CONFIG初期化確認後にタスクを実行
      if (!globalThis.SPREADSHEET_CONFIG) {
        this.logger.warn('SPREADSHEET_CONFIG が未初期化、初期化を実行');
        this.initializeSpreadsheetConfig();
      }

      // Step 8-3.1: 送信時刻を記録（ログ用）
      if (this.spreadsheetLogger) {
        const taskId = `${task.column}${task.row}_${task.aiType || 'AI'}`;
        // メソッドの存在をチェック
        if (typeof this.spreadsheetLogger.recordSendTimestamp === 'function') {
          this.spreadsheetLogger.recordSendTimestamp(taskId, task);
          this.logger.log(`[Step 8-3.1] ⏰ 送信時刻記録: ${taskId}`);
        } else if (typeof this.spreadsheetLogger.recordSendTime === 'function') {
          // フォールバック: 古いメソッドを使用
          this.spreadsheetLogger.recordSendTime(taskId, {
            aiType: task.aiType || 'Claude',
            model: task.model || 'Claude Opus 4.1',
            function: task.function || '通常'
          });
          this.logger.log(`[Step 8-3.1] ⏰ 送信時刻記録（旧メソッド）: ${taskId}`);
        } else {
          this.logger.warn(`[Step 8-3.1] ⚠️ 送信時刻記録メソッドが見つかりません`);
        }
      }

      const result = await this.aiTaskExecutor.executeAITask(windowInfo.tabId, task);

      // Step 8-3.5: 回答をスプレッドシートに書き込み
      if (result?.success && result?.response && this.sheetsClient) {
        const cellRef = `${task.column}${task.row}`;
        try {
          await this.sheetsClient.updateCell(
            this.spreadsheetData.spreadsheetId,
            cellRef,
            result.response
          );
          this.logger.log(`[Step 8-3.5] ✅ 回答書き込み成功: ${cellRef} (${result.response.length}文字)`);
        } catch (writeError) {
          this.logger.error(`[Step 8-3.5] ❌ 回答書き込みエラー: ${cellRef}`, {
            error: writeError.message,
            taskId: task.taskId,
            aiType: task.aiType,
            model: task.model
          });
        }
      } else {
        this.logger.warn(`[Step 8-3.5] ⚠️ 回答書き込みスキップ`, {
          success: result?.success,
          hasResponse: !!result?.response,
          hasSheetsClient: !!this.sheetsClient,
          cell: `${task.column}${task.row}`
        });
      }

      // Step 8-3.6: 詳細ログをスプレッドシートに書き込み（送信時刻、記載時刻、選択/表示モデル）
      if (this.spreadsheetLogger) {
        try {
          // タスクIDを生成
          const taskId = `${task.column}${task.row}_${task.aiType || 'AI'}`;

          // 送信時刻を記録（既に記録されていない場合）
          if (typeof this.spreadsheetLogger.getSendTime === 'function') {
            if (!this.spreadsheetLogger.getSendTime(taskId)) {
              // タスク実行時に既に記録されているはずだが、念のため確認
              this.logger.warn(`[Step 8-3.6] 送信時刻が未記録のため、現在時刻で記録: ${taskId}`);
              if (typeof this.spreadsheetLogger.recordSendTimestamp === 'function') {
                this.spreadsheetLogger.recordSendTimestamp(taskId, task);
              } else if (typeof this.spreadsheetLogger.recordSendTime === 'function') {
                this.spreadsheetLogger.recordSendTime(taskId, {
                  aiType: task.aiType || 'Claude',
                  model: task.model || 'Claude Opus 4.1',
                  function: task.function || '通常'
                });
              }
            }
          }

          // タスクオブジェクトにlogColumns配列形式を追加（spreadsheet-logger.jsが期待する形式）
          const logTask = {
            ...task,
            id: taskId,
            logColumns: task.logColumn ? [task.logColumn] : [],
            // displayedModelとdisplayedFunctionは実際のAI実行時に取得されるべき
            displayedModel: result?.displayedModel || task.model || '不明',
            displayedFunction: result?.displayedFunction || task.function || '不明'
          };

          // 詳細ログを書き込み
          const logResult = await this.spreadsheetLogger.writeLogToSpreadsheet(logTask, {
            sheetsClient: this.sheetsClient,
            spreadsheetId: this.spreadsheetData.spreadsheetId,
            gid: this.spreadsheetData.gid,
            spreadsheetData: this.spreadsheetData,
            url: result?.url || 'N/A',
            onComplete: (task, logCell, writeVerified, error) => {
              if (error) {
                this.logger.warn(`[Step 8-3.7] ⚠️ ログ書き込み完了コールバック - エラー: ${logCell}`, error);
              } else {
                this.logger.log(`[Step 8-3.7] ✅ ログ書き込み完了コールバック: ${logCell} (検証: ${writeVerified})`);
              }
            }
          });

          if (logResult.success) {
            const logColumn = logTask.logColumns && logTask.logColumns[0] ? logTask.logColumns[0] : 'Unknown';
            this.logger.log(`[Step 8-3.6] 📝 詳細ログ書き込み成功: ${logColumn}${task.row}`);
          } else {
            this.logger.error(`[Step 8-3.6] ❌ 詳細ログ書き込み失敗:`, logResult.error);
          }
        } catch (logError) {
          this.logger.error(`[Step 8-3.6] ❌ ログ書き込みエラー:`, logError);
        }
      } else {
        this.logger.warn(`[Step 8-3.6] ⚠️ SpreadsheetLoggerが未初期化のためログ書き込みスキップ`);
      }

      // Step 8-4: タスク完了ログ記録
      if (this.spreadsheetLogger && this.spreadsheetLogger.logTaskCompletion) {
        const taskId = `${task.column}${task.row}_${task.aiType || 'AI'}`;
        await this.spreadsheetLogger.logTaskCompletion(taskId, result?.response);
      }

      // Step 8-5: ウィンドウをクローズ
      await this.windowService.closeWindow(windowInfo.windowId);

      return result;

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] タスク処理エラー (${task.column}${task.row}):`, error);

      // Step 8-6: エラー時もログ記録
      if (this.spreadsheetLogger && this.spreadsheetLogger.logTaskCompletion) {
        const taskId = `${task.column}${task.row}_${task.aiType || 'AI'}`;
        await this.spreadsheetLogger.logTaskCompletion(taskId, null);
      }

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
   * @returns {Array} 作業行の配列
   */
  getWorkRowRange() {
    // 作業行の配列を生成
    // 行制御を考慮して実際の作業行のみを返す
    const workRows = [];
    const start = 9;  // 通常、9行目から開始
    let end = 38;     // 行制御「この行で停止」を考慮（38行目まで）

    // 実際のデータから行制御を取得
    if (this.currentOptions?.rowControls?.until) {
      end = Math.min(end, this.currentOptions.rowControls.until);
    }

    // 作業行の配列を生成
    for (let i = start; i <= end; i++) {
      workRows.push({ number: i });
    }

    return workRows;
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

  // initializeLoggingFeatures関数を削除
  // spreadsheetLoggerはコンストラクタで正しくSpreadsheetLoggerクラスとして初期化されているため
  // この関数による二重初期化（単純オブジェクトへの上書き）を防ぐ

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
      // SheetsClientが未設定の場合、Service Registryから取得を試行
      if (!this.sheetsClient) {
        this.log('SheetsClientが未設定 - Service Registry経由で取得を試行', 'info', 'Step 3-7');
        try {
          this.sheetsClient = await getService('sheetsClient');
          this.log('Service Registry経由でSheetsClientを取得しました', 'success', 'Step 3-7');
        } catch (registryError) {
          this.log(`Service Registry経由のSheetsClient取得に失敗: ${registryError.message}`, 'warning', 'Step 3-7');
        }
      }

      if (this.sheetsClient && this.sheetsClient.reloadData) {
        await this.sheetsClient.reloadData();
        this.log('スプレッドシートデータ再読み込み完了', 'success', 'Step 3-7');
      } else {
        this.log('SheetsClientが利用できません - 再読み込みスキップ', 'warning', 'Step 3-7');
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
    // キャッシュキーを生成（スプレッドシートIDとデータサイズを使用）
    const cacheKey = `${data.spreadsheetId || 'unknown'}_${data.values?.length || 0}`;

    // キャッシュから取得を試みる
    if (this.structureCache && this.structureCache.has(cacheKey)) {
      this.log('キャッシュから構造情報を取得', 'debug', '5');
      return this.structureCache.get(cacheKey);
    }

    this.log('スプレッドシート構造を解析中...', 'info', '5');

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
    const result = {
      rows,
      promptGroups,
      controls,
      workRows,
      aiColumns,       // processSpreadsheetData互換
      columnMapping,   // processSpreadsheetData互換
      taskGroups,      // processSpreadsheetData互換
      ...data          // 元のデータも保持
    };

    // 結果をキャッシュに保存
    if (this.structureCache) {
      this.structureCache.set(cacheKey, result);
      this.log('構造解析結果をキャッシュに保存', 'debug', '5');
    }

    return result;
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

  // ========================================
  // Step 12: モニター・ウィンドウ管理機能
  // マルチモニター環境でのウィンドウ配置制御機能
  // ========================================

  /**
   * Step 0-3: モニター管理システム初期化
   * UI要素取得、設定読み込み、イベントリスナー設定
   */
  initializeMonitorSystem() {
    this.log('【StreamProcessor-ステップ0-3-1】UI要素初期化開始', 'info');
    this.initializeMonitorElements();

    this.log('【StreamProcessor-ステップ0-3-2】保存済み設定読み込み開始', 'info');
    this.loadWindowSettings();

    this.log('【StreamProcessor-ステップ0-3-3】イベントリスナー設定開始', 'info');
    this.setupMonitorEventListeners();

    this.log('【StreamProcessor-ステップ0-3】モニター管理システム初期化完了', 'info');
  }

  /**
   * DOM要素の初期化
   * HTML内のモニター管理に必要な要素を取得
   */
  initializeMonitorElements() {
    this.log('【StreamProcessor-ステップ0-3-1】DOM要素取得中', 'info');

    // Service Worker環境チェック
    if (typeof document === 'undefined') {
      this.log('【StreamProcessor-ステップ0-3-1】Service Worker環境のためDOM要素取得をスキップ', 'info');
      return;
    }

    // UI要素を取得
    this.extensionWindowNumberInput = document.getElementById('extensionWindowNumber');
    this.spreadsheetWindowNumberInput = document.getElementById('spreadsheetWindowNumber');
    this.checkWindowLocationsBtn = document.getElementById('checkWindowLocationsBtn');

    // 存在確認
    const elementStatus = [
      this.extensionWindowNumberInput,
      this.spreadsheetWindowNumberInput,
      this.checkWindowLocationsBtn
    ].filter(Boolean).length;

    this.log(`【StreamProcessor-ステップ0-3-1】DOM要素確認完了: ${elementStatus}/3 要素が利用可能`, 'info');

    if (!this.extensionWindowNumberInput || !this.spreadsheetWindowNumberInput) {
      this.log('【StreamProcessor-ステップ0-3-1】⚠️ 重要なDOM要素が見つかりません', 'warn');
    }
  }

  /**
   * イベントリスナーの設定
   */
  setupMonitorEventListeners() {
    this.log('【StreamProcessor-ステップ0-3-3】イベントリスナー設定中', 'info');

    // モニター場所確認ボタン
    if (this.checkWindowLocationsBtn) {
      this.checkWindowLocationsBtn.addEventListener('click', () => {
        this.log('【StreamProcessor-ステップ0-3-3】モニター場所確認ボタンがクリックされました', 'info');
        this.showMonitorNumbers();
      });
    }

    // 設定保存のイベントリスナー
    if (this.extensionWindowNumberInput) {
      this.extensionWindowNumberInput.addEventListener('change', () => {
        this.log('【StreamProcessor-ステップ0-3-3】拡張機能モニター番号が変更されました', 'info');
        this.saveWindowSettings();
      });
    }

    if (this.spreadsheetWindowNumberInput) {
      this.spreadsheetWindowNumberInput.addEventListener('change', () => {
        this.log('【StreamProcessor-ステップ0-3-3】スプレッドシートモニター番号が変更されました', 'info');
        this.saveWindowSettings();
      });
    }

    this.log('【StreamProcessor-ステップ0-3-3】イベントリスナー設定完了', 'info');
  }

  /**
   * モニター番号設定の読み込み
   */
  async loadWindowSettings() {
    try {
      // Service Worker環境チェック
      if (typeof document === 'undefined') {
        this.log('【StreamProcessor-ステップ0-3-2】Service Worker環境のため設定読み込みをスキップ', 'info');
        return;
      }

      this.log('【StreamProcessor-ステップ0-3-2】chrome.storage.local から設定取得中', 'info');

      const result = await chrome.storage.local.get(['windowSettings']);
      const settings = result.windowSettings || {};

      if (settings.extensionWindowNumber && this.extensionWindowNumberInput) {
        this.extensionWindowNumberInput.value = settings.extensionWindowNumber;
      }
      if (settings.spreadsheetWindowNumber && this.spreadsheetWindowNumberInput) {
        this.spreadsheetWindowNumberInput.value = settings.spreadsheetWindowNumber;
      }

      this.log('【StreamProcessor-ステップ0-3-2】モニター設定読み込み完了', 'info');
    } catch (error) {
      this.log('【StreamProcessor-ステップ0-3-2】❌ モニター設定読み込みエラー: ' + error.message, 'error');
    }
  }

  /**
   * モニター番号設定の保存
   */
  async saveWindowSettings() {
    try {
      this.log('【StreamProcessor-ステップ0-3-4】設定保存開始', 'info');

      const settings = {
        extensionWindowNumber: this.extensionWindowNumberInput?.value || '1',
        spreadsheetWindowNumber: this.spreadsheetWindowNumberInput?.value || '2'
      };

      await chrome.storage.local.set({ windowSettings: settings });
      this.log('【StreamProcessor-ステップ0-3-4】設定保存完了', 'info');
    } catch (error) {
      this.log('【StreamProcessor-ステップ0-3-4】❌ 設定保存エラー: ' + error.message, 'error');
    }
  }

  /**
   * モニター番号表示機能
   */
  async showMonitorNumbers() {
    try {
      this.log('【StreamProcessor-ステップ3-0-4】モニター番号表示開始', 'info');

      // ディスプレイ情報を取得
      const displays = await chrome.system.display.getInfo();
      this.log(`【StreamProcessor-ステップ3-0-4】検出されたモニター数: ${displays.length}`, 'info');

      // 各モニターに番号を表示
      for (let i = 0; i < displays.length; i++) {
        const display = displays[i];
        await this.createMonitorNumberWindow(i + 1, display);
      }

      // 3秒後に自動で閉じる
      setTimeout(() => {
        this.log('【StreamProcessor-ステップ3-0-4】モニター番号表示終了', 'info');
      }, 3000);

    } catch (error) {
      this.log('【StreamProcessor-ステップ3-0-4】❌ モニター番号表示エラー: ' + error.message, 'error');
    }
  }

  /**
   * モニター番号表示ウィンドウを作成
   */
  async createMonitorNumberWindow(number, display) {
    const html = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        font-size: 120px;
        font-weight: bold;
        padding: 50px;
        border-radius: 20px;
        text-align: center;
        z-index: 10000;
      ">
        モニター ${number}
      </div>
    `;

    const window = await chrome.windows.create({
      url: `data:text/html,${encodeURIComponent(html)}`,
      type: 'popup',
      left: display.bounds.left,
      top: display.bounds.top,
      width: display.bounds.width,
      height: display.bounds.height,
      focused: false
    });

    // 3秒後に閉じる
    setTimeout(() => {
      chrome.windows.remove(window.id);
    }, 3000);
  }

  /**
   * 4分割レイアウト計算
   */
  calculateQuadLayout(displayInfo) {
    this.log('【StreamProcessor-ステップ3-0-2】4分割レイアウト計算開始', 'info');

    const display = displayInfo[0] || { bounds: { left: 0, top: 0, width: 1920, height: 1080 } };
    const { left, top, width, height } = display.bounds;

    const quadLayout = {
      topLeft: {
        left: left,
        top: top,
        width: Math.floor(width / 2),
        height: Math.floor(height / 2)
      },
      topRight: {
        left: left + Math.floor(width / 2),
        top: top,
        width: Math.floor(width / 2),
        height: Math.floor(height / 2)
      },
      bottomLeft: {
        left: left,
        top: top + Math.floor(height / 2),
        width: Math.floor(width / 2),
        height: Math.floor(height / 2)
      },
      bottomRight: {
        left: left + Math.floor(width / 2),
        top: top + Math.floor(height / 2),
        width: Math.floor(width / 2),
        height: Math.floor(height / 2)
      }
    };

    this.log('【StreamProcessor-ステップ3-0-2】4分割レイアウト計算完了', 'info');
    return quadLayout;
  }

  /**
   * ウィンドウ配置準備（Step 2-1拡張）
   */
  async prepareWindowLayout() {
    this.log('【StreamProcessor-ステップ2-1-2】ウィンドウ配置準備開始', 'info');

    try {
      // 設定を読み込み
      await this.loadWindowSettings();

      // ディスプレイ情報を取得
      const displays = await chrome.system.display.getInfo();
      this.log(`【StreamProcessor-ステップ2-1-2】利用可能なモニター数: ${displays.length}`, 'info');

      this.log('【StreamProcessor-ステップ2-1-2】ウィンドウ配置準備完了', 'info');
      return displays;
    } catch (error) {
      this.log('【StreamProcessor-ステップ2-1-2】❌ ウィンドウ配置準備エラー: ' + error.message, 'error');
      throw error;
    }
  }

  /**
   * マルチモニター4分割配置（Step 3-0）
   */
  async setupMultiMonitorLayout() {
    this.log('【StreamProcessor-ステップ3-0】マルチモニター4分割配置開始', 'info');

    try {
      // ディスプレイ情報取得
      this.log('【StreamProcessor-ステップ3-0-1】モニター情報取得中', 'info');
      const displays = await chrome.system.display.getInfo();

      // 4分割レイアウト計算
      const quadLayout = this.calculateQuadLayout(displays);

      // ウィンドウ配置実行
      this.log('【StreamProcessor-ステップ3-0-3】ウィンドウ配置実行中', 'info');
      // 実際のウィンドウ配置はWindowServiceを使用

      this.log('【StreamProcessor-ステップ3-0】マルチモニター4分割配置完了', 'info');
      return quadLayout;
    } catch (error) {
      this.log('【StreamProcessor-ステップ3-0】❌ マルチモニター4分割配置エラー: ' + error.message, 'error');
      throw error;
    }
  }

  // ========================================
  // Step 0-1-3: PC識別システム（統合）
  // pc-identifier.js から統合 - PC識別子ユーティリティ
  // ========================================

  /**
   * PC識別システム初期化
   * Chrome拡張のランタイムIDを使用したユニーク識別子を生成
   */
  initializePCIdentifier() {
    this.log('【StreamProcessor-ステップ0-1-3-1】PC識別子生成開始', 'info', 'Step 0-1-3-1');

    this._pcIdentifier = null;
    this._pcMetadata = {};

    this.log('【StreamProcessor-ステップ0-1-3-2】PC識別システム初期化完了', 'info', 'Step 0-1-3-2');
  }

  /**
   * PC識別子を取得（一度生成したら同じ値を返す）
   * @returns {Object} 識別子情報
   */
  getPCIdentifier() {
    if (!this._pcIdentifier) {
      this.log('【StreamProcessor-ステップ0-1-3-3】新規PC識別子生成中', 'info', 'Step 0-1-3-3');

      this._pcIdentifier = {
        id: this.generatePCId(),
        timestamp: new Date().toISOString(),
        metadata: this.getPCMetadata()
      };

      this.log(`【StreamProcessor-ステップ0-1-3-4】PC識別子生成完了: ${this._pcIdentifier.id}`, 'info', 'Step 0-1-3-4');
    }
    return this._pcIdentifier;
  }

  /**
   * 識別子文字列のみを取得
   * @returns {string} 識別子文字列
   */
  getPCId() {
    return this.getPCIdentifier().id;
  }

  /**
   * ユニークな識別子を生成
   * @returns {string} 識別子
   */
  generatePCId() {
    try {
      let baseId = 'PC';

      // Chrome拡張のランタイムIDを取得
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        // ランタイムIDの末尾8文字を使用（長すぎると見づらいため）
        const runtimeId = chrome.runtime.id;
        baseId = runtimeId.substring(runtimeId.length - 8);
      }

      // ランダムなサフィックスを追加（5文字）
      const randomSuffix = Math.random().toString(36).substring(2, 7);

      // 組み合わせて返す（例: "abcd1234_x7k9m"）
      return `${baseId}_${randomSuffix}`;

    } catch (error) {
      this.log(`【StreamProcessor-ステップ0-1-3】PC識別子生成エラー: ${error.message}`, 'error', 'Step 0-1-3');
      // エラー時はランダムIDを生成
      return `PC_${Math.random().toString(36).substring(2, 10)}`;
    }
  }

  /**
   * メタデータを取得
   * @returns {Object} メタデータ
   */
  getPCMetadata() {
    return {
      ...this._pcMetadata,
      userAgent: this.getUserAgent(),
      platform: this.getPlatform(),
      extensionVersion: this.getExtensionVersion()
    };
  }

  /**
   * ユーザーエージェントを取得
   * @returns {string} ユーザーエージェント
   */
  getUserAgent() {
    try {
      return navigator?.userAgent || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * プラットフォームを取得
   * @returns {string} プラットフォーム
   */
  getPlatform() {
    try {
      return navigator?.platform || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * 拡張機能のバージョンを取得
   * @returns {string} バージョン
   */
  getExtensionVersion() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        return manifest.version || 'unknown';
      }
    } catch (error) {
      this.log(`【StreamProcessor-ステップ0-1-3】Extension version取得失敗: ${error.message}`, 'warning', 'Step 0-1-3');
    }
    return 'unknown';
  }

  /**
   * 識別子が自分のものかチェック
   * @param {string} id - チェックする識別子
   * @returns {boolean} 自分の識別子の場合true
   */
  isMyPCIdentifier(id) {
    return id === this.getPCId();
  }

  // ========================================
  // Step 0-2-3: スプレッドシート設定（統合）
  // spreadsheet/config.js から統合 - スプレッドシート構造の定義
  // ========================================

  /**
   * スプレッドシート設定システム初期化
   */
  initializeSpreadsheetConfig() {
    this.log('【StreamProcessor-ステップ0-2-3-1】スプレッドシート設定定義開始', 'info', 'Step 0-2-3-1');

    this.SPREADSHEET_CONFIG = {
      // 行の識別定義
      rowIdentifiers: {
        // A列で検索する行
        menuRow: {
          keyword: "メニュー",
          name: "メニュー行",
          expectedTexts: [
            "ログ",
            "プロンプト",
            "回答",
            "ChatGPT回答",
            "Claude回答",
            "Gemini回答",
          ],
        },

        controlRow: {
          keyword: "列制御",
          name: "列制御",
          expectedTexts: [
            "この列のみ処理",
            "この列から処理",
            "この列の処理後に停止",
          ],
        },

        aiRow: {
          keyword: "AI",
          name: "AI行",
          expectedTexts: [
            "ChatGPT",
            "Claude",
            "Gemini",
            "3種類（ChatGPT・Gemini・Claude）",
          ],
          aiModels: {
            ChatGPT: { type: "chatgpt", displayName: "ChatGPT" },
            Claude: { type: "claude", displayName: "Claude" },
            Gemini: { type: "gemini", displayName: "Gemini" },
            "3種類（ChatGPT・Gemini・Claude）": {
              type: "multi",
              displayName: "マルチAI",
            },
          },
        },

        modelRow: {
          keyword: "モデル",
          name: "モデル行",
          expectedTexts: ["o3（推論）", "o3-pro（鬼推論）"],
        },

        taskRow: {
          keyword: "機能",
          name: "機能行",
          expectedTexts: ["DeepReserch"],
        },
      },

      // 作業行の定義
      workRow: {
        startMarker: "1", // A列が「1」から始まる
        name: "作業行",
      },

      // 行制御の定義（B列）
      rowControl: {
        column: "B",
        types: {
          stopAfter: "この行の処理後に停止",
          startFrom: "この行から処理",
          onlyThis: "この行のみ処理",
        },
      },

      // 列の種別識別（メニュー行で使用）
      columnTypes: {
        log: {
          keyword: "ログ",
          type: "log",
        },
        prompt: {
          keyword: "プロンプト",
          type: "prompt",
        },
        prompt2: {
          keyword: "プロンプト2",
          type: "prompt",
        },
        prompt3: {
          keyword: "プロンプト3",
          type: "prompt",
        },
        prompt4: {
          keyword: "プロンプト4",
          type: "prompt",
        },
        prompt5: {
          keyword: "プロンプト5",
          type: "prompt",
        },
        answer: {
          keyword: "回答",
          type: "answer",
        },
        chatgptAnswer: {
          keyword: "ChatGPT回答",
          type: "answer",
          aiType: "chatgpt",
        },
        claudeAnswer: {
          keyword: "Claude回答",
          type: "answer",
          aiType: "claude",
        },
        geminiAnswer: {
          keyword: "Gemini回答",
          type: "answer",
          aiType: "gemini",
        },
        history: {
          keyword: "処理履歴を記録",
          type: "history",
        },
        report: {
          keyword: "レポート化",
          type: "report",
        },
      },

      // その他の設定
      settings: {
        maxColumns: 26, // A-Z列まで
        defaultTimeout: 30000, // 30秒
        retryCount: 3,
      },
    };

    // Chrome拡張機能で使用できるようにグローバルに公開
    if (typeof globalThis !== "undefined") {
      globalThis.SPREADSHEET_CONFIG = this.SPREADSHEET_CONFIG;
    }

    this.log('【StreamProcessor-ステップ0-2-3-2】スプレッドシート設定システム初期化完了', 'info', 'Step 0-2-3-2');
  }

  // ========================================
  // Step 1-5: ChatGPTツール制御システム（統合）
  // chatgpt-tool-control.js から統合 - ChatGPTツールモード制御
  // ========================================

  /**
   * ChatGPTツール制御システム初期化
   */
  initializeChatGPTToolControl() {
    this.log('【StreamProcessor-ステップ1-5-1】ChatGPTツール制御初期化開始', 'info', 'Step 1-5-1');

    this.chatgptToolControl = {
      isMenuOpen: false,
      selectedTools: new Set()
    };

    this.log('【StreamProcessor-ステップ1-5-2】ChatGPTツール制御システム初期化完了', 'info', 'Step 1-5-2');
  }

  /**
   * 既存の選択ツールを解除
   */
  async clearChatGPTSelectedTools() {
    this.log('【StreamProcessor-ステップ1-5-3】選択中ツール解除開始', 'info', 'Step 1-5-3');

    const selectedButtons = document.querySelectorAll(
      'button[data-is-selected="true"]',
    );

    if (selectedButtons.length > 0) {
      this.log(
        `【StreamProcessor-ステップ1-5-4】選択中のツールを解除 (${selectedButtons.length}個)`,
        'info',
        'Step 1-5-4'
      );

      selectedButtons.forEach((btn) => {
        const toolName =
          btn.querySelector('[data-label="true"]')?.textContent?.trim() ||
          "ツール";
        this.log(`【StreamProcessor-ステップ1-5-5】${toolName}を解除`, 'info', 'Step 1-5-5');
        btn.click();
      });

      // 解除処理の完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    return selectedButtons.length;
  }

  /**
   * ツールメニューを開く
   */
  async openChatGPTToolsMenu() {
    this.log('【StreamProcessor-ステップ1-5-6】ツールメニューを開く', 'info', 'Step 1-5-6');

    const toolButton = Array.from(document.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent?.trim() === "ツール" &&
        btn.classList.contains("composer-btn"),
    );

    if (!toolButton) {
      this.log('【StreamProcessor-ステップ1-5-7】ツールボタンが見つかりません', 'error', 'Step 1-5-7');
      return false;
    }

    // focus + Enterキーで確実に開く
    toolButton.focus();
    const keyEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      bubbles: true,
    });
    toolButton.dispatchEvent(keyEvent);

    // メニューが開くまで待機
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 10;

      const checkMenu = () => {
        attempts++;
        const menuItems = document.querySelectorAll('[role="menuitemradio"]');

        if (menuItems.length > 0) {
          this.log('【StreamProcessor-ステップ1-5-8】ツールメニューが開きました', 'info', 'Step 1-5-8');
          this.chatgptToolControl.isMenuOpen = true;
          resolve(true);
        } else if (attempts >= maxAttempts) {
          this.log('【StreamProcessor-ステップ1-5-9】メニューを開けませんでした', 'error', 'Step 1-5-9');
          resolve(false);
        } else {
          setTimeout(checkMenu, 200);
        }
      };

      setTimeout(checkMenu, 200);
    });
  }

  /**
   * 利用可能なツール一覧を取得
   */
  getChatGPTAvailableTools() {
    const menuItems = document.querySelectorAll('[role="menuitemradio"]');
    const tools = [];

    menuItems.forEach((item, i) => {
      const text = item.textContent?.trim();
      const isChecked =
        item.getAttribute("aria-checked") === "true" ||
        item.getAttribute("data-state") === "checked";
      tools.push({
        index: i,
        name: text,
        selected: isChecked,
        element: item,
      });
    });

    return tools;
  }

  /**
   * 特定のツールを選択
   */
  async selectChatGPTTool(toolName) {
    this.log(`【StreamProcessor-ステップ1-5-10】${toolName}ツール選択開始`, 'info', 'Step 1-5-10');

    // 既存の選択を解除
    await this.clearChatGPTSelectedTools();

    // メニューを開く
    if (!(await this.openChatGPTToolsMenu())) {
      return false;
    }

    const tools = this.getChatGPTAvailableTools();
    const tool = tools.find((t) =>
      t.name?.toLowerCase().includes(toolName.toLowerCase()),
    );

    if (!tool) {
      this.log(`【StreamProcessor-ステップ1-5-11】${toolName}が見つかりません`, 'error', 'Step 1-5-11');
      return false;
    }

    if (!tool.selected) {
      tool.element.click();
      this.log(`【StreamProcessor-ステップ1-5-12】${toolName}を選択しました`, 'info', 'Step 1-5-12');
    } else {
      this.log(`【StreamProcessor-ステップ1-5-13】${toolName}は既に選択されています`, 'info', 'Step 1-5-13');
    }

    this.chatgptToolControl.selectedTools.clear();
    this.chatgptToolControl.selectedTools.add(toolName);

    return true;
  }

  /**
   * 現在選択されているツールを確認
   */
  getChatGPTCurrentTool() {
    const selectedBtn = document.querySelector(
      'button[data-is-selected="true"]',
    );

    if (selectedBtn) {
      const toolName = selectedBtn
        .querySelector('[data-label="true"]')
        ?.textContent?.trim();
      return toolName;
    }

    return null;
  }

  /**
   * ツールモード設定（統合用）
   */
  async enableChatGPTToolMode(toolType) {
    this.log(`【StreamProcessor-ステップ1-5-14】${toolType}モードを有効化`, 'info', 'Step 1-5-14');

    const toolMap = {
      ChatGPTAgent: "エージェントモード",
      ChatGPTCanvas: "canvas",
      ChatGPTWebSearch: "ウェブ検索",
      ChatGPTImage: "画像を作成",
      DeepResearch: "Deep Research",
    };

    const toolName = toolMap[toolType];
    if (!toolName) {
      this.log(`【StreamProcessor-ステップ1-5-15】未知のツールタイプ: ${toolType}`, 'error', 'Step 1-5-15');
      return false;
    }

    return await this.selectChatGPTTool(toolName);
  }

  /**
   * すべてのツールを無効化
   */
  async disableChatGPTAllTools() {
    this.log('【StreamProcessor-ステップ1-5-16】全ツール無効化開始', 'info', 'Step 1-5-16');

    const count = await this.clearChatGPTSelectedTools();
    this.log(`【StreamProcessor-ステップ1-5-17】${count}個のツールを無効化しました`, 'info', 'Step 1-5-17');
    this.chatgptToolControl.selectedTools.clear();
    return count;
  }

  // ================================================================================
  // Step 0-4-1: 排他制御ユーティリティ (exclusive-control.js統合)
  // ================================================================================

  /**
   * 排他制御ユーティリティの初期化
   */
  initializeExclusiveControl() {
    // タイムアウト設定（ミリ秒）
    this.exclusiveControlTimeouts = {
      'Deep Research': 40 * 60 * 1000,    // 40分
      'ディープリサーチ': 40 * 60 * 1000, // 40分（日本語）
      'エージェント': 40 * 60 * 1000,     // 40分
      'エージェントモード': 40 * 60 * 1000, // 40分
      'Canvas': 10 * 60 * 1000,           // 10分
      'ウェブ検索': 8 * 60 * 1000,        // 8分
      'Web Search': 8 * 60 * 1000,        // 8分
      '通常': 5 * 60 * 1000,              // 5分
      'default': 5 * 60 * 1000,           // 5分（デフォルト）
    };

    // マーカーフォーマット設定
    this.markerFormat = {
      prefix: '現在操作中です',
      separator: '_',
      includeTimestamp: true,
      includePCId: true,
      includeFunction: false,
    };

    // タイムアウトログのバッファ
    this.timeoutLogBuffer = [];
    this.timeoutLogTimer = null;

    this.log('【StreamProcessor-ステップ0-4-1】排他制御ユーティリティ初期化完了', 'info', 'Step 0-4-1');
  }

  /**
   * 排他制御マーカーを作成
   * @param {string} pcId - PC識別子
   * @param {Object} additionalData - 追加データ
   * @returns {string} マーカー文字列
   */
  createExclusiveMarker(pcId, additionalData = {}) {
    const parts = [];

    // プレフィックス
    parts.push(this.markerFormat.prefix);

    // タイムスタンプ（日本時間）
    if (this.markerFormat.includeTimestamp) {
      const now = new Date();
      const jstOffset = 9 * 60 * 60 * 1000; // +9時間をミリ秒に変換
      const jstDate = new Date(now.getTime() + jstOffset);

      // 日付部分 (YYYY-MM-DD)
      const dateStr = jstDate.toISOString().split('T')[0];
      parts.push(dateStr);

      // 時間部分 (HH:MM:SS)
      const timeStr = jstDate.toISOString().split('T')[1].split('.')[0];
      parts.push(timeStr);

      this.log('【StreamProcessor-ステップ0-4-1】新形式マーカー作成', 'debug', 'Step 0-4-1', {
        日付: dateStr,
        時刻: timeStr,
        JST: true,
        形式: '現在操作中です_日付_時刻_PC識別子'
      });
    }

    // PC識別子
    if (this.markerFormat.includePCId) {
      parts.push(pcId);
    }

    // 機能名（オプション）
    if (this.markerFormat.includeFunction && additionalData.function) {
      parts.push(additionalData.function);
    }

    // 追加のカスタムデータ
    if (additionalData.custom) {
      parts.push(additionalData.custom);
    }

    return parts.join(this.markerFormat.separator);
  }

  /**
   * マーカーを解析
   * @param {string} marker - マーカー文字列
   * @returns {Object|null} 解析結果
   */
  parseExclusiveMarker(marker) {
    if (!marker || typeof marker !== 'string') {
      return null;
    }

    // マーカーパターン: 現在操作中です_タイムスタンプ_PC識別子_機能名（オプション）
    const parts = marker.split(this.markerFormat.separator);

    if (parts.length >= 3) {
      let timestamp, pcId, functionName;

      // 新形式のチェック（日付_時刻が分離）: 現在操作中です_2025-09-13_04:50:56_ooeehlmj_98ae8_通常
      if (parts.length >= 4 && parts[1].match(/^\d{4}-\d{2}-\d{2}$/)) {
        // 新形式
        const dateStr = parts[1]; // 2025-09-13
        const timeStr = parts[2]; // 04:50:56
        timestamp = `${dateStr}T${timeStr}`;
        pcId = parts[3];
        functionName = parts.length >= 5 ? parts[4] : null;
      } else {
        // 旧形式
        timestamp = parts[1];
        pcId = parts[2];
        functionName = parts.length >= 4 ? parts[3] : null;
      }

      try {
        const timestampDate = new Date(timestamp);
        const age = Date.now() - timestampDate.getTime();

        return {
          original: marker,
          timestamp: timestampDate,
          timestampString: timestamp,
          pcId: pcId,
          functionName: functionName,
          age: age,
          ageMinutes: Math.floor(age / (60 * 1000)),
          isValid: !isNaN(timestampDate.getTime())
        };
      } catch (error) {
        this.log('【StreamProcessor-ステップ0-4-1】マーカー解析エラー', 'warn', 'Step 0-4-1', error);
        return null;
      }
    }

    // 旧形式のマーカー（タイムスタンプなし）の場合
    if (marker === this.markerFormat.prefix || marker === '現在操作中です') {
      return {
        original: marker,
        timestamp: null,
        pcId: 'unknown',
        age: Infinity, // 古いものとして扱う
        ageMinutes: Infinity,
        isValid: false,
        isLegacy: true
      };
    }

    return null;
  }

  /**
   * マーカーがタイムアウトしているか判定
   * @param {string} marker - マーカー文字列
   * @param {Object} task - タスクオブジェクト
   * @param {Object} customRules - カスタムルール
   * @returns {boolean} タイムアウトしている場合true
   */
  isExclusiveTimeout(marker, task, customRules = {}) {
    const parsed = this.parseExclusiveMarker(marker);

    if (!parsed) {
      // 解析できない場合はタイムアウトとみなす
      return true;
    }

    // 旧形式のマーカーは即座にタイムアウト
    if (parsed.isLegacy) {
      this.log('【StreamProcessor-ステップ0-4-1】旧形式マーカーを検出 - タイムアウトとして処理', 'info', 'Step 0-4-1');
      return true;
    }

    // 機能名を取得（タスクから、またはマーカーから）
    const functionName = task?.function || task?.displayedFunction || parsed.functionName || 'default';

    // タイムアウト時間を決定（優先順位: カスタムルール > 機能別設定 > デフォルト）
    const timeout = customRules[functionName] ||
                   this.exclusiveControlTimeouts[functionName] ||
                   this.exclusiveControlTimeouts.default;

    const isTimedOut = parsed.age > timeout;

    if (isTimedOut) {
      // セル位置を安全に取得
      const cell = (task?.column && task?.row) ? `${task.column}${task.row}` : 'unknown';

      // タイムアウトログをバッファに追加
      this.addExclusiveTimeoutLog({
        cell: cell,
        function: functionName,
        ageMinutes: parsed.ageMinutes,
        timeoutMinutes: Math.floor(timeout / (60 * 1000)),
        pcId: parsed.pcId
      });
    }

    return isTimedOut;
  }

  /**
   * マーカーが有効かチェック
   * @param {string} marker - マーカー文字列
   * @returns {boolean} 有効な場合true
   */
  isValidExclusiveMarker(marker) {
    const parsed = this.parseExclusiveMarker(marker);
    return parsed && parsed.isValid && !parsed.isLegacy;
  }

  /**
   * マーカーの年齢を取得（分単位）
   * @param {string} marker - マーカー文字列
   * @returns {number} 年齢（分）
   */
  getExclusiveMarkerAge(marker) {
    const parsed = this.parseExclusiveMarker(marker);
    return parsed ? parsed.ageMinutes : Infinity;
  }

  /**
   * 特定のPC IDのマーカーかチェック
   * @param {string} marker - マーカー文字列
   * @param {string} pcId - チェックするPC ID
   * @returns {boolean} 一致する場合true
   */
  isMarkerFromPC(marker, pcId) {
    const parsed = this.parseExclusiveMarker(marker);
    return parsed && parsed.pcId === pcId;
  }

  /**
   * 推奨待機時間を取得
   * @param {string} marker - マーカー文字列
   * @param {Object} task - タスクオブジェクト
   * @returns {number} 推奨待機時間（ミリ秒）
   */
  getRecommendedWaitTime(marker, task) {
    const parsed = this.parseExclusiveMarker(marker);

    if (!parsed || parsed.isLegacy) {
      return 0; // 即座に処理可能
    }

    const functionName = task?.function || parsed.functionName || 'default';
    const timeout = this.exclusiveControlTimeouts[functionName] || this.exclusiveControlTimeouts.default;
    const remaining = timeout - parsed.age;

    // 残り時間がある場合はその時間、ない場合は0
    return Math.max(0, remaining);
  }

  /**
   * タイムアウトログをバッファに追加し、まとめて出力
   * @param {Object} logData - ログデータ
   */
  addExclusiveTimeoutLog(logData) {
    this.timeoutLogBuffer.push(logData);

    // 既存のタイマーをクリア
    if (this.timeoutLogTimer) {
      clearTimeout(this.timeoutLogTimer);
    }

    // 100ms後にまとめて出力
    this.timeoutLogTimer = setTimeout(() => {
      if (this.timeoutLogBuffer.length > 0) {
        // 同じ関数・PCIDでグループ化
        const grouped = {};
        this.timeoutLogBuffer.forEach(log => {
          const key = `${log.function}_${log.pcId}`;
          if (!grouped[key]) {
            grouped[key] = {
              function: log.function,
              pcId: log.pcId,
              timeoutMinutes: log.timeoutMinutes,
              cells: [],
              ages: []
            };
          }
          grouped[key].cells.push(log.cell);
          grouped[key].ages.push(log.ageMinutes);
        });

        // グループごとにログ出力
        Object.values(grouped).forEach(group => {
          const avgAge = Math.floor(group.ages.reduce((a, b) => a + b, 0) / group.ages.length);
          this.log(`【StreamProcessor-ステップ0-4-1】マーカータイムアウト検出 (${group.cells.length}件)`, 'info', 'Step 0-4-1', {
            cells: group.cells.join(', '),
            function: group.function,
            avgAgeMinutes: avgAge,
            timeoutMinutes: group.timeoutMinutes,
            pcId: group.pcId
          });
        });

        // バッファをクリア
        this.timeoutLogBuffer = [];
      }
      this.timeoutLogTimer = null;
    }, 100);
  }

  // ================================================================================
  // Step 0-4-2: 排他制御マネージャー (exclusive-control-manager.js統合)
  // ================================================================================

  /**
   * 排他制御マネージャーの初期化
   */
  initializeExclusiveControlManager() {
    // イベントフック管理
    this.exclusiveControlHooks = {};

    // 処理中のロック情報を管理
    this.activeLocks = new Map();

    // 再試行スケジュール管理
    this.retrySchedules = new Map();

    this.log('【StreamProcessor-ステップ0-4-2】排他制御マネージャー初期化完了', 'info', 'Step 0-4-2', {
      pcId: this.pcId || 'StreamProcessor-integrated'
    });
  }

  /**
   * 排他制御イベントフックを登録
   * @param {string} event - イベント名
   * @param {Function} callback - コールバック関数
   */
  onExclusiveControlEvent(event, callback) {
    if (!this.exclusiveControlHooks[event]) {
      this.exclusiveControlHooks[event] = [];
    }
    this.exclusiveControlHooks[event].push(callback);
  }

  /**
   * 排他制御イベントをトリガー
   * @param {string} event - イベント名
   * @param {Object} data - イベントデータ
   */
  async triggerExclusiveControlEvent(event, data) {
    const callbacks = this.exclusiveControlHooks[event] || [];
    for (const callback of callbacks) {
      try {
        await callback(data);
      } catch (error) {
        this.log(`【StreamProcessor-ステップ0-4-2】イベントフックエラー (${event})`, 'error', 'Step 0-4-2', error);
      }
    }
  }

  /**
   * ロックを取得
   * @param {Object} task - タスクオブジェクト
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @param {Object} options - オプション
   * @returns {Object} 取得結果
   */
  async acquireExclusiveLock(task, sheetsClient, options = {}) {
    const { spreadsheetId, gid } = options;
    const cellRef = `${task.column}${task.row}`;

    try {
      // フック: ロック取得前
      await this.triggerExclusiveControlEvent('beforeAcquire', { task, cellRef });

      // 現在の値を取得
      let sheetName;
      let currentValue;

      try {
        sheetName = await sheetsClient.getSheetNameFromGid(spreadsheetId, gid);
        this.log(`【StreamProcessor-ステップ0-4-2】シート名取得成功: ${sheetName}`, 'debug', 'Step 0-4-2');

        currentValue = await sheetsClient.getCellValue(
          spreadsheetId,
          sheetName,
          cellRef
        );
      } catch (error) {
        // フォールバック: 従来のgetCellメソッドを使用
        if (sheetsClient.getCell && typeof sheetsClient.getCell === 'function') {
          currentValue = await sheetsClient.getCell(
            spreadsheetId,
            cellRef,
            gid
          );
        } else {
          throw error;
        }
      }

      // 既存のマーカーチェック
      if (currentValue && currentValue.includes('現在操作中です')) {
        const handled = await this.handleExistingMarker(
          currentValue,
          task,
          sheetsClient,
          options
        );

        if (!handled.canProceed) {
          await this.triggerExclusiveControlEvent('lockDenied', { task, cellRef, reason: handled.reason });
          return {
            success: false,
            reason: handled.reason,
            marker: currentValue,
            recommendedWaitTime: handled.recommendedWaitTime
          };
        }
      }

      // 新しいマーカーを作成
      const newMarker = this.createExclusiveMarker(this.pcId || 'StreamProcessor', {
        function: task.function || task.displayedFunction
      });

      // マーカーを設定
      await sheetsClient.updateCell(
        spreadsheetId,
        cellRef,
        newMarker,
        gid
      );

      // アクティブロックとして記録
      this.activeLocks.set(cellRef, {
        marker: newMarker,
        task: task,
        acquiredAt: new Date()
      });

      // フック: ロック取得後
      await this.triggerExclusiveControlEvent('afterAcquire', {
        task,
        cellRef,
        marker: newMarker,
        success: true
      });

      this.log(`【StreamProcessor-ステップ0-4-2】ロック取得成功: ${cellRef}`, 'info', 'Step 0-4-2');

      return {
        success: true,
        marker: newMarker,
        cellRef: cellRef
      };

    } catch (error) {
      this.log(`【StreamProcessor-ステップ0-4-2】ロック取得エラー: ${cellRef}`, 'error', 'Step 0-4-2', error);

      await this.triggerExclusiveControlEvent('acquireError', { task, cellRef, error });

      return {
        success: false,
        reason: 'error',
        error: error
      };
    }
  }

  /**
   * ロックを解放
   * @param {Object} task - タスクオブジェクト
   * @param {string} newValue - 新しい値（AIの応答など）
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @param {Object} options - オプション
   */
  async releaseExclusiveLock(task, newValue, sheetsClient, options = {}) {
    const { spreadsheetId, gid } = options;
    const cellRef = `${task.column}${task.row}`;

    try {
      // フック: ロック解放前
      await this.triggerExclusiveControlEvent('beforeRelease', { task, cellRef, newValue });

      // 新しい値を書き込み（マーカーを上書き）
      await sheetsClient.updateCell(
        spreadsheetId,
        cellRef,
        newValue,
        gid
      );

      // アクティブロックから削除
      this.activeLocks.delete(cellRef);

      // フック: ロック解放後
      await this.triggerExclusiveControlEvent('afterRelease', { task, cellRef, success: true });

      this.log(`【StreamProcessor-ステップ0-4-2】ロック解放成功: ${cellRef}`, 'info', 'Step 0-4-2');

      return { success: true };

    } catch (error) {
      this.log(`【StreamProcessor-ステップ0-4-2】ロック解放エラー: ${cellRef}`, 'error', 'Step 0-4-2', error);

      await this.triggerExclusiveControlEvent('releaseError', { task, cellRef, error });

      return {
        success: false,
        error: error
      };
    }
  }

  /**
   * 既存マーカーの処理
   * @param {string} marker - 既存のマーカー
   * @param {Object} task - タスクオブジェクト
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @param {Object} options - オプション
   * @returns {Object} 処理結果
   */
  async handleExistingMarker(marker, task, sheetsClient, options = {}) {
    const strategy = options.strategy || 'smart';

    const strategies = {
      'aggressive': () => this.aggressiveExclusiveStrategy(marker, task),
      'polite': () => this.politeExclusiveStrategy(marker, task),
      'smart': () => this.smartExclusiveStrategy(marker, task),
      'default': () => this.smartExclusiveStrategy(marker, task)
    };

    const strategyFn = strategies[strategy] || strategies.default;
    return await strategyFn();
  }

  /**
   * スマート戦略（推奨）
   * @param {string} marker - マーカー
   * @param {Object} task - タスクオブジェクト
   */
  async smartExclusiveStrategy(marker, task) {
    // 自分のマーカーの場合は即座に処理可能
    if (this.isMarkerFromPC(marker, this.pcId || 'StreamProcessor')) {
      this.log('【StreamProcessor-ステップ0-4-2】自分のマーカーを検出 - 処理続行', 'info', 'Step 0-4-2');
      return { canProceed: true, reason: 'own-marker' };
    }

    // タイムアウトチェック
    if (this.isExclusiveTimeout(marker, task)) {
      this.log('【StreamProcessor-ステップ0-4-2】タイムアウトしたマーカー - 上書き可能', 'info', 'Step 0-4-2');
      return { canProceed: true, reason: 'timeout' };
    }

    // まだタイムアウトしていない場合
    const recommendedWaitTime = this.getRecommendedWaitTime(marker, task);

    this.log('【StreamProcessor-ステップ0-4-2】他PCが作業中 - 待機推奨', 'info', 'Step 0-4-2', {
      recommendedWaitMinutes: Math.ceil(recommendedWaitTime / (60 * 1000))
    });

    return {
      canProceed: false,
      reason: 'locked-by-other',
      recommendedWaitTime: recommendedWaitTime
    };
  }

  /**
   * アグレッシブ戦略（強制上書き）
   * @param {string} marker - マーカー
   * @param {Object} task - タスクオブジェクト
   */
  async aggressiveExclusiveStrategy(marker, task) {
    this.log('【StreamProcessor-ステップ0-4-2】アグレッシブ戦略 - 強制上書き', 'warn', 'Step 0-4-2');
    return { canProceed: true, reason: 'forced' };
  }

  /**
   * ポライト戦略（常に待機）
   * @param {string} marker - マーカー
   * @param {Object} task - タスクオブジェクト
   */
  async politeExclusiveStrategy(marker, task) {
    const recommendedWaitTime = this.getRecommendedWaitTime(marker, task);

    this.log('【StreamProcessor-ステップ0-4-2】ポライト戦略 - 待機', 'info', 'Step 0-4-2');

    return {
      canProceed: false,
      reason: 'polite-wait',
      recommendedWaitTime: recommendedWaitTime || 5 * 60 * 1000 // 最低5分待機
    };
  }

  /**
   * 再処理をスケジュール
   * @param {Object} task - タスクオブジェクト
   * @param {number} waitTime - 待機時間（ミリ秒）
   * @param {Function} callback - コールバック関数
   */
  scheduleExclusiveRetry(task, waitTime, callback) {
    const cellRef = `${task.column}${task.row}`;

    // 既存のスケジュールをキャンセル
    if (this.retrySchedules.has(cellRef)) {
      clearTimeout(this.retrySchedules.get(cellRef));
    }

    const timeoutId = setTimeout(async () => {
      this.log(`【StreamProcessor-ステップ0-4-2】再処理実行: ${cellRef}`, 'info', 'Step 0-4-2');

      try {
        await callback();
      } catch (error) {
        this.log(`【StreamProcessor-ステップ0-4-2】再処理エラー: ${cellRef}`, 'error', 'Step 0-4-2', error);
      } finally {
        this.retrySchedules.delete(cellRef);
      }
    }, waitTime);

    this.retrySchedules.set(cellRef, timeoutId);

    this.log(`【StreamProcessor-ステップ0-4-2】再処理スケジュール設定: ${cellRef}`, 'info', 'Step 0-4-2', {
      waitMinutes: Math.round(waitTime / (60 * 1000))
    });
  }

  /**
   * アクティブロックの状態を取得
   * @returns {Object} ロック状態
   */
  getActiveExclusiveLocks() {
    const locks = {};
    for (const [cellRef, lockInfo] of this.activeLocks.entries()) {
      locks[cellRef] = {
        marker: lockInfo.marker,
        acquiredAt: lockInfo.acquiredAt.toISOString(),
        durationMs: Date.now() - lockInfo.acquiredAt.getTime()
      };
    }
    return locks;
  }

  /**
   * すべてのアクティブロックをクリア（緊急用）
   */
  clearAllExclusiveLocks() {
    const count = this.activeLocks.size;
    this.activeLocks.clear();

    for (const [cellRef, timeoutId] of this.retrySchedules.entries()) {
      clearTimeout(timeoutId);
    }
    this.retrySchedules.clear();

    this.log(`【StreamProcessor-ステップ0-4-2】すべてのロックをクリア: ${count}個`, 'warn', 'Step 0-4-2');

    return count;
  }

  // ================================================================================
  // Step 1-6: 排他制御ログヘルパー (exclusive-control-logger-helper.js統合)
  // ================================================================================

  /**
   * 排他制御ログヘルパーの初期化
   */
  initializeExclusiveControlLoggerHelper() {
    // ログヘルパーの設定
    this.exclusiveLoggerConfig = {
      spreadsheetLogger: this.spreadsheetLogger || null,
      spreadsheetData: this.spreadsheetData || null,
      sheetsClient: this.sheetsClient || null
    };

    this.log('【StreamProcessor-ステップ1-6】排他制御ログヘルパー初期化完了', 'info', 'Step 1-6', {
      hasSpreadsheetLogger: !!this.exclusiveLoggerConfig.spreadsheetLogger,
      hasSpreadsheetData: !!this.exclusiveLoggerConfig.spreadsheetData,
      hasSheetsClient: !!this.exclusiveLoggerConfig.sheetsClient
    });

    // 排他制御イベントフックを設定
    this.setupExclusiveControlEventHooks();
  }

  /**
   * 排他制御イベントフックの設定
   */
  setupExclusiveControlEventHooks() {
    // ロック取得成功時
    this.onExclusiveControlEvent('afterAcquire', async (eventData) => {
      if (eventData.success) {
        await this.logExclusiveControlEvent(eventData.task, {
          action: 'EXCLUSIVE_CONTROL',
          type: 'LOCK_ACQUIRED',
          cell: eventData.cellRef,
          marker: eventData.marker
        });
      }
    });

    // ロック解放時
    this.onExclusiveControlEvent('afterRelease', async (eventData) => {
      await this.logExclusiveControlEvent(eventData.task, {
        action: 'EXCLUSIVE_CONTROL',
        type: 'LOCK_RELEASED',
        cell: eventData.cellRef
      });
    });

    // ロック取得拒否時
    this.onExclusiveControlEvent('lockDenied', async (eventData) => {
      await this.logExclusiveControlEvent(eventData.task, {
        action: 'EXCLUSIVE_CONTROL',
        type: 'LOCK_DENIED',
        cell: eventData.cellRef,
        reason: eventData.reason
      });
    });

    // エラー時
    this.onExclusiveControlEvent('acquireError', async (eventData) => {
      await this.logExclusiveControlEvent(eventData.task, {
        action: 'EXCLUSIVE_CONTROL',
        type: 'ERROR',
        cell: eventData.cellRef,
        error: eventData.error?.message || 'Unknown error'
      });
    });

    this.log('【StreamProcessor-ステップ1-6】イベントフック設定完了', 'info', 'Step 1-6');
  }

  /**
   * 排他制御ログヘルパー設定の更新
   * @param {Object} config - 設定オブジェクト
   */
  updateExclusiveLoggerConfig(config) {
    const oldConfig = {
      hasSpreadsheetLogger: !!this.exclusiveLoggerConfig.spreadsheetLogger,
      hasSpreadsheetData: !!this.exclusiveLoggerConfig.spreadsheetData,
      hasSheetsClient: !!this.exclusiveLoggerConfig.sheetsClient
    };

    this.exclusiveLoggerConfig.spreadsheetLogger = config.spreadsheetLogger || this.exclusiveLoggerConfig.spreadsheetLogger;
    this.exclusiveLoggerConfig.spreadsheetData = config.spreadsheetData || this.exclusiveLoggerConfig.spreadsheetData;
    this.exclusiveLoggerConfig.sheetsClient = config.sheetsClient || this.exclusiveLoggerConfig.sheetsClient;

    const newConfig = {
      hasSpreadsheetLogger: !!this.exclusiveLoggerConfig.spreadsheetLogger,
      hasSpreadsheetData: !!this.exclusiveLoggerConfig.spreadsheetData,
      hasSheetsClient: !!this.exclusiveLoggerConfig.sheetsClient
    };

    this.log('【StreamProcessor-ステップ1-6】設定更新完了', 'info', 'Step 1-6', {
      before: oldConfig,
      after: newConfig,
      spreadsheetId: this.exclusiveLoggerConfig.spreadsheetData?.spreadsheetId ?
        `${this.exclusiveLoggerConfig.spreadsheetData.spreadsheetId.substring(0, 10)}...` : 'null'
    });
  }

  /**
   * 排他制御イベントをSpreadsheetLoggerに記録
   * @param {Object} task - タスクオブジェクト
   * @param {Object} logData - ログデータ
   * @returns {Promise<boolean>} 成功/失敗
   */
  async logExclusiveControlEvent(task, logData) {
    if (!this.exclusiveLoggerConfig.spreadsheetLogger) {
      this.log('【StreamProcessor-ステップ1-6】SpreadsheetLoggerが未設定', 'warn', 'Step 1-6');
      return false;
    }

    try {
      // 共通パラメータを生成
      const commonParams = this.generateExclusiveLogParams();

      // ログデータにタイムスタンプを追加
      const enrichedLogData = {
        ...logData,
        timestamp: new Date().toISOString(),
        isFirstTask: false // 排他制御ログは追加モード
      };

      this.log('【StreamProcessor-ステップ1-6】ログ記録実行', 'debug', 'Step 1-6', {
        action: enrichedLogData.action,
        type: enrichedLogData.type,
        cell: enrichedLogData.cell
      });

      // SpreadsheetLoggerを呼び出し
      await this.exclusiveLoggerConfig.spreadsheetLogger.writeLogToSpreadsheet(task, {
        ...commonParams,
        ...enrichedLogData,
        onComplete: (task, logCell, writeVerified, error) => {
          if (error) {
            this.log('【StreamProcessor-ステップ1-7】ログ書き込み完了コールバック - エラー', 'warn', 'Step 1-7', { logCell, error });
          } else {
            this.log('【StreamProcessor-ステップ1-7】ログ書き込み完了コールバック', 'debug', 'Step 1-7', { logCell, writeVerified });
          }
        }
      });

      this.log('【StreamProcessor-ステップ1-6】ログ記録成功', 'debug', 'Step 1-6');
      return true;

    } catch (error) {
      this.log('【StreamProcessor-ステップ1-6】ログ記録エラー', 'error', 'Step 1-6', {
        errorMessage: error.message,
        taskInfo: task ? `${task.column}${task.row}` : 'null',
        logDataAction: logData.action
      });
      return false;
    }
  }

  /**
   * 排他制御ログ用共通パラメータを生成
   * @returns {Object} 共通パラメータ
   */
  generateExclusiveLogParams() {
    const params = {
      url: 'N/A', // 排他制御ログなのでURL不要
      sheetsClient: this.exclusiveLoggerConfig.sheetsClient || this.sheetsClient,
      spreadsheetId: this.exclusiveLoggerConfig.spreadsheetData?.spreadsheetId,
      gid: this.exclusiveLoggerConfig.spreadsheetData?.gid,
      spreadsheetData: this.exclusiveLoggerConfig.spreadsheetData
    };

    this.log('【StreamProcessor-ステップ1-6】共通パラメータ生成', 'debug', 'Step 1-6', {
      hasLocalSheetsClient: !!this.exclusiveLoggerConfig.sheetsClient,
      hasThisSheetsClient: !!this.sheetsClient,
      hasSpreadsheetData: !!this.exclusiveLoggerConfig.spreadsheetData,
      spreadsheetId: params.spreadsheetId ? `${params.spreadsheetId.substring(0, 10)}...` : 'null',
      gid: params.gid
    });

    return params;
  }

  /**
   * 排他制御ログヘルパー設定の有効性をチェック
   * @returns {Object} 設定チェック結果
   */
  validateExclusiveLoggerConfig() {
    const result = {
      isValid: true,
      warnings: [],
      errors: []
    };

    if (!this.exclusiveLoggerConfig.spreadsheetLogger) {
      result.errors.push('SpreadsheetLoggerが設定されていません');
      result.isValid = false;
    }

    if (!this.exclusiveLoggerConfig.spreadsheetData) {
      result.warnings.push('spreadsheetDataが設定されていません');
    } else {
      if (!this.exclusiveLoggerConfig.spreadsheetData.spreadsheetId) {
        result.errors.push('spreadsheetIdが設定されていません');
        result.isValid = false;
      }
      if (!this.exclusiveLoggerConfig.spreadsheetData.gid) {
        result.warnings.push('gidが設定されていません');
      }
    }

    if (!this.exclusiveLoggerConfig.sheetsClient && !this.sheetsClient) {
      result.errors.push('sheetsClientが設定されていません');
      result.isValid = false;
    }

    return result;
  }

  // ========================================
  // Step 12: グループ完了時ログ・回答記録
  // タスクグループ完了時にログ列と回答列に記録を行う
  // ========================================

  /**
   * グループ完了時のログ・回答記録
   * @param {Object} taskGroupInfo - タスクグループ情報
   * @param {Object} spreadsheetData - スプレッドシートデータ
   */
  async writeGroupLogsAndResponses(taskGroupInfo, spreadsheetData) {
    try {
      this.logger.log(`[StreamProcessorV2] 📝 グループログ・回答記録開始: ${taskGroupInfo.id}`);

      // 🔍 [DEBUG] 記録処理状態確認
      console.log(`🔍 [DEBUG] 記録処理開始 - グループID: ${taskGroupInfo?.id}`);
      console.log(`- taskGroupInfo存在: ${!!taskGroupInfo}`);
      console.log(`- globalThis.logManager存在: ${!!globalThis.logManager}`);
      console.log(`- this.spreadsheetLogger存在: ${!!this.spreadsheetLogger}`);

      // 内部のSpreadsheetLoggerを使用
      const externalLogger = this.spreadsheetLogger;
      if (!externalLogger) {
        console.log(`🔍 [DEBUG] ❌ SpreadsheetLoggerが初期化されていません`);
        this.logger.warn('[StreamProcessorV2] SpreadsheetLoggerが初期化されていません');
        return;
      }

      // グループの作業行範囲を取得
      const workRows = this.getWorkRowRange();
      console.log(`🔍 [DEBUG] 作業行取得結果:`);
      console.log(`- workRows存在: ${!!workRows}`);
      console.log(`- workRows数: ${workRows?.length}`);
      if (!workRows || workRows.length === 0) {
        console.log(`🔍 [DEBUG] ❌ 作業行が見つかりません`);
        this.logger.warn('[StreamProcessorV2] 作業行が見つかりません');
        return;
      }

      // グループのログ列と回答列を特定
      const logColumn = taskGroupInfo.columnRange?.logColumn;
      const answerColumns = taskGroupInfo.columnRange?.answerColumns || [];

      // 🔍 [DEBUG] カラム情報確認
      console.log(`🔍 [DEBUG] カラム情報:`);
      console.log(`- logColumn: ${logColumn}`);
      console.log(`- answerColumns数: ${answerColumns?.length}`);
      console.log(`- answerColumns: ${JSON.stringify(answerColumns)}`);
      console.log(`- taskGroupInfo.columnRange: ${JSON.stringify(taskGroupInfo.columnRange)}`);
      console.log(`- sheetsClient存在: ${!!this.sheetsClient}`);

      this.logger.log(`[StreamProcessorV2] グループ構造:`, {
        logColumn: logColumn,
        answerColumnsCount: answerColumns.length,
        workRowsCount: workRows.length
      });

      // 各作業行に対してログと回答を記録
      for (const workRow of workRows) {
        const rowNumber = workRow.number;

        // ログ列への記録
        if (logColumn) {
          await this.writeGroupLogToCell(
            logColumn,
            rowNumber,
            taskGroupInfo,
            externalLogger,
            spreadsheetData
          );
        }

        // 回答列への記録
        for (const answerCol of answerColumns) {
          await this.writeGroupResponseToCell(
            answerCol,
            rowNumber,
            taskGroupInfo,
            externalLogger,
            spreadsheetData
          );
        }
      }

      this.logger.log(`[StreamProcessorV2] ✅ グループログ・回答記録完了: ${taskGroupInfo.id}`);

    } catch (error) {
      this.logger.error('[StreamProcessorV2] グループログ・回答記録エラー:', error);
      throw error;
    }
  }

  /**
   * グループログをセルに記録
   * @param {string} logColumn - ログ列
   * @param {number} rowNumber - 行番号
   * @param {Object} taskGroupInfo - タスクグループ情報
   * @param {Object} externalLogger - 外部SpreadsheetLogger
   * @param {Object} spreadsheetData - スプレッドシートデータ
   */
  async writeGroupLogToCell(logColumn, rowNumber, taskGroupInfo, externalLogger, spreadsheetData) {
    try {
      // ダミータスクを作成（外部SpreadsheetLoggerのインターフェースに合わせる）
      const dummyTask = {
        id: `${taskGroupInfo.id}_log_${rowNumber}`,
        row: rowNumber,
        column: logColumn,
        logColumns: [logColumn],
        aiType: taskGroupInfo.aiType || 'Claude',
        model: '通常',
        displayedModel: '通常',
        function: '通常',
        displayedFunction: '通常'
      };

      // 送信時刻を記録（現在時刻で仮設定）
      const currentTime = new Date();
      externalLogger.recordSendTimestamp(dummyTask.id, dummyTask, currentTime);

      // ログを記録
      const result = await externalLogger.writeLogToSpreadsheet(dummyTask, {
        sheetsClient: this.sheetsClient,
        spreadsheetId: spreadsheetData.spreadsheetId,
        gid: spreadsheetData.gid,
        spreadsheetData: spreadsheetData,
        onComplete: (task, logCell, writeVerified, error) => {
          if (error) {
            this.logger.warn(`[StreamProcessorV2] ログ書き込み完了コールバック - エラー: ${logCell}`, error);
          } else {
            this.logger.log(`[StreamProcessorV2] ログ書き込み完了コールバック: ${logCell} (検証: ${writeVerified})`);
          }
        }
      });

      if (result.success) {
        this.logger.log(`[StreamProcessorV2] ログ記録成功: ${logColumn}${rowNumber}`);
      } else {
        this.logger.warn(`[StreamProcessorV2] ログ記録失敗: ${logColumn}${rowNumber} - ${result.error}`);
      }

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ログ記録エラー ${logColumn}${rowNumber}:`, error);
    }
  }

  /**
   * グループ回答をセルに記録
   * @param {Object} answerCol - 回答列情報
   * @param {number} rowNumber - 行番号
   * @param {Object} taskGroupInfo - タスクグループ情報
   * @param {Object} externalLogger - 外部SpreadsheetLogger
   * @param {Object} spreadsheetData - スプレッドシートデータ
   */
  async writeGroupResponseToCell(answerCol, rowNumber, taskGroupInfo, externalLogger, spreadsheetData) {
    try {
      const columnLetter = answerCol.column || this.indexToColumn(answerCol.index);

      // スプレッドシートから現在の回答を取得
      const cellData = await this.getCellValue(spreadsheetData, columnLetter, rowNumber);

      if (!cellData || cellData.trim() === '') {
        this.logger.log(`[StreamProcessorV2] 回答セル空白のためスキップ: ${columnLetter}${rowNumber}`);
        return;
      }

      // SheetsClientを使って回答をそのまま確実に記録
      if (this.sheetsClient && this.sheetsClient.updateCell) {
        await this.sheetsClient.updateCell(
          spreadsheetData.spreadsheetId,
          `${columnLetter}${rowNumber}`,
          cellData,
          spreadsheetData.gid
        );

        this.logger.log(`[StreamProcessorV2] 回答記録成功: ${columnLetter}${rowNumber}`);
      }

    } catch (error) {
      this.logger.error(`[StreamProcessorV2] 回答記録エラー ${answerCol.column}${rowNumber}:`, error);
    }
  }
}