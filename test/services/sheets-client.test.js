/**
 * SheetsClientのユニットテスト
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

describe('SheetsClient', () => {
  let SheetsClient;
  let sheetsClient;
  let mockAuthService;

  beforeEach(async () => {
    // モジュールをインポート
    const module = await import('../../src/features/spreadsheet/sheets-client.js');
    SheetsClient = module.default;
    
    // モックAuthService
    mockAuthService = {
      getAuthToken: jest.fn().mockResolvedValue('mock-token')
    };
    
    // SheetsClientインスタンスを作成
    sheetsClient = new SheetsClient({
      authService: mockAuthService
    });
    
    // fetchをモック
    global.fetch = jest.fn();
  });

  describe('constructor', () => {
    test('依存性を受け取る', () => {
      expect(sheetsClient.authService).toBe(mockAuthService);
      expect(sheetsClient.baseUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets');
    });

    test('クォータ管理が初期化される', () => {
      expect(sheetsClient.quotaManager).toBeDefined();
      expect(sheetsClient.quotaManager.minInterval).toBe(100);
      expect(sheetsClient.quotaManager.maxInterval).toBe(5000);
    });
  });

  describe('getAuthToken', () => {
    test('注入されたauthServiceからトークンを取得', async () => {
      const token = await sheetsClient.getAuthToken();
      
      expect(token).toBe('mock-token');
      expect(mockAuthService.getAuthToken).toHaveBeenCalled();
    });

    test('authServiceがない場合はglobalThisにフォールバック', async () => {
      const clientWithoutAuth = new SheetsClient({});
      globalThis.authService = {
        getAuthToken: jest.fn().mockResolvedValue('global-token')
      };
      
      const token = await clientWithoutAuth.getAuthToken();
      
      expect(token).toBe('global-token');
      expect(globalThis.authService.getAuthToken).toHaveBeenCalled();
      
      // クリーンアップ
      delete globalThis.authService;
    });

    test('どちらもない場合はエラー', async () => {
      const clientWithoutAuth = new SheetsClient({});
      
      await expect(clientWithoutAuth.getAuthToken())
        .rejects.toThrow('AuthService not available');
    });
  });

  describe('getSheetData', () => {
    test('シートデータを取得できる', async () => {
      const mockData = {
        values: [
          ['A1', 'B1'],
          ['A2', 'B2']
        ]
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });
      
      const result = await sheetsClient.getSheetData('spreadsheet-id', 'A1:B2');
      
      expect(result).toEqual(mockData.values);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('spreadsheet-id'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token'
          })
        })
      );
    });

    test('APIエラーを処理できる', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: 'API Error' }
        })
      });
      
      await expect(sheetsClient.getSheetData('spreadsheet-id', 'A1:B2'))
        .rejects.toThrow('Sheets API error');
    });
  });

  describe('updateCell', () => {
    test('セルを更新できる', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ updatedCells: 1 })
      });
      
      await sheetsClient.updateCell('spreadsheet-id', 'A1', 'New Value');
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('spreadsheet-id'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('New Value')
        })
      );
    });

    test('空文字列をセットできる', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ clearedCells: 1 })
      });
      
      await sheetsClient.updateCell('spreadsheet-id', 'A1', '');
      
      // 空文字列の場合はclear APIが使われる
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('clear'),
        expect.any(Object)
      );
    });
  });

  describe('parseSpreadsheetUrl', () => {
    test('URLからspreadsheetIdとgidを抽出できる', () => {
      const url = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=456';
      const result = SheetsClient.parseSpreadsheetUrl(url);
      
      expect(result).toEqual({
        spreadsheetId: 'abc123',
        gid: '456'
      });
    });

    test('gidがない場合は0を返す', () => {
      const url = 'https://docs.google.com/spreadsheets/d/xyz789/edit';
      const result = SheetsClient.parseSpreadsheetUrl(url);
      
      expect(result).toEqual({
        spreadsheetId: 'xyz789',
        gid: '0'
      });
    });

    test('無効なURLはnullを返す', () => {
      const url = 'https://example.com';
      const result = SheetsClient.parseSpreadsheetUrl(url);
      
      expect(result).toEqual({
        spreadsheetId: null,
        gid: '0'
      });
    });
  });

  describe('columnToIndex / indexToColumn', () => {
    test('列名をインデックスに変換', () => {
      expect(sheetsClient.columnToIndex('A')).toBe(0);
      expect(sheetsClient.columnToIndex('B')).toBe(1);
      expect(sheetsClient.columnToIndex('Z')).toBe(25);
      expect(sheetsClient.columnToIndex('AA')).toBe(26);
      expect(sheetsClient.columnToIndex('AB')).toBe(27);
    });

    test('インデックスを列名に変換', () => {
      expect(sheetsClient.indexToColumn(0)).toBe('A');
      expect(sheetsClient.indexToColumn(1)).toBe('B');
      expect(sheetsClient.indexToColumn(25)).toBe('Z');
      expect(sheetsClient.indexToColumn(26)).toBe('AA');
      expect(sheetsClient.indexToColumn(27)).toBe('AB');
    });
  });
});