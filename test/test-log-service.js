/**
 * LogServiceのテスト
 *
 * 実行方法:
 * node test/test-log-service.js
 */

import { getGlobalContainer } from '../src/core/service-registry.js';
import { LogService, ConsoleLogger, SpreadsheetLoggerAdapter } from '../src/core/log-service.js';

async function testLogService() {
  console.log('========================================');
  console.log('LogServiceテスト開始');
  console.log('========================================\n');

  try {
    // 1. 直接LogServiceをテスト
    console.log('1. LogServiceの直接テスト:');
    const logService = new LogService({ logLevel: 'debug' });
    
    logService.debug('デバッグメッセージ');
    logService.info('情報メッセージ');
    logService.warn('警告メッセージ');
    logService.error('エラーメッセージ');
    
    console.log('\n2. グループログテスト:');
    logService.group('グループテスト');
    logService.info('グループ内メッセージ');
    logService.groupEnd();
    
    console.log('\n3. オブジェクトログテスト:');
    logService.info('オブジェクト:', { key: 'value', nested: { data: 123 } });
    
    console.log('\n4. ログレベル変更テスト:');
    logService.setLogLevel('warn');
    logService.debug('これは表示されない');
    logService.info('これも表示されない');
    logService.warn('これは表示される');
    logService.error('これも表示される');
    
    // 5. DIコンテナから取得
    console.log('\n5. DIコンテナからLogServiceを取得:');
    const container = await getGlobalContainer();
    const containerLogService = await container.get('logService');
    console.log('  ✅ LogService取得成功:', typeof containerLogService);
    
    containerLogService.info('DIコンテナからのログ');
    
    // 6. スプレッドシートロガーアダプターのテスト
    console.log('\n6. SpreadsheetLoggerAdapterテスト:');
    const mockSpreadsheetLogger = {
      log: async (message, level) => {
        console.log(`  [Mock SpreadsheetLogger] ${level}: ${message}`);
      }
    };
    
    const adapter = new SpreadsheetLoggerAdapter(mockSpreadsheetLogger);
    await adapter.log({
      level: 'info',
      message: 'アダプター経由のログ',
      timestamp: new Date().toISOString()
    });
    
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

if (typeof globalThis.chrome === 'undefined') {
  globalThis.chrome = {
    runtime: { lastError: null },
    identity: {
      getAuthToken: (options, callback) => callback('mock-token'),
      removeCachedAuthToken: (options, callback) => callback()
    }
  };
}

// テスト実行
testLogService().catch(console.error);