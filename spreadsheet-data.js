/**
 * SpreadsheetData - セルアドレスベースのスプレッドシート データアクセス
 *
 * バッチ読み取りしたデータをセルアドレス（例：X13, Y20）で
 * 直接アクセスできるようにするクラス
 */
class SpreadsheetData {
  constructor() {
    this.cellMap = new Map();
    this.rowDataMap = new Map();
  }

  /**
   * バッチ読み取りデータをセルアドレスでアクセス可能にする
   * @param {string} range - 読み取り範囲（例："X100:Y120"）
   * @param {Array} values - Sheets APIから返された値の2次元配列
   */
  loadBatchData(range, values) {
    if (!range || !values) return;

    // 範囲をパース（例："Sheet1!X100:Y120" または "X100:Y120"）
    const rangeMatch = range.match(/(?:.*!)?([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if (!rangeMatch) {
      console.error(`❌ [SpreadsheetData] 範囲のパースに失敗: ${range}`);
      return;
    }

    const [_, startCol, startRowStr, endCol, endRowStr] = rangeMatch;
    const startRow = parseInt(startRowStr);
    const endRow = parseInt(endRowStr);

    // 列の範囲を決定
    const startColNum = this.columnToNumber(startCol);
    const endColNum = this.columnToNumber(endCol);

    // 各行のデータをセルアドレスにマップ
    values.forEach((rowData, rowIndex) => {
      const currentRow = startRow + rowIndex;

      // 行データを保存
      this.rowDataMap.set(currentRow, rowData);

      // 各セルをアドレスでアクセス可能にする
      for (let colIndex = 0; colIndex < rowData.length; colIndex++) {
        const colNum = startColNum + colIndex;
        const colLetter = this.numberToColumn(colNum);
        const cellAddress = `${colLetter}${currentRow}`;

        this.cellMap.set(cellAddress, rowData[colIndex]);
      }
    });

    console.log(`✅ [SpreadsheetData] データ読み込み完了:`, {
      range,
      rows: values.length,
      cellsLoaded: this.cellMap.size,
    });
  }

  /**
   * セルアドレスから値を取得
   * @param {string} address - セルアドレス（例："X13"）
   * @returns {any} セルの値
   */
  getCell(address) {
    return this.cellMap.get(address);
  }

  /**
   * セルに値が存在し、空でないかチェック
   * @param {string} address - セルアドレス
   * @returns {boolean} 値が存在する場合true
   */
  hasValue(address) {
    const value = this.cellMap.get(address);
    return (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      String(value).trim() !== ""
    );
  }

  /**
   * 行番号から行データ全体を取得
   * @param {number} rowNumber - 行番号
   * @returns {Array} 行データ
   */
  getRow(rowNumber) {
    return this.rowDataMap.get(rowNumber) || [];
  }

  /**
   * 列文字を数値に変換（A=1, B=2, ..., Z=26, AA=27）
   * @param {string} column - 列文字
   * @returns {number} 列番号
   */
  columnToNumber(column) {
    let result = 0;
    for (let i = 0; i < column.length; i++) {
      result = result * 26 + (column.charCodeAt(i) - "A".charCodeAt(0) + 1);
    }
    return result;
  }

  /**
   * 数値を列文字に変換（1=A, 2=B, ..., 26=Z, 27=AA）
   * @param {number} num - 列番号
   * @returns {string} 列文字
   */
  numberToColumn(num) {
    let result = "";
    while (num > 0) {
      num--; // 1-indexed to 0-indexed
      result = String.fromCharCode((num % 26) + "A".charCodeAt(0)) + result;
      num = Math.floor(num / 26);
    }
    return result;
  }

  /**
   * デバッグ用：読み込まれているセルアドレスを表示
   * @param {number} limit - 表示する最大数
   */
  debugPrintCells(limit = 10) {
    const addresses = Array.from(this.cellMap.keys()).slice(0, limit);
    console.log(
      `🔍 [SpreadsheetData] 読み込み済みセル（最初の${limit}件）:`,
      addresses,
    );

    addresses.forEach((addr) => {
      const value = this.cellMap.get(addr);
      console.log(
        `  ${addr}: "${String(value).substring(0, 50)}${String(value).length > 50 ? "..." : ""}"`,
      );
    });
  }

  /**
   * メモリをクリア
   */
  clear() {
    this.cellMap.clear();
    this.rowDataMap.clear();
  }
}

// グローバルに登録
if (typeof window !== "undefined") {
  window.SpreadsheetData = SpreadsheetData;
}

// エクスポート（ES6モジュール）
export default SpreadsheetData;
