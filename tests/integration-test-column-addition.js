// integration-test-column-addition.js - 列追加機能の統合テスト

import { Task, TaskList } from "../src/features/task/models.js";
import TaskGenerator from "../src/features/task/generator.js";

// モック環境のセットアップ
global.logger = {
  log: (category, message, data) => {
    if (category === "TaskGenerator" && message.includes("タスク生成")) {
      console.log(`[${category}] ${message}`, data || "");
    }
  },
  warn: (message) => console.warn("[WARN]", message),
  error: (message, data) => console.error("[ERROR]", message, data),
};

// テストデータ
const testData = {
  // ケース1: 通常のAI（ChatGPT）
  case1: {
    menuRow: {
      number: 3,
      data: ["メニュー", "プロンプト", "回答", "次の列"],
    },
    aiRow: {
      number: 2,
      data: ["使うAI", "ChatGPT", "ChatGPT", ""],
    },
    workRows: [
      { number: 5, data: ["作業", "テスト質問1", "", ""] },
      { number: 6, data: ["作業", "テスト質問2", "", ""] },
    ],
    values: [
      ["", "", "", ""],
      ["使うAI", "ChatGPT", "ChatGPT", ""],
      ["メニュー", "プロンプト", "回答", "次の列"],
      ["", "", "", ""],
      ["作業", "テスト質問1", "", ""],
      ["作業", "テスト質問2", "", ""],
    ],
  },

  // ケース2: 3種類AI
  case2: {
    menuRow: {
      number: 3,
      data: ["メニュー", "何か", "プロンプト", "既存"],
    },
    aiRow: {
      number: 2,
      data: ["使うAI", "", "3種類（ChatGPT・Gemini・Claude）", ""],
    },
    workRows: [{ number: 5, data: ["作業", "", "3種類テスト質問", ""] }],
    values: [
      ["", "", "", ""],
      ["使うAI", "", "3種類（ChatGPT・Gemini・Claude）", ""],
      ["メニュー", "何か", "プロンプト", "既存"],
      ["", "", "", ""],
      ["作業", "", "3種類テスト質問", ""],
    ],
  },

  // ケース3: 複数のAI列混在
  case3: {
    menuRow: {
      number: 3,
      data: ["メニュー", "プロンプト", "回答", "プロンプト", "既存データ"],
    },
    aiRow: {
      number: 2,
      data: [
        "使うAI",
        "Claude",
        "Claude",
        "3種類（ChatGPT・Gemini・Claude）",
        "",
      ],
    },
    workRows: [
      { number: 5, data: ["作業", "Claude質問", "", "3種類質問", ""] },
    ],
    values: [
      ["", "", "", "", ""],
      ["使うAI", "Claude", "Claude", "3種類（ChatGPT・Gemini・Claude）", ""],
      ["メニュー", "プロンプト", "回答", "プロンプト", "既存データ"],
      ["", "", "", "", ""],
      ["作業", "Claude質問", "", "3種類質問", ""],
    ],
  },
};

