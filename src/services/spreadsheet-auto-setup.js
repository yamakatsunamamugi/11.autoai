/**
 * @fileoverview スプレッドシート自動セットアップ機能
 * プロンプト列の前後にログ・回答列を自動追加する
 */

/**
 * スプレッドシート自動セットアップクラス
 */
export class SpreadsheetAutoSetup {
  constructor() {
    this.spreadsheetId = null;
    this.token = null;
    this.sheetData = null;
    this.menuRowIndex = -1;
    this.aiRowIndex = -1;
    this.sheetId = 0; // デフォルトは0、動的に取得
    this.sheetName = null; // シート名
    this.targetGid = null; // ターゲットgid
    this.addedColumns = []; // 追加された列の記録
  }

  /**
   * 自動セットアップを実行
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} token - 認証トークン
   * @param {string} gid - シートID（オプション）
   */
  async executeAutoSetup(spreadsheetId, token, gid = null) {
    this.spreadsheetId = spreadsheetId;
    this.token = token;
    this.targetGid = gid;

    try {

      // 1. シートIDを取得
      await this.loadSheetMetadata();

      // 2. スプレッドシートデータを取得
      await this.loadSpreadsheetData();

      // 3. メニュー行とAI行を検索
      await this.findKeyRows();

      // 3. プロンプト列を検索して処理
      await this.processPromptColumns();


      const result = {
        success: true,
        message:
          this.addedColumns.length > 0
            ? `${this.addedColumns.length}個の列を追加しました`
            : "自動セットアップが完了しました",
        addedColumns: this.addedColumns,
        hasAdditions: this.addedColumns.length > 0,
      };

      return result;
    } catch (error) {
      console.error("[AutoSetup] 自動セットアップエラー", error);
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

    // targetGidがある場合は該当するシートを検索、なければ最初のシート
    if (metadata.sheets && metadata.sheets.length > 0) {
      let targetSheet = null;

      if (this.targetGid) {
        const targetGidNumber = parseInt(this.targetGid);
        targetSheet = metadata.sheets.find(
          (sheet) => sheet.properties.sheetId === targetGidNumber,
        );

        if (!targetSheet) {
          console.warn(
            "[AutoSetup] 指定されたgidのシートが見つかりません。最初のシートを使用します",
            {
              targetGid: this.targetGid,
              availableSheetIds: metadata.sheets.map(
                (s) => s.properties.sheetId,
              ),
            },
          );
          targetSheet = metadata.sheets[0];
        }
      } else {
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
    // シート名がある場合は特定のシートから、なければデフォルト
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
   * メニュー行とAI行を検索
   */
  async findKeyRows() {

    // configから設定を取得
    const config = typeof SPREADSHEET_CONFIG !== "undefined" ? SPREADSHEET_CONFIG : null;
    if (!config) {
      throw new Error("SPREADSHEET_CONFIG が見つかりません。config.js を読み込んでください。");
    }

    for (let i = 0; i < this.sheetData.length; i++) {
      const row = this.sheetData[i];
      if (!row || row.length === 0) continue;

      // A列のセル値を取得
      const cellA = row[0];
      if (!cellA) continue;

      const cellValue = cellA.toString().trim();

      // メニュー行を検索
      if (cellValue === config.rowIdentifiers.menuRow.keyword) {
        this.menuRowIndex = i;
      }

      // AI行を検索
      if (cellValue === config.rowIdentifiers.aiRow.keyword) {
        this.aiRowIndex = i;
      }
    }

    if (this.menuRowIndex === -1) {
      throw new Error(
        `メニュー行が見つかりません（A列に「${config.rowIdentifiers.menuRow.keyword}」を含むセルが必要）`,
      );
    }

    if (this.aiRowIndex === -1) {
      throw new Error(
        `AI行が見つかりません（A列に「${config.rowIdentifiers.aiRow.keyword}」を含むセルが必要）`,
      );
    }
  }

  /**
   * プロンプト列を検索して処理
   */
  async processPromptColumns() {
    const menuRow = this.sheetData[this.menuRowIndex];
    const aiRow = this.sheetData[this.aiRowIndex];

    if (!menuRow || !aiRow) {
      throw new Error("メニュー行またはAI行のデータが不正です");
    }

    // プロンプト列グループを検索
    const promptGroups = [];
    const maxLength = Math.max(menuRow.length, aiRow.length);
    
    for (let colIndex = 0; colIndex < maxLength; colIndex++) {
      const cellValue = menuRow[colIndex];
      if (cellValue) {
        const trimmedValue = cellValue.toString().trim();
        
        // メインのプロンプト列を見つけた場合
        if (trimmedValue === "プロンプト") {
          let lastPromptIndex = colIndex;
          
          // 連続するプロンプト2〜5を探す
          for (let i = 2; i <= 5; i++) {
            const nextIndex = lastPromptIndex + 1;
            if (nextIndex < maxLength) {
              const nextValue = menuRow[nextIndex];
              if (nextValue && nextValue.toString().trim() === `プロンプト${i}`) {
                lastPromptIndex = nextIndex;
              } else {
                break; // 連続していない場合は終了
              }
            }
          }
          
          // プロンプトグループとして記録（回答列は最後のプロンプトの後に配置）
          promptGroups.push({
            firstIndex: colIndex,
            lastIndex: lastPromptIndex,
            column: this.indexToColumn(colIndex),
            aiType: (aiRow[colIndex] || "").toString(),
          });
          
          
          // 次の検索はグループの最後の次から
          colIndex = lastPromptIndex;
        }
      }
    }
    
    // promptColumnsに変換（互換性のため）
    const promptColumns = promptGroups.map(group => ({
      index: group.firstIndex,
      lastIndex: group.lastIndex,  // 最後のプロンプトのインデックスを追加
      column: group.column,
      value: menuRow[group.firstIndex],
      aiType: group.aiType,
    }));


    // 第1段階: 通常AIのプロンプト列のみ処理（3種類AIは除外）

    // 右から左に処理（インデックスが大きい順）
    const sortedPromptColumns = promptColumns.sort((a, b) => b.index - a.index);

    for (const promptCol of sortedPromptColumns) {
      const is3TypeAI = promptCol.aiType.includes(
        "3種類（ChatGPT・Gemini・Claude）",
      );


      if (!is3TypeAI) {
        await this.setupBasicColumns(promptCol);
      } else {
      }
    }

    // 第2段階: 3種類AIの特別処理
    await this.process3TypeAIColumns();
  }

  /**
   * 基本的な列を設定（ログ、回答、ドキュメントURL）- 3.autoaiの一つずつ処理アプローチを採用
   * @param {Object} promptCol - プロンプト列情報
   */
  async setupBasicColumns(promptCol) {

    // 最新のデータを再読み込み（3.autoaiアプローチ）
    await this.loadSpreadsheetData();

    const menuRow = this.sheetData[this.menuRowIndex];
    const aiRow = this.sheetData[this.aiRowIndex];
    const aiType = promptCol.aiType;

    // 3種類AIの早期判定（元のプロンプト列情報から）
    const is3TypeAI = promptCol.aiType.includes(
      "3種類（ChatGPT・Gemini・Claude）",
    );

    if (is3TypeAI) {
      return { added: false };
    }

    // 現在のメニュー行でプロンプト列の実際の位置を再検索
    let actualIndex = -1;
    const candidates = [];
    for (let i = 0; i < menuRow.length; i++) {
      if (menuRow[i] && menuRow[i].toString().trim() === "プロンプト") {
        const currentAiType = (aiRow[i] || "").toString();
        if (
          currentAiType === promptCol.aiType ||
          (currentAiType === "" && promptCol.aiType === "")
        ) {
          candidates.push({
            index: i,
            distance: Math.abs(i - promptCol.index),
          });
        }
      }
    }

    // 元のインデックスに最も近いものを選択
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      actualIndex = candidates[0].index;
    } else {
      actualIndex = promptCol.index;
    }


    const insertions = [];

    // 左にログ列がなければ追加
    const leftIndex = actualIndex - 1;
    const leftValue =
      leftIndex >= 0 ? (menuRow[leftIndex] || "").toString().trim() : "";

    if (leftValue !== "ログ") {
      insertions.push({
        position: actualIndex,
        header: "ログ",
      });
    }

    // 回答列の配置位置を決定（lastIndexがあればその後、なければ通常通り）
    const answerPosition = promptCol.lastIndex !== undefined ? promptCol.lastIndex + 1 : actualIndex + 1;
    
    // 回答列がなければ追加
    let answerValue = "";
    if (answerPosition < menuRow.length) {
      answerValue = (menuRow[answerPosition] || "").toString().trim();
    }
    if (answerPosition >= menuRow.length || answerValue !== "回答") {
      insertions.push({
        position: answerPosition,
        header: "回答",
      });
    }


    // 一つずつ挿入を実行（3.autoaiアプローチ）
    if (insertions.length > 0) {
      await this.executeIndividualInsertions(insertions, promptCol.aiType);

      // 追加された列を記録
      for (const insertion of insertions) {
        this.addedColumns.push({
          type: "basic",
          column: promptCol.column,
          aiType: aiType,
          header: insertion.header,
        });
      }

      return { added: true };
    }

    return { added: false };
  }

  /**
   * 3種類AIの特別処理（正しい順番での配置と位置確認対応）
   */
  async process3TypeAIColumns() {

    // 処理済みの列位置を記録
    const processedPositions = new Set();

    // 処理が必要な3種類AI列を特定するループ
    while (true) {
      // 最新のデータを再読み込み
      await this.loadSpreadsheetData();

      const menuRow = this.sheetData[this.menuRowIndex];
      const aiRow = this.sheetData[this.aiRowIndex];

      // 3種類AIのプロンプト列を動的に再検索（未処理のもののみ）
      const threeTypeAIColumns = [];
      for (let i = 0; i < menuRow.length; i++) {
        if (menuRow[i] && menuRow[i].toString().trim() === "プロンプト") {
          const aiValue = aiRow[i] || "";
          if (aiValue.includes("3種類（ChatGPT・Gemini・Claude）")) {
            // 処理済みでない、かつ正しい順番でない場合のみ追加
            if (
              !processedPositions.has(i) &&
              !this.check3TypeAICorrectOrder(i)
            ) {
              threeTypeAIColumns.push({
                index: i,
                column: this.indexToColumn(i),
              });
            }
          }
        }
      }

      if (threeTypeAIColumns.length === 0) {
        break;
      }


      // 最も右にある3種類AI列を1つ処理
      const sortedColumns = threeTypeAIColumns.sort(
        (a, b) => b.index - a.index,
      );
      const targetColumn = sortedColumns[0];


      // 処理前に再度最新の位置を確認
      await this.loadSpreadsheetData();
      const currentPosition = this.findCurrentPromptPosition(
        targetColumn.index,
        "3種類（ChatGPT・Gemini・Claude）",
      );

      if (currentPosition !== -1) {

        // 処理前に既に正しい順番かチェック
        if (!this.check3TypeAICorrectOrder(currentPosition)) {
          await this.setup3TypeAIColumnWithCorrectOrder(currentPosition);
        } else {
        }
      } else {
        break;
      }


      // 処理済みの位置として記録
      processedPositions.add(targetColumn.index);
    }
  }

  /**
   * 3種類AI列が既に正しい順番かチェック
   * @param {number} promptIndex - プロンプト列のインデックス
   * @returns {boolean} 正しい順番の場合true
   */
  check3TypeAICorrectOrder(promptIndex) {
    const menuRow = this.sheetData[this.menuRowIndex];

    // 左にログ列があるかチェック
    const leftIndex = promptIndex - 1;
    const leftValue =
      leftIndex >= 0 ? (menuRow[leftIndex] || "").toString().trim() : "";

    // 右側の3つの回答列が正しい順番かチェック
    const expectedAnswers = ["ChatGPT回答", "Claude回答", "Gemini回答"];
    for (let i = 0; i < expectedAnswers.length; i++) {
      const checkIndex = promptIndex + 1 + i;
      const currentValue =
        checkIndex < menuRow.length
          ? (menuRow[checkIndex] || "").toString().trim()
          : "";

      if (currentValue !== expectedAnswers[i]) {
        return false;
      }
    }

    return leftValue === "ログ";
  }

  /**
   * 現在のプロンプト列の位置を動的に検索
   * @param {number} originalIndex - 元のインデックス
   * @param {string} expectedAIType - 期待するAIタイプ
   * @returns {number} 現在のインデックス（見つからない場合は-1）
   */
  findCurrentPromptPosition(originalIndex, expectedAIType) {
    const menuRow = this.sheetData[this.menuRowIndex];
    const aiRow = this.sheetData[this.aiRowIndex];

    // まず元の位置をチェック
    if (
      originalIndex < menuRow.length &&
      menuRow[originalIndex] &&
      menuRow[originalIndex].toString().trim() === "プロンプト" &&
      aiRow[originalIndex] &&
      aiRow[originalIndex].includes(expectedAIType)
    ) {
      return originalIndex;
    }

    // 元の位置にない場合、周辺を検索
    const candidates = [];
    for (let i = 0; i < menuRow.length; i++) {
      if (menuRow[i] && menuRow[i].toString().trim() === "プロンプト") {
        const aiValue = aiRow[i] || "";
        if (aiValue.includes(expectedAIType)) {
          candidates.push({
            index: i,
            distance: Math.abs(i - originalIndex),
          });
        }
      }
    }

    // 元の位置に最も近いものを選択
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      return candidates[0].index;
    }

    return -1;
  }

  /**
   * 個別の3種類AIプロンプト列を正しい順番で処理（3.autoai方式）
   * @param {number} promptIndex - プロンプト列のインデックス
   */
  async setup3TypeAIColumnWithCorrectOrder(promptIndex) {
    const menuRow = this.sheetData[this.menuRowIndex];
    const requests = [];


    // プロンプト2〜5を探して最後のプロンプトのインデックスを取得
    let lastPromptIndex = promptIndex;
    for (let i = 2; i <= 5; i++) {
      const nextIndex = lastPromptIndex + 1;
      if (nextIndex < menuRow.length) {
        const nextValue = menuRow[nextIndex];
        if (nextValue && nextValue.toString().trim() === `プロンプト${i}`) {
          lastPromptIndex = nextIndex;
        } else {
          break;
        }
      }
    }

    // 1. 左にログ列がなければ追加
    const leftIndex = promptIndex - 1;
    const leftValue =
      leftIndex >= 0 ? (menuRow[leftIndex] || "").toString().trim() : "";

    if (leftValue !== "ログ") {
      requests.push({
        insertDimension: {
          range: {
            sheetId: this.sheetId,
            dimension: "COLUMNS",
            startIndex: promptIndex,
            endIndex: promptIndex + 1,
          },
          inheritFromBefore: false,
        },
      });
      requests.push({
        updateCells: {
          range: {
            sheetId: this.sheetId,
            startRowIndex: this.menuRowIndex,
            endRowIndex: this.menuRowIndex + 1,
            startColumnIndex: promptIndex,
            endColumnIndex: promptIndex + 1,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: { stringValue: "ログ" },
                },
              ],
            },
          ],
          fields: "userEnteredValue",
        },
      });

      // ログ列を挿入したので、プロンプト列とlastPromptIndexの位置が1つ右にずれる
      promptIndex++;
      lastPromptIndex++;

      // ログ列を記録
      this.addedColumns.push({
        type: "3type",
        column: this.indexToColumn(promptIndex - 1),
        header: "ログ",
      });
    }

