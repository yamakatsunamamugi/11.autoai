/**
 * @fileoverview テスト用AIセレクタ変更検出システム (MutationObserver) コントローラー V2 - ステップ構造化版
 *
 * 【ステップ構成】
 * Step 0: 初期化・設定 - 依存関係とシステム状態の初期化
 * Step 1: メインエントリーポイント - MutationObserver制御の統一管理
 * Step 2: 監視開始処理 - AI検出システムとの連携実行
 * Step 3: 監視停止処理 - システム状態のクリーンアップ
 * Step 4: 状態管理・ユーティリティ - ボタンUI・ステータス表示の制御
 *
 * ============================================================================
 * 主要機能:
 * ============================================================================
 * 1. AIサイトセレクタ変更監視: ChatGPT、Claude、Geminiのセレクタ変更を検出
 * 2. AI検出システム統合: test-ai-model-function-detection.jsを内部で使用
 * 3. UI状態管理: ボタン状態とステータス表示の管理
 * 4. 軽量実装: 重複コードなしで必要最小限の機能に特化
 *
 * @version 2.1.0
 * @updated 2025-09-14 ChatGPT風ステップ構造化、詳細ログ追加
 */

// ========================================
// Step 0: 初期化・設定
// 依存関係の読み込みとシステム状態管理変数の初期化を行う
// ========================================

// Step 0-1: 依存モジュールのインポート（統一AI検出システムを使用）
// test-ai-model-function-detection.jsから必要な機能を読み込み
import { runAIDetectionSystem } from './test-ai-model-function-detection.js';

// Step 0-2: MutationObserver関連の状態管理変数
// システム全体の監視状態を追跡するための変数群
let isAIMutationSystemRunning = false;    // 監視システムの実行状態フラグ
let currentMutationObserver = null;       // 現在の監視オブジェクト情報

// ========================================
// Step 1: メインエントリーポイント
// MutationObserver制御の統一管理を行うメイン関数
// ========================================

/**
 * Step 1: MutationObserver監視の開始/停止を切り替える
 *
 * システムの現在状態を確認し、適切な処理（開始または停止）を実行します。
 * ChatGPT風のステップログを詳細に出力してデバッグを容易にします。
 *
 * @param {HTMLElement} button - ボタン要素
 * @param {Function} updateStatus - ステータス更新関数
 */
export async function toggleMutationObserverMonitoring(button, updateStatus) {
  console.log('Step 1: MutationObserver制御メインエントリーポイント開始', 'step', 'Step 1');
  console.log('Step 1-0: AIセレクタ変更検出システムの制御を開始します', 'info', 'Step 1-0');

  try {
    // Step 1-1: 現在の監視状態を確認
    console.log('Step 1-1: 現在の監視システム状態を確認中', 'info', 'Step 1-1');
    console.log(`Step 1-1-1: 監視状態フラグ確認 - isAIMutationSystemRunning: ${isAIMutationSystemRunning}`, 'info', 'Step 1-1-1');
    console.log(`Step 1-1-2: 監視オブジェクト確認 - currentMutationObserver: ${currentMutationObserver ? 'あり' : 'なし'}`, 'info', 'Step 1-1-2');

    // Step 1-2: 状態に基づく条件分岐処理
    console.log('Step 1-2: 監視状態に基づく条件分岐処理開始', 'info', 'Step 1-2');
    if (isAIMutationSystemRunning) {
      // Step 1-2-1: 監視停止処理への分岐
      console.log('Step 1-2-1: 現在監視中のため停止処理に分岐', 'info', 'Step 1-2-1');
      await stopMutationObserverMonitoring(button, updateStatus);
    } else {
      // Step 1-2-2: 監視開始処理への分岐
      console.log('Step 1-2-2: 現在停止中のため開始処理に分岐', 'info', 'Step 1-2-2');
      await startMutationObserverMonitoring(button, updateStatus);
    }

    console.log('Step 1-3: MutationObserver制御処理完了', 'info', 'Step 1-3');

  } catch (error) {
    // Step 1-4: エラーハンドリング
    console.error('❌ Step 1-4: MutationObserver制御でエラーが発生', 'error', 'Step 1-4');
    console.error('エラー詳細:', error);
    updateStatus(`MutationObserver制御エラー: ${error.message}`, "error");
  }
}

// ========================================
// Step 2: 監視開始処理
// AI検出システムとの連携による監視開始の実装
// ========================================

/**
 * Step 2: MutationObserver監視を開始
 *
 * test-ai-model-function-detection.jsのrunAIDetectionSystemを内部で使用し、
 * ChatGPT風のステップログで詳細な処理過程を追跡します。
 *
 * @param {HTMLElement} button - ボタン要素
 * @param {Function} updateStatus - ステータス更新関数
 * @private
 */
