/**
 * @fileoverview AI検出テストシステム コントローラー V2 - ステップ構造化版
 *
 * 【ステップ構成】
 * Step 0: 初期化・設定 - システムの基本設定とモジュール初期化
 * Step 1: メインエントリーポイント - 4分割ウィンドウ作成と検出制御
 * Step 2: ウィンドウ作成・管理 - 本番のWindowServiceを使用したウィンドウ管理
 * Step 3: 検出・スクリプト注入 - 本番のAITaskExecutorを使用した統一処理
 * Step 4: 並列処理・結果集計 - StreamProcessorV2のパターンを流用
 * Step 5: データ保存・クリーンアップ - 結果保存とリソース解放
 *
 * ============================================================================
 * 主要機能:
 * ============================================================================
 * 1. 4分割ウィンドウでのAI検出: ChatGPT、Claude、Geminiを同時表示
 * 2. 本番コード統合: WindowService、AITaskExecutor、RetryManagerを使用
 * 3. 並列検出処理: 3つのAIを同時に検出して効率化
 * 4. データ永続化: chrome.storageへの結果保存
 * 5. 自動クリーンアップ: 検出完了後のウィンドウ自動クローズ
 *
 * @version 2.0.0
 * @updated 2025-09-14 ステップ構造化、本番コード統合
 */

// ========================================
// Step 0: 初期化・設定
// システム全体の基本設定と依存モジュールの初期化を行う
// ========================================

// Step 0-1: 依存モジュールのインポート（本番コードを使用）
// 本番コードの統一インポート（StreamProcessorV2と同じパターン）
import { WindowService } from '../../services/window-service.js';
import { AITaskExecutor } from '../../core/ai-task-executor.js';
import { RetryManager } from '../../utils/retry-manager.js';

// Step 0-2: AI検出システム設定定義
const AI_DETECTION_CONFIG = {
  windowCloseDelay: 5000,        // 自動クローズまでの遅延時間（ミリ秒）
  pageLoadTimeout: 10000,        // ページ読み込み待機タイムアウト（ミリ秒）
  retryCount: 3,                 // 失敗時のリトライ回数
  windowCreationDelay: 300       // ウィンドウ作成間隔（ミリ秒）
};

// Step 0-3: AI検出ウィンドウの管理変数
let aiDetectionWindows = [];

// Step 0-4: 共通サービスインスタンス（本番コード統合）
let aiTaskExecutor = null;
let retryManager = null;

// Step 0-5: MutationObserver関連の状態管理（統合機能）
let isAIMutationSystemRunning = false;
let currentMutationObserver = null;

// Step 0-5: AI検出用の設定マップ
const AI_CONFIG_MAP = {
  'ChatGPT': {
    url: 'https://chatgpt.com',
    position: 'topLeft',
    aiType: 'chatgpt'
  },
  'Claude': {
    url: 'https://claude.ai',
    position: 'topRight',
    aiType: 'claude'
  },
  'Gemini': {
    url: 'https://gemini.google.com',
    position: 'bottomLeft',
    aiType: 'gemini'
  }
};

// ========================================
// Step 1: メインエントリーポイント
// 4分割ウィンドウの作成から検出完了までの全体制御を行う
// ========================================

/**
 * Step 1: AI検出システムメインエントリーポイント
 *
 * StreamProcessorV2と同じパターンでステップ化された検出処理を実行します。
 * 本番のWindowServiceとAITaskExecutorを使用して統一された処理を行います。
 *
 * @param {Function} updateStatus - ステータス更新関数
 * @param {Function} injectAutomationScripts - スクリプト注入関数（後方互換性のため保持）
 */
