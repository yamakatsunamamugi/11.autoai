/**
 * @fileoverview スプレッドシート列削除機能
 * 自動追加された列を削除して元の状態に戻す
 */

/**
 * スプレッドシート列削除クラス
 */
export class SpreadsheetColumnRemover {
  constructor() {
    this.spreadsheetId = null;
    this.token = null;
    this.sheetData = null;
    this.menuRowIndex = -1;
    this.aiRowIndex = -1;
    this.sheetId = 0;
    this.sheetName = null;
    this.targetGid = null;
  }

  /**
   * 列削除を実行
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} token - 認証トークン
   * @param {string} gid - シートID（オプション）
   */
  async removeAutoColumns(spreadsheetId, token, gid = null) {
    this.spreadsheetId = spreadsheetId;
    this.token = token;
    this.targetGid = gid;

    try {
      console.log("[ColumnRemover] 列削除開始", { spreadsheetId });

      // 1. シートIDを取得
      await this.loadSheetMetadata();

      // 2. スプレッドシートデータを取得
      await this.loadSpreadsheetData();

      // 3. メニュー行と使うAI行を検索
      await this.findKeyRows();

      // 4. 削除対象の列を特定して削除
      const result = await this.removeColumns();

      console.log("[ColumnRemover] 列削除完了", result);
      return {
        success: true,
        message: `${result.removedCount}個の列を削除しました`,
        details: result,
      };
    } catch (error) {
      console.error("[ColumnRemover] 列削除エラー", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * シートメタデータを取得してsheetIdを設定
   */
  async loadSheetMetadata() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }

    const metadata = await response.json();

    if (metadata.sheets && metadata.sheets.length > 0) {
      let targetSheet = null;

      if (this.targetGid) {
        const targetGidNumber = parseInt(this.targetGid);
        targetSheet = metadata.sheets.find(
          (sheet) => sheet.properties.sheetId === targetGidNumber,
        );
      }

      if (!targetSheet) {
        targetSheet = metadata.sheets[0];
      }

      this.sheetId = targetSheet.properties.sheetId;
      this.sheetName = targetSheet.properties.title;
    } else {
      throw new Error("スプレッドシートにシートが見つかりません");
    }
  }

  /**
   * スプレッドシートデータを読み込み
   */
  async loadSpreadsheetData() {
    const range = this.sheetName ? `'${this.sheetName}'!A1:Z100` : "A1:Z100";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }

    const data = await response.json();
    this.sheetData = data.values || [];
  }

  /**
   * メニュー行と使うAI行を検索
   */
  async findKeyRows() {
    for (let i = 0; i < this.sheetData.length; i++) {
      const row = this.sheetData[i];
      if (!row || row.length === 0) continue;

      const cellA = row[0];
      if (!cellA) continue;

      const cellValue = cellA.toString().trim();

      if (cellValue.includes("メニュー")) {
        this.menuRowIndex = i;
      }

      if (cellValue.includes("使うAI")) {
        this.aiRowIndex = i;
      }
    }

    if (this.menuRowIndex === -1) {
      throw new Error("メニュー行が見つかりません");
    }

    if (this.aiRowIndex === -1) {
      throw new Error("使うAI行が見つかりません");
    }
  }

  /**
   * 削除対象の列を特定して削除
   */
  async removeColumns() {
    const menuRow = this.sheetData[this.menuRowIndex];
    const columnsToRemove = [];

    // 削除対象の列を特定
    for (let i = 0; i < menuRow.length; i++) {
      const cellValue = (menuRow[i] || "").toString().trim();

      // 自動追加される列のパターン
      if (
        cellValue === "ログ" ||
        cellValue === "ChatGPT回答" ||
        cellValue === "Claude回答" ||
        cellValue === "Gemini回答"
      ) {
        // プロンプト列の隣接チェック
        let isAutoAdded = false;

        // 左隣がプロンプトの場合（ログ列）
        if (
          i > 0 &&
          menuRow[i - 1] &&
          menuRow[i - 1].toString().trim() === "プロンプト"
        ) {
          isAutoAdded = true;
        }

        // 3種類AI回答列のパターンチェック
        if (cellValue === "ChatGPT回答" && i >= 2) {
          // 2つ左がプロンプトで、その使うAIが3種類の場合
          const promptIndex = i - 1;
          if (
            menuRow[promptIndex - 1] &&
            menuRow[promptIndex - 1].toString().trim() === "プロンプト" &&
            this.sheetData[this.aiRowIndex][promptIndex - 1] &&
            this.sheetData[this.aiRowIndex][promptIndex - 1].includes("3種類")
          ) {
            isAutoAdded = true;
          }
        }

        if (isAutoAdded) {
          columnsToRemove.push({
            index: i,
            column: this.indexToColumn(i),
            header: cellValue,
          });
        }
      }
    }

    // 列を削除（右から左に処理）
    columnsToRemove.sort((a, b) => b.index - a.index);

    console.log("[ColumnRemover] 削除対象の列", {
      count: columnsToRemove.length,
      columns: columnsToRemove,
    });

    if (columnsToRemove.length === 0) {
      return { removedCount: 0, removedColumns: [] };
    }

    // バッチ削除リクエストを作成
    const requests = [];
    for (const col of columnsToRemove) {
      requests.push({
        deleteDimension: {
          range: {
            sheetId: this.sheetId,
            dimension: "COLUMNS",
            startIndex: col.index,
            endIndex: col.index + 1,
          },
        },
      });
    }

    // バッチ更新を実行
    await this.executeBatchUpdate(requests);

    return {
      removedCount: columnsToRemove.length,
      removedColumns: columnsToRemove.map((c) => ({
        column: c.column,
        header: c.header,
      })),
    };
  }

  /**
   * バッチ更新を実行
   */
  async executeBatchUpdate(requests) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}:batchUpdate`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Batch update error: ${error.error.message}`);
    }

    return await response.json();
  }

  /**
   * インデックスを列名に変換
   */
  indexToColumn(index) {
    let column = "";
    index++;
    while (index > 0) {
      index--;
      column = String.fromCharCode(65 + (index % 26)) + column;
      index = Math.floor(index / 26);
    }
    return column;
  }
}

export default SpreadsheetColumnRemover;
