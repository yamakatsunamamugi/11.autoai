/**
 * @fileoverview UI Selectors Loader
 *
 * JSONファイルからセレクタを読み込むローダーモジュール
 * キャッシュ機能付きで、一度読み込んだデータは再利用される
 */

// キャッシュ用変数
let CACHED_SELECTORS = null;

/**
 * ui-selectors-data.jsonからセレクタを読み込む
 * @returns {Promise<Object>} セレクタオブジェクト
 */
export async function loadSelectors() {
  if (!CACHED_SELECTORS) {
    try {
      const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
      const data = await response.json();
      CACHED_SELECTORS = data.selectors;
      console.log(`✅ UI Selectors loaded (v${data.version}, updated: ${data.lastUpdated})`);
    } catch (error) {
      console.error('❌ Failed to load ui-selectors-data.json:', error);
      CACHED_SELECTORS = {};
    }
  }
  return CACHED_SELECTORS;
}

/**
 * セレクタデータを取得（エイリアス）
 * @returns {Promise<Object>} セレクタオブジェクト
 */
export async function getSelectors() {
  return loadSelectors();
}

/**
 * キャッシュをクリア（主にデバッグ用）
 */
export function clearSelectorsCache() {
  CACHED_SELECTORS = null;
  console.log('🔄 Selectors cache cleared');
}

/**
 * 特定のAIのセレクタを取得
 * @param {string} aiType - 'ChatGPT', 'Claude', 'Gemini', 'Genspark'
 * @returns {Promise<Object|null>} AIセレクタオブジェクト
 */
export async function getAISelectors(aiType) {
  const selectors = await loadSelectors();
  return selectors[aiType] || null;
}

/**
 * 特定のセレクタタイプを取得
 * @param {string} aiType - AI種別
 * @param {string} selectorType - 'INPUT', 'SEND_BUTTON', 'STOP_BUTTON' など
 * @returns {Promise<Array<string>>} セレクタの配列
 */
export async function getSelectorsByType(aiType, selectorType) {
  const aiSelectors = await getAISelectors(aiType);
  if (!aiSelectors) {
    console.warn(`Unknown AI type: ${aiType}`);
    return [];
  }

  const selectors = aiSelectors[selectorType];
  if (!selectors) {
    console.warn(`Unknown selector type: ${selectorType} for ${aiType}`);
    return [];
  }

  return Array.isArray(selectors) ? selectors : [];
}

// Content Script環境用にwindowにも公開
if (typeof window !== 'undefined') {
  window.loadSelectors = loadSelectors;
  window.getSelectors = getSelectors;
  window.clearSelectorsCache = clearSelectorsCache;
  window.getAISelectors = getAISelectors;
  window.getSelectorsByType = getSelectorsByType;
}