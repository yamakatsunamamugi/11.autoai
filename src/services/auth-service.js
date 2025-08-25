/**
 * @fileoverview Authentication Service
 * OAuth2認証処理を管理するサービス（複数拡張機能ID対応）
 */

class AuthService {
  constructor() {
    this.logger = typeof logger !== "undefined" ? logger : console;
    
    // 拡張機能IDごとのクライアントIDマッピング
    // 両方のパソコンで同じウェブアプリケーションタイプのクライアントIDを使用
    this.CLIENT_ID_MAPPING = {
      // 1台目のパソコン
      'bbbfjffpkfleplpoabeehglgikblfkip': '262291163420-02ohr4mn3i3tngukpj11ed5pdqn0frjg.apps.googleusercontent.com',
      // 2台目のパソコン
      'fphilbjcpglgablmlkffchdphbndehlg': '262291163420-02ohr4mn3i3tngukpj11ed5pdqn0frjg.apps.googleusercontent.com'
    };
  }

  /**
   * 現在の拡張機能IDに対応するクライアントIDを取得
   */
  getClientIdForCurrentExtension() {
    const extensionId = chrome.runtime.id;
    const clientId = this.CLIENT_ID_MAPPING[extensionId];
    
    if (!clientId) {
      // マッピングにない場合はmanifest.jsonの設定を使用
      this.logger.warn(`No client ID mapping for extension ${extensionId}, using manifest.json oauth2 config`);
      return null;
    }
    
    this.logger.log(`Using client ID for extension ${extensionId}`);
    return clientId;
  }

  /**
   * OAuth2認証トークンを取得
   * @param {boolean} interactive - ユーザー操作を許可するか
   */
  async getAuthToken(interactive = true) {
    try {
      // 拡張機能IDに対応するクライアントIDを取得
      const clientId = this.getClientIdForCurrentExtension();
      if (!clientId) {
        throw new Error(`未登録の拡張機能ID: ${chrome.runtime.id}`);
      }
      
      // OAuth2認証URLを構築
      const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('response_type', 'token');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents', 
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/userinfo.email'
      ].join(' '));
      
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
      
      if (!token) {
        throw new Error('トークンの取得に失敗しました');
      }
      
      this.logger.log("AuthService", "Auth token obtained successfully");
      return token;
      
    } catch (error) {
      this.logger.error("AuthService", "Failed to get auth token", error);
      
      // エラーの詳細情報をログに記録
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
