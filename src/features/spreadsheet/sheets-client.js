// sheets-client.js - Google Sheets APIクライアント

class SheetsClient {
  constructor() {
    this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    this.logger = typeof logger !== "undefined" ? logger : console;
  }

  /**
   * 列名生成関数（A, B, ..., Z, AA, AB, ...）
   */
  getColumnName(index) {
    if (index < 0) return null;
    
    let columnName = '';
    let num = index;
    
    while (num >= 0) {
      columnName = String.fromCharCode(65 + (num % 26)) + columnName;
      num = Math.floor(num / 26) - 1;
      if (num < 0) break;
    }
    
    return columnName;
  }

  /**
   * スプレッドシートのメタデータを取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @returns {Promise<Object>} メタデータ
   */
  async getSpreadsheetMetadata(spreadsheetId) {
    const token = await globalThis.authService.getAuthToken();
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

    const token = await globalThis.authService.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}`;

    this.logger.log("SheetsClient", `API URL: ${url}`);

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
    this.logger.log(
      "SheetsClient",
      `スプレッドシート読み込み: ${spreadsheetId}${gid ? ` (gid: ${gid})` : ""}`,
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
      modelRow: null,
      taskRow: null,
      columnMapping: {},
      workRows: [],
      rawData: rawData,
      values: rawData,  // valuesも含める（互換性のため）
      aiColumns: {}     // aiColumnsも初期化
    };

    // 基本的な設定定数を定義（SPREADSHEET_CONFIGがない場合のフォールバック）
    // SPREADSHEET_CONFIGを使用（グローバル変数またはインポート）
    const config = typeof SPREADSHEET_CONFIG !== "undefined"
        ? SPREADSHEET_CONFIG
        : null;
        
    if (!config) {
      throw new Error("SPREADSHEET_CONFIG が見つかりません。config.js を読み込んでください。");
    }

    // 各行を解析
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const firstCell = row[0] || "";

      // メニュー行を検索
      if (firstCell === config.rowIdentifiers.menuRow.keyword) {
        result.menuRow = {
          index: i,
          data: row,
        };
        // 列マッピングを作成
        for (let j = 0; j < row.length; j++) {
          const cellValue = row[j];
          const columnLetter = this.getColumnName(j);
          
          // プロンプト列の検出とAI列としての登録（メインのプロンプト列のみ）
          if (cellValue && cellValue === "プロンプト") {
            // AI行の値を確認（AI行が存在する場合）
            let aiType = "single"; // デフォルト
            if (result.aiRow && result.aiRow.data) {
              const aiValue = result.aiRow.data[j]; // プロンプト列自体のAI行の値
              if (aiValue && aiValue.includes("3種類")) {
                aiType = "3type";
              }
            }
            
            // aiColumnsに登録
            result.aiColumns[columnLetter] = {
              index: j,
              letter: columnLetter,
              header: cellValue,
              type: aiType,
              promptDescription: ""
            };
            
            this.logger.log("SheetsClient", `AI列検出: ${columnLetter}列 (${aiType})`);
          }
          
          for (const [key, columnConfig] of Object.entries(
            config.columnTypes,
          )) {
            if (cellValue === columnConfig.keyword) {
              result.columnMapping[j] = {
                type: columnConfig.type,
                aiType: columnConfig.aiType,
                keyword: columnConfig.keyword,
                columnIndex: j,
              };
            }
          }
        }
      }

      // 制御行を検索
      if (firstCell === config.rowIdentifiers.controlRow.keyword) {
        result.controlRow = {
          index: i,
          data: row,
        };
      }

      // AI行を検索
      if (firstCell === config.rowIdentifiers.aiRow.keyword) {
        result.aiRow = {
          index: i,
          data: row,
        };
      }

      // モデル行を検索（A列が「モデル」と完全一致）
      if (firstCell === config.rowIdentifiers.modelRow.keyword) {
        result.modelRow = {
          index: i,
          data: row,
        };
        this.logger.log("SheetsClient", `モデル行検出: 行${i + 1}, A列="${firstCell}"`);
      }

      // 機能行を検索（A列が「機能」と完全一致）
      if (firstCell === config.rowIdentifiers.taskRow.keyword) {
        result.taskRow = {
          index: i,
          data: row,
        };
        this.logger.log("SheetsClient", `機能行検出: 行${i + 1}, A列="${firstCell}"`);
      }

      // 作業行を検索（A列が「1」から始まる数字）
      if (/^\d+$/.test(firstCell)) {
        // 最後の制御行を特定
        const lastControlRowIndex = Math.max(
          result.menuRow ? result.menuRow.index : -1,
          result.controlRow ? result.controlRow.index : -1,
          result.aiRow ? result.aiRow.index : -1,
          result.modelRow ? result.modelRow.index : -1,
          result.taskRow ? result.taskRow.index : -1,
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

    // 作業行検出結果をログ出力
    if (result.workRows.length > 0) {
      this.logger.log(
        "SheetsClient",
        `作業行検出: ${result.workRows.length}行を検出`,
      );
    }
    
    // AI列の最終処理（メニュー行とAI行の両方が揃った後）
    if (result.menuRow && result.menuRow.data) {
      const menuRowData = result.menuRow.data;
      const aiRowData = result.aiRow ? result.aiRow.data : [];
      
      for (let j = 0; j < menuRowData.length; j++) {
        const cellValue = menuRowData[j];
        const columnLetter = this.getColumnName(j);
        
        // プロンプト列の検出（メインのプロンプト列のみ）
        if (cellValue && cellValue === "プロンプト") {
          let aiType = "single"; // デフォルト
          
          // AI行の値を確認
          if (aiRowData && aiRowData[j] && aiRowData[j].includes("3種類")) {
            aiType = "3type";
          }
          // メニュー行の次の列をチェック（3種類AIレイアウト）
          else if (
            (menuRowData[j + 1] && menuRowData[j + 1].includes("ChatGPT") &&
             menuRowData[j + 2] && menuRowData[j + 2].includes("Claude") &&
             menuRowData[j + 3] && menuRowData[j + 3].includes("Gemini")) ||
            (menuRowData[j + 1] && menuRowData[j + 1].includes("回答") &&
             menuRowData[j + 2] && menuRowData[j + 2].includes("回答") &&
             menuRowData[j + 3] && menuRowData[j + 3].includes("回答"))
          ) {
            aiType = "3type";
          }
          
          // aiColumnsに登録（上書き）
          result.aiColumns[columnLetter] = {
            index: j,
            letter: columnLetter,
            header: cellValue,
            type: aiType,
            promptDescription: ""
          };
          
          this.logger.log("SheetsClient", `AI列最終検出: ${columnLetter}列 (${aiType})`);
        }
      }
    }

    this.logger.log("SheetsClient", "読み込み完了", {
      menuRowFound: !!result.menuRow,
      workRowsCount: result.workRows.length,
      columnTypes: Object.keys(result.columnMapping).length,
      aiColumnsCount: Object.keys(result.aiColumns).length
    });

    return result;
  }

  /**
   * バッチでセルを更新
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {Array<{range: string, values: Array}>} updates - 更新データの配列
   * @returns {Promise<Object>} 更新結果
   */
  async batchUpdate(spreadsheetId, updates) {
    const token = await globalThis.authService.getAuthToken();
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
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} 更新結果
   */
  async updateCell(spreadsheetId, range, value, gid = null) {
    // gidが指定されている場合、シート名を取得して範囲を更新
    if (gid && !range.includes("!")) {
      const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
      if (sheetName) {
        range = `'${sheetName}'!${range}`;
      }
    }
    
    const token = await globalThis.authService.getAuthToken();
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

  /**
   * リッチテキストでセルを更新（リンクを含むテキスト）
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 更新する範囲（例: "B5"）
   * @param {Array<Object>} richTextData - リッチテキストデータの配列
   *   [{text: "通常テキスト"}, {text: "リンクテキスト", url: "https://example.com"}, ...]
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} 更新結果
   */
  async updateCellWithRichText(spreadsheetId, range, richTextData, gid = null) {
    const token = await globalThis.authService.getAuthToken();
    
    // 範囲をA1記法からインデックスに変換
    const cellMatch = range.match(/^([A-Z]+)(\d+)$/);
    if (!cellMatch) {
      throw new Error(`Invalid range format: ${range}`);
    }
    
    const columnLetters = cellMatch[1];
    const rowNumber = parseInt(cellMatch[2]);
    
    // 列文字をインデックスに変換（A=0, B=1, ...）
    let columnIndex = 0;
    for (let i = 0; i < columnLetters.length; i++) {
      columnIndex = columnIndex * 26 + (columnLetters.charCodeAt(i) - 65);
    }
    
    // 全体のテキストを構築
    let fullText = '';
    const textFormatRuns = [];
    
    richTextData.forEach(item => {
      const startIndex = fullText.length;
      fullText += item.text || '';
      
      // URLがある場合はリンクとして追加
      if (item.url) {
        textFormatRuns.push({
          startIndex: startIndex,
          format: {
            link: { uri: item.url }
          }
        });
        // リンクの終了位置を指定
        textFormatRuns.push({
          startIndex: fullText.length
        });
      }
    });
    
    // batchUpdate用のリクエスト
    const requests = [{
      updateCells: {
        rows: [{
          values: [{
            userEnteredValue: { 
              stringValue: fullText 
            },
            textFormatRuns: textFormatRuns.length > 0 ? textFormatRuns : undefined
          }]
        }],
        range: {
          sheetId: gid ? parseInt(gid) : 0,
          startRowIndex: rowNumber - 1,  // 0-indexed
          endRowIndex: rowNumber,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1
        },
        fields: "userEnteredValue,textFormatRuns"
      }
    }];
    
    const batchUpdateUrl = `${this.baseUrl}/${spreadsheetId}:batchUpdate`;
    const response = await fetch(batchUpdateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API batchUpdate error: ${error.error.message}`);
    }
    
    return await response.json();
  }

  /**
   * スプレッドシートのログをクリア
   * 
   * 【概要】
   * スプレッドシートのメニュー行から「ログ」列を探し、その列の作業行データをクリアする機能。
   * background.jsと連携してA列のデータもクリアされる。
   * 
   * 【依存関係】
   * - loadAutoAIData: スプレッドシートの構造を読み込む
   * - batchUpdate: 複数セルを一括更新
   * - background.js: A列のクリア処理を追加実行
   * 
   * 【前提条件】
   * - メニュー行（1行目）に「ログ」という列が存在すること
   * - 「ログ」は完全一致で検索される（部分一致は不可）
   * - 作業行はメニュー行の「プロンプト」列にデータがある行
   * 
   * 【動作フロー】
   * 1. スプレッドシート全体のデータを読み込み
   * 2. メニュー行から「ログ」列を完全一致で検索
   * 3. 見つかった場合、その列の作業行のセルをクリア
   * 4. background.jsでA列（A2:A1000）も同時にクリア
   * 
   * 【注意事項】
   * - B列固定ではなく、メニュー行の「ログ」を動的に検索
   * - ログ列が見つからない場合はエラーを返す
   * 
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} クリア結果
   */
  async clearSheetLogs(spreadsheetId, gid = null) {
    this.logger.log("SheetsClient", `ログクリア開始: ${spreadsheetId}`);
    
    try {
      // スプレッドシートのデータを読み込み
      const sheetData = await this.loadAutoAIData(spreadsheetId, gid);
      
      // メニュー行から「ログ」列を探す（完全一致）
      let logColumnIndex = -1;
      if (sheetData.menuRow && sheetData.menuRow.data) {
        for (let j = 0; j < sheetData.menuRow.data.length; j++) {
          if (sheetData.menuRow.data[j] === "ログ") {  // 完全一致
            logColumnIndex = j;
            this.logger.log("SheetsClient", `ログ列を検出: ${this.getColumnName(j)}列`);
            break;
          }
        }
      }
      
      if (logColumnIndex === -1) {
        this.logger.warn("SheetsClient", "メニュー行に'ログ'列が見つかりません");
        return { success: false, error: "ログ列が見つかりません" };
      }
      
      const updates = [];
      let clearedCount = 0;
      
      // 作業行のログ列をクリア
      for (const workRow of sheetData.workRows) {
        const rowIndex = workRow.index;
        const columnName = this.getColumnName(logColumnIndex);
        let range;
        
        if (gid) {
          const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
          range = sheetName ? `'${sheetName}'!${columnName}${rowIndex + 1}` : `${columnName}${rowIndex + 1}`;
        } else {
          range = `${columnName}${rowIndex + 1}`;
        }
        
        updates.push({
          range: range,
          values: [[""]]
        });
        clearedCount++;
      }
      
      if (updates.length > 0) {
        await this.batchUpdate(spreadsheetId, updates);
      }
      
      this.logger.log("SheetsClient", `ログクリア完了: ${clearedCount}個のセル`);
      return { success: true, clearedCount };
      
    } catch (error) {
      this.logger.error("SheetsClient", `ログクリアエラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * AI回答を削除
   * 
   * 【概要】
   * スプレッドシートのAI回答列（Claude、ChatGPT、Gemini等）とA列のデータを削除する機能。
   * メニュー行から各AI名の列を検出し、その列の作業行データをクリアする。
   * 
   * 【依存関係】
   * - loadAutoAIData: スプレッドシートの構造を読み込む
   * - batchUpdate: 複数セルを一括更新
   * - columnMapping: メニュー行の列タイプ判定情報
   * 
   * 【前提条件】
   * - メニュー行にAI名（Claude、ChatGPT、Gemini等）の列が存在
   * - A列は作業行のチェック用（1が入っている行が処理対象）
   * - 作業行はメニュー行の「プロンプト」列にデータがある行
   * 
   * 【動作フロー】
   * 1. スプレッドシート全体のデータを読み込み
   * 2. columnMappingから type="answer" の列を特定
   * 3. 各AI回答列の作業行データをクリア
   * 4. A列（A2:A1000）の全データもクリア
   * 
   * 【削除対象】
   * - 各AI列（Claude、ChatGPT、Gemini等）の回答データ
   * - A列の作業行マーカー（1の値）
   * 
   * 【削除対象外】
   * - メニュー行、制御行、AI行、モデル行、機能行
   * - プロンプト列
   * - ログ列
   * 
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} 削除結果
   */
  async deleteAnswers(spreadsheetId, gid = null) {
    this.logger.log("SheetsClient", `AI回答削除開始: ${spreadsheetId}`);
    
    try {
      // スプレッドシートのデータを読み込み
      const sheetData = await this.loadAutoAIData(spreadsheetId, gid);
      
      // AI回答列を特定して削除
      const updates = [];
      let deletedCount = 0;
      
      // 削除対象の列を特定
      // 対象: 「回答」「ChatGPT回答」「Claude回答」「Gemini回答」の4つの列
      const answerColumns = [];
      
      // メニュー行から削除対象の列を検索
      if (sheetData.menuRow && sheetData.menuRow.data) {
        // 削除対象の列名を定義（完全一致で検索）
        const targetColumns = ["回答", "ChatGPT回答", "Claude回答", "Gemini回答"];
        
        for (let j = 0; j < sheetData.menuRow.data.length; j++) {
          const cellValue = sheetData.menuRow.data[j];
          
          // 削除対象の列名と完全一致するかチェック
          if (targetColumns.includes(cellValue)) {
            answerColumns.push(j);
            this.logger.log("SheetsClient", `削除対象列検出: ${this.getColumnName(j)}列 (${cellValue})`);
          }
        }
        
        if (answerColumns.length === 0) {
          this.logger.warn("SheetsClient", "削除対象の列（回答、ChatGPT回答、Claude回答、Gemini回答）が見つかりません");
        }
      }
      
      // 作業行のAI回答列をクリア
      for (const workRow of sheetData.workRows) {
        const rowIndex = workRow.index;
        
        for (const colIndex of answerColumns) {
          const columnLetter = this.getColumnName(colIndex);
          let range;
          
          if (gid) {
            const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
            range = sheetName ? `'${sheetName}'!${columnLetter}${rowIndex + 1}` : `${columnLetter}${rowIndex + 1}`;
          } else {
            range = `${columnLetter}${rowIndex + 1}`;
          }
          
          updates.push({
            range: range,
            values: [[""]]
          });
          deletedCount++;
        }
      }
      
      if (updates.length > 0) {
        await this.batchUpdate(spreadsheetId, updates);
      }
      
      this.logger.log("SheetsClient", `AI回答削除完了: ${deletedCount}個のセル`);
      return { success: true, deletedCount };
      
    } catch (error) {
      this.logger.error("SheetsClient", `AI回答削除エラー: ${error.message}`);
      throw error;
    }
  }
}

// グローバルスコープに追加
self.SheetsClient = SheetsClient;

// シングルトンインスタンスを作成してグローバルに公開
if (typeof globalThis !== "undefined") {
  globalThis.sheetsClient = new SheetsClient();
}
