// column-addition-test.js - 列追加機能のテスト

// モックデータの準備
const mockSpreadsheetData = {
  menuRow: {
    number: 3,
    data: ["メニュー", "プロンプト", "ChatGPT回答", "プロンプト", "回答"],
  },
  aiRow: {
    number: 2,
    data: ["使うAI", "ChatGPT", "", "3種類（ChatGPT・Gemini・Claude）", ""],
  },
  workRows: [
    { number: 5, data: ["作業", "質問1", "", "質問2", ""] },
    { number: 6, data: ["作業", "質問3", "", "質問4", ""] },
  ],
  rawData: [
    ["", "", "", "", ""],
    ["使うAI", "ChatGPT", "", "3種類（ChatGPT・Gemini・Claude）", ""],
    ["メニュー", "プロンプト", "ChatGPT回答", "プロンプト", "回答"],
    ["", "", "", "", ""],
    ["作業", "質問1", "", "質問2", ""],
    ["作業", "質問3", "", "質問4", ""],
  ],
};

// SpreadsheetAutoSetupのモック
class MockSpreadsheetAutoSetup {
  constructor() {
    this.executedCalls = [];
  }

  async executeAutoSetup(spreadsheetId, token, gid) {
    this.executedCalls.push({ spreadsheetId, token, gid });

    console.log("[MockAutoSetup] 列追加シミュレーション開始");
    console.log("対象スプレッドシート:", spreadsheetId);
    console.log("シートGID:", gid);

    // 必要な列の検出
    const requiredColumns = this.detectRequiredColumns(mockSpreadsheetData);
    console.log("必要な列:", requiredColumns);

    // 列追加のシミュレーション
    if (requiredColumns.length > 0) {
      console.log("[MockAutoSetup] 列追加完了（シミュレーション）");
      return { success: true, addedColumns: requiredColumns };
    }

    return { success: true, message: "列追加不要" };
  }

  detectRequiredColumns(data) {
    const required = [];
    const menuRow = data.menuRow.data;
    const aiRow = data.aiRow.data;

    for (let i = 0; i < menuRow.length; i++) {
      if (menuRow[i] === "プロンプト") {
        const aiType = aiRow[i] || "";

        // 左にログ列が必要か
        if (i === 0 || menuRow[i - 1] !== "ログ") {
          required.push({
            position: i,
            type: "ログ",
            reason: "プロンプト列の左にログ列が必要",
          });
        }

        // 3種類AIの場合
        if (aiType.includes("3種類")) {
          // 右側に3つの回答列が必要
          const expectedColumns = ["ChatGPT回答", "Claude回答", "Gemini回答"];
          for (let j = 0; j < expectedColumns.length; j++) {
            if (
              i + j + 1 >= menuRow.length ||
              menuRow[i + j + 1] !== expectedColumns[j]
            ) {
              required.push({
                position: i + j + 1,
                type: expectedColumns[j],
                reason: "3種類AI用の回答列",
              });
            }
          }
        } else {
          // 通常のAIの場合、右に回答列が必要
          if (i + 1 >= menuRow.length || menuRow[i + 1] !== "回答") {
            required.push({
              position: i + 1,
              type: "回答",
              reason: "通常AI用の回答列",
            });
          }
        }
      }
    }

    return required;
  }
}

// テスト実行
async function runColumnAdditionTest() {
  console.log("=== 列追加機能テスト開始 ===\n");

  // 1. 現在の列構成を表示
  console.log("現在の列構成:");
  console.log("メニュー行:", mockSpreadsheetData.menuRow.data);
  console.log("使うAI行:", mockSpreadsheetData.aiRow.data);
  console.log("");

  // 2. SpreadsheetAutoSetupのテスト
  console.log("--- SpreadsheetAutoSetup テスト ---");
  const autoSetup = new MockSpreadsheetAutoSetup();
  const result = await autoSetup.executeAutoSetup(
    "test-spreadsheet-id",
    "test-token",
    "123",
  );

  console.log("\n実行結果:", result);
  console.log("");

  // 3. TaskGeneratorでのタスク生成テスト
  console.log("--- TaskGenerator テスト ---");

  // TaskGeneratorのモック
  const mockTaskGenerator = {
    generateTasks: (data) => {
      const tasks = [];
      const menuRow = data.menuRow.data;
      const aiRow = data.aiRow.data;

      // AI列の検出
      for (let i = 0; i < menuRow.length; i++) {
        if (menuRow[i] === "プロンプト") {
          const aiType = aiRow[i] || "";
          console.log(`\n列${String.fromCharCode(65 + i)}: プロンプト列を検出`);
          console.log(`  AIタイプ: ${aiType}`);

          if (aiType.includes("3種類")) {
            // 3種類AIタスク生成
            console.log("  → 3種類AIタスクを生成");
            console.log("    ログ列: " + String.fromCharCode(65 + i - 1));
            console.log(
              "    ChatGPT回答列: " + String.fromCharCode(65 + i + 1),
            );
            console.log("    Claude回答列: " + String.fromCharCode(65 + i + 2));
            console.log("    Gemini回答列: " + String.fromCharCode(65 + i + 3));

            tasks.push({
              type: "3typeAI",
              promptColumn: String.fromCharCode(65 + i),
              logColumns: {
                log: String.fromCharCode(65 + i - 1),
                layout: "3type",
                aiColumns: {
                  chatgpt: String.fromCharCode(65 + i + 1),
                  claude: String.fromCharCode(65 + i + 2),
                  gemini: String.fromCharCode(65 + i + 3),
                },
              },
            });
          } else {
            // 通常AIタスク生成
            console.log("  → 通常AIタスクを生成");
            console.log("    左ログ列: " + String.fromCharCode(65 + i - 1));
            console.log("    回答列: " + String.fromCharCode(65 + i + 1));
            console.log("    右ログ列: " + String.fromCharCode(65 + i + 2));

            tasks.push({
              type: "singleAI",
              promptColumn: String.fromCharCode(65 + i),
              logColumns: {
                left: String.fromCharCode(65 + i - 1),
                right: String.fromCharCode(65 + i + 2),
              },
            });
          }
        }
      }

      return { tasks };
    },
  };

  const taskResult = mockTaskGenerator.generateTasks(mockSpreadsheetData);
  console.log("\n生成されたタスク数:", taskResult.tasks.length);

  // 4. 期待される最終的な列構成
  console.log("\n--- 期待される最終的な列構成 ---");
  console.log("列A: メニュー");
  console.log("列B: ログ（新規追加）");
  console.log("列C: プロンプト");
  console.log("列D: ChatGPT回答");
  console.log("列E: ログ（新規追加）");
  console.log("列F: ログ（新規追加）");
  console.log("列G: プロンプト");
  console.log("列H: ChatGPT回答（新規追加）");
  console.log("列I: Claude回答（新規追加）");
  console.log("列J: Gemini回答（新規追加）");

  console.log("\n=== テスト完了 ===");
}

// テスト実行
runColumnAdditionTest();
