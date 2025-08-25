/**
 * @fileoverview Authentication Service
 * OAuth2認証処理を管理するサービス（動的クライアントID対応）
 */

class AuthService {
  constructor() {
    this.logger = typeof logger !== "undefined" ? logger : console;
    this.token = null;
    this.tokenExpiry = null;
    
    // OAuthクライアントIDマッピング
    this.OAUTH_CLIENT_MAPPING = {
      // 両方のパソコンで同じクライアントIDを使用（ウェブアプリケーションタイプ）
      'bbbfjffpkfleplpoabeehglgikblfkip': '262291163420-02ohr4mn3i3tngukpj11ed5pdqn0frjg.apps.googleusercontent.com',
      'fphilbjcpglgablmlkffchdphbndehlg': '262291163420-02ohr4mn3i3tngukpj11ed5pdqn0frjg.apps.googleusercontent.com'
    };
    
    // OAuth2スコープ
    this.OAUTH_SCOPES = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/userinfo.email'
    ];
  }

  /**
   * 現在の拡張機能IDに対応するOAuthクライアントIDを取得
   */
  getOAuthClientId() {
    const extensionId = chrome.runtime.id;
    const clientId = this.OAUTH_CLIENT_MAPPING[extensionId];
    
    if (!clientId) {
      this.logger.error(`OAuth client ID not found for extension ID: ${extensionId}`);
      throw new Error(`未設定の拡張機能ID: ${extensionId}。src/services/auth-service.jsのOAUTH_CLIENT_MAPPINGに追加してください。`);
    }
    
    this.logger.log(`Using OAuth client for extension ${extensionId}`);
    return clientId;
  }

  /**
   * OAuth2認証トークンを取得（chrome.identity.getAuthTokenの代替実装）
   * @param {boolean} interactive - ユーザー操作を許可するか
   */
  async getAuthToken(interactive = true) {
    // 既存のトークンが有効ならそれを返す
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }

    // manifest.jsonにoauth2設定がある場合は従来の方法を使用
    const manifest = chrome.runtime.getManifest();
    if (manifest.oauth2 && manifest.oauth2.client_id) {
      return this.getAuthTokenLegacy(interactive);
    }

    // OAuth2フローを使用してトークンを取得
    try {
      const clientId = this.getOAuthClientId();
      const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
      const scopes = this.OAUTH_SCOPES.join(' ');
      
      // OAuth2認証URLを構築
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('response_type', 'token');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', scopes);
      authUrl.searchParams.set('access_type', 'online');
      
      if (!interactive) {
        authUrl.searchParams.set('prompt', 'none');
      }

      // 認証フローを起動
      const responseUrl = await new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
          {
            url: authUrl.toString(),
            interactive: interactive
          },
          (responseUrl) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(responseUrl);
            }
          }
        );
      });

      // レスポンスURLからトークンを抽出
      const url = new URL(responseUrl);
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const token = hashParams.get('access_token');
      const expiresIn = parseInt(hashParams.get('expires_in') || '3600');
      
      if (!token) {
        throw new Error('トークンの取得に失敗しました');
      }

      // トークンを保存
      this.token = token;
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
      
      this.logger.log("AuthService", "Auth token obtained successfully");
      return token;
      
    } catch (error) {
      this.logger.error("AuthService", "Failed to get auth token", error);
      
      if (globalThis.logManager) {
        globalThis.logManager.error(`認証エラー: ${error.message}`, {
          message: error.message,
          interactive: interactive,
          hint: this.getErrorHint(error.message)
        });
      }
      
      throw error;
    }
  }

  /**
   * 従来のgetAuthToken実装（manifest.jsonにoauth2設定がある場合）
   */
  async getAuthTokenLegacy(interactive = true) {
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
    // 保存されたトークンをクリア
    this.token = null;
    this.tokenExpiry = null;
    
    // manifest.jsonにoauth2設定がある場合は従来の方法も実行
    const manifest = chrome.runtime.getManifest();
    if (manifest.oauth2 && manifest.oauth2.client_id) {
      return new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({}, () => {
          resolve();
        });
      });
    }
    
    return Promise.resolve();
  }
}

// グローバルスコープに追加
self.AuthService = AuthService;

// シングルトンインスタンスを作成してグローバルに公開
if (typeof globalThis !== "undefined") {
  globalThis.authService = new AuthService();
}