export async function runAIDetectionSystem(updateStatus, injectAutomationScripts) {
  console.log('Step 1: AI検出システムメインエントリーポイント開始', 'step', 'Step 1');
  console.log('Step 1-0: 4分割ウィンドウでのAI検出処理を開始します', 'info', 'Step 1-0');

  try {
    // Step 1-1: 共通サービス初期化（本番コードを使用）
    console.log('Step 1-1: 共通サービス初期化処理開始', 'info', 'Step 1-1');
    console.log('Step 1-1-1: AITaskExecutorインスタンス作成中', 'info', 'Step 1-1-1');
    aiTaskExecutor = new AITaskExecutor(console);
    console.log('Step 1-1-2: RetryManagerインスタンス作成中', 'info', 'Step 1-1-2');
    retryManager = new RetryManager(console);
    console.log('Step 1-1-3: 共通サービス初期化完了', 'info', 'Step 1-1-3');

    // Step 1-2: スクリーン情報取得とレイアウト計算
    console.log('Step 1-2: スクリーン情報取得とレイアウト計算処理開始', 'info', 'Step 1-2');
    console.log('Step 1-2-1: WindowServiceでスクリーン情報を取得中', 'info', 'Step 1-2-1');
    const screenInfo = await WindowService.getScreenInfo();
    console.log('Step 1-2-2: 4分割レイアウト計算中', 'info', 'Step 1-2-2');
    const quadLayout = WindowService.calculateQuadLayout(screenInfo);

    console.log(`Step 1-2-3: 📊 画面サイズ確認 - ${screenInfo.width}x${screenInfo.height}`, 'info', 'Step 1-2-3');
    console.log(`Step 1-2-4: 📐 各ウィンドウサイズ確認 - ${quadLayout.topLeft.width}x${quadLayout.topLeft.height}`, 'info', 'Step 1-2-4');
    console.log('Step 1-2-5: レイアウト計算処理完了', 'info', 'Step 1-2-5');

    // Step 1-3: 既存ウィンドウのクリーンアップ
    console.log('Step 1-3: 既存ウィンドウクリーンアップ処理開始', 'info', 'Step 1-3');
    console.log(`Step 1-3-1: 既存ウィンドウ数確認 - ${aiDetectionWindows.length}個`, 'info', 'Step 1-3-1');
    if (aiDetectionWindows.length > 0) {
      console.log(`Step 1-3-2: 🧹 ${aiDetectionWindows.length}個の既存ウィンドウクローズ実行中`, 'info', 'Step 1-3-2');
      await closeAIDetectionWindows();
      console.log('Step 1-3-3: 既存ウィンドウクローズ完了', 'info', 'Step 1-3-3');
    } else {
      console.log('Step 1-3-2: クリーンアップ対象ウィンドウなし', 'info', 'Step 1-3-2');
    }
    console.log('Step 1-3-4: ウィンドウクリーンアップ処理完了', 'info', 'Step 1-3-4');

    // Step 1-4: 3つのAIウィンドウを順次作成
    console.log('3つのAIウィンドウを順次作成', 'info', 'Step 1-4');

    // Step 1-4-1: ChatGPTウィンドウを左上に作成
    console.log('ChatGPTウィンドウを作成中（左上）', 'info', 'Step 1-4-1');
    const chatgptWindow = await createAIWindowWithPosition(
      'ChatGPT',
      quadLayout.topLeft
    );
    await sleep(AI_DETECTION_CONFIG.windowCreationDelay);

    // Step 1-4-2: Claudeウィンドウを右上に作成
    console.log('Claudeウィンドウを作成中（右上）', 'info', 'Step 1-4-2');
    const claudeWindow = await createAIWindowWithPosition(
      'Claude',
      quadLayout.topRight
    );
    await sleep(AI_DETECTION_CONFIG.windowCreationDelay);

    // Step 1-4-3: Geminiウィンドウを左下に作成
    console.log('Geminiウィンドウを作成中（左下）', 'info', 'Step 1-4-3');
    const geminiWindow = await createAIWindowWithPosition(
      'Gemini',
      quadLayout.bottomLeft
    );

    // Step 1-5: 検出対象ウィンドウの準備
    console.log('🎯 4分割ウィンドウを作成完了。検出処理を準備', 'info', 'Step 1-5');
    const detectionWindows = [
      { window: chatgptWindow, name: 'ChatGPT', config: AI_CONFIG_MAP['ChatGPT'] },
      { window: claudeWindow, name: 'Claude', config: AI_CONFIG_MAP['Claude'] },
      { window: geminiWindow, name: 'Gemini', config: AI_CONFIG_MAP['Gemini'] }
    ];

    // Step 1-6: 並列検出処理の実行（StreamProcessorV2のパターンを使用）
    console.log('🚀 3つのAIで並列検出処理を開始', 'info', 'Step 1-6');
    const results = await executeDetectionInParallel(detectionWindows, updateStatus);

    // Step 1-7: 検出結果の集計と分析
    console.log('検出結果を集計して分析', 'info', 'Step 1-7');
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const errorCount = results.length - successCount;

    console.log(`📊 並列検出結果: 成功 ${successCount}件, エラー ${errorCount}件`, 'info', 'Step 1-7-1');

    // Step 1-8: データ保存処理
    console.log('検出データを永続化', 'info', 'Step 1-8');
    await saveDetectionResults(results, detectionWindows);

    // Step 1-9: 成功通知と自動クリーンアップ設定
    console.log('🎉 すべてのAI検出が完了。自動クリーンアップを設定', 'info', 'Step 1-9');
    const successMessage = `すべてのAI検出が完了しました。${AI_DETECTION_CONFIG.windowCloseDelay / 1000}秒後に自動でウィンドウを閉じます...`;
    updateStatus(successMessage, "success");

    // Step 1-9-1: 遅延クリーンアップの設定
    setTimeout(async () => {
      console.log('自動クリーンアップを実行', 'info', 'Step 1-9-1');
      await closeAIDetectionWindows();
      updateStatus("AI検出完了。ウィンドウを閉じました。", "success");
    }, AI_DETECTION_CONFIG.windowCloseDelay);

  } catch (error) {
    // Step 1-10: エラーハンドリングとクリーンアップ
    console.error('❌ AI検出システムでエラーが発生', 'error', 'Step 1-10');
    console.error('エラー詳細:', error);
    updateStatus(`AI検出エラー: ${error.message}`, "error");

    // 緊急クリーンアップ
    await closeAIDetectionWindows();
  }
}

