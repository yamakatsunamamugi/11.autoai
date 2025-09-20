/**
 * @fileoverview スプレッドシートユーティリティ関数
 */

/**
 * スプレッドシートURLからIDとGIDを抽出
 * @param {string} url - スプレッドシートのURL
 * @returns {{spreadsheetId: string|null, gid: string}} IDとGID
 */
export function parseSpreadsheetUrl(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[#&]gid=([0-9]+)/);
  return {
    spreadsheetId: match ? match[1] : null,
    gid: gidMatch ? gidMatch[1] : '0'
  };
}

/**
 * カラムインデックスをA1記法に変換
 * @param {number} index - カラムインデックス（0ベース）
 * @returns {string} A1記法のカラム名
 */
export function indexToColumn(index) {
  let column = '';
  while (index >= 0) {
    column = String.fromCharCode((index % 26) + 65) + column;
    index = Math.floor(index / 26) - 1;
  }
  return column;
}

/**
 * A1記法をカラムインデックスに変換
 * @param {string} column - A1記法のカラム名
 * @returns {number} カラムインデックス（0ベース）
 */
export function columnToIndex(column) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + column.charCodeAt(i) - 64;
  }
  return index - 1;
}

/**
 * セル範囲をA1記法に変換
 * @param {number} row - 行番号（1ベース）
 * @param {number} col - カラム番号（1ベース）
 * @returns {string} A1記法のセル参照
 */
export function getCellA1Notation(row, col) {
  return `${indexToColumn(col - 1)}${row}`;
}

/**
 * 範囲をA1記法に変換
 * @param {number} startRow - 開始行（1ベース）
 * @param {number} startCol - 開始列（1ベース）
 * @param {number} endRow - 終了行（1ベース）
 * @param {number} endCol - 終了列（1ベース）
 * @returns {string} A1記法の範囲
 */
export function getRangeA1Notation(startRow, startCol, endRow, endCol) {
  const startCell = getCellA1Notation(startRow, startCol);
  const endCell = getCellA1Notation(endRow, endCol);
  return `${startCell}:${endCell}`;
}

// globalThisへの後方互換性のため
if (typeof globalThis !== 'undefined' && !globalThis.parseSpreadsheetUrl) {
  globalThis.parseSpreadsheetUrl = parseSpreadsheetUrl;
}

export default {
  parseSpreadsheetUrl,
  indexToColumn,
  columnToIndex,
  getCellA1Notation,
  getRangeA1Notation
};