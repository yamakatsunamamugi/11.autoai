/**
 * @fileoverview サービスのユニットテスト
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// モック設定
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    getManifest: jest.fn(() => ({ version: '1.0.0' }))
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      getBytesInUse: jest.fn(),
      QUOTA_BYTES: 5242880
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      getBytesInUse: jest.fn(),
      QUOTA_BYTES: 102400
    }
  },
  identity: {
    getAuthToken: jest.fn()
  }
};

global.fetch = jest.fn();
global.performance = {
  now: jest.fn(() => Date.now()),
  memory: {
    usedJSHeapSize: 1000000,
    jsHeapSizeLimit: 10000000
  }
};

describe('AuthService', () => {
  let AuthService;
  let authService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await import('../../src/services/auth-service.js');
    AuthService = module.default;
    authService = new AuthService();
  });

  test('認証トークンを取得できる', async () => {
    const mockToken = 'test-token-123';
    chrome.identity.getAuthToken.mockResolvedValue(mockToken);

    const token = await authService.getAuthToken();

    expect(token).toBe(mockToken);
    expect(chrome.identity.getAuthToken).toHaveBeenCalledWith({ interactive: true });
  });

  test('キャッシュされたトークンを返す', async () => {
    const mockToken = 'cached-token-456';
    chrome.identity.getAuthToken.mockResolvedValue(mockToken);

    // 初回取得
    const token1 = await authService.getAuthToken();
    // 2回目（キャッシュから）
    const token2 = await authService.getAuthToken();

    expect(token1).toBe(mockToken);
    expect(token2).toBe(mockToken);
    expect(chrome.identity.getAuthToken).toHaveBeenCalledTimes(1);
  });

  test('トークンエラーを適切に処理する', async () => {
    const error = new Error('Authentication failed');
    chrome.identity.getAuthToken.mockRejectedValue(error);

    await expect(authService.getAuthToken()).rejects.toThrow('Authentication failed');
  });

  test('トークンをリフレッシュできる', async () => {
    const oldToken = 'old-token';
    const newToken = 'new-token';

    chrome.identity.getAuthToken
      .mockResolvedValueOnce(oldToken)
      .mockResolvedValueOnce(newToken);

    // 初回取得
    await authService.getAuthToken();
    // リフレッシュ
    await authService.refreshToken();
    // 新しいトークンを取得
    const token = await authService.getAuthToken();

    expect(token).toBe(newToken);
  });
});

describe('SheetsClient', () => {
  let SheetsClient;
  let sheetsClient;
  let mockAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // AuthServiceのモック
    mockAuthService = {
      getAuthToken: jest.fn().mockResolvedValue('test-token')
    };

    const module = await import('../../src/features/spreadsheet/sheets-client.js');
    SheetsClient = module.default;
    sheetsClient = new SheetsClient({ authService: mockAuthService });
  });

  test('スプレッドシートデータを取得できる', async () => {
    const mockData = {
      values: [
        ['Header1', 'Header2'],
        ['Value1', 'Value2']
      ]
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    });

    const result = await sheetsClient.getSpreadsheetData('sheet123', 'A1:B2');

    expect(result).toEqual(mockData);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('sheet123'),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token'
        }
      })
    );
  });

  test('セルに値を書き込める', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ updatedCells: 1 })
    });

    const result = await sheetsClient.writeToCell('sheet123', 'A1', 'New Value');

    expect(result.updatedCells).toBe(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('sheet123'),
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('New Value')
      })
    );
  });

  test('APIエラーを適切に処理する', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: { message: 'Permission denied' }
      })
    });

    await expect(
      sheetsClient.getSpreadsheetData('sheet123', 'A1:B2')
    ).rejects.toThrow('Permission denied');
  });

  test('バッチ更新ができる', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ totalUpdatedCells: 3 })
    });

    const updates = [
      { range: 'A1', values: [['Value1']] },
      { range: 'B1', values: [['Value2']] },
      { range: 'C1', values: [['Value3']] }
    ];

    const result = await sheetsClient.batchUpdate('sheet123', updates);

    expect(result.totalUpdatedCells).toBe(3);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('batchUpdate'),
      expect.objectContaining({
        method: 'POST'
      })
    );
  });
});

describe('ErrorRecoverySystem', () => {
  let ErrorRecoveryStrategy;
  let errorRecovery;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await import('../../src/core/error-recovery.js');
    ErrorRecoveryStrategy = module.ErrorRecoveryStrategy;
    errorRecovery = new ErrorRecoveryStrategy();
  });

  test('ネットワークエラーからリカバリーできる', async () => {
    const networkError = new Error('Network failed');
    networkError.name = 'NetworkError';

    let attemptCount = 0;
    const operation = jest.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 2) {
        throw networkError;
      }
      return 'success';
    });

    const result = await errorRecovery.recover(
      networkError,
      'network',
      { operation }
    );

    expect(attemptCount).toBe(2);
  });

  test('最大リトライ回数を超えるとエラーをスローする', async () => {
    const persistentError = new Error('Persistent error');

    const operation = jest.fn().mockRejectedValue(persistentError);

    await expect(
      errorRecovery.recover(persistentError, 'network', { operation })
    ).rejects.toThrow('Persistent error');
  });

  test('エラー履歴が記録される', () => {
    const error1 = new Error('Error 1');
    const error2 = new Error('Error 2');

    errorRecovery.recordError(error1, 'network');
    errorRecovery.recordError(error2, 'auth');

    const stats = errorRecovery.getErrorStatistics();

    expect(stats.total).toBe(2);
    expect(stats.byType.network).toBe(1);
    expect(stats.byType.auth).toBe(1);
  });

  test('クリティカルエラーが通知される', () => {
    const criticalError = new Error('Critical failure');
    chrome.runtime.sendMessage.mockResolvedValue({});

    errorRecovery.recordError(criticalError, 'permission');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CRITICAL_ERROR'
      })
    );
  });
});

describe('EnhancedLogger', () => {
  let EnhancedLogger;
  let logger;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    const module = await import('../../src/core/enhanced-logger.js');
    EnhancedLogger = module.EnhancedLogger;
    logger = new EnhancedLogger({ enableConsole: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('各レベルのログを出力できる', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message', new Error('Test error'));

    expect(console.log).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  test('ログレベルフィルタリングが機能する', () => {
    logger.setLevel(2); // WARN以上

    logger.debug('Debug'); // 出力されない
    logger.info('Info');   // 出力されない
    logger.warn('Warning'); // 出力される

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });

  test('パフォーマンス計測ができる', async () => {
    logger.startPerformance('test-operation');

    // 処理をシミュレート
    await new Promise(resolve => setTimeout(resolve, 100));

    const duration = logger.endPerformance('test-operation');

    expect(duration).toBeGreaterThanOrEqual(100);
    expect(duration).toBeLessThan(200);
  });

  test('ログを検索できる', () => {
    logger.info('Message 1', {}, 'system');
    logger.warn('Message 2', {}, 'auth');
    logger.error('Message 3', null, {}, 'network');

    const authLogs = logger.search({ category: 'auth' });
    const errorLogs = logger.search({ level: 3 });

    expect(authLogs).toHaveLength(1);
    expect(errorLogs).toHaveLength(1);
  });

  test('統計情報を取得できる', () => {
    logger.info('Info 1');
    logger.info('Info 2');
    logger.warn('Warning');
    logger.error('Error');

    const stats = logger.getStatistics();

    expect(stats.total).toBe(4);
    expect(stats.byLevel.INFO).toBe(2);
    expect(stats.byLevel.WARN).toBe(1);
    expect(stats.byLevel.ERROR).toBe(1);
  });
});

describe('SystemMonitor', () => {
  let SystemMetrics;
  let monitor;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module = await import('../../src/monitoring/system-monitor.js');
    SystemMetrics = module.SystemMetrics;
    monitor = new SystemMetrics();
  });

  afterEach(() => {
    jest.useRealTimers();
    monitor.stop();
  });

  test('メトリクスを収集できる', async () => {
    chrome.storage.local.getBytesInUse.mockResolvedValue(1000000);
    chrome.storage.sync.getBytesInUse.mockResolvedValue(50000);

    monitor.start();
    await monitor.collect();

    const metrics = monitor.getCurrentMetrics();

    expect(metrics.storage.local.used).toBe(1000000);
    expect(metrics.storage.sync.used).toBe(50000);
  });

  test('健全性スコアを計算できる', () => {
    monitor.metrics.memory.percentage = 60;
    monitor.metrics.network.requests = 100;
    monitor.metrics.network.failures = 5;

    const score = monitor.calculateHealthScore();

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('閾値超過時にアラートが発生する', () => {
    monitor.metrics.memory.percentage = 96; // Critical threshold

    monitor.checkThresholds();

    expect(monitor.alerts).toHaveLength(1);
    expect(monitor.alerts[0].level).toBe('critical');
  });

  test('メモリリークを検出できる', () => {
    // 10回連続で増加するメモリ使用量をシミュレート
    for (let i = 1; i <= 11; i++) {
      monitor.metrics.memory.used = i * 1000000;
      monitor.updateHistory();
    }

    monitor.analyze();

    const alerts = monitor.alerts.filter(a =>
      a.message.includes('メモリリーク')
    );

    expect(alerts).toHaveLength(1);
  });

  test('推奨事項を生成できる', () => {
    monitor.metrics.memory.percentage = 75;
    monitor.metrics.storage.local.used = 4000000;
    monitor.metrics.storage.local.quota = 5242880;

    const recommendations = monitor.getRecommendations();

    expect(recommendations).toContainEqual(
      expect.objectContaining({
        type: 'memory',
        priority: 'high'
      })
    );

    expect(recommendations).toContainEqual(
      expect.objectContaining({
        type: 'storage',
        priority: 'medium'
      })
    );
  });
});