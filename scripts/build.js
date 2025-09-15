#!/usr/bin/env node

/**
 * ビルドスクリプト
 * Chrome拡張機能の本番ビルドを作成
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const BUILD_DIR = path.join(DIST_DIR, 'build');

// ビルド設定
const BUILD_CONFIG = {
  // コピーするファイル
  files: [
    'manifest.json',
    'background.js',
    'popup.html',
    'popup.js',
    'popup.css',
    'log-viewer.html',
    'log-viewer.js',
    'log-viewer.css',
    'monitoring-dashboard.html',
    'monitoring-dashboard.js'
  ],

  // コピーするディレクトリ
  directories: [
    'src',
    'automations',
    'config',
    'assets'
  ],

  // 除外パターン
  exclude: [
    '*.test.js',
    '*.spec.js',
    '*.test.ts',
    '*.spec.ts',
    '__tests__',
    'tests',
    'node_modules',
    '.git',
    '.env',
    '.env.local',
    '*.map',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '*.backup'
  ]
};

/**
 * ディレクトリを作成
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * ディレクトリをクリーン
 */
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  ensureDir(dir);
}

/**
 * ファイルをコピー
 */
function copyFile(src, dest) {
  const srcPath = path.join(ROOT_DIR, src);
  const destPath = path.join(BUILD_DIR, dest || src);

  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠️  File not found: ${src}`);
    return;
  }

  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
  console.log(`✓ Copied: ${src}`);
}

/**
 * ディレクトリを再帰的にコピー
 */
function copyDirectory(src, dest, excludePatterns = []) {
  const srcPath = path.join(ROOT_DIR, src);
  const destPath = path.join(BUILD_DIR, dest || src);

  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠️  Directory not found: ${src}`);
    return;
  }

  ensureDir(destPath);

  const files = fs.readdirSync(srcPath);

  files.forEach(file => {
    const srcFile = path.join(srcPath, file);
    const destFile = path.join(destPath, file);

    // 除外チェック
    const shouldExclude = excludePatterns.some(pattern => {
      if (pattern.startsWith('*.')) {
        return file.endsWith(pattern.slice(1));
      }
      return file === pattern || file.includes(pattern);
    });

    if (shouldExclude) {
      return;
    }

    const stat = fs.statSync(srcFile);

    if (stat.isDirectory()) {
      copyDirectory(
        path.join(src, file),
        path.join(dest || src, file),
        excludePatterns
      );
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  });

  console.log(`✓ Copied directory: ${src}`);
}

/**
 * manifest.jsonを処理
 */
function processManifest() {
  const manifestPath = path.join(BUILD_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // 開発用の設定を削除
  delete manifest.key;
  delete manifest.update_url;

  // バージョン情報を更新
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')
  );
  manifest.version = packageJson.version;

  // 本番用の設定を追加
  if (process.env.NODE_ENV === 'production') {
    manifest.name = '11.autoai';
    manifest.short_name = '11.autoai';
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`✓ Processed manifest.json (version: ${manifest.version})`);
}

/**
 * JavaScriptファイルを最適化
 */
function optimizeJavaScript() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('⏭️  Skipping JS optimization (not production)');
    return;
  }

  try {
    // Terserを使用して最小化
    execSync('npx terser --version', { stdio: 'ignore' });

    const jsFiles = findFiles(BUILD_DIR, '.js');

    jsFiles.forEach(file => {
      const relativePath = path.relative(BUILD_DIR, file);
      console.log(`  Minifying: ${relativePath}`);

      execSync(
        `npx terser ${file} -o ${file} -c -m --toplevel`,
        { stdio: 'ignore' }
      );
    });

    console.log(`✓ Optimized ${jsFiles.length} JavaScript files`);
  } catch (error) {
    console.warn('⚠️  Could not optimize JavaScript files:', error.message);
  }
}

/**
 * ファイルを検索
 */
function findFiles(dir, ext) {
  const files = [];

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);

    items.forEach(item => {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item.endsWith(ext)) {
        files.push(fullPath);
      }
    });
  }

  walk(dir);
  return files;
}

/**
 * ZIPアーカイブを作成
 */
async function createZipArchive() {
  const zipPath = path.join(DIST_DIR, 'extension.zip');

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最大圧縮
    });

    output.on('close', () => {
      const size = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✓ Created extension.zip (${size} MB)`);
      resolve(zipPath);
    });

    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(BUILD_DIR, false);
    archive.finalize();
  });
}

/**
 * ビルド統計を表示
 */
function showBuildStats() {
  const stats = {
    files: 0,
    totalSize: 0
  };

  function walk(dir) {
    const items = fs.readdirSync(dir);

    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        stats.files++;
        stats.totalSize += stat.size;
      }
    });
  }

  walk(BUILD_DIR);

  console.log('\n📊 Build Statistics:');
  console.log(`   Files: ${stats.files}`);
  console.log(`   Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
}

/**
 * メインビルド処理
 */
async function build() {
  console.log('🔨 Starting build process...\n');

  const startTime = Date.now();

  try {
    // 1. ディレクトリ準備
    console.log('📁 Preparing directories...');
    cleanDir(DIST_DIR);
    cleanDir(BUILD_DIR);

    // 2. ファイルコピー
    console.log('\n📋 Copying files...');
    BUILD_CONFIG.files.forEach(file => copyFile(file));

    // 3. ディレクトリコピー
    console.log('\n📂 Copying directories...');
    BUILD_CONFIG.directories.forEach(dir => {
      copyDirectory(dir, null, BUILD_CONFIG.exclude);
    });

    // 4. manifest.json処理
    console.log('\n⚙️  Processing manifest...');
    processManifest();

    // 5. JavaScript最適化
    console.log('\n🗜️  Optimizing JavaScript...');
    optimizeJavaScript();

    // 6. ZIPアーカイブ作成
    console.log('\n📦 Creating archive...');
    await createZipArchive();

    // 7. 統計表示
    showBuildStats();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Build completed successfully in ${elapsed}s`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Build failed:', error);
    process.exit(1);
  }
}

// ビルド実行
build();