/**
 * @fileoverview OAuth Configuration
 * 拡張機能IDに基づいてOAuthクライアントIDを自動選択
 */

// 拡張機能IDとOAuthクライアントIDのマッピング
const OAUTH_CLIENT_MAPPING = {
  // 1台目のパソコン
  'bbbfjffpkfleplpoabeehglgikblfkip': '262291163420-fj2jfie1cmb63md9nnu4ofdkr9ku1u3o.apps.googleusercontent.com',
  
  // 2台目のパソコン
  'fphilbjcpglgablmlkffchdphbndehlg': '262291163420-treg4qt8vf9bh5hojire3vfkc0fhvet6.apps.googleusercontent.com',
  
  // 今後追加のパソコン用（必要に応じて追加）
  // 'new-extension-id': 'new-client-id.apps.googleusercontent.com'
};

// OAuth2スコープ
const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email'
];

/**
 * 現在の拡張機能IDに対応するOAuthクライアントIDを取得
 * @returns {string} OAuthクライアントID
 */
function getOAuthClientId() {
  const extensionId = chrome.runtime.id;
  const clientId = OAUTH_CLIENT_MAPPING[extensionId];
  
  if (!clientId) {
    console.error(`OAuth client ID not found for extension ID: ${extensionId}`);
    console.error('Please add mapping in oauth-config.js');
    throw new Error(`未設定の拡張機能ID: ${extensionId}`);
  }
  
  console.log(`Using OAuth client for extension ${extensionId}`);
  return clientId;
}

/**
 * OAuth設定を取得
 * @returns {Object} OAuth設定オブジェクト
 */
function getOAuthConfig() {
  return {
    clientId: getOAuthClientId(),
    scopes: OAUTH_SCOPES,
    redirectUri: `https://${chrome.runtime.id}.chromiumapp.org/`
  };
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getOAuthClientId,
    getOAuthConfig,
    OAUTH_SCOPES,
    OAUTH_CLIENT_MAPPING
  };
}

// グローバルスコープに追加
if (typeof self !== 'undefined') {
  self.OAuthConfig = {
    getOAuthClientId,
    getOAuthConfig,
    OAUTH_SCOPES,
    OAUTH_CLIENT_MAPPING
  };
}