/**
 * @fileoverview テスト用AIモデル・機能変更検出システム コントローラー V2 - ステップ構造化版
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
 * @updated 2025-09-14 ファイル分離、testプレフィックス追加
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