/**
 * @fileoverview Dropbox API サービス
 * ファイルのアップロード、フォルダ管理、認証を担当
 */

import { dropboxConfig } from '../config/dropbox-config.js';

export class DropboxService {
  constructor() {
    this.config = dropboxConfig;
    this.isInitialized = false;
  }

  /**
   * サービスを初期化
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      await this.config.loadClientId();
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[DropboxService] 初期化エラー:', error);
      return false;
    }
  }

  /**
   * OAuth2認証を開始（PKCE対応）
   * @returns {Promise<Object>}
   */
  async authenticate() {
    try {
      if (!this.config.config.clientId) {
        throw new Error('Client IDが設定されていません。設定画面から設定してください。');
      }

      // Chrome Identity APIを使用して認証
      if (typeof chrome !== 'undefined' && chrome.identity) {
        // PKCEコードを生成
        const { codeVerifier, codeChallenge } = await this.config.generatePKCE();

        // コードベリファイアを一時保存
        await chrome.storage.local.set({ dropbox_code_verifier: codeVerifier });

        const authUrl = this.config.getAuthUrl(codeChallenge);

        return new Promise((resolve, reject) => {
          chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
          }, async (redirectUrl) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            try {
              // 認証コードを抽出
              const url = new URL(redirectUrl);
              const authCode = url.searchParams.get('code');

              if (!authCode) {
                throw new Error('認証コードが取得できませんでした');
              }

              // アクセストークンを取得（PKCE）
              const tokenData = await this.exchangeCodeForTokenPKCE(authCode, codeVerifier);

              // トークンを保存
              await this.config.saveTokens(tokenData.access_token, tokenData.refresh_token);

              // コードベリファイアを削除
              await chrome.storage.local.remove(['dropbox_code_verifier']);

              resolve({
                success: true,
                message: 'Dropbox認証が完了しました'
              });
            } catch (error) {
              reject(error);
            }
          });
        });
      } else {
        throw new Error('Chrome Identity APIが利用できません');
      }
    } catch (error) {
      console.error('[DropboxService] 認証エラー:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 認証コードをアクセストークンに交換（PKCE対応）
   * @param {string} authCode
   * @param {string} codeVerifier
   * @returns {Promise<Object>}
   */
  async exchangeCodeForTokenPKCE(authCode, codeVerifier) {
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: authCode,
        grant_type: 'authorization_code',
        client_id: this.config.config.clientId,
        redirect_uri: this.config.config.redirectUri,
        code_verifier: codeVerifier
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`トークン取得エラー: ${error}`);
    }

    return await response.json();
  }

  /**
   * 認証コードをアクセストークンに交換（旧方式・互換性用）
   * @param {string} authCode
   * @returns {Promise<Object>}
   */
  async exchangeCodeForToken(authCode) {
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: authCode,
        grant_type: 'authorization_code',
        client_id: this.config.config.clientId,
        redirect_uri: this.config.config.redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`トークン取得エラー: ${error}`);
    }

    return await response.json();
  }

  /**
   * ファイルをDropboxにアップロード
   * @param {string} filePath - Dropbox上のファイルパス
   * @param {string} content - ファイル内容
   * @param {Object} options - アップロードオプション
   * @returns {Promise<Object>}
   */
  async uploadFile(filePath, content, options = {}) {
    try {
      const accessToken = await this.config.getAccessToken();
      if (!accessToken) {
        throw new Error('認証が必要です。先にDropbox認証を完了してください。');
      }

      // ファイルサイズをチェック（150MB以下は通常アップロード）
      const fileSize = new Blob([content]).size;
      const isLargeFile = fileSize > 150 * 1024 * 1024;

      if (isLargeFile) {
        return await this.uploadLargeFile(filePath, content, accessToken, options);
      } else {
        return await this.uploadSmallFile(filePath, content, accessToken, options);
      }
    } catch (error) {
      console.error('[DropboxService] ファイルアップロードエラー:', error);
      throw error;
    }
  }

  /**
   * 小さいファイル（150MB以下）をアップロード
   * @param {string} filePath
   * @param {string} content
   * @param {string} accessToken
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async uploadSmallFile(filePath, content, accessToken, options = {}) {
    const uploadSettings = await this.config.getUploadSettings();
    const fullPath = `${uploadSettings.uploadPath}${filePath}`;

    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: fullPath,
          mode: options.overwrite ? 'overwrite' : 'add',
          autorename: !options.overwrite,
          mute: false,
          strict_conflict: false
        })
      },
      body: content
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`アップロードエラー: ${error}`);
    }

    const result = await response.json();
    return {
      success: true,
      filePath: result.path_display,
      size: result.size,
      serverModified: result.server_modified
    };
  }

  /**
   * 大きいファイル（150MB以上）をチャンクアップロード
   * @param {string} filePath
   * @param {string} content
   * @param {string} accessToken
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async uploadLargeFile(filePath, content, accessToken, options = {}) {
    const uploadSettings = await this.config.getUploadSettings();
    const fullPath = `${uploadSettings.uploadPath}${filePath}`;
    const fileData = new TextEncoder().encode(content);
    const chunkSize = this.config.config.chunkSize;

    try {
      // セッション開始
      const sessionStartResponse = await fetch('https://content.dropboxapi.com/2/files/upload_session/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            close: false
          })
        },
        body: fileData.slice(0, chunkSize)
      });

      if (!sessionStartResponse.ok) {
        throw new Error('セッション開始に失敗しました');
      }

      const sessionData = await sessionStartResponse.json();
      const sessionId = sessionData.session_id;
      let offset = chunkSize;

      // 残りのチャンクをアップロード
      while (offset < fileData.length) {
        const chunkEnd = Math.min(offset + chunkSize, fileData.length);
        const chunk = fileData.slice(offset, chunkEnd);
        const isLastChunk = chunkEnd === fileData.length;

        if (isLastChunk) {
          // 最後のチャンク - ファイナライズ
          const finishResponse = await fetch('https://content.dropboxapi.com/2/files/upload_session/finish', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
              'Dropbox-API-Arg': JSON.stringify({
                cursor: {
                  session_id: sessionId,
                  offset: offset
                },
                commit: {
                  path: fullPath,
                  mode: options.overwrite ? 'overwrite' : 'add',
                  autorename: !options.overwrite,
                  mute: false
                }
              })
            },
            body: chunk
          });

          if (!finishResponse.ok) {
            throw new Error('ファイナライズに失敗しました');
          }

          const result = await finishResponse.json();
          return {
            success: true,
            filePath: result.path_display,
            size: result.size,
            serverModified: result.server_modified
          };
        } else {
          // 中間チャンク
          const appendResponse = await fetch('https://content.dropboxapi.com/2/files/upload_session/append_v2', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
              'Dropbox-API-Arg': JSON.stringify({
                cursor: {
                  session_id: sessionId,
                  offset: offset
                },
                close: false
              })
            },
            body: chunk
          });

          if (!appendResponse.ok) {
            throw new Error(`チャンクアップロードに失敗しました (offset: ${offset})`);
          }
        }

        offset = chunkEnd;

        // 進捗通知（オプション）
        if (options.onProgress) {
          const progress = Math.round((offset / fileData.length) * 100);
          options.onProgress(progress);
        }
      }
    } catch (error) {
      console.error('[DropboxService] 大容量ファイルアップロードエラー:', error);
      throw error;
    }
  }

  /**
   * フォルダを作成
   * @param {string} folderPath
   * @returns {Promise<Object>}
   */
  async createFolder(folderPath) {
    try {
      const accessToken = await this.config.getAccessToken();
      if (!accessToken) {
        throw new Error('認証が必要です');
      }

      const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: folderPath,
          autorename: false
        })
      });

      if (!response.ok) {
        const error = await response.json();
        // フォルダが既に存在する場合はエラーとしない
        if (error.error_summary?.includes('path/conflict/folder')) {
          return {
            success: true,
            message: 'フォルダは既に存在します',
            path: folderPath
          };
        }
        throw new Error(`フォルダ作成エラー: ${error.error_summary}`);
      }

      const result = await response.json();
      return {
        success: true,
        path: result.metadata.path_display,
        message: 'フォルダを作成しました'
      };
    } catch (error) {
      console.error('[DropboxService] フォルダ作成エラー:', error);
      throw error;
    }
  }

  /**
   * ファイル・フォルダの一覧を取得
   * @param {string} folderPath
   * @returns {Promise<Array>}
   */
  async listFiles(folderPath = '') {
    try {
      const accessToken = await this.config.getAccessToken();
      if (!accessToken) {
        throw new Error('認証が必要です');
      }

      const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: folderPath,
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`ファイル一覧取得エラー: ${error.error_summary}`);
      }

      const result = await response.json();

      // デバッグ：レスポンス構造を確認
      console.log('[DropboxService] APIレスポンス構造:', {
        entriesCount: result.entries ? result.entries.length : 0,
        hasMore: result.has_more,
        cursor: result.cursor ? 'あり' : 'なし',
        rawKeys: Object.keys(result)
      });

      // ページネーション対応：has_moreがtrueの場合、追加のファイルを取得
      let allEntries = result.entries || [];
      let hasMore = result.has_more;
      let cursor = result.cursor;

      // 追加ページがある場合は全て取得
      while (hasMore && cursor) {
        console.log('[DropboxService] 追加ファイル取得中...');

        const continueResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            cursor: cursor
          })
        });

        if (!continueResponse.ok) {
          const error = await continueResponse.json();
          console.error('[DropboxService] 追加ページ取得エラー:', error);
          break; // エラー時は取得を中止
        }

        const continueResult = await continueResponse.json();
        console.log('[DropboxService] 追加ページ取得:', {
          additionalCount: continueResult.entries ? continueResult.entries.length : 0,
          hasMore: continueResult.has_more
        });

        allEntries = allEntries.concat(continueResult.entries || []);
        hasMore = continueResult.has_more;
        cursor = continueResult.cursor;
      }

      console.log('[DropboxService] 最終取得ファイル数:', allEntries.length);

      return allEntries.map(entry => ({
        name: entry.name,
        path: entry.path_display,
        type: entry['.tag'], // file または folder
        size: entry.size || 0,
        modified: entry.server_modified || entry.client_modified
      }));
    } catch (error) {
      console.error('[DropboxService] ファイル一覧取得エラー:', error);
      throw error;
    }
  }

  /**
   * ファイルを削除
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async deleteFile(filePath) {
    try {
      const accessToken = await this.config.getAccessToken();
      if (!accessToken) {
        throw new Error('認証が必要です');
      }

      const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: filePath
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`ファイル削除エラー: ${error.error_summary}`);
      }

      return {
        success: true,
        message: 'ファイルを削除しました'
      };
    } catch (error) {
      console.error('[DropboxService] ファイル削除エラー:', error);
      throw error;
    }
  }

  /**
   * 認証状態をチェック
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    return await this.config.isAuthenticated();
  }

  /**
   * ユーザー情報を取得
   * @returns {Promise<Object>}
   */
  async getUserInfo() {
    try {
      const accessToken = await this.config.getAccessToken();
      if (!accessToken) {
        throw new Error('認証が必要です');
      }

      const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
          // Content-Typeも不要、bodyも不要
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DropboxService] API応答エラー:', response.status, errorText);

        if (response.status === 401) {
          throw new Error('認証トークンが無効です。再認証が必要です。');
        } else {
          throw new Error(`ユーザー情報取得に失敗しました (${response.status}): ${errorText}`);
        }
      }

      const userInfo = await response.json();
      return {
        name: userInfo.name.display_name,
        email: userInfo.email,
        accountId: userInfo.account_id,
        country: userInfo.country
      };
    } catch (error) {
      console.error('[DropboxService] ユーザー情報取得エラー:', error);
      throw error;
    }
  }

  /**
   * ログアウト（トークンをクリア）
   * @returns {Promise<boolean>}
   */
  async logout() {
    try {
      await this.config.clearTokens();
      return true;
    } catch (error) {
      console.error('[DropboxService] ログアウトエラー:', error);
      return false;
    }
  }
}

// グローバルインスタンス
export const dropboxService = new DropboxService();