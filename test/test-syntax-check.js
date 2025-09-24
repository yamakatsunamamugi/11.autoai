#!/usr/bin/env node

/**
 * @fileoverview 構文エラーチェックスクリプト
 * JavaScriptファイルの構文をチェックして、エラーがある場合は詳細を表示
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// チェック対象のファイル
const filesToCheck = [
  "4-1-chatgpt-automation.js",
  "4-2-claude-automation.js",
  "4-3-gemini-automation.js",
  "step0-ui-controller.js",
];

console.log("🔍 構文チェック開始\n");

let hasError = false;

filesToCheck.forEach((file) => {
  const filePath = path.join(__dirname, "..", file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${file}: ファイルが見つかりません\n`);
    return;
  }

  try {
    // Node.jsの構文チェック機能を使用
    execSync(`node --check "${filePath}"`, { stdio: "pipe" });
    console.log(`✅ ${file}: 構文エラーなし`);
  } catch (error) {
    hasError = true;
    console.error(`❌ ${file}: 構文エラーあり`);

    // エラーメッセージを解析
    const errorMessage = error.stderr ? error.stderr.toString() : error.message;

    // 行番号とエラー内容を抽出
    const lineMatch = errorMessage.match(/:(\d+)/);
    if (lineMatch) {
      const lineNumber = lineMatch[1];
      console.error(`   行番号: ${lineNumber}`);

      // 該当行の前後を表示
      const fileContent = fs.readFileSync(filePath, "utf8");
      const lines = fileContent.split("\n");
      const targetLine = parseInt(lineNumber) - 1;

      console.error("\n   問題のある箇所:");
      for (
        let i = Math.max(0, targetLine - 2);
        i <= Math.min(lines.length - 1, targetLine + 2);
        i++
      ) {
        const prefix = i === targetLine ? ">>> " : "    ";
        console.error(`   ${String(i + 1).padStart(4)}: ${prefix}${lines[i]}`);
      }
    }

    console.error(`\n   エラー詳細: ${errorMessage}\n`);
  }
});

// try-catchブロックの整合性チェック
console.log("\n📊 try-catchブロックの整合性チェック\n");

filesToCheck.forEach((file) => {
  const filePath = path.join(__dirname, "..", file);

  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  let tryCount = 0;
  let catchCount = 0;
  let finallyCount = 0;
  const tryStack = [];

  lines.forEach((line, index) => {
    // 文字列内のtry/catchを除外
    const cleanLine = line.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, "");

    // tryブロックの検出
    if (/\btry\s*{/.test(cleanLine)) {
      tryCount++;
      tryStack.push(index + 1);
    }

    // catchブロックの検出
    if (/\bcatch\s*\(/.test(cleanLine)) {
      catchCount++;
      if (tryStack.length === 0) {
        console.error(
          `⚠️  ${file}: 行 ${index + 1} に対応するtryブロックがないcatchがあります`,
        );
        hasError = true;
      } else {
        tryStack.pop();
      }
    }

    // finallyブロックの検出
    if (/\bfinally\s*{/.test(cleanLine)) {
      finallyCount++;
    }
  });

  if (tryStack.length > 0) {
    console.error(
      `⚠️  ${file}: 未完了のtryブロックがあります (行: ${tryStack.join(", ")})`,
    );
    hasError = true;
  }

  console.log(`📈 ${file}:`);
  console.log(
    `   try: ${tryCount}, catch: ${catchCount}, finally: ${finallyCount}`,
  );

  if (tryCount !== catchCount + finallyCount && tryCount !== catchCount) {
    console.error(`   ⚠️  try-catch-finallyの数が一致しません`);
    hasError = true;
  }
  console.log("");
});

// 結果サマリー
console.log("\n" + "=".repeat(50));
if (hasError) {
  console.error("❌ 構文エラーまたは構造の問題が見つかりました");
  process.exit(1);
} else {
  console.log("✅ すべてのファイルの構文チェックに合格しました");
  process.exit(0);
}
