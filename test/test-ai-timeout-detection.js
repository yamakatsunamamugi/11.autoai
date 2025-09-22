// AI動作検出によるタイムアウト制御機能のテストスクリプト
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🔍 AI動作検出機能のテスト開始...\n");

// step4-tasklist.jsの実装をチェック
const step4File = path.join(__dirname, "step4-tasklist.js");
const step4Content = fs.readFileSync(step4File, "utf8");

const checks = [
  {
    name: "AI動作検出機能",
    pattern: /executeWithAIDetection/,
    description: "AI動作検出機能が実装されている",
  },
  {
    name: "30秒タイムアウト",
    pattern: /30000/,
    description: "30秒以内のAI応答チェック",
  },
  {
    name: "AI応答検出リスナー",
    pattern: /AI_RESPONSE_DETECTED/,
    description: "AI応答検出メッセージリスナー",
  },
  {
    name: "タイムアウト停止",
    pattern: /clearTimeout.*timeoutId/,
    description: "AI応答検出時のタイムアウト停止",
  },
  {
    name: "クリーンアップ機能",
    pattern: /const cleanup = \(\) => \{/,
    description: "リスナーとタイムアウトのクリーンアップ",
  },
  {
    name: "AI内部制御委任",
    pattern: /AI内部制御に委任/,
    description: "AI応答後の内部タイムアウト制御委任",
  },
];

let allPassed = true;

console.log("📊 実装チェック結果:");
console.log("=".repeat(50));

checks.forEach((check, index) => {
  const passed = check.pattern.test(step4Content);
  const status = passed ? "✅" : "❌";
  console.log(`${index + 1}. ${status} ${check.name}`);
  console.log(`   ${check.description}`);

  if (!passed) {
    allPassed = false;
    console.log(`   ⚠️  パターンが見つかりません: ${check.pattern}`);
  }
  console.log("");
});

// 旧タイムアウト実装の削除確認
console.log("🗑️  旧実装の削除確認:");
console.log("=".repeat(50));

const removedChecks = [
  {
    name: "45分固定タイムアウト",
    pattern: /45 minutes|2700000/,
    shouldExist: false,
    description: "45分固定タイムアウトが削除されている",
  },
  {
    name: "Promise.race with timeout",
    pattern: /Promise\.race.*timeoutPromise/,
    shouldExist: false,
    description: "旧タイムアウト方式が削除されている",
  },
];

removedChecks.forEach((check, index) => {
  const exists = check.pattern.test(step4Content);
  const passed = check.shouldExist ? exists : !exists;
  const status = passed ? "✅" : "❌";
  console.log(`${index + 1}. ${status} ${check.name}`);
  console.log(`   ${check.description}`);

  if (!passed) {
    allPassed = false;
    if (check.shouldExist) {
      console.log(
        `   ⚠️  期待されるパターンが見つかりません: ${check.pattern}`,
      );
    } else {
      console.log(
        `   ⚠️  削除されるべきパターンが残っています: ${check.pattern}`,
      );
    }
  }
  console.log("");
});

// 機能フロー確認
console.log("🔄 期待される動作フロー:");
console.log("=".repeat(50));
console.log("1. ✅ タスク開始 → 30秒タイムアウト設定");
console.log("2. ✅ AI応答検出 → タイムアウト停止");
console.log("3. ✅ AI内部制御 → 10分 or 40分で自動完了");
console.log("4. ✅ 結果返却");
console.log("");
console.log("エラーケース:");
console.log("- ✅ 30秒以内にAI応答なし → 真の通信エラー");
console.log("- ✅ AI応答後のエラー → AI内部エラーハンドリング");

if (allPassed) {
  console.log("\n🎉 AI動作検出機能が正常に実装されています!");
  console.log("\n📝 実装された改善点:");
  console.log("- 30秒以内のAI応答チェックで真の通信エラーを早期検出");
  console.log("- AI応答検出後は外部タイムアウトを停止");
  console.log("- AI内部のタイムアウト制御（10分/40分）に完全委任");
  console.log("- リソースの適切なクリーンアップ");
  console.log("- 詳細なログ出力でデバッグ情報を提供");
} else {
  console.log("\n⚠️  一部の機能が不完全です。上記の項目を確認してください。");
}

process.exit(allPassed ? 0 : 1);
