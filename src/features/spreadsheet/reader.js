// sheets-client.js - Google Sheets APIクライアント

class SheetsClient {
  constructor() {
    this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
  }

  /**
   * スプレッドシートのメタデータを取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @returns {Promise<Object>} メタデータ
   */
  async getSpreadsheetMetadata(spreadsheetId) {
    const token = await authService.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}?fields=properties,sheets(properties)`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }

    return await response.json();
  }

  /**
   * gidからシート名を取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid
   * @returns {Promise<string|null>} シート名
   */
  async getSheetNameFromGid(spreadsheetId, gid) {
    if (!gid) return null;

    const metadata = await this.getSpreadsheetMetadata(spreadsheetId);
    const targetGidNumber = parseInt(gid);
    const sheet = metadata.sheets?.find(
      (s) => s.properties.sheetId === targetGidNumber,
    );

    return sheet ? sheet.properties.title : null;
  }

  /**
   * スプレッドシートのデータを取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 取得する範囲（例: "Sheet1!A1:Z100"）
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Array>} セルデータの2次元配列
   */
  async getSheetData(spreadsheetId, range, gid = null) {
    // gidが指定されている場合、シート名を取得して範囲を更新
    if (gid) {
      const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
      if (sheetName) {
        // 範囲にシート名が含まれていない場合は追加
        if (!range.includes("!")) {
          range = `'${sheetName}'!${range}`;
        } else {
          // すでにシート名が含まれている場合は置き換え
          range = `'${sheetName}'!${range.split("!")[1]}`;
        }
      }
    }

    const token = await authService.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}`;

    console.log(`  API URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  /**
   * スプレッドシートからAutoAIの作業データを読み込み
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} 解析されたデータ構造
   */
  async loadAutoAIData(spreadsheetId, gid = null) {
    console.groupCollapsed(
      `[SheetsClient] スプレッドシート読み込み: ${spreadsheetId}${gid ? ` (gid: ${gid})` : ""}`,
    );

    // まず全体のデータを取得（A1:Z1000の範囲）
    const rawData = await this.getSheetData(spreadsheetId, "A1:Z1000", gid);

    if (rawData.length === 0) {
      throw new Error("スプレッドシートにデータがありません");
    }

    // データ構造を解析
    const result = {
      menuRow: null,
      controlRow: null,
      aiRow: null,
      specialModelRow: null,
      specialTaskRow: null,
      columnMapping: {},
      workRows: [],
      rawData: rawData,
    };

    // 各行を解析
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const firstCell = row[0] || "";

      // メニュー行を検索
      if (firstCell === SPREADSHEET_CONFIG.rowIdentifiers.menuRow.keyword) {
        result.menuRow = {
          index: i,
          data: row,
        };
        // 列マッピングを作成
        for (let j = 0; j < row.length; j++) {
          const cellValue = row[j];
          for (const [key, config] of Object.entries(
            SPREADSHEET_CONFIG.columnTypes,
          )) {
            if (cellValue === config.keyword) {
              result.columnMapping[j] = {
                type: config.type,
                aiType: config.aiType,
                keyword: config.keyword,
                columnIndex: j,
              };
            }
          }
        }
      }

      // 制御行を検索
      if (firstCell === SPREADSHEET_CONFIG.rowIdentifiers.controlRow.keyword) {
        result.controlRow = {
          index: i,
          data: row,
        };
      }

      // AI行を検索
      if (firstCell === SPREADSHEET_CONFIG.rowIdentifiers.aiRow.keyword) {
        result.aiRow = {
          index: i,
          data: row,
        };
      }

      // 特殊モデル行を検索
      if (
        firstCell === SPREADSHEET_CONFIG.rowIdentifiers.specialModelRow.keyword
      ) {
        result.specialModelRow = {
          index: i,
          data: row,
        };
      }

      // 特殊作業行を検索
      if (
        firstCell === SPREADSHEET_CONFIG.rowIdentifiers.specialTaskRow.keyword
      ) {
        result.specialTaskRow = {
          index: i,
          data: row,
        };
      }

      // 作業行を検索（A列が「1」から始まる数字）
      // ただし、すべての制御行（メニュー、制御、AI、特殊モデル、特殊作業）の後のみ
      if (/^\d+$/.test(firstCell)) {
        // 最後の制御行を特定
        const lastControlRowIndex = Math.max(
          result.menuRow ? result.menuRow.index : -1,
          result.controlRow ? result.controlRow.index : -1,
          result.aiRow ? result.aiRow.index : -1,
          result.specialModelRow ? result.specialModelRow.index : -1,
          result.specialTaskRow ? result.specialTaskRow.index : -1,
        );

        // 現在の行がすべての制御行より後にある場合のみ作業行として扱う
        if (i > lastControlRowIndex) {
          const workRow = {
            index: i,
            number: i + 1, // 実際の行番号（1ベース）を使用
            data: row,
            control: row[1] || null, // B列の制御情報
          };

          // プロンプトを収集
          workRow.prompts = {};
          for (const [colIndex, mapping] of Object.entries(
            result.columnMapping,
          )) {
            if (mapping.type === "prompt" && row[colIndex]) {
              workRow.prompts[colIndex] = row[colIndex];
            }
          }

          result.workRows.push(workRow);
        }
      }
    }

    // 作業行検出結果をまとめて出力
    if (result.workRows.length > 0) {
      const firstRow = result.workRows[0];
      const lastRow = result.workRows[result.workRows.length - 1];

      if (result.workRows.length <= 5) {
        // 5行以下の場合はすべて表示
        console.log(`[作業行検出] ${result.workRows.length}行を検出`);
        result.workRows.forEach((row) => {
          console.log(`  行${row.number} (A列: "${row.data[0]}")`);
        });
      } else {
        // 6行以上の場合は折りたたみ形式で表示
        console.groupCollapsed(
          `[作業行検出] ${result.workRows.length}行を検出 (行${firstRow.number}〜行${lastRow.number})`,
        );
        result.workRows.forEach((row) => {
          console.log(`  行${row.number} (A列: "${row.data[0]}")`);
        });
        console.groupEnd();
      }
    }

    console.log(`  読み込み完了:`, {
      menuRowFound: !!result.menuRow,
      workRowsCount: result.workRows.length,
      columnTypes: Object.keys(result.columnMapping).length,
    });
    console.groupEnd();

    return result;
  }

  /**
   * バッチでセルを更新
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {Array<{range: string, values: Array}>} updates - 更新データの配列
   * @returns {Promise<Object>} 更新結果
   */
  async batchUpdate(spreadsheetId, updates) {
    const token = await authService.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values:batchUpdate`;

    const requestBody = {
      valueInputOption: "USER_ENTERED",
      data: updates,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }

    return await response.json();
  }

  /**
   * 単一のセルを更新
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 更新する範囲（例: "A1"）
   * @param {*} value - 設定する値
   * @returns {Promise<Object>} 更新結果
   */
  async updateCell(spreadsheetId, range, value) {
    const token = await authService.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

    const requestBody = {
      values: [[value]],
    };

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }

    return await response.json();
  }
}

// シングルトンインスタンスを作成してエクスポート
const sheetsClient = new SheetsClient();

// グローバルに公開
if (typeof globalThis !== "undefined") {
  globalThis.sheetsClient = sheetsClient;
}