// Step 1-11: 共通ヘルパー関数（sleep）
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// Step 2: ウィンドウ作成・管理
// 本番のWindowServiceを使用したウィンドウ作成と管理機能
// ========================================

/**
 * Step 2-1: 位置指定付きAIウィンドウ作成
 *
 * StreamProcessorV2と同じWindowServiceを使用してウィンドウを作成します。
 * 本番の createAIWindow メソッドを使用して統一された処理を行います。
 *
 * @param {string} aiName - AI名（ChatGPT、Claude、Gemini）
 * @param {Object} layout - ウィンドウレイアウト情報
 * @returns {Promise<Object>} 作成されたウィンドウオブジェクト
 * @private
 */
async function createAIWindowWithPosition(aiName, layout) {
  console.log(`Step 2-1: ${aiName}ウィンドウを作成`, 'info', 'Step 2-1');

  try {
    // Step 2-1-1: AI設定の取得
    const aiConfig = AI_CONFIG_MAP[aiName];
    if (!aiConfig) {
      throw new Error(`未対応のAI: ${aiName}`);
    }

    // Step 2-1-2: 本番のWindowService.createAIWindowを使用
    console.log(`${aiName}用ウィンドウを作成中...`, 'info', 'Step 2-1-2');
    const window = await WindowService.createAIWindow(aiConfig.url, {
      left: layout.left,
      top: layout.top,
      width: layout.width,
      height: layout.height,
      aiType: aiConfig.aiType  // 本番コードで使用されるaiType
    });

    // Step 2-1-3: ウィンドウ管理リストへの追加
    if (window) {
      aiDetectionWindows.push({
        windowId: window.id,
        aiType: aiName,
        aiTypeLower: aiConfig.aiType,
        url: aiConfig.url
      });
      console.log(`✅ ${aiName}ウィンドウを作成完了 (ID: ${window.id})`, 'info', 'Step 2-1-3');
    }

    return window;
  } catch (error) {
    console.error(`❌ ${aiName}ウィンドウの作成エラー:`, error, 'error', 'Step 2-1');
    throw error;
  }
}

// ========================================
// Step 3: 検出・スクリプト注入処理
// 本番のAITaskExecutorを使用した統一検出処理
// ========================================

/**
 * Step 3: 並列検出処理の実行
 *
 * StreamProcessorV2のバッチ処理パターンを参考に、
 * 本番のAITaskExecutorを使用して3つのAIを並列検出します。
 *
 * @param {Array} detectionWindows - 検出対象ウィンドウの配列
 * @param {Function} updateStatus - ステータス更新関数
 * @returns {Promise<Array>} 検出結果の配列
 * @private
 */
async function executeDetectionInParallel(detectionWindows, updateStatus) {
  console.log('Step 3: 並列検出処理を開始', 'info', 'Step 3');

  // Step 3-1: 進捗管理の初期化
  let completedCount = 0;
  const totalWindows = detectionWindows.length;

  // Step 3-2: 各ウィンドウでの検出処理を並列実行
  console.log('各AIでの検出処理をPromise.allSettledで並列実行', 'info', 'Step 3-2');
  const detectionPromises = detectionWindows.map(async ({ window, name, config }) => {
    return await executeSingleDetection(window, name, config, () => {
      // Step 3-2-1: 進捗更新のコールバック
      completedCount++;
      console.log(`🔢 AI検出進捗: ${completedCount}/${totalWindows} 完了 (${name})`, 'info', 'Step 3-2-1');
      updateStatus(`AI検出中... (${completedCount}/${totalWindows}) - ${name}完了`, "loading");
    });
  });

  // Step 3-3: 全検出処理の完了待機
  console.log('🚀 すべてのAI検出を並列実行開始...', 'info', 'Step 3-3');
  return await Promise.allSettled(detectionPromises);
}

