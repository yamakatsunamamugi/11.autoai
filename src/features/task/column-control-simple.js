// column-control-simple.js - シンプルな列制御実装

/**
 * シンプルな列制御クラス
 * ログ〜回答（または Gemini回答）をひとまとめに扱う
 * 
 * ========================================
 * 制御パターンの詳細
 * ========================================
 * 
 * ■ 列制御（制御行の任意のセルで指定）
 * 
 * 【基本パターン】
 * - "この列のみ処理" - その列を含むグループだけ処理
 * - "この列から処理" - その列を含むグループ以降を処理
 * - "この列の処理後に停止" - その列を含むグループまでを処理
 * 
 * 【列名指定パターン】
 * - "P列のみ処理" / "P列だけ処理" / "Pだけ処理"
 * - "P列から処理" / "Pから開始"
 * - "P列の処理後に停止" / "Pで停止"
 * - "P-R" / "P〜R" / "P～R" - 範囲指定
 * 
 * ■ 行制御（B列または制御行のA/B列で指定）
 * 
 * 【基本パターン】
 * - "この行のみ処理" - その行だけ処理
 * - "この行から処理" - その行以降を処理
 * - "この行の処理後に停止" - その行までを処理
 * 
 * 【行番号指定パターン】
 * - "5行のみ処理" / "5行だけ処理" / "5だけ処理"
 * - "5行から処理" / "5から開始"
 * - "5行の処理後に停止" / "5で停止"
 * - "5-10" / "5〜10" / "5～10" - 範囲指定
 * 
 * ========================================
 * 制御の検出箇所
 * ========================================
 * 
 * ■ 列制御の検出
 * - 制御行（1-10行）の任意のセル（A〜Z列）
 * - 複数の制御が存在する場合は優先順位に従う
 * 
 * ■ 行制御の検出
 * - 作業行のB列：その行専用の制御
 * - 制御行（1-10行）のA/B列：全体的な範囲指定
 * 
 * ========================================
 * 使用例
 * ========================================
 * 
 * // 制御情報の収集
 * const controls = SimpleColumnControl.collectControls(spreadsheetData);
 * 
 * // 列が処理対象かチェック
 * const shouldProcess = SimpleColumnControl.shouldProcessColumn(
 *   targetColumn, columnGroup, controls.columnControls
 * );
 * 
 * // 行が処理対象かチェック
 * const shouldProcessRow = SimpleColumnControl.shouldProcessRow(
 *   rowNumber, controls.rowControls
 * );
 * 
 * ========================================
 * 依存関係
 * ========================================
 * 
 * ■ このクラスを使用するモジュール:
 * - generator.js (間接的に列制御・行制御の概念を使用)
 * - tests/test-spreadsheet.js (テストで直接使用)
 * 
 * ■ 関連設定:
 * - spreadsheet/config.js - 制御キーワードの定義
 */
