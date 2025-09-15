/**
 * @fileoverview クリティカルパスのE2Eテスト
 *
 * Chrome拡張機能の主要機能の自動テスト
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.join(__dirname, '../..');

describe('11.autoai クリティカルパステスト', () => {
  let browser;
  let page;
  let extensionId;

  beforeAll(async () => {
    // Puppeteerでブラウザを起動（拡張機能を読み込み）
    browser = await puppeteer.launch({
      headless: false, // 拡張機能テストはヘッドレスモードでは動作しない
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    // 拡張機能IDを取得
    const targets = await browser.targets();
    const extensionTarget = targets.find(target =>
      target.type() === 'service_worker' &&
      target.url().includes('chrome-extension://')
    );

    if (extensionTarget) {
      const url = new URL(extensionTarget.url());
      extensionId = url.hostname;
      console.log('Extension ID:', extensionId);
    }

    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('基本機能テスト', () => {
    test('拡張機能が正常に読み込まれる', async () => {
      expect(extensionId).toBeDefined();
      expect(extensionId).toMatch(/^[a-z]{32}$/);
    });

    test('Service Workerが起動している', async () => {
      const serviceWorker = await browser.waitForTarget(
        target => target.type() === 'service_worker',
        { timeout: 10000 }
      );
      expect(serviceWorker).toBeDefined();
    });

    test('ポップアップが開く', async () => {
      const popupUrl = `chrome-extension://${extensionId}/popup.html`;
      await page.goto(popupUrl);

      // ポップアップのタイトルを確認
      const title = await page.title();
      expect(title).toContain('11.autoai');

      // 主要な要素が存在することを確認
      const mainContainer = await page.$('#app');
      expect(mainContainer).toBeTruthy();
    });
  });

  describe('認証フローテスト', () => {
    test('OAuth認証ボタンが表示される', async () => {
      const popupUrl = `chrome-extension://${extensionId}/popup.html`;
      await page.goto(popupUrl);

      // 認証ボタンを探す
      const authButton = await page.$('#googleAuthBtn');
      expect(authButton).toBeTruthy();

      // ボタンのテキストを確認
      const buttonText = await page.$eval('#googleAuthBtn', el => el.textContent);
      expect(buttonText).toContain('Google');
    });

    test('認証エラーが適切にハンドリングされる', async () => {
      // Service Workerにメッセージを送信
      const response = await page.evaluate((extId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'TEST_AUTH_ERROR' },
            resolve
          );
        });
      }, extensionId);

      expect(response).toHaveProperty('error');
    });
  });

  describe('スプレッドシート操作テスト', () => {
    test('スプレッドシートURLの検証が機能する', async () => {
      const validUrl = 'https://docs.google.com/spreadsheets/d/1234567890/edit';
      const invalidUrl = 'https://example.com/invalid';

      // バックグラウンドスクリプトでURL検証
      const validResult = await page.evaluate((extId, url) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'VALIDATE_SPREADSHEET_URL', url },
            resolve
          );
        });
      }, extensionId, validUrl);

      const invalidResult = await page.evaluate((extId, url) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'VALIDATE_SPREADSHEET_URL', url },
            resolve
          );
        });
      }, extensionId, invalidUrl);

      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
    });

    test('スプレッドシートIDの抽出が正しく動作する', async () => {
      const url = 'https://docs.google.com/spreadsheets/d/1234567890abcdef/edit#gid=0';

      const result = await page.evaluate((extId, url) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'PARSE_SPREADSHEET_URL', url },
            resolve
          );
        });
      }, extensionId, url);

      expect(result.spreadsheetId).toBe('1234567890abcdef');
      expect(result.sheetId).toBe('0');
    });
  });

  describe('AIサイト連携テスト', () => {
    const AI_SITES = [
      { name: 'ChatGPT', url: 'https://chat.openai.com' },
      { name: 'Claude', url: 'https://claude.ai' },
      { name: 'Gemini', url: 'https://gemini.google.com' }
    ];

    AI_SITES.forEach(site => {
      test(`${site.name}サイトでコンテンツスクリプトが注入される`, async () => {
        // AIサイトにナビゲート
        await page.goto(site.url, { waitUntil: 'domcontentloaded' });

        // コンテンツスクリプトが注入されているか確認
        const injected = await page.evaluate(() => {
          return window.__11autoai_injected === true;
        });

        expect(injected).toBe(true);
      });
    });

    test('プロンプト送信機能が動作する', async () => {
      // モックプロンプトを送信
      const result = await page.evaluate((extId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            {
              type: 'SEND_PROMPT',
              prompt: 'テストプロンプト',
              aiType: 'ChatGPT'
            },
            resolve
          );
        });
      }, extensionId);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe('エラーリカバリーテスト', () => {
    test('ネットワークエラーから自動回復する', async () => {
      // ネットワークエラーをシミュレート
      await page.setOfflineMode(true);

      const result = await page.evaluate((extId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'TEST_NETWORK_REQUEST' },
            (response) => {
              resolve(response);
            }
          );
        });
      }, extensionId);

      // オンラインに戻す
      await page.setOfflineMode(false);

      // リトライが成功することを確認
      const retryResult = await page.evaluate((extId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'TEST_NETWORK_REQUEST' },
            resolve
          );
        });
      }, extensionId);

      expect(retryResult.success).toBe(true);
    });

    test('メモリリークが検出される', async () => {
      // メモリリークをシミュレート
      const result = await page.evaluate((extId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'TEST_MEMORY_LEAK' },
            resolve
          );
        });
      }, extensionId);

      expect(result.detected).toBe(true);
    });
  });

  describe('ストレージ管理テスト', () => {
    test('ローカルストレージに保存できる', async () => {
      const testData = { key: 'test', value: 'value123' };

      const saveResult = await page.evaluate((extId, data) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'SAVE_TO_STORAGE', data },
            resolve
          );
        });
      }, extensionId, testData);

      expect(saveResult.success).toBe(true);

      // 保存したデータを取得
      const getResult = await page.evaluate((extId, key) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'GET_FROM_STORAGE', key },
            resolve
          );
        });
      }, extensionId, testData.key);

      expect(getResult.value).toBe(testData.value);
    });

    test('ストレージクォータ超過時にクリーンアップされる', async () => {
      // 大量のデータを保存してクォータに近づける
      const largeData = new Array(1000).fill('x').join('');

      for (let i = 0; i < 100; i++) {
        await page.evaluate((extId, data, index) => {
          return new Promise((resolve) => {
            chrome.runtime.sendMessage(
              extId,
              {
                type: 'SAVE_TO_STORAGE',
                data: { key: `large_${index}`, value: data }
              },
              resolve
            );
          });
        }, extensionId, largeData, i);
      }

      // クリーンアップをトリガー
      const cleanupResult = await page.evaluate((extId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'CLEANUP_STORAGE' },
            resolve
          );
        });
      }, extensionId);

      expect(cleanupResult.success).toBe(true);
      expect(cleanupResult.itemsDeleted).toBeGreaterThan(0);
    });
  });

  describe('パフォーマンステスト', () => {
    test('大量タスク処理のパフォーマンス', async () => {
      const startTime = Date.now();
      const taskCount = 100;

      // 100個のタスクを並列で送信
      const promises = [];
      for (let i = 0; i < taskCount; i++) {
        promises.push(
          page.evaluate((extId, index) => {
            return new Promise((resolve) => {
              chrome.runtime.sendMessage(
                extId,
                { type: 'PROCESS_TASK', taskId: index },
                resolve
              );
            });
          }, extensionId, i)
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // すべてのタスクが成功
      const successCount = results.filter(r => r?.success).length;
      expect(successCount).toBe(taskCount);

      // 処理時間が妥当な範囲内
      expect(duration).toBeLessThan(30000); // 30秒以内
      console.log(`${taskCount}タスクの処理時間: ${duration}ms`);
    });

    test('メモリ使用量が適切に管理される', async () => {
      // 初期メモリ使用量を取得
      const initialMemory = await page.evaluate(() => {
        return performance.memory.usedJSHeapSize;
      });

      // 負荷をかける処理
      for (let i = 0; i < 10; i++) {
        await page.evaluate((extId) => {
          return new Promise((resolve) => {
            chrome.runtime.sendMessage(
              extId,
              { type: 'HEAVY_OPERATION' },
              resolve
            );
          });
        }, extensionId);
      }

      // ガベージコレクションを待つ
      await page.evaluate(() => {
        return new Promise(resolve => setTimeout(resolve, 2000));
      });

      // 最終メモリ使用量を取得
      const finalMemory = await page.evaluate(() => {
        return performance.memory.usedJSHeapSize;
      });

      // メモリリークがないことを確認（2倍以上増えていない）
      expect(finalMemory).toBeLessThan(initialMemory * 2);
    });
  });

  describe('セキュリティテスト', () => {
    test('XSS攻撃が防がれる', async () => {
      const maliciousInput = '<script>alert("XSS")</script>';

      const result = await page.evaluate((extId, input) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            extId,
            { type: 'PROCESS_USER_INPUT', input },
            resolve
          );
        });
      }, extensionId, maliciousInput);

      // スクリプトタグがエスケープされている
      expect(result.processed).not.toContain('<script>');
      expect(result.processed).toContain('&lt;script&gt;');
    });

    test('CSPが正しく設定されている', async () => {
      const popupUrl = `chrome-extension://${extensionId}/popup.html`;
      await page.goto(popupUrl);

      // インラインスクリプトが実行されないことを確認
      const result = await page.evaluate(() => {
        try {
          // インラインスクリプトを挿入
          const script = document.createElement('script');
          script.textContent = 'window.__inline_executed = true;';
          document.head.appendChild(script);
          return window.__inline_executed === true;
        } catch (e) {
          return false;
        }
      });

      expect(result).toBe(false);
    });
  });
});

/**
 * 統合テストスイート
 */
