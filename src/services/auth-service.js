/**
 * @fileoverview Authentication Service
 * OAuth2認証処理を管理するサービス
 *
 * @note google-services.jsのGoogleAuthManagerから統合
 * DIコンテナで管理される統一認証サービス
 */

export class AuthService {
  constructor() {
    this.logger = typeof logger !== "undefined" ? logger : console;
    
    // トークンキャッシュ
    this._tokenCache = null;
    this._tokenTimestamp = null;
    this._tokenExpiry = 50 * 60 * 1000; // 50分間有効（Google tokenは通常1時間）
  }

  /**
   * OAuth2認証トークンを取得（キャッシュ機能付き）
   */
  async getAuthToken() {
    const now = Date.now();
    
    // キャッシュが有効な場合は返す
    if (this._tokenCache && this._tokenTimestamp && 
        (now - this._tokenTimestamp) < this._tokenExpiry) {
      return this._tokenCache;
    }
    
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          this.logger.error(
            "AuthService",
            "Failed to get auth token",
            chrome.runtime.lastError,
          );
          reject(chrome.runtime.lastError);
        } else {
          // トークンをキャッシュ
          this._tokenCache = token;
          this._tokenTimestamp = now;
          
          this.logger.log("AuthService", "Auth token obtained successfully");
          resolve(token);
        }
      });
    });
  }

  /**
   * 現在の認証状態を確認
   */
  async checkAuthStatus() {
    try {
      const token = await this.getAuthToken();

      if (!token) {
        return {
          isAuthenticated: false,
          message: "認証されていません",
        };
      }

      return {
        isAuthenticated: true,
        token: token,
      };
    } catch (error) {
      this.logger.error("AuthService", "Auth status check failed", error);
      return {
        isAuthenticated: false,
        error: error.message,
      };
    }
  }

  /**
   * 認証をクリア（ログアウト）
   */
  async clearAuth() {
    // キャッシュもクリア
    this._tokenCache = null;
    this._tokenTimestamp = null;
    
    return new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({}, () => {
        resolve();
      });
    });
  }
  
  /**
   * トークンキャッシュをクリア
   */
  clearTokenCache() {
    this._tokenCache = null;
    this._tokenTimestamp = null;
    this.logger.log("AuthService", "Token cache cleared");
  }
}

// デフォルトエクスポート
export default AuthService;

// 後方互換性のためのシングルトンインスタンス
let authServiceInstance = null;

export function getAuthService() {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}

// グローバルスコープに追加（移行期間用）
if (typeof self !== "undefined") {
  self.AuthService = AuthService;
}

// Chrome拡張機能環境でグローバルに公開（移行期間用）
if (typeof globalThis !== "undefined" && !globalThis.authService) {
  globalThis.authService = getAuthService();
}
