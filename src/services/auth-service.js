/**
 * @fileoverview Authentication Service
 * OAuth2認証処理を管理するサービス
 */

class AuthService {
  constructor() {
    this.logger = typeof logger !== "undefined" ? logger : console;
  }

  /**
   * OAuth2認証トークンを取得
   */
  async getAuthToken() {
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
    return new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({}, () => {
        resolve();
      });
    });
  }
}

// グローバルスコープに追加
self.AuthService = AuthService;

// シングルトンインスタンスを作成してグローバルに公開
if (typeof globalThis !== "undefined") {
  globalThis.authService = new AuthService();
}
