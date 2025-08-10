/**
 * @fileoverview タイムアウト設定 - 11.autoai
 * AIサイト別のタイムアウト設定を管理
 */

// グローバル設定オブジェクト
window.CONFIG = {
  DEBUG: false, // 本番環境では false

  // タイムアウト設定（ミリ秒）
  TIMEOUT: {
    // 要素検出のタイムアウト
    ELEMENT_DETECTION: 30000, // 30秒

    // 送信ボタン有効化待機
    SEND_BUTTON: 30000, // 30秒

    // AI応答待機
    RESPONSE_WAIT: 180000, // 3分
    RESPONSE_DEEP_RESEARCH: 2400000, // 40分（DeepResearch専用）

    // DOM変更監視
    DOM_MUTATION: 5000, // 5秒

    // ネットワーク要求
    NETWORK_REQUEST: 10000, // 10秒

    // ウィンドウ操作
    WINDOW_OPERATION: 15000, // 15秒
  },

  // 再試行設定
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY_BASE: 1000, // 1秒
    EXPONENTIAL_BACKOFF: true,
  },

  // AI別固有設定
  AI_SPECIFIC: {
    Claude: {
      PROCESSING_DELAY: 2000, // Claude専用の処理遅延
      MUTATION_THROTTLE: 500, // DOM変更監視の間隔
      RESPONSE_TIMEOUT: 600000, // 10分（Claude専用）
    },
    ChatGPT: {
      PROCESSING_DELAY: 1000,
      MUTATION_THROTTLE: 100,
      RESPONSE_TIMEOUT: 300000, // 5分
      DEEP_RESEARCH_TIMEOUT: 2400000, // 40分（DeepResearch時）
    },
    Gemini: {
      PROCESSING_DELAY: 1500,
      MUTATION_THROTTLE: 200,
      RESPONSE_TIMEOUT: 300000, // 5分
    },
  },

  // ログレベル設定
  LOG_LEVEL: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
  },

  // 現在のログレベル
  CURRENT_LOG_LEVEL: 2, // INFO

  // エラー追跡設定
  ERROR_TRACKING: {
    MAX_ERRORS: 100,
    CLEANUP_INTERVAL: 300000, // 5分
  },
};

// 設定の動的更新機能
window.updateConfig = (newConfig) => {
  Object.assign(window.CONFIG, newConfig);
  console.log("🔧 CONFIG updated:", window.CONFIG);
};

// AI種別に応じた設定取得
window.getAIConfig = (aiType) => {
  const baseConfig = { ...window.CONFIG };
  const aiSpecific = window.CONFIG.AI_SPECIFIC[aiType] || {};

  return {
    ...baseConfig,
    ...aiSpecific,
  };
};

// デバッグモード切り替え
window.toggleDebugMode = () => {
  window.CONFIG.DEBUG = !window.CONFIG.DEBUG;
  window.CONFIG.CURRENT_LOG_LEVEL = window.CONFIG.DEBUG ? 3 : 2;
  console.log(`🐛 Debug mode: ${window.CONFIG.DEBUG ? "ON" : "OFF"}`);
  return window.CONFIG.DEBUG;
};

console.log("⚙️ Timeout config loaded for 11.autoai");