    // 2. 既存の3つの回答列が正しく存在するかチェック（最後のプロンプトの後）
    const answerHeaders = ["ChatGPT回答", "Claude回答", "Gemini回答"];
    let hasAllCorrectHeaders = true;

    // 最後のプロンプトの右側の3列をチェック
    for (let i = 0; i < answerHeaders.length; i++) {
      const checkIndex = lastPromptIndex + 1 + i;  // promptIndexではなくlastPromptIndexを使用
      const currentValue =
        checkIndex < menuRow.length
          ? (menuRow[checkIndex] || "").toString().trim()
          : "";

      if (currentValue !== answerHeaders[i]) {
        hasAllCorrectHeaders = false;
        break;
      }
    }

    // 既に正しい3つの回答列が存在する場合は何もしない
    if (hasAllCorrectHeaders) {

      // ログ列の追加のみ実行（必要な場合）
      if (requests.length > 0) {
        await this.executeBatchUpdate(requests);
      }
      return;
    }

    // 3. 右側の「回答」列を削除（あれば）- 最後のプロンプトの後をチェック
    const rightIndex = lastPromptIndex + 1;  // promptIndexではなくlastPromptIndexを使用
    const rightValue =
      rightIndex < menuRow.length
        ? (menuRow[rightIndex] || "").toString().trim()
        : "";

