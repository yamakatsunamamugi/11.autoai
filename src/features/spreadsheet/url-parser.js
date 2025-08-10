// url-parser.js - スプレッドシートURL解析ユーティリティ

/**
 * スプレッドシートURLからIDとgidを抽出
 * @param {string} url - スプレッドシートのURL
 * @returns {{spreadsheetId: string, gid: string|null}}
 */
function parseSpreadsheetUrl(url) {
  const result = {
    spreadsheetId: null,
    gid: null,
  };

  try {
    // URLオブジェクトを作成
    const urlObj = new URL(url);

    // スプレッドシートIDを抽出（/d/[ID]/の形式）
    const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch) {
      result.spreadsheetId = idMatch[1];
    }

    // gidを抽出（#gid=数値 または ?gid=数値）
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    if (gidMatch) {
      result.gid = gidMatch[1];
    }

    console.log("Parsed URL:", { url, result });
  } catch (error) {
    console.error("Failed to parse spreadsheet URL:", error);
  }

  return result;
}

/**
 * 複数のスプレッドシートURLを解析
 * @param {string[]} urls - URLの配列
 * @returns {Array<{url: string, spreadsheetId: string, gid: string|null}>}
 */
function parseMultipleUrls(urls) {
  return urls
    .map((url) => ({
      url,
      ...parseSpreadsheetUrl(url),
    }))
    .filter((item) => item.spreadsheetId); // 有効なIDを持つもののみ返す
}

// グローバルに公開
if (typeof globalThis !== "undefined") {
  globalThis.parseSpreadsheetUrl = parseSpreadsheetUrl;
  globalThis.parseMultipleUrls = parseMultipleUrls;
}
