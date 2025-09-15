/**
 * Jest設定ファイル
 */

export default {
  // テスト環境
  testEnvironment: 'node',

  // ESモジュールサポート
  extensionsToTreatAsEsm: ['.js'],
  transform: {},

  // テストファイルパターン
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],

  // カバレッジ設定
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/__tests__/**',
    '!**/node_modules/**',
    '!**/vendor/**'
  ],

  // カバレッジレポート
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],

  // カバレッジ閾値
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // モジュール解決
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },

  // セットアップファイル
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.js'
  ],

  // グローバル設定
  globals: {
    __DEV__: true
  },

  // タイムアウト設定
  testTimeout: 30000,

  // 詳細出力
  verbose: true,

  // ウォッチモード除外
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],

  // クリアモック
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};