/**
 * Jest設定ファイル
 */

export default {
  // ESモジュール対応
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.js'],
  transform: {},
  
  // テストファイルのパターン
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.spec.js'
  ],
  
  // カバレッジ対象
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js'
  ],
  
  // カバレッジレポート
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // グローバル設定
  globals: {
    chrome: {
      runtime: { lastError: null },
      identity: {
        getAuthToken: jest.fn(),
        removeCachedAuthToken: jest.fn()
      }
    }
  },
  
  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  
  // タイムアウト
  testTimeout: 10000,
  
  // 詳細なエラー情報
  verbose: true
};