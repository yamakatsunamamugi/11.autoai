#!/usr/bin/env node

/**
 * 構文エラーチェック用テストスクリプト
 * 主要なJavaScriptファイルの構文エラーをチェックします
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execPromise = util.promisify(exec);

// チェック対象ファイル
const filesToCheck = [
  "4-1-chatgpt-automation.js",
  "4-2-claude-automation.js",
  "4-2-5-gemini-automation.js",
  "4-3-gemini-automation.js",
  "4-4-genspark-automation.js",
  "common-error-handler.js",
  "aitest/ai-test-message-handler.js",
];

// 色付きコンソール出力
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

async function checkSyntax(file) {
  const filePath = path.join(__dirname, file);

  // ファイルの存在確認
  if (!fs.existsSync(filePath)) {
    console.log(`${colors.yellow}⚠️  ${file} が見つかりません${colors.reset}`);
    return { file, status: "not_found", error: null };
  }

  try {
    // Node.jsの構文チェック（--check フラグ）
    await execPromise(`node --check "${filePath}"`);
    console.log(`${colors.green}✅ ${file} - 構文エラーなし${colors.reset}`);
    return { file, status: "ok", error: null };
  } catch (error) {
    console.log(`${colors.red}❌ ${file} - 構文エラー検出！${colors.reset}`);
    console.log(`${colors.red}   ${error.stderr}${colors.reset}`);
    return { file, status: "error", error: error.stderr };
  }
}

async function checkAllFiles() {
  console.log(`${colors.cyan}========================================`);
  console.log(`📝 JavaScript構文エラーチェック開始`);
  console.log(`========================================${colors.reset}\n`);

  const results = [];
  let hasError = false;

  for (const file of filesToCheck) {
    const result = await checkSyntax(file);
    results.push(result);
    if (result.status === "error") {
      hasError = true;
    }
  }

  // サマリー表示
  console.log(`\n${colors.cyan}========================================`);
  console.log(`📊 チェック結果サマリー`);
  console.log(`========================================${colors.reset}`);

  const okCount = results.filter((r) => r.status === "ok").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const notFoundCount = results.filter((r) => r.status === "not_found").length;

  console.log(`${colors.green}✅ 成功: ${okCount} ファイル${colors.reset}`);
  if (errorCount > 0) {
    console.log(
      `${colors.red}❌ エラー: ${errorCount} ファイル${colors.reset}`,
    );
  }
  if (notFoundCount > 0) {
    console.log(
      `${colors.yellow}⚠️  未検出: ${notFoundCount} ファイル${colors.reset}`,
    );
  }

  if (hasError) {
    console.log(
      `\n${colors.red}⚠️ 構文エラーが検出されました。修正してください。${colors.reset}`,
    );
    process.exit(1);
  } else {
    console.log(
      `\n${colors.green}✨ すべてのファイルが構文チェックを通過しました！${colors.reset}`,
    );
    process.exit(0);
  }
}

// 追加機能：特定ファイルのみチェック
async function checkSpecificFile(filename) {
  console.log(`${colors.cyan}========================================`);
  console.log(`📝 ${filename} の構文チェック`);
  console.log(`========================================${colors.reset}\n`);

  const result = await checkSyntax(filename);

  if (result.status === "error") {
    process.exit(1);
  } else if (result.status === "not_found") {
    console.log(`${colors.yellow}ファイルが見つかりません${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}✨ 構文チェック成功！${colors.reset}`);
    process.exit(0);
  }
}

// コマンドライン引数の処理
const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== "--all") {
  // 特定ファイルをチェック
  checkSpecificFile(args[0]);
} else {
  // 全ファイルをチェック
  checkAllFiles();
}
