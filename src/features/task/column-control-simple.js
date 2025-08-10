// column-control-simple.js - シンプルな列制御実装

/**
 * シンプルな列制御クラス
 * ログ〜回答（または Gemini回答）をひとまとめに扱う
 */
export class SimpleColumnControl {
  /**
   * 列グループの定義を取得
   * @param {string} promptColumn - プロンプト列
   * @param {string} aiType - AIタイプ
   * @param {boolean} hasAIInstructionColumn - AI指示列があるか
   * @returns {Object} 列グループ情報
   */
  static getColumnGroup(promptColumn, aiType, hasAIInstructionColumn = false) {
    const promptIndex = promptColumn.charCodeAt(0) - 65;

    if (aiType === "3種類（ChatGPT・Gemini・Claude）" || aiType === "3種類") {
      // 3種類AIの場合: ログ → プロンプト → ChatGPT → Claude → Gemini
      const baseIndex = hasAIInstructionColumn ? promptIndex + 1 : promptIndex;

      return {
        type: "3type",
        promptColumn: promptColumn,
        columns: [
          String.fromCharCode(65 + promptIndex - 1), // ログ
          promptColumn, // プロンプト
          String.fromCharCode(65 + baseIndex + 1), // ChatGPT回答
          String.fromCharCode(65 + baseIndex + 2), // Claude回答
          String.fromCharCode(65 + baseIndex + 3), // Gemini回答
        ],
        aiMapping: {
          [String.fromCharCode(65 + baseIndex + 1)]: "chatgpt",
          [String.fromCharCode(65 + baseIndex + 2)]: "claude",
          [String.fromCharCode(65 + baseIndex + 3)]: "gemini",
        },
      };
    } else {
      // 単独AIの場合: ログ → プロンプト → 回答
      return {
        type: "single",
        promptColumn: promptColumn,
        columns: [
          String.fromCharCode(65 + promptIndex - 1), // ログ
          promptColumn, // プロンプト
          String.fromCharCode(65 + promptIndex + 1), // 回答
        ],
        aiMapping: {
          [String.fromCharCode(65 + promptIndex + 1)]: aiType.toLowerCase(),
        },
      };
    }
  }

  /**
   * セル値から列制御を解析
   * @param {string} cellValue - セルの値
   * @param {string} currentColumn - 現在の列
   * @returns {Object|null} 制御情報
   */
  static parseColumnControl(cellValue, currentColumn) {
    if (!cellValue || typeof cellValue !== "string") return null;

    // この列のみ処理
    if (cellValue.includes("この列のみ処理")) {
      return { type: "only", column: currentColumn };
    }

    // この列から処理
    if (cellValue.includes("この列から処理")) {
      return { type: "from", column: currentColumn };
    }

    // この列の処理後に停止
    if (cellValue.includes("この列の処理後に停止")) {
      return { type: "until", column: currentColumn };
    }

    // 特定列の指定パターン（例：P列のみ処理、P列から処理、P列の処理後に停止）
    const patterns = [
      { regex: /([A-Z]+)列のみ処理/, type: "only" },
      { regex: /([A-Z]+)列だけ処理/, type: "only" },
      { regex: /([A-Z]+)だけ処理/, type: "only" },
      { regex: /([A-Z]+)列から処理/, type: "from" },
      { regex: /([A-Z]+)から開始/, type: "from" },
      { regex: /([A-Z]+)列の処理後に停止/, type: "until" },
      { regex: /([A-Z]+)で停止/, type: "until" },
    ];

    for (const pattern of patterns) {
      const match = cellValue.match(pattern.regex);
      if (match) {
        return { type: pattern.type, column: match[1] };
      }
    }

    // 範囲指定（例：P-R、P〜R）
    const rangeMatch = cellValue.match(/([A-Z]+)\s*[-〜～]\s*([A-Z]+)/);
    if (rangeMatch) {
      return {
        type: "range",
        startColumn: rangeMatch[1],
        endColumn: rangeMatch[2],
      };
    }

    return null;
  }

