/**
 * Jestセットアップファイル
 * テスト実行前の共通初期化処理
 */

// グローバル変数のモック
globalThis.self = globalThis;
globalThis.window = globalThis;

// loggerのモック
globalThis.logger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Chrome APIのモック
globalThis.chrome = {
  runtime: {
    lastError: null,
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  identity: {
    getAuthToken: jest.fn((options, callback) => {
      callback('mock-auth-token');
    }),
    removeCachedAuthToken: jest.fn((options, callback) => {
      callback();
    })
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    },
    sync: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
};

// コンソールメソッドのスパイ
global.console = {
  ...console,
  log: jest.fn(console.log),
  error: jest.fn(console.error),
  warn: jest.fn(console.warn),
  info: jest.fn(console.info),
  debug: jest.fn(console.debug),
  group: jest.fn(),
  groupEnd: jest.fn()
};

// テストユーティリティ
export const resetMocks = () => {
  jest.clearAllMocks();
};

export const mockFetch = (response) => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response))
    })
  );
};

// テスト後のクリーンアップ
afterEach(() => {
  resetMocks();
});