export class SimpleColumnControl {
  /**
   * インデックスから列名を生成（AA, AB, AC...にも対応）
   * @param {number} index - 0ベースのインデックス
   * @returns {string} 列名（A, B, ..., Z, AA, AB, ...）
   */
  static getColumnName(index) {
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
   * 列グループの定義を取得
   * 
   * 【グループ構成】
   * - ログ列（プロンプト列の1つ前）
   * - プロンプト列群（プロンプト〜プロンプト5）
   * - 回答列群（単独AIなら1列、3種類AIなら3列）
   * - レポート化列（あれば）
   * 
   * @param {string} promptColumn - プロンプト列
   * @param {string} aiType - AIタイプ
   * @param {boolean} hasAIInstructionColumn - AI指示列があるか
   * @param {Object} spreadsheetData - スプレッドシートデータ（レポート化列検出用）
   * @returns {Object} 列グループ情報
   */
  static getColumnGroup(promptColumn, aiType, hasAIInstructionColumn = false, spreadsheetData = null) {
    const promptIndex = promptColumn.charCodeAt(0) - 65;

    // プロンプト2~5の列を含める（プロンプト列の直後から順番に）
    const additionalPromptColumns = [];
    
    // プロンプト列の直後から順番にチェック
    for (let i = 1; i <= 4; i++) {
      const colIndex = promptIndex + i;
      const colName = this.getColumnName(colIndex);
      
      if (colName && spreadsheetData?.menuRow?.data) {
        const headerText = spreadsheetData.menuRow.data[colIndex];
        const expectedPromptName = `プロンプト${i + 1}`; // プロンプト2, プロンプト3, プロンプト4, プロンプト5
        
        // 完全一致でチェック
        if (headerText === expectedPromptName) {
          additionalPromptColumns.push(colName);
          console.log(`[SimpleColumnControl] ${expectedPromptName}を${colName}列で検出`);
        } else {
          // 順番通りでない場合は、それ以降のプロンプトもスキップ
          console.log(`[SimpleColumnControl] ${colName}列は「${headerText}」（${expectedPromptName}ではない）のため、追加プロンプトの検索を終了`);
          break;
        }
      }
    }
    
    // レポート化列の検出は後で行う（追加プロンプト列の数が確定してから）
    let reportColumn = null;

    if (aiType === "3種類（ChatGPT・Gemini・Claude）" || aiType === "3種類" || aiType === "3type") {
      // 3種類AIの場合: ログ → プロンプト → [プロンプト2〜5] → ChatGPT → Claude → Gemini → レポート化
      
      // 追加プロンプト列の数を考慮して回答列の開始位置を計算
      const answerStartIndex = promptIndex + 1 + additionalPromptColumns.length;
      
      // レポート化列の検出位置も調整
      const groupEndIndex = answerStartIndex + 2; // Gemini回答列のインデックス
      
      // レポート化列を再検出（位置が変わったため）
      if (spreadsheetData && spreadsheetData.menuRow) {
        const menuRowData = spreadsheetData.menuRow.data || [];
        const nextColumnIndex = groupEndIndex + 1;
        if (nextColumnIndex < menuRowData.length) {
          const nextColumnHeader = menuRowData[nextColumnIndex];
          if (nextColumnHeader === "レポート化") {
            reportColumn = this.getColumnName(nextColumnIndex);
            console.log(`[SimpleColumnControl] レポート化列検出: ${reportColumn} (index: ${nextColumnIndex})`);
          }
        }
      }

      const columns = [];
      const logCol = this.getColumnName(promptIndex - 1);
      if (logCol) columns.push(logCol); // ログ
      columns.push(promptColumn); // プロンプト
      
      // 追加プロンプト列を追加
      for (const addCol of additionalPromptColumns) {
        columns.push(addCol);
      }
      
      // 回答列を追加
      columns.push(this.getColumnName(answerStartIndex)); // ChatGPT回答
      columns.push(this.getColumnName(answerStartIndex + 1)); // Claude回答
      columns.push(this.getColumnName(answerStartIndex + 2)); // Gemini回答
      
      // レポート化列があれば追加
      if (reportColumn) {
        columns.push(reportColumn);
      }

      return {
        type: "3type",
        promptColumn: promptColumn,
        additionalPromptColumns: additionalPromptColumns,
        columns: columns,
        aiMapping: {
          [this.getColumnName(answerStartIndex)]: "chatgpt",
          [this.getColumnName(answerStartIndex + 1)]: "claude",
          [this.getColumnName(answerStartIndex + 2)]: "gemini",
        },
        reportColumn: reportColumn,
      };
    } else {
      // 単独AIの場合: ログ → プロンプト → [プロンプト2〜5] → 回答 → レポート化
      // 追加プロンプト列の数を考慮して回答列の位置を計算
      const answerIndex = promptIndex + 1 + additionalPromptColumns.length;
      
      // レポート化列を検出（回答列の直後）
      if (spreadsheetData && spreadsheetData.menuRow) {
        const menuRowData = spreadsheetData.menuRow.data || [];
        const nextColumnIndex = answerIndex + 1;
        if (nextColumnIndex < menuRowData.length) {
          const nextColumnHeader = menuRowData[nextColumnIndex];
          if (nextColumnHeader === "レポート化") {
            reportColumn = this.getColumnName(nextColumnIndex);
            console.log(`[SimpleColumnControl] レポート化列検出: ${reportColumn} (index: ${nextColumnIndex})`);
          }
        }
      }
      
      const columns = [];
      const logCol = this.getColumnName(promptIndex - 1);
      if (logCol) columns.push(logCol); // ログ
      columns.push(promptColumn); // プロンプト
      
      // 追加プロンプト列を追加
      for (const addCol of additionalPromptColumns) {
        columns.push(addCol);
      }
      
      const answerCol = this.getColumnName(answerIndex);
      if (answerCol) columns.push(answerCol); // 回答
      
      // レポート化列があれば追加
      if (reportColumn) {
        columns.push(reportColumn);
      }
      
      // AI行から実際のAIタイプを取得
      let normalizedAiType = "chatgpt"; // デフォルト
      
      // spreadsheetDataが渡されていて、AI行がある場合
      if (spreadsheetData && spreadsheetData.aiRow && spreadsheetData.values) {
        const aiRowData = spreadsheetData.values[spreadsheetData.aiRow.index];
        if (aiRowData) {
          // プロンプト列のAI行の値を確認
          const aiValue = aiRowData[promptIndex];
          if (aiValue && typeof aiValue === 'string') {
            const aiValueLower = aiValue.toLowerCase().trim();
            // AI名の判定
            if (aiValueLower.includes('claude')) {
              normalizedAiType = 'claude';
              console.log(`[SimpleColumnControl] ${promptColumn}列: AI行から'Claude'を検出`);
            } else if (aiValueLower.includes('gemini')) {
              normalizedAiType = 'gemini';
              console.log(`[SimpleColumnControl] ${promptColumn}列: AI行から'Gemini'を検出`);
            } else if (aiValueLower.includes('chatgpt') || aiValueLower.includes('gpt')) {
              normalizedAiType = 'chatgpt';
              console.log(`[SimpleColumnControl] ${promptColumn}列: AI行から'ChatGPT'を検出`);
            } else {
              console.log(`[SimpleColumnControl] ${promptColumn}列: AI行の値 "${aiValue}" を解釈できず、デフォルトの'chatgpt'を使用`);
            }
          }
        }
      } else if (aiType === "chatgpt" || aiType === "claude" || aiType === "gemini") {
        // 引数で渡されたaiTypeを使用（後方互換性のため）
        normalizedAiType = aiType;
      }
      
      return {
        type: "single",
        promptColumn: promptColumn,
        additionalPromptColumns: additionalPromptColumns,
        columns: columns,
        aiMapping: {
          [this.getColumnName(answerIndex)]: normalizedAiType,
        },
        reportColumn: reportColumn,
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
   * 
   * 【注意】このメソッドは現在generator.jsでは直接使用されていない
   * generator.jsはグループ単位で制御を行うため、filterGroupsByColumnControlを使用
   * テストやデバッグ用途で利用される
   * 
   * @param {string} targetColumn - チェック対象の列
   * @param {Object} columnGroup - 列グループ情報
   * @param {Array} controls - 制御情報の配列
   * @returns {boolean} 処理すべきかどうか
   */
  static shouldProcessColumn(targetColumn, columnGroup, controls) {
    // グループに含まれない列は処理しない
    const columnIndex = columnGroup.columns.indexOf(targetColumn);
    if (columnIndex === -1) return false;

    // ログ列、プロンプト列は処理対象外（回答列のみ処理）
    // 回答列は、3種類AIの場合はインデックス2,3,4、単独AIの場合はインデックス2
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
    // 3種類AIの場合: ログ、プロンプト、3つの回答列（インデックス2から）
    // 単独AIの場合: ログ、プロンプト、1つの回答列（インデックス2）
    const answerStartIndex = columnGroup.type === "3type" ? 2 : 2;
    const answerColumns = columnGroup.columns.slice(answerStartIndex);
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