  /**
   * セル値から行制御を解析
   * @param {string} cellValue - セルの値
   * @param {number} currentRow - 現在の行番号
   * @returns {Object|null} 制御情報
   */
  static parseRowControl(cellValue, currentRow) {
    if (!cellValue || typeof cellValue !== "string") return null;

    // この行のみ処理
    if (cellValue.includes("この行のみ処理")) {
      return { type: "only", row: currentRow };
    }

    // この行から処理
    if (cellValue.includes("この行から処理")) {
      return { type: "from", row: currentRow };
    }

    // この行の処理後に停止
    if (cellValue.includes("この行の処理後に停止")) {
      return { type: "until", row: currentRow };
    }

    // 特定行の指定パターン（例：5行のみ処理、5行から処理、5行の処理後に停止）
    const patterns = [
      { regex: /(\d+)行のみ処理/, type: "only" },
      { regex: /(\d+)行だけ処理/, type: "only" },
      { regex: /(\d+)だけ処理/, type: "only" },
      { regex: /(\d+)行から処理/, type: "from" },
      { regex: /(\d+)から開始/, type: "from" },
      { regex: /(\d+)行の処理後に停止/, type: "until" },
      { regex: /(\d+)で停止/, type: "until" },
    ];

    for (const pattern of patterns) {
      const match = cellValue.match(pattern.regex);
      if (match) {
        return { type: pattern.type, row: parseInt(match[1]) };
      }
    }

    // 範囲指定（例：5-10、5〜10）
    const rangeMatch = cellValue.match(/(\d+)\s*[-〜～]\s*(\d+)/);
    if (rangeMatch) {
      return {
        type: "range",
        startRow: parseInt(rangeMatch[1]),
        endRow: parseInt(rangeMatch[2]),
      };
    }

    return null;
  }

  /**
   * 列が処理対象かチェック
   * @param {string} targetColumn - チェック対象の列
   * @param {Object} columnGroup - 列グループ情報
   * @param {Array} controls - 制御情報の配列
   * @returns {boolean} 処理すべきかどうか
   */
  static shouldProcessColumn(targetColumn, columnGroup, controls) {
    // グループに含まれない列は処理しない
    const columnIndex = columnGroup.columns.indexOf(targetColumn);
    if (columnIndex === -1) return false;

    // ログ列とプロンプト列は処理対象外（回答列のみ処理）
    if (columnIndex < 2) return false;

    // 制御なしの場合はすべての回答列を処理
    if (!controls || controls.length === 0) return true;

    // 各制御をチェック
    let shouldProcess = true;

    for (const control of controls) {
      switch (control.type) {
        case "only":
          // その列のみ処理
          if (targetColumn !== control.column) {
            shouldProcess = false;
          }
          break;

        case "from":
          // その列から処理（グループ内での制御は無視）
          // グローバル制御でのみ処理される
          break;

        case "until":
          // その列まで処理
          let untilIndex = columnGroup.columns.indexOf(control.column);

          // 制御列が回答列でない場合（ログやプロンプト列の場合）
          // グループ全体を処理（制限なし）として扱う
          if (untilIndex !== -1 && untilIndex < 2) {
            // ログ列やプロンプト列での制御は、グループ全体に制限をかけない
            break;
          }

          if (untilIndex !== -1 && columnIndex > untilIndex) {
            shouldProcess = false;
          }
          break;

        case "range":
          // 範囲指定
          const startIndex = columnGroup.columns.indexOf(control.startColumn);
          const endIndex = columnGroup.columns.indexOf(control.endColumn);
          if (startIndex !== -1 && endIndex !== -1) {
            if (columnIndex < startIndex || columnIndex > endIndex) {
              shouldProcess = false;
            }
          }
          break;
      }
    }

    return shouldProcess;
  }