    if (rightValue === "回答") {
      requests.push({
        deleteDimension: {
          range: {
            sheetId: this.sheetId,
            dimension: "COLUMNS",
            startIndex: rightIndex,
            endIndex: rightIndex + 1,
          },
        },
      });
    }

    // 4. 3つの回答列を挿入（最後のプロンプトの後）

    // 3つの列を挿入（回答列のみ）
    for (let i = 0; i < 3; i++) {
      requests.push({
        insertDimension: {
          range: {
            sheetId: this.sheetId,
            dimension: "COLUMNS",
            startIndex: lastPromptIndex + 1 + i,  // promptIndexではなくlastPromptIndexを使用
            endIndex: lastPromptIndex + 2 + i,
          },
          inheritFromBefore: false,
        },
      });
    }

    // 5. ヘッダーを設定（メニュー行）
    for (let i = 0; i < 3; i++) {
      requests.push({
        updateCells: {
          range: {
            sheetId: this.sheetId,
            startRowIndex: this.menuRowIndex,
            endRowIndex: this.menuRowIndex + 1,
            startColumnIndex: lastPromptIndex + 1 + i,  // promptIndexではなくlastPromptIndexを使用
            endColumnIndex: lastPromptIndex + 2 + i,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: { stringValue: answerHeaders[i] },
                },
              ],
            },
          ],
          fields: "userEnteredValue",
        },
      });

      // 追加された列を記録
      this.addedColumns.push({
        type: "3type",
        column: this.indexToColumn(promptIndex),
        header: answerHeaders[i],
      });
    }

    // 6. AI行にAI名を設定
    const aiNames = ["ChatGPT", "Claude", "Gemini"];
    for (let i = 0; i < 3; i++) {
      requests.push({
        updateCells: {
          range: {
            sheetId: this.sheetId,
            startRowIndex: this.aiRowIndex,
            endRowIndex: this.aiRowIndex + 1,
            startColumnIndex: lastPromptIndex + 1 + i,  // promptIndexではなくlastPromptIndexを使用
            endColumnIndex: lastPromptIndex + 2 + i,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: { stringValue: aiNames[i] },
                },
              ],
            },
          ],
          fields: "userEnteredValue",
        },
      });
    }

    // バッチ更新を実行（3.autoai方式）
    if (requests.length > 0) {
      await this.executeBatchUpdate(requests);
    }
  }

  /**
   * 個別の3種類AIプロンプト列を処理 - 3.autoaiの一つずつ処理アプローチを採用（旧版）
   * @param {number} promptIndex - プロンプト列のインデックス
   */
  async setup3TypeAIColumn(promptIndex) {
    // 最新のデータを再読み込み
    await this.loadSpreadsheetData();

    const menuRow = this.sheetData[this.menuRowIndex];
    const insertions = [];


    // 1. 左にログ列がなければ追加
    const leftIndex = promptIndex - 1;
    const leftValue =
      leftIndex >= 0 ? (menuRow[leftIndex] || "").toString().trim() : "";

    if (leftValue !== "ログ") {
      insertions.push({
        position: promptIndex,
        header: "ログ",
      });
      // ログ列を挿入するため、プロンプト列の位置が1つ右にシフト
      promptIndex += 1;
    }

    // 2. 既存の3つの回答列が正しく存在するかチェック（最後のプロンプトの後）
    const answerHeaders = ["ChatGPT回答", "Claude回答", "Gemini回答"];
    let hasAllCorrectHeaders = true;

    // 最後のプロンプトの右側の3列をチェック
    for (let i = 0; i < answerHeaders.length; i++) {
      const checkIndex = lastPromptIndex + 1 + i;  // promptIndexではなくlastPromptIndexを使用
      const currentValue =
        checkIndex < menuRow.length
          ? (menuRow[checkIndex] || "").toString().trim()
          : "";

      if (currentValue !== answerHeaders[i]) {
        hasAllCorrectHeaders = false;
        break;
      }
    }

    // 3つの回答列を追加
    if (!hasAllCorrectHeaders) {

      for (let i = 0; i < answerHeaders.length; i++) {
        insertions.push({
          position: promptIndex + 1 + i,
          header: answerHeaders[i],
        });
      }
    }

    // 一つずつ挿入を実行（3.autoaiアプローチ）
    if (insertions.length > 0) {
      await this.executeIndividualInsertions(insertions);

      // 追加された列を記録
      for (const insertion of insertions) {
        this.addedColumns.push({
          type: "3type",
          column: this.indexToColumn(promptIndex),
          header: insertion.header,
        });
      }
    } else {
    }
  }

  /**
   * バッチ更新を実行
   * @param {Array} requests - バッチ更新リクエスト
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
   * インデックスを列名に変換（A, B, C...）
   * @param {number} index - 列インデックス（0ベース）
   * @returns {string} 列名
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

  /**
   * AIタイプから表示用AI名を取得
   * @param {string} aiType - AIタイプ
   * @returns {string} 表示用AI名
   */
  getDisplayAIName(aiType) {
    const typeMap = {
      "chatgpt": "ChatGPT",
      "claude": "Claude", 
      "gemini": "Gemini",
      "ChatGPT": "ChatGPT",
      "Claude": "Claude",
      "Gemini": "Gemini"
    };
    
    return typeMap[aiType] || aiType;
  }

  /**
   * 個別の挿入を一つずつ実行（3.autoaiアプローチを完全に採用 + グリッドサイズエラー対処）
   * @param {Array} insertions - 挿入情報の配列
   * @param {string} aiType - AIタイプ（回答列にAI名を設定するため）
   */
  async executeIndividualInsertions(insertions, aiType = null) {
    // 右から左へソート（インデックスが大きい順）
    const sortedInsertions = insertions.sort((a, b) => b.position - a.position);

    for (const insertion of sortedInsertions) {
      const requests = [];

      // 現在のグリッドサイズを取得
      const menuRow = this.sheetData[this.menuRowIndex];
      const currentGridSize = menuRow ? menuRow.length : 0;


      // グリッドサイズエラー対処: 3.autoaiと同じ方式
      if (insertion.position >= currentGridSize) {
        // グリッドサイズを超える場合は、まず空の列を必要な数だけ追加
        const columnsNeeded = insertion.position - currentGridSize + 1;


        // 複数列を一度に追加（3.autoai方式）
        for (let i = 0; i < columnsNeeded; i++) {
          requests.push({
            appendDimension: {
              sheetId: this.sheetId,
              dimension: "COLUMNS",
              length: 1,
            },
          });
        }

        // ヘッダーを設定（末尾の列に）
        requests.push({
          updateCells: {
            range: {
              sheetId: this.sheetId,
              startRowIndex: this.menuRowIndex,
              endRowIndex: this.menuRowIndex + 1,
              startColumnIndex: insertion.position,
              endColumnIndex: insertion.position + 1,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: { stringValue: insertion.header },
                  },
                ],
              },
            ],
            fields: "userEnteredValue",
          },
        });

        // 回答列の場合、AI行にAI名を設定
        if (insertion.header === "回答" && aiType && aiType !== "") {
          requests.push({
            updateCells: {
              range: {
                sheetId: this.sheetId,
                startRowIndex: this.aiRowIndex,
                endRowIndex: this.aiRowIndex + 1,
                startColumnIndex: insertion.position,
                endColumnIndex: insertion.position + 1,
              },
              rows: [
                {
                  values: [
                    {
                      userEnteredValue: { stringValue: this.getDisplayAIName(aiType) },
                    },
                  ],
                },
              ],
              fields: "userEnteredValue",
            },
          });
        }
      } else {
        // 通常の列挿入（グリッドサイズ以内）
        requests.push({
          insertDimension: {
            range: {
              sheetId: this.sheetId,
              dimension: "COLUMNS",
              startIndex: insertion.position,
              endIndex: insertion.position + 1,
            },
            inheritFromBefore: false,
          },
        });

        // ヘッダーを設定
        requests.push({
          updateCells: {
            range: {
              sheetId: this.sheetId,
              startRowIndex: this.menuRowIndex,
              endRowIndex: this.menuRowIndex + 1,
              startColumnIndex: insertion.position,
              endColumnIndex: insertion.position + 1,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: { stringValue: insertion.header },
                  },
                ],
              },
            ],
            fields: "userEnteredValue",
          },
        });

        // 回答列の場合、AI行にAI名を設定
        if (insertion.header === "回答" && aiType && aiType !== "") {
          requests.push({
            updateCells: {
              range: {
                sheetId: this.sheetId,
                startRowIndex: this.aiRowIndex,
                endRowIndex: this.aiRowIndex + 1,
                startColumnIndex: insertion.position,
                endColumnIndex: insertion.position + 1,
              },
              rows: [
                {
                  values: [
                    {
                      userEnteredValue: { stringValue: this.getDisplayAIName(aiType) },
                    },
                  ],
                },
              ],
              fields: "userEnteredValue",
            },
          });
        }
      }

      try {
        await this.executeBatchUpdate(requests);

        // データを再読み込み（次の挿入のため）- 3.autoaiアプローチの核心
        await this.loadSpreadsheetData();
      } catch (error) {
        console.error(`[AutoSetup] 列挿入エラー: ${insertion.header}`, error);
        throw error;
      }
    }
  }
}

export default SpreadsheetAutoSetup;
