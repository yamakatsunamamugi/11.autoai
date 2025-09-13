const fs = require('fs');

// ui-selectors.jsを読み込み
const content = fs.readFileSync('src/config/ui-selectors.js', 'utf8');

// UI_SELECTORSを含む部分を抽出
const startIndex = content.indexOf('export const UI_SELECTORS = {');
const endIndex = content.indexOf('\n};', startIndex) + 3;

if (startIndex === -1 || endIndex === -1) {
  console.error('UI_SELECTORSが見つかりません');
  process.exit(1);
}

let objStr = content.substring(startIndex, endIndex);

// export const UI_SELECTORS = を削除
objStr = objStr.replace('export const UI_SELECTORS = ', '');

// 末尾の;を削除
objStr = objStr.replace(/;$/, '');

// コメントを削除
objStr = objStr.replace(/\/\/.*$/gm, '');  // 単行コメント
objStr = objStr.replace(/\/\*[\s\S]*?\*\//g, '');  // 複数行コメント

// 末尾のカンマを削除
objStr = objStr.replace(/,(\s*[}\]])/g, '$1');

// ファイルに保存して確認
fs.writeFileSync('temp_selectors.js', 'module.exports = ' + objStr);

// 一時的にrequireして読み込み
try {
  const UI_SELECTORS = require('./temp_selectors.js');

  // JSONデータ構造を作成
  const jsonData = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString().split('T')[0],
    description: "UI selectors for ChatGPT, Claude, Gemini, and Genspark automation",
    selectors: UI_SELECTORS
  };

  // JSONとして保存
  fs.writeFileSync('ui-selectors-data.json', JSON.stringify(jsonData, null, 2));
  console.log('ui-selectors-data.json を作成しました');

  // 一時ファイルを削除
  fs.unlinkSync('temp_selectors.js');

} catch (e) {
  console.error('エラー:', e.message);
  console.log('temp_selectors.jsを確認してください');
}