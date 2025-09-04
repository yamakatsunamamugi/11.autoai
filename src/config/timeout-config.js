/**
 * @fileoverview タイムアウト設定 - 11.autoai
 * AIサイト別のタイムアウト設定を管理
 */

// グローバルオブジェクトを適切に選択（Service Worker対応）
const globalThis = (typeof self !== 'undefined' ? self : 
                   typeof window !== 'undefined' ? window : 
                   typeof global !== 'undefined' ? global : {});

// グローバル設定オブジェクト
globalThis.CONFIG = {
  DEBUG: false, // 本番環境では false

  // タイムアウト設定（ミリ秒）
  TIMEOUT: {
    // 要素検出のタイムアウト
    ELEMENT_DETECTION: 30000, // 30秒

    // 送信ボタン有効化待機
    SEND_BUTTON: 30000, // 30秒

    // AI応答待機（基本値）
    RESPONSE_WAIT: 300000, // 5分（全AIの基本待機時間）
    
    // DeepResearch/エージェントモード専用
    DEEP_RESEARCH: 2400000, // 40分
    AGENT_MODE: 2400000, // 40分
    
    // 旧設定（後方互換性のため残す）
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
      RESPONSE_TIMEOUT: 300000, // 5分（統一）
      DEEP_RESEARCH_TIMEOUT: 2400000, // 40分（DeepResearch時）
    },
    ChatGPT: {
      PROCESSING_DELAY: 1000,
      MUTATION_THROTTLE: 100,
      RESPONSE_TIMEOUT: 300000, // 5分
      DEEP_RESEARCH_TIMEOUT: 2400000, // 40分（DeepResearch時）
      AGENT_MODE_TIMEOUT: 2400000, // 40分（エージェントモード時）
    },
    Gemini: {
      PROCESSING_DELAY: 1500,
      MUTATION_THROTTLE: 200,
      RESPONSE_TIMEOUT: 300000, // 5分
      DEEP_RESEARCH_TIMEOUT: 2400000, // 40分（DeepResearch時）
    },
    Genspark: {
      PROCESSING_DELAY: 2000,
      MUTATION_THROTTLE: 300,
      RESPONSE_TIMEOUT: 2400000, // Gensparkは常に40分（DeepResearchがデフォルト）
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
globalThis.updateConfig = (newConfig) => {
  Object.assign(globalThis.CONFIG, newConfig);
  console.log("🔧 CONFIG updated:", globalThis.CONFIG);
};

// AI種別に応じた設定取得
globalThis.getAIConfig = (aiType) => {
  const baseConfig = { ...globalThis.CONFIG };
  const aiSpecific = globalThis.CONFIG.AI_SPECIFIC[aiType] || {};

  return {
    ...baseConfig,
    ...aiSpecific,
  };
};

// デバッグモード切り替え
globalThis.toggleDebugMode = () => {
  globalThis.CONFIG.DEBUG = !globalThis.CONFIG.DEBUG;
  globalThis.CONFIG.CURRENT_LOG_LEVEL = globalThis.CONFIG.DEBUG ? 3 : 2;
  console.log(`🐛 Debug mode: ${globalThis.CONFIG.DEBUG ? "ON" : "OFF"}`);
  return globalThis.CONFIG.DEBUG;
};

console.log("⚙️ Timeout config loaded for 11.autoai");
