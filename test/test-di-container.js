/**
 * DIコンテナのテストファイル
 *
 * 実行方法:
 * node test-di-container.js
 */

import { getGlobalContainer, debugContainer } from '../src/core/service-registry.js';

async function testDIContainer() {
  console.log('========================================');
  console.log('DIコンテナテスト開始');
  console.log('========================================\n');

  try {
    // 1. コンテナを取得
    console.log('1. DIコンテナを取得...');
    const container = await getGlobalContainer();
    console.log('✅ DIコンテナ取得成功\n');

    // 2. 登録済みサービスを確認
    console.log('2. 登録済みサービス:');
    const services = container.getRegisteredServices();
    services.forEach(service => {
      console.log(`  - ${service}`);
    });
    console.log('');

    // 3. 各サービスの取得テスト
    console.log('3. サービス取得テスト:');

    // AuthService
    try {
      const authService = await container.get('authService');
      console.log('  ✅ authService: 取得成功', typeof authService);
    } catch (e) {
      console.log('  ❌ authService: 取得失敗', e.message);
    }

    // SheetsClient
    try {
      const sheetsClient = await container.get('sheetsClient');
      console.log('  ✅ sheetsClient: 取得成功', typeof sheetsClient);
    } catch (e) {
      console.log('  ❌ sheetsClient: 取得失敗', e.message);
    }

    // SpreadsheetLogger
    try {
      const logger = await container.get('spreadsheetLogger');
      console.log('  ✅ spreadsheetLogger: 取得成功', typeof logger);
    } catch (e) {
      console.log('  ❌ spreadsheetLogger: 取得失敗', e.message);
    }

    // TaskProcessor
    try {
      const processor = await container.get('taskProcessor');
      console.log('  ✅ taskProcessor: 取得成功', typeof processor);
    } catch (e) {
      console.log('  ❌ taskProcessor: 取得失敗', e.message);
    }

    console.log('\n4. グローバル変数の確認:');
    console.log('  globalThis.authService:', !!globalThis.authService);
    console.log('  globalThis.sheetsClient:', !!globalThis.sheetsClient);
    console.log('  globalThis.spreadsheetLogger:', !!globalThis.spreadsheetLogger);

    console.log('\n5. デバッグ情報:');
    await debugContainer();

    console.log('\n========================================');
    console.log('✅ テスト完了');
    console.log('========================================');

  } catch (error) {
    console.error('❌ テストエラー:', error);
    process.exit(1);
  }
}

// ブラウザ環境変数をモック
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

// loggerをモック
if (typeof globalThis.logger === 'undefined') {
  globalThis.logger = console;
}

// Chrome拡張機能の環境をシミュレート
if (typeof globalThis.chrome === 'undefined') {
  globalThis.chrome = {
    runtime: {
      lastError: null
    },
    identity: {
      getAuthToken: (options, callback) => {
        // モックトークンを返す
        callback('mock-auth-token');
      },
      removeCachedAuthToken: (options, callback) => {
        callback();
      }
    }
  };
}

// テスト実行
testDIContainer().catch(console.error);