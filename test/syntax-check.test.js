#!/usr/bin/env node

/**
 * JavaScript構文チェックテスト
 * 各JavaScriptファイルの構文をチェックして、エラーがないことを確認
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// テスト対象のファイル
const filesToTest = [
  "4-1-chatgpt-automation.js",
  "4-2-claude-automation.js",
  "4-3-gemini-automation.js",
  "4-4-genspark-automation.js",
  "aitest/ai-test-message-handler.js",
];

console.log("🔍 JavaScript構文チェックテスト開始\n");

let hasErrors = false;
const results = [];

filesToTest.forEach((file) => {
  const filePath = path.join(__dirname, "..", file);

  // ファイルが存在するかチェック
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${file}: ファイルが存在しません`);
    return;
  }

  try {
    // Node.jsの構文チェック機能を使用
    execSync(`node -c "${filePath}"`, {
      encoding: "utf8",
      stdio: "pipe",
    });

    // 追加チェック: 基本的な構造確認
    const content = fs.readFileSync(filePath, "utf8");

    // IIFEの開始と終了をチェック
    const iifeStart = content.match(/\(async function\s*\(\)/g) || [];
    const iifeEnd = content.match(/\}\)\(\);?/g) || [];

    // 括弧のバランスチェック
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;

    const checks = [];

    if (openBraces !== closeBraces) {
      checks.push(`中括弧のバランス: { ${openBraces} vs } ${closeBraces}`);
    }
    if (openParens !== closeParens) {
      checks.push(`丸括弧のバランス: ( ${openParens} vs ) ${closeParens}`);
    }
    if (openBrackets !== closeBrackets) {
      checks.push(`角括弧のバランス: [ ${openBrackets} vs ] ${closeBrackets}`);
    }

    if (checks.length > 0) {
      console.log(
        `⚠️  ${file}: 構文は有効ですが、括弧のバランスに問題がある可能性があります`,
      );
      checks.forEach((check) => console.log(`    - ${check}`));
      results.push({ file, status: "warning", issues: checks });
    } else {
      console.log(`✅ ${file}: 構文チェック成功`);
      results.push({ file, status: "success" });
    }

    // ファイルサイズと行数も表示
    const lines = content.split("\n").length;
    const size = (fs.statSync(filePath).size / 1024).toFixed(2);
    console.log(`    📊 ${lines}行, ${size}KB`);

    // IIFE構造の情報
    if (iifeStart.length > 0) {
      console.log(
        `    🔧 IIFE: ${iifeStart.length}個の開始, ${iifeEnd.length}個の終了`,
      );
    }
  } catch (error) {
    hasErrors = true;
    console.log(`❌ ${file}: 構文エラー`);
    console.log(`    ${error.message}`);
    results.push({ file, status: "error", error: error.message });
  }

  console.log("");
});

// 結果サマリー
console.log("📋 テスト結果サマリー");
console.log("=".repeat(50));

const successCount = results.filter((r) => r.status === "success").length;
const warningCount = results.filter((r) => r.status === "warning").length;
const errorCount = results.filter((r) => r.status === "error").length;

console.log(`✅ 成功: ${successCount}ファイル`);
if (warningCount > 0) {
  console.log(`⚠️  警告: ${warningCount}ファイル`);
}
if (errorCount > 0) {
  console.log(`❌ エラー: ${errorCount}ファイル`);
}

console.log("=".repeat(50));

// 特定ファイルの詳細チェック
if (fs.existsSync(path.join(__dirname, "..", "4-1-chatgpt-automation.js"))) {
  console.log("\n📝 4-1-chatgpt-automation.js の詳細チェック:");

  const content = fs.readFileSync(
    path.join(__dirname, "..", "4-1-chatgpt-automation.js"),
    "utf8",
  );

  // 重要な関数の存在確認
  const importantFunctions = [
    "executeTask",
    "runAutomation",
    "detectChatGPTModelsAndFeatures",
    "ChatGPTAutomationV2",
  ];

  importantFunctions.forEach((func) => {
    if (content.includes(func)) {
      console.log(`  ✅ ${func} が定義されています`);
    } else {
      console.log(`  ⚠️  ${func} が見つかりません`);
    }
  });

  // エラーハンドラーの存在確認
  if (content.includes('window.addEventListener("error"')) {
    console.log("  ✅ エラーハンドラーが設定されています");
  }

  if (content.includes('window.addEventListener("unhandledrejection"')) {
    console.log("  ✅ Promise拒否ハンドラーが設定されています");
  }
}

// 終了コード
if (hasErrors) {
  console.log("\n❌ 構文エラーが検出されました。修正が必要です。");
  process.exit(1);
} else if (warningCount > 0) {
  console.log("\n⚠️  警告がありますが、構文は有効です。");
  process.exit(0);
} else {
  console.log("\n✅ すべてのファイルの構文チェックが成功しました！");
  process.exit(0);
}
