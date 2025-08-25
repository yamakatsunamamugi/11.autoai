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
   * @param {boolean} interactive - ユーザー操作を許可するか
   */
  async getAuthToken(interactive = true) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, async (token) => {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError;
          this.logger.error(
            "AuthService",
            "Failed to get auth token",
            error,
          );
          
          // エラーの詳細情報をログに記録
          if (globalThis.logManager) {
            globalThis.logManager.error(`認証エラー: ${error.message}`, {
              message: error.message,
              interactive: interactive,
              hint: this.getErrorHint(error.message)
            });
          }
          
          // トークンをクリアして再試行を促す
          if (error.message && error.message.includes('OAuth2')) {
            chrome.identity.removeCachedAuthToken({ token: '' }, () => {
              this.logger.log("AuthService", "Cleared cached auth token");
            });
          }
          
          reject(error);
        } else {
          this.logger.log("AuthService", "Auth token obtained successfully");
          resolve(token);
        }
      });
    });
  }
  
  /**
   * エラーメッセージに基づいて解決方法のヒントを返す
   */
  getErrorHint(errorMessage) {
    if (!errorMessage) return '';
    
    if (errorMessage.includes('OAuth2 not granted')) {
      return '拡張機能を再インストールして、権限を許可してください';
    } else if (errorMessage.includes('invalid_client')) {
      return 'OAuth2クライアントIDの設定を確認してください';
    } else if (errorMessage.includes('User interaction required')) {
      return '認証ボタンをクリックして、Googleアカウントでログインしてください';
    } else if (errorMessage.includes('network')) {
      return 'インターネット接続を確認してください';
    }
    return '認証を再度実行してください';
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