async function startMutationObserverMonitoring(button, updateStatus) {
  console.log('Step 2: MutationObserver監視開始処理開始', 'step', 'Step 2');
  console.log('Step 2-0: AIセレクタ変更検出システムを開始します（AI検出システム連携）', 'info', 'Step 2-0');

  try {
    // Step 2-1: UI状態の初期化
    console.log('Step 2-1: 監視開始のためのUI状態初期化処理開始', 'info', 'Step 2-1');
    console.log('Step 2-1-1: ボタンを無効化してユーザー操作を防止', 'info', 'Step 2-1-1');
    button.disabled = true;
    console.log('Step 2-1-2: ステータス表示を監視準備中に更新', 'info', 'Step 2-1-2');
    updateStatus("AIセレクタ変更検出準備中...", "loading");

    // Step 2-2: AI検出システムとの連携実行
    console.log('Step 2-2: AI検出システム（test-ai-model-function-detection.js）との連携開始', 'info', 'Step 2-2');
    console.log('Step 2-2-1: runAIDetectionSystem関数を呼び出し中', 'info', 'Step 2-2-1');
    console.log('Step 2-2-2: 4分割ウィンドウでのAI検出処理を実行', 'info', 'Step 2-2-2');

    // test-ai-model-function-detection.jsのrunAIDetectionSystemを使用
    await runAIDetectionSystem(updateStatus, true);

    console.log('Step 2-2-3: runAIDetectionSystem実行完了', 'info', 'Step 2-2-3');

    // Step 2-3: 監視状態の更新とシステム情報記録
    console.log('Step 2-3: 監視状態更新とシステム情報記録処理開始', 'info', 'Step 2-3');
    console.log('Step 2-3-1: 監視オブジェクト情報を作成', 'info', 'Step 2-3-1');
    currentMutationObserver = {
      mode: 'ai_selector_mutation_detection',
      timestamp: new Date().toISOString(),
      source: 'test-ai-selector-mutation-observer'
    };
    console.log('Step 2-3-2: 監視状態フラグをtrueに設定', 'info', 'Step 2-3-2');
    isAIMutationSystemRunning = true;

    // Step 2-4: UI状態の最終更新
    console.log('Step 2-4: 監視開始完了のためのUI状態最終更新処理開始', 'info', 'Step 2-4');
    console.log('Step 2-4-1: ボタン表示を監視停止モードに変更', 'info', 'Step 2-4-1');
    button.innerHTML = '<span class="btn-icon">⏹️</span>監視停止 (実行中)';
    console.log('Step 2-4-2: ボタン背景色を実行中スタイルに変更', 'info', 'Step 2-4-2');
    button.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
    console.log('Step 2-4-3: ボタンを有効化してユーザー操作を許可', 'info', 'Step 2-4-3');
    button.disabled = false;

    // Step 2-5: 完了通知とログ出力
    console.log('Step 2-5: 監視開始完了通知処理開始', 'info', 'Step 2-5');
    console.log('Step 2-5-1: ステータス表示を完了状態に更新', 'info', 'Step 2-5-1');
    updateStatus("AIセレクタ変更検出完了", "success");
    console.log('Step 2-5-2: 完了ログを出力', 'info', 'Step 2-5-2');
    console.log('🎉 Step 2-5-3: AIセレクタ変更検出システムが正常に完了しました', 'success', 'Step 2-5-3');

  } catch (error) {
    // Step 2-6: エラーハンドリングと復旧処理
    console.error('❌ Step 2-6: AIセレクタ変更検出開始処理でエラーが発生', 'error', 'Step 2-6');
    console.error('Step 2-6-1: エラー詳細情報:', error);
    console.log('Step 2-6-2: エラー復旧処理を開始', 'info', 'Step 2-6-2');

    updateStatus("AIセレクタ変更検出エラー", "error");
    button.disabled = false;

    console.log('Step 2-6-3: ユーザーにエラー通知を表示', 'info', 'Step 2-6-3');
    alert(`AIセレクタ変更検出エラー: ${error.message}`);
  }
}

// ========================================
// Step 3: 監視停止処理
// システム状態のクリーンアップと安全な停止処理
// ========================================

/**
 * Step 3: MutationObserver監視を停止
 *
 * 監視システムを安全に停止し、システム状態をクリーンアップします。
 * ChatGPT風のステップログで停止処理の詳細を追跡します。
 *
 * @param {HTMLElement} button - ボタン要素
 * @param {Function} updateStatus - ステータス更新関数
 * @private
 */