describe('統合テスト', () => {
  let browser;
  let page;
  let extensionId;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`
      ]
    });

    const targets = await browser.targets();
    const extensionTarget = targets.find(target =>
      target.type() === 'service_worker'
    );

    if (extensionTarget) {
      extensionId = new URL(extensionTarget.url()).hostname;
    }

    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('エンドツーエンドワークフロー', async () => {
    // 1. 拡張機能を開く
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // 2. スプレッドシートURLを設定
    const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/test123/edit';
    await page.evaluate((extId, url) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          extId,
          { type: 'SET_SPREADSHEET_URL', url },
          resolve
        );
      });
    }, extensionId, spreadsheetUrl);

    // 3. AIサイトに移動
    await page.goto('https://chat.openai.com', { waitUntil: 'domcontentloaded' });

    // 4. タスクを実行
    const taskResult = await page.evaluate((extId) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          extId,
          {
            type: 'EXECUTE_TASK',
            task: {
              prompt: 'テストプロンプト',
              aiType: 'ChatGPT',
              column: 'A',
              row: 1
            }
          },
          resolve
        );
      });
    }, extensionId);

    expect(taskResult).toBeDefined();
    expect(taskResult.taskId).toBeDefined();

    // 5. 結果を確認
    const statusResult = await page.evaluate((extId, taskId) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          extId,
          { type: 'GET_TASK_STATUS', taskId },
          resolve
        );
      });
    }, extensionId, taskResult.taskId);

    expect(statusResult.status).toBeDefined();
  });
});