// テスト実行関数
async function runIntegrationTest() {
  console.log("=== 11.autoai 列追加機能統合テスト ===\n");

  const generator = new TaskGenerator();
  let testsPassed = 0;
  let totalTests = 0;

  // ケース1: 通常AI（ChatGPT）のテスト
  console.log("【ケース1】通常AI（ChatGPT）");
  console.log(
    "期待: B列（プロンプト）に対して、A列（ログ）とC列（回答）が追加される",
  );

  const case1Data = {
    ...testData.case1,
    aiColumns: { C: { type: "ChatGPT", columnIndex: 2 } }, // C列が回答列
  };

  const result1 = generator.generateTasks(case1Data);
  const tasks1 = result1.tasks;

  totalTests++;
  if (tasks1.length > 0) {
    console.log("✓ タスクが生成されました");
    const firstTask = tasks1[0];
    console.log("  タスク構造確認:", {
      hasLogColumns: !!firstTask.logColumns,
      logColumns: firstTask.logColumns,
    });

    if (firstTask.logColumns) {
      const logColumns = firstTask.logColumns;
      console.log(`  左ログ列: ${logColumns.left} (期待: A)`);
      console.log(`  右ログ列: ${logColumns.right} (期待: D)`);

      if (logColumns.left === "A" && logColumns.right === "D") {
        console.log("✓ ログ列が正しく設定されています\n");
        testsPassed++;
      } else {
        console.log("✗ ログ列の位置が不正です\n");
      }
    } else {
      console.log("✗ logColumnsが設定されていません\n");
    }
  } else {
    console.log("✗ タスクが生成されませんでした\n");
  }

  // ケース2: 3種類AIのテスト
  console.log("【ケース2】3種類AI");
  console.log(
    "期待: C列（プロンプト）に対して、B列（ログ）とD,E,F列（回答）が追加される",
  );

  const case2Data = {
    ...testData.case2,
    aiColumns: {
      C: { type: "3種類（ChatGPT・Gemini・Claude）", columnIndex: 2 },
    },
  };

  const result2 = generator.generateTasks(case2Data);
  const tasks2 = result2.tasks;

  totalTests++;
  if (tasks2.length >= 3) {
    // 3種類AIなので3つのタスクが生成される
    console.log("✓ 3つのタスクが生成されました");

    // 最初のタスクの構造を確認
    const firstTask = tasks2[0];
    console.log("  タスク構造確認:", {
      hasLogColumns: !!firstTask.logColumns,
      logColumns: firstTask.logColumns,
    });

    if (firstTask.logColumns) {
      const logColumns = firstTask.logColumns;
      console.log(`  ログ列: ${logColumns.log} (期待: B)`);
      console.log(
        `  ChatGPT回答列: ${logColumns.aiColumns?.chatgpt} (期待: D)`,
      );
      console.log(`  Claude回答列: ${logColumns.aiColumns?.claude} (期待: E)`);
      console.log(`  Gemini回答列: ${logColumns.aiColumns?.gemini} (期待: F)`);

      if (
        logColumns.log === "B" &&
        logColumns.aiColumns?.chatgpt === "D" &&
        logColumns.aiColumns?.claude === "E" &&
        logColumns.aiColumns?.gemini === "F"
      ) {
        console.log("✓ 3種類AI用の列が正しく設定されています\n");
        testsPassed++;
      } else {
        console.log("✗ 3種類AI用の列の位置が不正です\n");
      }
    } else {
      console.log("✗ logColumnsが設定されていません\n");
    }
  } else {
    console.log("✗ 3種類AIのタスクが正しく生成されませんでした\n");
  }

  // ケース3: 複数AI列混在のテスト
  console.log("【ケース3】複数AI列混在");
  console.log("期待: B列（Claude）とD列（3種類）が正しく処理される");

  const case3Data = {
    ...testData.case3,
    aiColumns: {
      C: { type: "Claude", columnIndex: 2 },
      D: { type: "3種類（ChatGPT・Gemini・Claude）", columnIndex: 3 },
    },
  };

  const result3 = generator.generateTasks(case3Data);
  const tasks3 = result3.tasks;

  totalTests++;
  let claudeTaskFound = false;
  let threeTypeTaskFound = false;

  tasks3.forEach((task) => {
    if (task.aiType === "claude" && task.column === "C") {
      claudeTaskFound = true;
      console.log("✓ Claude用タスクが見つかりました");
      if (task.logColumns) {
        console.log(`  左ログ列: ${task.logColumns.left}`);
        console.log(`  右ログ列: ${task.logColumns.right}`);
      } else {
        console.log("  ログ列情報が設定されていません");
      }
    }

    if (task.groupInfo && task.groupInfo.type === "3type") {
      threeTypeTaskFound = true;
      console.log("✓ 3種類AI用タスクが見つかりました");
      if (task.logColumns) {
        console.log(`  ログ列: ${task.logColumns.log}`);
      } else {
        console.log("  ログ列情報が設定されていません");
      }
    }
  });

  if (claudeTaskFound && threeTypeTaskFound) {
    console.log("✓ 複数AI列が正しく処理されています\n");
    testsPassed++;
  } else {
    console.log("✗ 複数AI列の処理に問題があります\n");
  }

  // テスト結果サマリー
  console.log("=== テスト結果サマリー ===");
  console.log(`合格: ${testsPassed}/${totalTests}`);
  console.log(`成功率: ${Math.round((testsPassed / totalTests) * 100)}%`);

  // タスク統計情報
  console.log("\n=== タスク統計情報 ===");
  const allTasks = [...tasks1, ...tasks2, ...tasks3];
  const byAI = {
    chatgpt: allTasks.filter((t) => t.aiType === "chatgpt").length,
    claude: allTasks.filter((t) => t.aiType === "claude").length,
    gemini: allTasks.filter((t) => t.aiType === "gemini").length,
  };

  console.log(`総タスク数: ${allTasks.length}`);
  console.log(
    `AI別: ChatGPT=${byAI.chatgpt}, Claude=${byAI.claude}, Gemini=${byAI.gemini}`,
  );

  return testsPassed === totalTests;
}

// テスト実行
runIntegrationTest()
  .then((success) => {
    if (success) {
      console.log("\n✅ すべてのテストが成功しました！");
      process.exit(0);
    } else {
      console.log("\n❌ 一部のテストが失敗しました");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("\n❌ テスト実行中にエラーが発生しました:", error);
    process.exit(1);
  });
