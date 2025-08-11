// extraction-maps.js - 抽出ロジックの辞書定義

// モデル・機能の設定をインポート
import { SPECIAL_MODEL_MAP, SPECIAL_OPERATION_MAP } from "./special-configs.js";

// 再エクスポート
export { SPECIAL_MODEL_MAP, SPECIAL_OPERATION_MAP };

/**
 * AIタイプの検出マップ
 * キーワードからAIタイプへのマッピング
 */
export const AI_TYPE_MAP = {
  chatgpt: "chatgpt",
  gpt: "chatgpt",
  claude: "claude",
  gemini: "gemini",
};

/**
 * 値から対応する要素を抽出
 * @param {string} value - 検索対象の文字列
 * @param {Object} map - キーワードと値のマッピング
 * @returns {string|null} 見つかった値またはnull
 */
export function extractFromMap(value, map) {
  if (!value) return null;

  // 完全一致のみ
  return map[value] || null;
}
