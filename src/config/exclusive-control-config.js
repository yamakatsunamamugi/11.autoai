/**
 * @fileoverview 排他制御設定ファイル - タイムアウトや待機時間の設定
 * 
 * このファイルを編集することで、コードを変更せずに動作を調整できます。
 */

/**
 * 排他制御の設定
 */
export const EXCLUSIVE_CONTROL_CONFIG = {
  /**
   * 機能別タイムアウト設定（ミリ秒）
   * マーカーが設定されてからタイムアウトとみなすまでの時間
   */
  timeouts: {
    // Deep Research系（長時間処理）
    'Deep Research': 40 * 60 * 1000,      // 40分
    'ディープリサーチ': 40 * 60 * 1000,   // 40分（日本語）
    'DeepResearch': 40 * 60 * 1000,       // 40分（スペースなし）
    
    // エージェント系（長時間処理）
    'エージェント': 40 * 60 * 1000,       // 40分
    'エージェントモード': 40 * 60 * 1000, // 40分
    'Agent': 40 * 60 * 1000,              // 40分（英語）
    'AgentMode': 40 * 60 * 1000,          // 40分（英語）
    
    // Canvas系（中程度の処理）
    'Canvas': 10 * 60 * 1000,             // 10分
    'キャンバス': 10 * 60 * 1000,         // 10分（日本語）
    
    // Web検索系（中程度の処理）
    'ウェブ検索': 8 * 60 * 1000,          // 8分
    'Web Search': 8 * 60 * 1000,          // 8分（英語）
    'WebSearch': 8 * 60 * 1000,           // 8分（スペースなし）
    
    // 通常処理（短時間）
    '通常': 5 * 60 * 1000,                // 5分
    'Normal': 5 * 60 * 1000,              // 5分（英語）
    
    // デフォルト
    'default': 5 * 60 * 1000              // 5分
  },

  /**
   * 再試行間隔の設定
   * verifyAndReprocessColumnで使用される待機時間
   */
  retryIntervals: {
    // 即座に処理（空白セル用）
    immediate: 0,
    
    // 短時間待機（通常機能用）
    short: 5 * 60 * 1000,      // 5分
    
    // 中時間待機（Canvas、ウェブ検索等）
    medium: 10 * 60 * 1000,    // 10分
    
    // 長時間待機（Deep Research/エージェント用）
    long: 40 * 60 * 1000       // 40分
  },

  /**
   * 機能別の詳細な再試行間隔設定
   */
  functionSpecificRetryIntervals: {
    // Deep Research系 - 40分待機
    'Deep Research': 40 * 60 * 1000,
    'ディープリサーチ': 40 * 60 * 1000,
    'DeepResearch': 40 * 60 * 1000,
    
    // エージェント系 - 40分待機
    'エージェント': 40 * 60 * 1000,
    'エージェントモード': 40 * 60 * 1000,
    'Agent': 40 * 60 * 1000,
    
    // Canvas系 - 10分待機
    'Canvas': 10 * 60 * 1000,
    'キャンバス': 10 * 60 * 1000,
    
    // Web検索系 - 8分待機
    'ウェブ検索': 8 * 60 * 1000,
    'Web Search': 8 * 60 * 1000,
    'WebSearch': 8 * 60 * 1000,
    
    // 通常機能 - 5分待機
    '通常': 5 * 60 * 1000,
    'Normal': 5 * 60 * 1000
  },

  /**
   * 列完了後の失敗タスク再実行の待機時間
   * checkAndProcessFailedTasksで使用
   */
  failedTaskRetryDelays: [
    5 * 60 * 1000,     // 1回目: 5分後
    30 * 60 * 1000,    // 2回目: 30分後
    60 * 60 * 1000     // 3回目: 1時間後
  ],

  /**
   * マーカーフォーマット設定
   */
  markerFormat: {
    // マーカーのプレフィックス
    prefix: '現在操作中です',
    
    // 区切り文字
    separator: '_',
    
    // タイムスタンプを含めるか
    includeTimestamp: true,
    
    // PC識別子を含めるか
    includePCId: true,
    
    // 機能名を含めるか（推奨: true）
    includeFunction: true
  },

  /**
   * ログ設定
   */
  logging: {
    // ログを有効にするか
    enabled: true,
    
    // スプレッドシートにログを記録するか
    logToSpreadsheet: true,
    
    // ログレベル（debug, info, warn, error）
    logLevel: 'info',
    
    // 排他制御関連のログを詳細に出力するか
    verboseExclusiveControl: true
  },

  /**
   * 処理戦略設定
   */
  strategy: {
    // デフォルトの戦略（smart, aggressive, polite, default）
    default: 'smart',
    
    // 機能別の戦略オーバーライド
    functionOverrides: {
      // 'Deep Research': 'polite',  // 例：Deep Researchは常に待機
    }
  },

  /**
   * その他の設定
   */
  misc: {
    // 古いマーカー（タイムスタンプなし）を即座にタイムアウトとみなすか
    treatLegacyMarkersAsTimeout: true,
    
    // 自分のマーカーを即座に上書き可能にするか
    allowOverwriteOwnMarkers: true,
    
    // 最大再試行回数
    maxRetryCount: 3,
    
    // マーカーチェック時のAPI呼び出し間隔（ミリ秒）
    apiCallInterval: 500
  }
};

