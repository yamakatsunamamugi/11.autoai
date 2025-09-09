/**
 * @fileoverview 共通スリープユーティリティ - 待機処理の統一管理
 * 
 * 特徴:
 * - 基本的なスリープ関数
 * - ランダム待機時間生成
 * - デバッグ用ログ付きスリープ
 * - AI待機設定との統合
 * - テスト用のモック対応
 * 
 * 使用方法:
 * ```javascript
 * import { sleep, waitForUI, waitForDeepResearch } from '../utils/sleep-utils.js';
 * 
 * // 基本的な待機
 * await sleep(1000); // 1秒待機
 * 
 * // UI操作待機
 * await waitForUI('ボタンクリック後');
 * 
 * // Deep Research待機
 * await waitForDeepResearch('AI応答');
 * 
 * // 機能に基づく待機
 * await waitForFunction('Deep Research', 'AI処理');
 * ```
 * 
 * 移行ガイド:
 * - 旧: await this._sleep(1000) → 新: await sleep(1000)
 * - 旧: await new Promise(resolve => setTimeout(resolve, 1000)) → 新: await sleep(1000)
 */

// AI待機設定をインポート
import { AI_WAIT_CONFIG } from '../../automations/v2/ai-wait-config.js';
import { globalWakeLockManager } from './wake-lock-manager.js';

/**
 * 基本的なスリープ関数
 * @param {number} ms - 待機時間（ミリ秒）
 * @returns {Promise<void>} 待機Promise
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * デバッグログ付きスリープ関数
 * @param {number} ms - 待機時間（ミリ秒）
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function sleepWithLog(ms, context = 'sleep', logger = console.log) {
  if (ms > 1000) {
    logger(`[${context}] ${ms / 1000}秒待機開始`);
  }
  
  await sleep(ms);
  
  if (ms > 1000) {
    logger(`[${context}] ${ms / 1000}秒待機完了`);
  }
}

/**
 * ランダム待機時間生成
 * @param {number} min - 最小時間（秒）
 * @param {number} max - 最大時間（秒）
 * @returns {number} 待機時間（ミリ秒）
 */
export function randomWaitTime(min = 5, max = 15) {
  return Math.floor(Math.random() * ((max - min) * 1000 + 1)) + (min * 1000);
}

/**
 * ランダム待機実行
 * @param {number} min - 最小時間（秒）
 * @param {number} max - 最大時間（秒）
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function randomSleep(min = 5, max = 15, context = 'randomSleep', logger = console.log) {
  const waitTime = randomWaitTime(min, max);
  await sleepWithLog(waitTime, context, logger);
}

/**
 * AI待機設定に基づく待機
 * @param {string} type - 待機タイプ ('MICRO_WAIT', 'TINY_WAIT', 'SHORT_WAIT', etc.)
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function aiWait(type = 'SHORT_WAIT', context = 'aiWait', logger = console.log) {
  const waitTime = AI_WAIT_CONFIG[type] || AI_WAIT_CONFIG.SHORT_WAIT;
  await sleepWithLog(waitTime, `${context}(${type})`, logger);
}

/**
 * 条件付き待機 - 条件が満たされるまで待機
 * @param {Function} condition - 条件関数
 * @param {number} interval - チェック間隔（ミリ秒）
 * @param {number} maxWait - 最大待機時間（ミリ秒）
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<boolean>} 条件が満たされた場合true、タイムアウトの場合false
 */
export async function waitForCondition(
  condition, 
  interval = 1000, 
  maxWait = 30000, 
  context = 'waitForCondition',
  logger = console.log
) {
  const startTime = Date.now();
  let lastLogTime = startTime;
  
  while (Date.now() - startTime < maxWait) {
    try {
      if (await condition()) {
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > 1000) {
          logger(`[${context}] 条件満了 (${Math.round(elapsedTime / 1000)}秒)`);
        }
        return true;
      }
    } catch (error) {
      logger(`[${context}] 条件チェックエラー:`, error);
    }
    
    // 定期的なログ出力（長時間待機時）
    const currentTime = Date.now();
    if (currentTime - lastLogTime >= 10000) {
      const elapsedSeconds = Math.round((currentTime - startTime) / 1000);
      const maxSeconds = Math.round(maxWait / 1000);
      logger(`[${context}] 条件待機中... (${elapsedSeconds}秒 / 最大${maxSeconds}秒)`);
      lastLogTime = currentTime;
    }
    
    await sleep(interval);
  }
  
  logger(`[${context}] タイムアウト (${Math.round(maxWait / 1000)}秒)`);
  return false;
}