  /**
   * スプレッドシートから列制御を収集
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Object} 列制御と行制御の情報
   */
  static collectControls(spreadsheetData) {
    const columnControls = [];
    const rowControls = [];
    const values = spreadsheetData.values || [];
    const workRows = spreadsheetData.workRows || [];

    // 制御行（1-10行）をスキャン（列制御用）
    for (let row = 0; row < Math.min(10, values.length); row++) {
      const rowData = values[row] || [];

      for (let col = 0; col < Math.min(26, rowData.length); col++) {
        const cellValue = rowData[col];
        if (!cellValue) continue;

        const column = String.fromCharCode(65 + col);
        const control = this.parseColumnControl(cellValue, column);

        if (control) {
          columnControls.push(control);
          console.log(
            `[SimpleColumnControl] 列制御検出: ${JSON.stringify(control)} at ${column}${row + 1}`,
          );
        }
      }
    }

    // 作業行のA列とB列をスキャン（行制御用）
    for (const workRow of workRows) {
      const rowData = values[workRow.index] || [];

      // A列とB列をチェック
      for (let col = 0; col < 2; col++) {
        const cellValue = rowData[col];
        if (!cellValue) continue;

        const control = this.parseRowControl(cellValue, workRow.number);
        if (control) {
          rowControls.push(control);
          console.log(
            `[SimpleColumnControl] 行制御検出: ${JSON.stringify(control)} at ${String.fromCharCode(65 + col)}${workRow.number}`,
          );
        }
      }
    }

    // 制御行（1-10行）のA列とB列もスキャン（行制御の範囲指定用）
    for (let row = 0; row < Math.min(10, values.length); row++) {
      const rowData = values[row] || [];

      // A列とB列をチェック
      for (let col = 0; col < 2; col++) {
        const cellValue = rowData[col];
        if (!cellValue) continue;

        const control = this.parseRowControl(cellValue, row + 1);
        if (control && control.type === "range") {
          rowControls.push(control);
          console.log(
            `[SimpleColumnControl] 行制御検出: ${JSON.stringify(control)} at ${String.fromCharCode(65 + col)}${row + 1}`,
          );
        }
      }
    }

    return { columnControls, rowControls };
  }

  /**
   * 行が処理対象かチェック
   * @param {number} targetRow - チェック対象の行番号
   * @param {Array} rowControls - 行制御情報の配列
   * @returns {boolean} 処理すべきかどうか
   */
  static shouldProcessRow(targetRow, rowControls) {
    // 制御なしの場合はすべての行を処理
    if (!rowControls || rowControls.length === 0) return true;

    // 各制御をチェック
    let shouldProcess = true;

    for (const control of rowControls) {
      switch (control.type) {
        case "only":
          // その行のみ処理
          if (targetRow !== control.row) {
            shouldProcess = false;
          }
          break;

        case "from":
          // その行から処理
          if (targetRow < control.row) {
            shouldProcess = false;
          }
          break;

        case "until":
          // その行まで処理
          if (targetRow > control.row) {
            shouldProcess = false;
          }
          break;

        case "range":
          // 範囲指定
          if (targetRow < control.startRow || targetRow > control.endRow) {
            shouldProcess = false;
          }
          break;
      }
    }

    return shouldProcess;
  }

  /**
   * デバッグ用: 列グループと制御情報を表示
   */
  static debugPrint(columnGroup, controls) {
    console.log("[SimpleColumnControl] === デバッグ情報 ===");
    console.log("列グループ:", columnGroup);
    console.log("制御情報:", controls);

    // 各列の処理状態を表示
    const answerColumns = columnGroup.columns.slice(2); // ログとプロンプトを除く
    console.log("処理判定:");
    answerColumns.forEach((col) => {
      const shouldProcess = this.shouldProcessColumn(
        col,
        columnGroup,
        controls.columnControls || controls,
      );
      console.log(`  ${col}列: ${shouldProcess ? "○処理する" : "×スキップ"}`);
    });
  }
}

export default SimpleColumnControl;