/**
 * Step 3-4: 単一AI検出処理
 *
 * 本番のAITaskExecutorを使用して単一のAIを検出します。
 *
 * @param {Object} window - ウィンドウオブジェクト
 * @param {string} aiName - AI名
 * @param {Object} config - AI設定
 * @param {Function} onComplete - 完了時コールバック
 * @returns {Promise<Object>} 検出結果
 * @private
 */
async function executeSingleDetection(window, aiName, config, onComplete) {
  console.log(`Step 3-4: ${aiName}の単一検出処理を開始`, 'info', 'Step 3-4');

  try {
    // Step 3-4-1: ウィンドウとタブの有効性チェック
    if (!window || !window.tabs || !window.tabs[0]) {
      throw new Error('ウィンドウまたはタブが無効');
    }

    const tabId = window.tabs[0].id;
    console.log(`${aiName}の検出処理を実行 (タブID: ${tabId})`, 'info', 'Step 3-4-1');

    // Step 3-4-2: ページ読み込み完了待機
    await waitForPageLoadWithTimeout(tabId, aiName);

    // Step 3-4-3: 本番のAITaskExecutorを使用した検出
    console.log(`${aiName}で本番のAITaskExecutorを使用して検出実行`, 'info', 'Step 3-4-3');
    const detectionResult = await executeDetectionWithAITaskExecutor(tabId, aiName, config);

    // Step 3-4-4: 完了通知
    onComplete();

    return {
      success: true,
      aiName: aiName,
      saveData: detectionResult.saveData,
      detectionData: detectionResult
    };

  } catch (error) {
    console.error(`❌ ${aiName}の検出処理でエラー:`, error, 'error', 'Step 3-4');
    onComplete(); // エラーでも進捗は更新

    return {
      success: false,
      aiName: aiName,
      error: error.message
    };
  }
}

/**
 * Step 3-5: 本番AITaskExecutorを使用した検出
 *
 * 本番のAITaskExecutor.executeDetectionTaskを使用して検出処理を実行します。
 * 専用メソッドにより最適化された検出処理を行います。
 *
 * @param {number} tabId - タブID
 * @param {string} aiName - AI名
 * @param {Object} config - AI設定
 * @returns {Promise<Object>} 検出結果
 * @private
 */
async function executeDetectionWithAITaskExecutor(tabId, aiName, config) {
  console.log(`Step 3-5: ${aiName}でAITaskExecutor.executeDetectionTaskを実行`, 'info', 'Step 3-5');

  // Step 3-5-1: 検出設定オブジェクトの作成
  const detectionConfig = {
    aiType: config.aiType,
    aiName: aiName
  };

  // Step 3-5-2: 本番のexecuteDetectionTaskを実行（専用メソッド）
  console.log(`AITaskExecutor.executeDetectionTask（専用メソッド）を実行`, 'info', 'Step 3-5-2');
  const result = await aiTaskExecutor.executeDetectionTask(tabId, detectionConfig);

  // Step 3-5-3: 結果の変換と返却
  console.log(`検出結果を変換して返却`, 'info', 'Step 3-5-3');
  return {
    success: result.success || false,
    saveData: result.saveData || {},
    detectionResult: result.detectionResult,
    rawResult: result
  };
}

// ========================================
// Step 4: 並列処理サポート機能
// ページ読み込み待機やタイムアウト制御など
// ========================================

/**
 * Step 4-1: タイムアウト付きページ読み込み待機
 *
 * 本番のタイムアウト設定を使用してページ読み込み完了を待機します。
 *
 * @param {number} tabId - タブID
 * @param {string} aiName - AI名（ログ用）
 * @returns {Promise<void>}
 * @private
 */