/**
 * 指数バックオフ待機
 * @param {number} baseDelay - 基本待機時間（ミリ秒）
 * @param {number} attempt - 試行回数（0から開始）
 * @param {number} maxDelay - 最大待機時間（ミリ秒）
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function exponentialBackoffSleep(
  baseDelay = 1000, 
  attempt = 0, 
  maxDelay = 30000, 
  context = 'exponentialBackoff',
  logger = console.log
) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  await sleepWithLog(delay, `${context}(試行${attempt + 1}回目)`, logger);
}

/**
 * テスト用モック設定
 * テスト環境では待機時間を短縮またはスキップ
 */
let mockEnabled = false;
let mockMultiplier = 1;

/**
 * テスト用モックを有効化
 * @param {number} multiplier - 待機時間の乗数（0で即座に完了、0.1で1/10の時間）
 */
export function enableMock(multiplier = 0) {
  mockEnabled = true;
  mockMultiplier = multiplier;
}

/**
 * テスト用モックを無効化
 */
export function disableMock() {
  mockEnabled = false;
  mockMultiplier = 1;
}

/**
 * モック対応スリープ関数
 * テスト時は待機時間を調整
 * @param {number} ms - 待機時間（ミリ秒）
 * @returns {Promise<void>} 待機Promise
 */
export async function mockableSleep(ms) {
  if (mockEnabled) {
    const adjustedMs = Math.round(ms * mockMultiplier);
    if (adjustedMs === 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, adjustedMs));
  }
  return sleep(ms);
}

/**
 * プリセット待機時間定数
 */
export const PRESET_WAITS = {
  // UI操作用
  MICRO: AI_WAIT_CONFIG.MICRO_WAIT || 100,
  TINY: AI_WAIT_CONFIG.TINY_WAIT || 500,
  SHORT: AI_WAIT_CONFIG.SHORT_WAIT || 1000,
  MEDIUM: AI_WAIT_CONFIG.MEDIUM_WAIT || 2000,
  LONG: AI_WAIT_CONFIG.LONG_WAIT || 3000,
  
  // 要素待機用
  ELEMENT_SEARCH: AI_WAIT_CONFIG.ELEMENT_SEARCH_WAIT || 5000,
  MENU: AI_WAIT_CONFIG.MENU_WAIT || 8000,
  
  // AI応答待機用
  INITIAL: AI_WAIT_CONFIG.INITIAL_WAIT || 30000,
  MAX_RESPONSE: AI_WAIT_CONFIG.MAX_WAIT || 300000,
  DEEP_RESEARCH: AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT || 2400000,
  CANVAS: AI_WAIT_CONFIG.CANVAS_MAX_WAIT || 300000
};

/**
 * プリセット待機の実行
 * @param {string} preset - プリセット名
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function presetSleep(preset, context = 'presetSleep', logger = console.log) {
  const waitTime = PRESET_WAITS[preset] || PRESET_WAITS.SHORT;
  await sleepWithLog(waitTime, `${context}(${preset})`, logger);
}

/**
 * デバッグ用 - 現在の設定を表示
 */
export function debugSleepUtils() {
  console.log('[SleepUtils] 現在の設定:', {
    mockEnabled,
    mockMultiplier,
    presetWaits: PRESET_WAITS
  });
}

/**
 * よく使用される待機パターンのヘルパー関数
 */

/**
 * UI操作間の待機
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function waitForUI(context = 'UI操作', logger = console.log) {
  await aiWait('SHORT_WAIT', context, logger);
}

/**
 * メニュー表示待機
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function waitForMenu(context = 'メニュー表示', logger = console.log) {
  await aiWait('MENU_WAIT', context, logger);
}

/**
 * AI応答待機（通常）
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function waitForResponse(context = 'AI応答', logger = console.log) {
  await aiWait('INITIAL', context, logger);
}

/**
 * Deep Research待機
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function waitForDeepResearch(context = 'Deep Research', logger = console.log) {
  await aiWait('DEEP_RESEARCH', context, logger);
}

/**
 * 排他制御用の機能別待機時間取得
 * exclusive-control-config.jsとの整合性を保つため
 * @param {string} functionName - 機能名
 * @returns {number} 待機時間（ミリ秒）
 */
