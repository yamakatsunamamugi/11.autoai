/**
 * @fileoverview Dropbox API設定管理
 * Dropbox API認証とアクセストークン管理
 */

export class DropboxConfig {
  constructor() {
    // Dropbox API設定
    this.config = {
      // Dropbox App Console (https://www.dropbox.com/developers/apps) で取得
      clientId: null,  // 開発者が設定する必要あり
      clientSecret: null,  // 開発者が設定する必要あり（拡張機能では使用しない）

      // OAuth2認証設定
      redirectUri: chrome.identity?.getRedirectURL ? chrome.identity.getRedirectURL() : 'https://localhost',
      scope: 'files.content.write account_info.read',  // ファイル書き込み権限 + アカウント情報読み取り

      // API エンドポイント
      apiUrl: 'https://api.dropboxapi.com/2',
      contentUrl: 'https://content.dropboxapi.com/2',

      // アップロード設定
      uploadPath: '/log-report',  // デフォルトアップロード先（新統一構造）
      maxRetries: 3,  // リトライ回数
      chunkSize: 8 * 1024 * 1024,  // 8MB チャンク
    };

    // ストレージキー
    this.storageKeys = {
      accessToken: 'dropbox_access_token',
      refreshToken: 'dropbox_refresh_token',
      clientId: 'dropboxClientId',  // UI Controllerと一致させる
      uploadSettings: 'dropbox_upload_settings'
    };
  }

  /**
   * Dropbox App設定を初期化
   * @param {string} clientId - Dropbox App Client ID
   * @returns {Promise<boolean>}
   */
  async setClientId(clientId) {
    if (!clientId) {
      throw new Error('Client IDが必要です');
    }

    this.config.clientId = clientId;

    // Chrome Storageに保存
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        [this.storageKeys.clientId]: clientId
      });
    }

    return true;
  }

  /**
   * 保存されたClient IDを読み込み
   * @returns {Promise<string|null>}
   */
  async loadClientId() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(this.storageKeys.clientId);
      const clientId = result[this.storageKeys.clientId];
      if (clientId) {
        this.config.clientId = clientId;
        return clientId;
      }
    }
    return null;
  }

  /**
   * アクセストークンを保存
   * @param {string} accessToken
   * @param {string} refreshToken
   * @returns {Promise<void>}
   */
  async saveTokens(accessToken, refreshToken = null) {
    const tokenData = { accessToken };
    if (refreshToken) {
      tokenData.refreshToken = refreshToken;
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        [this.storageKeys.accessToken]: accessToken,
        ...(refreshToken && { [this.storageKeys.refreshToken]: refreshToken })
      });
    }
  }

  /**
   * アクセストークンを取得
   * @returns {Promise<string|null>}
   */
  async getAccessToken() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(this.storageKeys.accessToken);
      return result[this.storageKeys.accessToken] || null;
    }
    return null;
  }

  /**
   * リフレッシュトークンを取得
   * @returns {Promise<string|null>}
   */
  async getRefreshToken() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(this.storageKeys.refreshToken);
      return result[this.storageKeys.refreshToken] || null;
    }
    return null;
  }

  /**
   * 認証状態をチェック
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    const accessToken = await this.getAccessToken();
    const clientId = await this.loadClientId();
    return !!(accessToken && clientId);
  }

  /**
   * PKCE用のコードチャレンジを生成
   * @returns {Promise<{codeVerifier: string, codeChallenge: string}>}
   */
  async generatePKCE() {
    // コードベリファイアを生成（43-128文字のランダム文字列）
    const codeVerifier = this.generateRandomString(128);

    // コードチャレンジを生成（SHA256ハッシュ + Base64URL）
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const codeChallenge = this.base64URLEncode(digest);

    return { codeVerifier, codeChallenge };
  }

  /**
   * ランダム文字列を生成
   * @param {number} length
   * @returns {string}
   */
  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Base64URL エンコード
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  base64URLEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let byte of bytes) {
      str += String.fromCharCode(byte);
    }
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * OAuth2認証URLを生成（PKCE対応）
   * @param {string} codeChallenge
   * @returns {string}
   */
  getAuthUrl(codeChallenge) {
    if (!this.config.clientId) {
      throw new Error('Client IDが設定されていません');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      token_access_type: 'offline',  // リフレッシュトークンを取得
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  /**
   * アップロード設定を保存
   * @param {Object} settings - アップロード設定
   * @returns {Promise<void>}
   */
  async saveUploadSettings(settings) {
    const defaultSettings = {
      autoUpload: false,
      uploadPath: '/log-report',
      compressionEnabled: true,
      retentionDays: 30,
      maxFilesPerAI: 5,           // AIタイプ別の最大保持ファイル数
      cleanupByFileCount: true,   // ファイル数ベースの削除を有効
      cleanupByDays: false        // 日数ベースの削除を無効
    };

    const mergedSettings = { ...defaultSettings, ...settings };

    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        [this.storageKeys.uploadSettings]: mergedSettings
      });
    }
  }

  /**
   * アップロード設定を取得
   * @returns {Promise<Object>}
   */
  async getUploadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(this.storageKeys.uploadSettings);
      return result[this.storageKeys.uploadSettings] || {
        autoUpload: false,
        uploadPath: '/log-report',
        compressionEnabled: true,
        retentionDays: 30,
        maxFilesPerAI: 5,
        cleanupByFileCount: true,
        cleanupByDays: false
      };
    }

    return {
      autoUpload: false,
      uploadPath: '/log-report',
      compressionEnabled: true,
      retentionDays: 30,
      maxFilesPerAI: 5,
      cleanupByFileCount: true,
      cleanupByDays: false
    };
  }

  /**
   * トークンをクリア（ログアウト）
   * @returns {Promise<void>}
   */
  async clearTokens() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove([
        this.storageKeys.accessToken,
        this.storageKeys.refreshToken
      ]);
    }
  }

  /**
   * 設定情報を取得
   * @returns {Object}
   */
  getConfig() {
    return { ...this.config };
  }
}

// シングルトンインスタンス
export const dropboxConfig = new DropboxConfig();