async function waitForPageLoadWithTimeout(tabId, aiName) {
  console.log(`Step 4-1: ${aiName}のページ読み込み完了を待機`, 'info', 'Step 4-1');

  return new Promise((resolve) => {
    // Step 4-1-1: ページ読み込み完了リスナー設定
    const listener = function(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        console.log(`✅ ${aiName}のページ読み込み完了`, 'info', 'Step 4-1-1');
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Step 4-1-2: タイムアウト設定（設定ファイルの値を使用）
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      console.log(`⏰ ${aiName}のページ読み込みタイムアウト (${AI_DETECTION_CONFIG.pageLoadTimeout}ms)`, 'warn', 'Step 4-1-2');
      resolve(); // タイムアウトでも処理を続行
    }, AI_DETECTION_CONFIG.pageLoadTimeout);
  });
}

// ========================================
// Step 5: データ保存・クリーンアップ
// 検出結果の永続化とリソース解放処理
// ========================================

/**
 * Step 5: 検出結果の保存処理
 *
 * StreamProcessorV2と同じパターンでデータを整理し、
 * chrome.storage.localに永続化します。
 *
 * @param {Array} results - Promise.allSettledの結果配列
 * @param {Array} detectionWindows - 検出ウィンドウの配列
 * @returns {Promise<void>}
 * @private
 */
async function saveDetectionResults(results, detectionWindows) {
  console.log('Step 5: 検出結果を保存処理開始', 'info', 'Step 5');
  console.log('💾 すべてのAI検出が完了。データを一括保存します...', 'info', 'Step 5-0');

  // Step 5-1: 成功した検出結果の収集
  console.log('成功した検出結果を収集', 'info', 'Step 5-1');
  const allSaveData = {};
  let successfulSaves = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success && result.value.saveData) {
      const aiName = detectionWindows[index].name.toLowerCase();
      allSaveData[aiName] = result.value.saveData;
      successfulSaves++;
      console.log(`✔️ ${detectionWindows[index].name}のデータを収集`, 'info', 'Step 5-1');
    } else {
      console.log(`❌ ${detectionWindows[index].name}のデータ収集失敗`, 'warn', 'Step 5-1');
    }
  });

  // Step 5-2: データの永続化
  if (Object.keys(allSaveData).length > 0) {
    console.log(`${successfulSaves}個のAIデータをchrome.storage.localに保存`, 'info', 'Step 5-2');

    // Step 5-2-1: chrome.storage.localへの保存
    await new Promise((resolve) => {
      chrome.storage.local.set({ 'ai_config_persistence': allSaveData }, () => {
        console.log('✅ 全AIのデータを一括保存完了:', allSaveData, 'info', 'Step 5-2-1');
        resolve();
      });
    });

    // Step 5-2-2: UI更新イベントの発火
    console.log('UI更新イベントを発火', 'info', 'Step 5-2-2');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ai-data-saved', {
        detail: {
          timestamp: new Date().toISOString(),
          savedCount: successfulSaves,
          totalCount: results.length
        }
      }));
    }

  } else {
    // Step 5-3: 保存データなしの場合の警告
    console.warn('⚠️ 保存するデータがありません', 'warn', 'Step 5-3');
    console.warn('すべての検出処理が失敗した可能性があります', 'warn', 'Step 5-3');
  }
}

/**
 * Step 5-4: AI検出ウィンドウクリーンアップ
 *
 * 本番のWindowService.closeWindowを使用してリソースを解放します。
 */
export async function closeAIDetectionWindows() {
  console.log('Step 5-4: AI検出ウィンドウクリーンアップ開始', 'info', 'Step 5-4');
  console.log('🔄 AI検出ウィンドウを閉じます...', 'info', 'Step 5-4-0');

  // Step 5-4-1: 閉じるウィンドウの存在チェック
  if (aiDetectionWindows.length === 0) {
    console.log('閉じるウィンドウがありません', 'info', 'Step 5-4-1');
    return;
  }

  console.log(`${aiDetectionWindows.length}個のウィンドウを閉じます`, 'info', 'Step 5-4-1');

  // Step 5-4-2: 各ウィンドウを順次クローズ
  for (const winInfo of aiDetectionWindows) {
    try {
      console.log(`${winInfo.aiType}ウィンドウを閉じています...`, 'info', 'Step 5-4-2');

      // 本番のWindowService.closeWindowを使用（統一されたエラーハンドリング）
      await WindowService.closeWindow(winInfo.windowId);
      console.log(`✅ ${winInfo.aiType}ウィンドウを閉じました`, 'info', 'Step 5-4-2');

    } catch (error) {
      console.error(`❌ ${winInfo.aiType}ウィンドウを閉じる際にエラー:`, error, 'error', 'Step 5-4-2');
      // エラーが発生しても他のウィンドウの処理は続行
    }
  }

  // Step 5-4-3: ウィンドウ管理配列のクリア
  aiDetectionWindows = [];
  console.log('✅ すべてのAI検出ウィンドウクリーンアップ完了', 'info', 'Step 5-4-3');
}