export function getWaitTimeForFunction(functionName) {
  // 機能名を正規化（大文字小文字・スペースを考慮）
  const normalized = functionName?.toLowerCase().replace(/\s+/g, '') || 'default';
  
  // 機能別のマッピング
  const functionMapping = {
    'deepresearch': PRESET_WAITS.DEEP_RESEARCH,
    'ディープリサーチ': PRESET_WAITS.DEEP_RESEARCH,
    'deep research': PRESET_WAITS.DEEP_RESEARCH,
    'エージェント': PRESET_WAITS.DEEP_RESEARCH,
    'エージェントモード': PRESET_WAITS.DEEP_RESEARCH,
    'agent': PRESET_WAITS.DEEP_RESEARCH,
    'canvas': PRESET_WAITS.CANVAS,
    'キャンバス': PRESET_WAITS.CANVAS,
    'ウェブ検索': AI_WAIT_CONFIG.ELEMENT_SEARCH_WAIT || 8000,
    'websearch': AI_WAIT_CONFIG.ELEMENT_SEARCH_WAIT || 8000,
    'web search': AI_WAIT_CONFIG.ELEMENT_SEARCH_WAIT || 8000,
    '通常': PRESET_WAITS.MAX_RESPONSE,
    'normal': PRESET_WAITS.MAX_RESPONSE,
    'default': PRESET_WAITS.MAX_RESPONSE
  };
  
  return functionMapping[normalized] || PRESET_WAITS.MAX_RESPONSE;
}

/**
 * 機能に基づく待機実行
 * @param {string} functionName - 機能名
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function waitForFunction(functionName, context = 'functionWait', logger = console.log) {
  const waitTime = getWaitTimeForFunction(functionName);
  await sleepWithLog(waitTime, `${context}(${functionName})`, logger);
}

/**
 * 長時間処理用スリープ - Wake Lock付き
 * 5分以上の待機時にはシステムスリープを防止
 * @param {number} ms - 待機時間（ミリ秒）
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function longSleep(ms, context = 'longSleep', logger = console.log) {
  const isLongProcess = ms >= 300000; // 5分以上
  let wakeLockAcquired = false;
  
  try {
    // 長時間処理の場合はWake Lock取得
    if (isLongProcess) {
      wakeLockAcquired = await globalWakeLockManager.acquire(`${context} (${Math.round(ms/1000/60)}分待機)`);
      if (wakeLockAcquired) {
        logger(`[${context}] システムスリープ防止を有効化 (${Math.round(ms/1000/60)}分)`);
      }
    }
    
    // ログ付きで待機実行
    await sleepWithLog(ms, context, logger);
    
  } finally {
    // Wake Lock解放
    if (wakeLockAcquired) {
      await globalWakeLockManager.release();
      logger(`[${context}] システムスリープ防止を解除`);
    }
  }
}

/**
 * AI応答待機（Wake Lock付き）
 * Deep Research等の長時間処理に対応
 * @param {string} mode - 待機モード ('normal', 'deep-research', 'canvas')
 * @param {string} context - コンテキスト（ログ用）
 * @param {Function} logger - ログ関数（オプション）
 * @returns {Promise<void>} 待機Promise
 */
export async function aiResponseSleep(mode = 'normal', context = 'AI応答待機', logger = console.log) {
  const waitTimes = {
    'normal': AI_WAIT_CONFIG.MAX_WAIT || 300000,        // 5分
    'deep-research': AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT || 2400000, // 40分
    'canvas': AI_WAIT_CONFIG.CANVAS_MAX_WAIT || 300000   // 5分
  };
  
  const waitTime = waitTimes[mode] || waitTimes.normal;
  const modeText = {
    'normal': '通常',
    'deep-research': 'Deep Research',
    'canvas': 'Canvas'
  };
  
  await longSleep(waitTime, `${context}(${modeText[mode]})`, logger);
}

// 後方互換性のため、従来の名前もエクスポート
export { sleep as wait };
export { sleepWithLog as waitWithLog };