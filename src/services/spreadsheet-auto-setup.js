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
      console.log("[AutoSetup] 自動セットアップ開始", { spreadsheetId });

      // 1. シートIDを取得
      await this.loadSheetMetadata();

      // 2. スプレッドシートデータを取得
      await this.loadSpreadsheetData();

      // 3. メニュー行と使うAI行を検索
      await this.findKeyRows();

      // 3. プロンプト列を検索して処理
      await this.processPromptColumns();

      console.log("[AutoSetup] 自動セットアップ完了");

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
      console.log("[AutoSetup] シートID取得完了", {
        sheetId: this.sheetId,
        sheetTitle: this.sheetName,
        targetGid: this.targetGid,
      });
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
    console.log("[AutoSetup] スプレッドシートデータ読み込み完了", {
      rows: this.sheetData.length,
    });
  }

  /**
   * メニュー行と使うAI行を検索
   */
  async findKeyRows() {
    console.log("[AutoSetup] キー行検索開始", {
      totalRows: this.sheetData.length,
    });

    for (let i = 0; i < this.sheetData.length; i++) {
      const row = this.sheetData[i];
      if (!row || row.length === 0) continue;

      // A列のセル値を取得
      const cellA = row[0];
      if (!cellA) continue;

      const cellValue = cellA.toString().trim();

      // メニュー行を検索
      if (cellValue.includes("メニュー")) {
        this.menuRowIndex = i;
        console.log("[AutoSetup] メニュー行を発見", {
          row: i + 1,
          value: cellValue,
        });
      }

      // 使うAI行を検索
      if (cellValue.includes("使うAI")) {
        this.aiRowIndex = i;
        console.log("[AutoSetup] 使うAI行を発見", {
          row: i + 1,
          value: cellValue,
        });
      }
    }

    if (this.menuRowIndex === -1) {
      throw new Error(
        "メニュー行が見つかりません（A列に「メニュー」を含むセルが必要）",
      );
    }

    if (this.aiRowIndex === -1) {
      throw new Error(
        "使うAI行が見つかりません（A列に「使うAI」を含むセルが必要）",
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
      throw new Error("メニュー行または使うAI行のデータが不正です");
    }

    // プロンプト列を検索
    const promptColumns = [];
    const maxLength = Math.max(menuRow.length, aiRow.length);
    for (let colIndex = 0; colIndex < maxLength; colIndex++) {
      const cellValue = menuRow[colIndex];
      if (cellValue && cellValue.toString().trim() === "プロンプト") {
        promptColumns.push({
          index: colIndex,
          column: this.indexToColumn(colIndex),
          value: cellValue,
          aiType: (aiRow[colIndex] || "").toString(),
        });
      }
    }

    console.log("[AutoSetup] プロンプト列を検出", {
      count: promptColumns.length,
      columns: promptColumns.map((p) => p.column),
      details: promptColumns.map((p) => ({
        column: p.column,
        index: p.index,
        aiType: p.aiType,
      })),
    });

    // 第1段階: 通常AIのプロンプト列のみ処理（3種類AIは除外）
    console.log("[AutoSetup] 第1段階: 通常AIの基本的な列の追加開始");

    // 右から左に処理（インデックスが大きい順）
    const sortedPromptColumns = promptColumns.sort((a, b) => b.index - a.index);

    for (const promptCol of sortedPromptColumns) {
      const is3TypeAI = promptCol.aiType.includes(
        "3種類（ChatGPT・Gemini・Claude）",
      );

      console.log(
        `[AutoSetup] 列${promptCol.column}の判定: AIType="${promptCol.aiType}", is3TypeAI=${is3TypeAI}`,
      );

      if (!is3TypeAI) {
        console.log(`[AutoSetup] 通常AI処理実行: ${promptCol.column}列`);
        await this.setupBasicColumns(promptCol);
      } else {
        console.log(
          `[AutoSetup] 3種類AIのため第1段階ではスキップ: ${promptCol.column}列`,
        );
      }
    }

    // 第2段階: 3種類AIの特別処理
    console.log("[AutoSetup] 第2段階: 3種類AIの特別処理開始");
    await this.process3TypeAIColumns();
  }

  /**
   * 基本的な列を設定（ログ、回答、ドキュメントURL）- 3.autoaiの一つずつ処理アプローチを採用
   * @param {Object} promptCol - プロンプト列情報
   */
  async setupBasicColumns(promptCol) {
    console.log("[AutoSetup] setupBasicColumns開始:", promptCol.column);

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
      console.log(
        "[AutoSetup]",
        `${promptCol.column}列: 3種類AIのため第1段階をスキップ`,
      );
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

    console.log("[AutoSetup] 通常AI列の基本列設定:", {
      originalIndex: promptCol.index,
      actualIndex: actualIndex,
      aiType: promptCol.aiType,
    });

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

    // 右に回答列がなければ追加
    const rightIndex = actualIndex + 1;
    let rightValue = "";
    if (rightIndex < menuRow.length) {
      rightValue = (menuRow[rightIndex] || "").toString().trim();
    }
    if (rightIndex >= menuRow.length || rightValue !== "回答") {
      insertions.push({
        position: actualIndex + 1,
        header: "回答",
      });
    }

    // 回答列の右にドキュメントURL列がなければ追加
    const docUrlIndex = actualIndex + 2;
    let docUrlValue = "";
    if (docUrlIndex < menuRow.length) {
      docUrlValue = (menuRow[docUrlIndex] || "").toString().trim();
    }
    if (docUrlIndex >= menuRow.length || docUrlValue !== "ドキュメントURL") {
      insertions.push({
        position: actualIndex + 2,
        header: "ドキュメントURL",
      });
    }

    // 一つずつ挿入を実行（3.autoaiアプローチ）
    if (insertions.length > 0) {
      console.log("[AutoSetup] 通常AI列への基本列の挿入:", insertions);
      await this.executeIndividualInsertions(insertions);

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
    console.log("[AutoSetup] process3TypeAIColumns開始");

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
        console.log("[AutoSetup] 3種類AIプロンプト列が見つかりません");
        break;
      }

      console.log("[AutoSetup] 3種類AIプロンプト列を検出（現在の位置）", {
        count: threeTypeAIColumns.length,
        columns: threeTypeAIColumns.map((c) => `${c.column}(index:${c.index})`),
      });

      // 最も右にある3種類AI列を1つ処理
      const sortedColumns = threeTypeAIColumns.sort(
        (a, b) => b.index - a.index,
      );
      const targetColumn = sortedColumns[0];

      console.log(
        `[AutoSetup] 3種類AI列の処理開始: ${targetColumn.column}列 (現在index: ${targetColumn.index})`,
      );

      // 処理前に再度最新の位置を確認
      await this.loadSpreadsheetData();
      const currentPosition = this.findCurrentPromptPosition(
        targetColumn.index,
        "3種類（ChatGPT・Gemini・Claude）",
      );

      if (currentPosition !== -1) {
        console.log(
          `[AutoSetup] プロンプト列位置確認: ${targetColumn.index} → ${currentPosition}`,
        );

        // 処理前に既に正しい順番かチェック
        if (!this.check3TypeAICorrectOrder(currentPosition)) {
          await this.setup3TypeAIColumnWithCorrectOrder(currentPosition);
        } else {
          console.log(
            `[AutoSetup] 3種類AI列は既に正しい順番です: ${this.indexToColumn(currentPosition)}列`,
          );
        }
      } else {
        console.log(
          `[AutoSetup] プロンプト列が見つかりません: ${targetColumn.column}`,
        );
        break;
      }

      console.log(`[AutoSetup] 3種類AI列の処理完了: ${targetColumn.column}列`);

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

    console.log(
      `[AutoSetup] setup3TypeAIColumnWithCorrectOrder開始: ${this.indexToColumn(promptIndex)}列`,
      {
        promptIndex: promptIndex,
        menuRowLength: menuRow.length,
      },
    );

    // 1. 左にログ列がなければ追加
    const leftIndex = promptIndex - 1;
    const leftValue =
      leftIndex >= 0 ? (menuRow[leftIndex] || "").toString().trim() : "";

    if (leftValue !== "ログ") {
      console.log(
        "[AutoSetup] 3種類AI: ログ列を挿入予定 (位置:",
        promptIndex,
        ")",
      );
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

      // ログ列を挿入したので、プロンプト列の位置が1つ右にずれる
      promptIndex++;

      // ログ列を記録
      this.addedColumns.push({
        type: "3type",
        column: this.indexToColumn(promptIndex - 1),
        header: "ログ",
      });
    }

    // 2. 既存の3つの回答列が正しく存在するかチェック
    const answerHeaders = ["ChatGPT回答", "Claude回答", "Gemini回答"];
    let hasAllCorrectHeaders = true;

    // 右側の3列をチェック
    for (let i = 0; i < answerHeaders.length; i++) {
      const checkIndex = promptIndex + 1 + i;
      const currentValue =
        checkIndex < menuRow.length
          ? (menuRow[checkIndex] || "").toString().trim()
          : "";

      if (currentValue !== answerHeaders[i]) {
        hasAllCorrectHeaders = false;
        console.log("[AutoSetup] 3種類AI: 期待する列が見つかりません", {
          position: checkIndex,
          expected: answerHeaders[i],
          actual: currentValue,
        });
        break;
      }
    }

    // ドキュメントURL列のチェック
    const docUrlIndex = promptIndex + 4; // プロンプト + 3つの回答列の後
    const docUrlValue =
      docUrlIndex < menuRow.length
        ? (menuRow[docUrlIndex] || "").toString().trim()
        : "";
    const hasDocUrlColumn = docUrlValue === "ドキュメントURL";

    // 既に正しい3つの回答列が存在し、ドキュメントURL列もある場合は何もしない
    if (hasAllCorrectHeaders && hasDocUrlColumn) {
      console.log(
        "[AutoSetup] 3種類AI: 既に正しい回答列とドキュメントURL列が存在するため、処理をスキップ",
        {
          promptColumn: this.indexToColumn(promptIndex),
          existingHeaders: [...answerHeaders, "ドキュメントURL"],
        },
      );

      // ログ列の追加のみ実行（必要な場合）
      if (requests.length > 0) {
        await this.executeBatchUpdate(requests);
      }
      return;
    }

    // 3. 右側の「回答」列を削除（あれば）
    const rightIndex = promptIndex + 1;
    const rightValue =
      rightIndex < menuRow.length
        ? (menuRow[rightIndex] || "").toString().trim()
        : "";

    if (rightValue === "回答") {
      console.log(
        "[AutoSetup] 3種類AI: 既存の「回答」列を削除予定 (位置:",
        rightIndex,
        ")",
      );
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

    // 4. 3つの回答列とドキュメントURL列を挿入
    const allHeaders = [...answerHeaders, "ドキュメントURL"];
    console.log("[AutoSetup] 3種類AI: 回答列とドキュメントURL列を挿入予定", {
      headers: allHeaders,
      startPosition: promptIndex + 1,
    });

    // 4つの列を挿入（3つの回答列 + ドキュメントURL列）
    for (let i = 0; i < 4; i++) {
      requests.push({
        insertDimension: {
          range: {
            sheetId: this.sheetId,
            dimension: "COLUMNS",
            startIndex: promptIndex + 1 + i,
            endIndex: promptIndex + 2 + i,
          },
          inheritFromBefore: false,
        },
      });
    }

    // 5. ヘッダーを設定
    for (let i = 0; i < 4; i++) {
      requests.push({
        updateCells: {
          range: {
            sheetId: this.sheetId,
            startRowIndex: this.menuRowIndex,
            endRowIndex: this.menuRowIndex + 1,
            startColumnIndex: promptIndex + 1 + i,
            endColumnIndex: promptIndex + 2 + i,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: { stringValue: allHeaders[i] },
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
        header: allHeaders[i],
      });
    }

    // バッチ更新を実行（3.autoai方式）
    if (requests.length > 0) {
      console.log("[AutoSetup] 3種類AI列の更新実行", {
        requestCount: requests.length,
        operations: requests.map((r) => Object.keys(r)[0]),
      });
      await this.executeBatchUpdate(requests);
      console.log("[AutoSetup] 3種類AI列の更新完了");
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

    console.log(
      `[AutoSetup] setup3TypeAIColumn開始: ${this.indexToColumn(promptIndex)}列`,
      {
        promptIndex: promptIndex,
        menuRowLength: menuRow.length,
      },
    );

    // 1. 左にログ列がなければ追加
    const leftIndex = promptIndex - 1;
    const leftValue =
      leftIndex >= 0 ? (menuRow[leftIndex] || "").toString().trim() : "";

    if (leftValue !== "ログ") {
      console.log("[AutoSetup] 3種類AI: ログ列を追加予定");
      insertions.push({
        position: promptIndex,
        header: "ログ",
      });
      // ログ列を挿入するため、プロンプト列の位置が1つ右にシフト
      promptIndex += 1;
    }

    // 2. 既存の3つの回答列が正しく存在するかチェック
    const answerHeaders = ["ChatGPT回答", "Claude回答", "Gemini回答"];
    let hasAllCorrectHeaders = true;

    // 右側の3列をチェック
    for (let i = 0; i < answerHeaders.length; i++) {
      const checkIndex = promptIndex + 1 + i;
      const currentValue =
        checkIndex < menuRow.length
          ? (menuRow[checkIndex] || "").toString().trim()
          : "";

      if (currentValue !== answerHeaders[i]) {
        hasAllCorrectHeaders = false;
        console.log("[AutoSetup] 3種類AI: 期待する列が見つかりません", {
          position: checkIndex,
          expected: answerHeaders[i],
          actual: currentValue,
        });
        break;
      }
    }

    // 3つの回答列を追加
    if (!hasAllCorrectHeaders) {
      console.log("[AutoSetup] 3種類AI: 3つの回答列を追加予定", {
        headers: answerHeaders,
        startPosition: promptIndex + 1,
      });

      for (let i = 0; i < answerHeaders.length; i++) {
        insertions.push({
          position: promptIndex + 1 + i,
          header: answerHeaders[i],
        });
      }
    }

    // 一つずつ挿入を実行（3.autoaiアプローチ）
    if (insertions.length > 0) {
      console.log("[AutoSetup] 3種類AI列への挿入実行:", insertions);
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
      console.log(
        "[AutoSetup] 3種類AI: 既に正しい回答列が存在するため、処理をスキップ",
      );
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
   * 個別の挿入を一つずつ実行（3.autoaiアプローチを完全に採用 + グリッドサイズエラー対処）
   * @param {Array} insertions - 挿入情報の配列
   */
  async executeIndividualInsertions(insertions) {
    // 右から左へソート（インデックスが大きい順）
    const sortedInsertions = insertions.sort((a, b) => b.position - a.position);

    for (const insertion of sortedInsertions) {
      const requests = [];

      // 現在のグリッドサイズを取得
      const menuRow = this.sheetData[this.menuRowIndex];
      const currentGridSize = menuRow ? menuRow.length : 0;

      console.log("[AutoSetup] 個別列挿入実行:", {
        position: insertion.position,
        column: this.indexToColumn(insertion.position),
        header: insertion.header,
        currentGridSize: currentGridSize,
      });

      // グリッドサイズエラー対処: 3.autoaiと同じ方式
      if (insertion.position >= currentGridSize) {
        // グリッドサイズを超える場合は、まず空の列を必要な数だけ追加
        const columnsNeeded = insertion.position - currentGridSize + 1;

        console.log("[AutoSetup] グリッド拡張が必要:", {
          currentGridSize: currentGridSize,
          targetPosition: insertion.position,
          columnsNeeded: columnsNeeded,
        });

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
      }

      try {
        await this.executeBatchUpdate(requests);
        console.log(`[AutoSetup] ${insertion.header}列の挿入完了`);

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