// ========================================
// Step 6: エクスポート関数・ユーティリティ
// 外部から使用される公開関数群
// ========================================

/**
 * Step 6-1: AI検出状態取得
 *
 * 現在の検出ウィンドウの状態を取得します。
 * デバッグやモニタリング用途で使用されます。
 *
 * @returns {Array} 現在のAI検出ウィンドウ配列
 */
export function getDetectionWindows() {
  return aiDetectionWindows;
}

/**
 * Step 6-2: 検出システム状態確認
 *
 * AI検出システムが実行中かどうかを判定します。
 *
 * @returns {boolean} 検出中の場合true
 */
export function isDetectionRunning() {
  return aiDetectionWindows.length > 0;
}

/**
 * Step 6-3: 検出システム設定取得
 *
 * 現在の検出システム設定を取得します。
 *
 * @returns {Object} AI_DETECTION_CONFIGオブジェクト
 */
export function getDetectionConfig() {
  return { ...AI_DETECTION_CONFIG };
}

// ========================================
// MutationObserver統合機能
// mutation-observer-controller.jsからの統合機能
// ========================================

/**
 * MutationObserver監視の開始/停止を切り替える（統合機能）
 * @param {HTMLElement} button - ボタン要素
 * @param {Function} updateStatus - ステータス更新関数
 */
export async function toggleMutationObserverMonitoring(button, updateStatus) {
  console.log("AIセレクタ変更検出システムボタンが押されました");

  if (isAIMutationSystemRunning) {
    // 監視停止
    await stopMutationObserverMonitoring(button, updateStatus);
  } else {
    // 監視開始 - runAIDetectionSystemを直接使用
    await startMutationObserverMonitoring(button, updateStatus);
  }
}

/**
 * MutationObserver監視を開始（統合機能）
 */
async function startMutationObserverMonitoring(button, updateStatus) {
  console.log("🔍 AIセレクタ変更検出システムを開始します（ai-detection-test-controller.jsを統合使用）");

  try {
    button.disabled = true;
    updateStatus("AI検出システム準備中...", "loading");

    // runAIDetectionSystemを直接使用
    await runAIDetectionSystem(updateStatus, true);

    // システム実行中の状態に更新
    currentMutationObserver = {
      mode: 'ai_detection_system',
      timestamp: new Date().toISOString()
    };
    isAIMutationSystemRunning = true;

    // ボタンの表示を更新
    button.innerHTML = '<span class="btn-icon">⏹️</span>監視停止 (実行中)';
    button.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
    button.disabled = false;

    updateStatus("AI検出システム実行完了", "success");
    console.log("🎉 AI検出システムが完了しました");

  } catch (error) {
    console.error("AI検出システムエラー:", error);
    updateStatus("AI検出システムエラー", "error");
    button.disabled = false;
    alert(`AI検出システムエラー: ${error.message}`);
  }
}

/**
 * MutationObserver監視を停止（統合機能）
 */
async function stopMutationObserverMonitoring(button, updateStatus) {
  console.log("🛑 AIセレクタ変更検出システムを停止します");

  try {
    // 状態リセット
    resetMutationObserverState(button, updateStatus);
    console.log("✅ AI検出システムを停止しました");
  } catch (error) {
    console.error("AI検出システム停止エラー:", error);
    updateStatus("監視停止エラー", "error");
  }
}

/**
 * MutationObserver状態をリセット（統合機能）
 */
function resetMutationObserverState(button, updateStatus) {
  isAIMutationSystemRunning = false;
  currentMutationObserver = null;
  button.innerHTML = '<span class="btn-icon">👁️</span>2. AIセレクタ変更検出システム';
  button.style.background = "linear-gradient(135deg, #a55eea, #3742fa)";
  updateStatus("AI検出システム停止", "warning");
}

/**
 * MutationObserver監視状態を取得（統合機能）
 * @returns {boolean} 監視中の場合true
 */
export function isMutationObserverRunning() {
  return isAIMutationSystemRunning;
}

/**
 * 現在のMutationObserver情報を取得（統合機能）
 * @returns {Object|null} MutationObserver情報
 */
export function getCurrentMutationObserver() {
  return currentMutationObserver;
}