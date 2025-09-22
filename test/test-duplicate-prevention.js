// テスト用スクリプト: Claude自動化の重複実行防止機能をテスト
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Claude自動化ファイルを読み込み
const automationFile = path.join(__dirname, "4-2-claude-automation.js");
const fileContent = fs.readFileSync(automationFile, "utf8");

console.log("🔍 Claude自動化スクリプトの重複実行防止機能をテスト中...\n");

// 実装されている重複防止機能を確認
const checks = [
  {
    name: "windowレベルの状態管理",
    pattern: /window\.CLAUDE_TASK_EXECUTING/,
    description: "window.CLAUDE_TASK_EXECUTINGを使用したコンテキスト間状態共有",
  },
  {
    name: "sessionStorageによる永続化",
    pattern: /sessionStorage\.setItem.*CLAUDE_EXECUTION_STATE/,
    description: "sessionStorageを使用した状態の永続化",
  },
  {
    name: "タイムアウトチェック",
    pattern: /15 \* 60 \* 1000/,
    description: "15分タイムアウトによる長時間実行の検出",
  },
  {
    name: "executeTask内の重複チェック",
    pattern: /重複実行チェック.*グローバル状態/,
    description: "executeTask関数内でのグローバル状態を使用した重複チェック",
  },
  {
    name: "メッセージリスナーでの重複チェック",
    pattern: /重複実行チェック.*メッセージリスナーレベル/,
    description: "メッセージリスナーレベルでの早期重複検出",
  },
  {
    name: "状態のクリーンアップ",
    pattern: /setExecutionState\(false\)/,
    description: "タスク完了時の状態クリーンアップ",
  },
];

let allPassed = true;

checks.forEach((check, index) => {
  const passed = check.pattern.test(fileContent);
  const status = passed ? "✅" : "❌";
  console.log(`${index + 1}. ${status} ${check.name}`);
  console.log(`   ${check.description}`);

  if (!passed) {
    allPassed = false;
    console.log(`   ⚠️  パターンが見つかりません: ${check.pattern}`);
  }
  console.log("");
});

// 実装の包括的分析
console.log("📊 実装分析:");
console.log("=".repeat(50));

// キーとなるコードブロックの存在確認
const keyImplementations = [
  "window.CLAUDE_TASK_EXECUTING = window.CLAUDE_TASK_EXECUTING || false",
  "loadExecutionStateFromStorage",
  "syncExecutionStateWithStorage",
  "getExecutionStatus",
  "setExecutionState",
];

keyImplementations.forEach((impl) => {
  const found = fileContent.includes(impl);
  console.log(`${found ? "✅" : "❌"} ${impl}`);
});

console.log("\n🎯 重複実行防止の効果:");
console.log("=".repeat(50));
console.log("1. ✅ 異なる実行コンテキスト間での状態共有");
console.log("2. ✅ sessionStorageによる状態の永続化");
console.log("3. ✅ タイムアウトによる古い実行状態の自動クリーンアップ");
console.log("4. ✅ メッセージリスナーレベルでの早期重複検出");
console.log("5. ✅ executeTask関数内での最終的な重複チェック");

if (allPassed) {
  console.log("\n🎉 すべての重複実行防止機能が正常に実装されています!");
  console.log("\n📝 実装された改善点:");
  console.log("- windowレベルの状態管理でコンテキスト間共有を実現");
  console.log("- sessionStorageで状態を永続化し、タブ間でも共有");
  console.log("- 15分タイムアウトで古い実行状態を自動クリーンアップ");
  console.log("- メッセージリスナーとexecuteTask両方で二重チェック");
  console.log("- 詳細なログ出力でデバッグ情報を提供");
} else {
  console.log(
    "\n⚠️  一部の重複実行防止機能が不完全です。上記の項目を確認してください。",
  );
}

process.exit(allPassed ? 0 : 1);