/**
 * 機能名を正規化（エイリアス処理）
 * @param {string} functionName - 機能名
 * @returns {string} 正規化された機能名
 */
export function normalizeFunctionName(functionName) {
  const aliases = {
    // Deep Research系
    'deep research': 'Deep Research',
    'deepresearch': 'Deep Research',
    'ディープリサーチ': 'Deep Research',
    'deep_research': 'Deep Research',
    
    // エージェント系
    'agent': 'エージェント',
    'agent mode': 'エージェント',
    'agentmode': 'エージェント',
    'エージェントモード': 'エージェント',
    
    // Canvas系
    'canvas': 'Canvas',
    'キャンバス': 'Canvas',
    
    // Web検索系
    'web search': 'ウェブ検索',
    'websearch': 'ウェブ検索',
    'web_search': 'ウェブ検索',
    
    // 通常
    'normal': '通常',
    '標準': '通常',
    'standard': '通常'
  };
  
  const normalized = functionName?.toLowerCase() || 'default';
  return aliases[normalized] || functionName || 'default';
}

/**
 * 機能に基づいてタイムアウト時間を取得
 * @param {string} functionName - 機能名
 * @returns {number} タイムアウト時間（ミリ秒）
 */
export function getTimeoutForFunction(functionName) {
  const normalized = normalizeFunctionName(functionName);
  return EXCLUSIVE_CONTROL_CONFIG.timeouts[normalized] || 
         EXCLUSIVE_CONTROL_CONFIG.timeouts.default;
}

/**
 * 機能に基づいて再試行間隔を取得
 * @param {string} functionName - 機能名
 * @returns {number} 再試行間隔（ミリ秒）
 */
export function getRetryIntervalForFunction(functionName) {
  const normalized = normalizeFunctionName(functionName);
  
  // まず詳細設定から検索
  const specificInterval = EXCLUSIVE_CONTROL_CONFIG.functionSpecificRetryIntervals[functionName] ||
                          EXCLUSIVE_CONTROL_CONFIG.functionSpecificRetryIntervals[normalized];
  
  if (specificInterval) {
    return specificInterval;
  }
  
  // 詳細設定がない場合は従来のロジック
  if (normalized === 'Deep Research' || normalized === 'エージェント') {
    return EXCLUSIVE_CONTROL_CONFIG.retryIntervals.long;
  }
  
  if (normalized === 'Canvas') {
    return EXCLUSIVE_CONTROL_CONFIG.retryIntervals.medium;
  }
  
  // デフォルトは短時間待機
  return EXCLUSIVE_CONTROL_CONFIG.retryIntervals.short;
}

// デフォルトエクスポート
export default EXCLUSIVE_CONTROL_CONFIG;