async function stopMutationObserverMonitoring(button, updateStatus) {
  console.log('Step 3: MutationObserver監視停止処理開始', 'step', 'Step 3');
  console.log('Step 3-0: AIセレクタ変更検出システムの停止処理を開始します', 'info', 'Step 3-0');

  try {
    // Step 3-1: 停止処理の準備
    console.log('Step 3-1: 監視停止のための準備処理開始', 'info', 'Step 3-1');
    console.log('Step 3-1-1: 現在の監視状態を確認', 'info', 'Step 3-1-1');
    console.log(`Step 3-1-2: 監視オブジェクト詳細 - mode: ${currentMutationObserver?.mode}`, 'info', 'Step 3-1-2');
    console.log(`Step 3-1-3: 監視オブジェクト詳細 - timestamp: ${currentMutationObserver?.timestamp}`, 'info', 'Step 3-1-3');

    // Step 3-2: システム状態のリセット処理
    console.log('Step 3-2: システム状態リセット処理を実行', 'info', 'Step 3-2');
    resetMutationObserverState(button, updateStatus);

    console.log('Step 3-3: 監視停止処理完了確認', 'info', 'Step 3-3');
    console.log('✅ Step 3-3-1: AIセレクタ変更検出システムを正常に停止しました', 'success', 'Step 3-3-1');

  } catch (error) {
    // Step 3-4: 停止処理でのエラーハンドリング
    console.error('❌ Step 3-4: AIセレクタ変更検出停止処理でエラーが発生', 'error', 'Step 3-4');
    console.error('Step 3-4-1: 停止エラー詳細情報:', error);
    updateStatus("監視停止エラー", "error");
  }
}

// ========================================
// Step 4: 状態管理・ユーティリティ
// ボタンUI・ステータス表示の制御とシステム状態管理
// ========================================

/**
 * Step 4-1: MutationObserver状態をリセット
 *
 * システム状態変数、UI表示、ボタンスタイルを初期状態にリセットします。
 * 各リセット処理をステップ化して詳細に追跡します。
 *
 * @param {HTMLElement} button - ボタン要素
 * @param {Function} updateStatus - ステータス更新関数
 * @private
 */
function resetMutationObserverState(button, updateStatus) {
  console.log('Step 4-1: MutationObserver状態リセット処理開始', 'step', 'Step 4-1');

  // Step 4-1-1: システム状態変数のリセット
  console.log('Step 4-1-1: システム状態変数リセット処理開始', 'info', 'Step 4-1-1');
  console.log('Step 4-1-1-1: 監視状態フラグをfalseに設定', 'info', 'Step 4-1-1-1');
  isAIMutationSystemRunning = false;
  console.log('Step 4-1-1-2: 監視オブジェクトをnullに初期化', 'info', 'Step 4-1-1-2');
  currentMutationObserver = null;

  // Step 4-1-2: ボタンUI表示のリセット
  console.log('Step 4-1-2: ボタンUI表示リセット処理開始', 'info', 'Step 4-1-2');
  console.log('Step 4-1-2-1: ボタンテキストを初期状態に戻す', 'info', 'Step 4-1-2-1');
  button.innerHTML = '<span class="btn-icon">👁️</span>2. AIセレクタ変更検出システム';
  console.log('Step 4-1-2-2: ボタン背景色を初期スタイルに戻す', 'info', 'Step 4-1-2-2');
  button.style.background = "linear-gradient(135deg, #a55eea, #3742fa)";

  // Step 4-1-3: ステータス表示の更新
  console.log('Step 4-1-3: ステータス表示更新処理開始', 'info', 'Step 4-1-3');
  console.log('Step 4-1-3-1: ステータスを停止状態に更新', 'info', 'Step 4-1-3-1');
  updateStatus("AIセレクタ変更検出停止", "warning");

  console.log('✅ Step 4-1-4: 状態リセット処理完了', 'success', 'Step 4-1-4');
}

/**
 * Step 4-2: MutationObserver監視状態を取得
 *
 * システムの現在の監視状態を外部から確認するための関数。
 * デバッグやモニタリング用途で使用されます。
 *
 * @returns {boolean} 監視中の場合true
 */
export function isMutationObserverRunning() {
  console.log('Step 4-2: 監視状態取得処理実行', 'info', 'Step 4-2');
  console.log(`Step 4-2-1: 現在の監視状態 - ${isAIMutationSystemRunning ? '監視中' : '停止中'}`, 'info', 'Step 4-2-1');
  return isAIMutationSystemRunning;
}

/**
 * Step 4-3: 現在のMutationObserver情報を取得
 *
 * 現在の監視オブジェクトの詳細情報を取得します。
 * システム状態の詳細確認やデバッグに使用されます。
 *
 * @returns {Object|null} MutationObserver情報オブジェクト
 */
export function getCurrentMutationObserver() {
  console.log('Step 4-3: MutationObserver情報取得処理実行', 'info', 'Step 4-3');
  console.log(`Step 4-3-1: 監視オブジェクト存在確認 - ${currentMutationObserver ? 'あり' : 'なし'}`, 'info', 'Step 4-3-1');

  if (currentMutationObserver) {
    console.log(`Step 4-3-2: 監視モード - ${currentMutationObserver.mode}`, 'info', 'Step 4-3-2');
    console.log(`Step 4-3-3: 開始時刻 - ${currentMutationObserver.timestamp}`, 'info', 'Step 4-3-3');
  }

  return currentMutationObserver;
}