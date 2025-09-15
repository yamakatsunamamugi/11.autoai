/**
 * AuthServiceのユニットテスト
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { getAuthService } from '../../src/services/auth-service.js';

describe('AuthService', () => {
  let authService;

  beforeEach(() => {
    // Chrome APIのモックをリセット
    globalThis.chrome = {
      identity: {
        getAuthToken: jest.fn(),
        removeCachedAuthToken: jest.fn()
      },
      runtime: {
        lastError: null
      }
    };
    
    // 新しいインスタンスを取得
    authService = getAuthService();
  });

  describe('getAuthToken', () => {
    test('トークンを取得できる', async () => {
      const mockToken = 'test-token-123';
      chrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      const token = await authService.getAuthToken();
      
      expect(token).toBe(mockToken);
      expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: true },
        expect.any(Function)
      );
    });

    test('トークンがキャッシュされる', async () => {
      const mockToken = 'cached-token-456';
      chrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      // 初回取得
      const token1 = await authService.getAuthToken();
      // 2回目取得（キャッシュから）
      const token2 = await authService.getAuthToken();
      
      expect(token1).toBe(mockToken);
      expect(token2).toBe(mockToken);
      // Chrome APIは1回だけ呼ばれる
      expect(chrome.identity.getAuthToken).toHaveBeenCalledTimes(1);
    });

    test('エラー時にキャッシュをクリアしてリトライ', async () => {
      let callCount = 0;
      chrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callCount++;
        if (callCount === 1) {
          chrome.runtime.lastError = { message: 'Auth error' };
          callback(null);
        } else {
          chrome.runtime.lastError = null;
          callback('retry-token');
        }
      });

      chrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });

      const token = await authService.getAuthToken();
      
      expect(token).toBe('retry-token');
      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalled();
      expect(chrome.identity.getAuthToken).toHaveBeenCalledTimes(2);
    });

    test('最大リトライ回数を超えるとエラー', async () => {
      chrome.identity.getAuthToken.mockImplementation((options, callback) => {
        chrome.runtime.lastError = { message: 'Persistent error' };
        callback(null);
      });

      chrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });

      await expect(authService.getAuthToken()).rejects.toThrow(
        '認証トークンの取得に失敗しました'
      );
      
      // 3回リトライ
      expect(chrome.identity.getAuthToken).toHaveBeenCalledTimes(3);
    });
  });

  describe('refreshToken', () => {
    test('トークンをリフレッシュできる', async () => {
      const oldToken = 'old-token';
      const newToken = 'new-token';
      
      // 初回取得
      chrome.identity.getAuthToken.mockImplementationOnce((options, callback) => {
        callback(oldToken);
      });
      await authService.getAuthToken();
      
      // リフレッシュ
      chrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });
      chrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(newToken);
      });
      
      const refreshedToken = await authService.refreshToken();
      
      expect(refreshedToken).toBe(newToken);
      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: oldToken },
        expect.any(Function)
      );
    });
  });

  describe('clearToken', () => {
    test('トークンをクリアできる', async () => {
      const token = 'token-to-clear';
      
      // トークンを取得
      chrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(token);
      });
      await authService.getAuthToken();
      
      // クリア
      chrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });
      
      await authService.clearToken();
      
      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: token },
        expect.any(Function)
      );
      // キャッシュがクリアされていることを確認
      expect(authService.cachedToken).toBeNull();
    });
  });
});