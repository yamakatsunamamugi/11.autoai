/**
 * サービスレジストリのユニットテスト
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  initializeServices,
  getGlobalContainer,
  getService,
  getServices,
  resetContainer
} from '../../src/core/service-registry.js';

describe('ServiceRegistry', () => {
  beforeEach(() => {
    resetContainer();
  });

  afterEach(() => {
    resetContainer();
  });

  describe('initializeServices', () => {
    test('コンテナを初期化できる', async () => {
      const container = await initializeServices();
      expect(container).toBeDefined();
      expect(container.has).toBeDefined();
      expect(container.get).toBeDefined();
    });

    test('基本サービスが登録される', async () => {
      const container = await initializeServices();
      
      expect(container.has('errorService')).toBe(true);
      expect(container.has('authService')).toBe(true);
      expect(container.has('sheetsClient')).toBe(true);
      expect(container.has('logService')).toBe(true);
      expect(container.has('spreadsheetLogger')).toBe(true);
      expect(container.has('taskProcessor')).toBe(true);
    });
  });

  describe('getGlobalContainer', () => {
    test('シングルトンコンテナを返す', async () => {
      const container1 = await getGlobalContainer();
      const container2 = await getGlobalContainer();
      
      expect(container1).toBe(container2);
    });

    test('コンテナが初期化される', async () => {
      const container = await getGlobalContainer();
      
      expect(container).toBeDefined();
      expect(container.has('authService')).toBe(true);
    });
  });

  describe('getService', () => {
    test('サービスを取得できる', async () => {
      await getGlobalContainer();
      const errorService = await getService('errorService');
      
      expect(errorService).toBeDefined();
      expect(errorService.handleError).toBeDefined();
    });

    test('同一サービスは同一インスタンスを返す', async () => {
      await getGlobalContainer();
      const service1 = await getService('errorService');
      const service2 = await getService('errorService');
      
      expect(service1).toBe(service2);
    });
  });

  describe('getServices', () => {
    test('複数のサービスを取得できる', async () => {
      await getGlobalContainer();
      const services = await getServices('errorService', 'logService');
      
      expect(services.errorService).toBeDefined();
      expect(services.logService).toBeDefined();
    });
  });

  describe('resetContainer', () => {
    test('コンテナをリセットできる', async () => {
      const container1 = await getGlobalContainer();
      resetContainer();
      const container2 = await getGlobalContainer();
      
      expect(container1).not.toBe(container2);
    });
  });

  describe('サービスの依存関係', () => {
    test('TaskProcessorAdapterが依存サービスを取得できる', async () => {
      const container = await getGlobalContainer();
      const taskProcessor = await container.get('taskProcessor');
      
      expect(taskProcessor).toBeDefined();
      expect(taskProcessor.processTasks).toBeDefined();
      expect(taskProcessor.processTaskGroup).toBeDefined();
    });

    test('LogServiceがSpreadsheetLoggerを統合できる', async () => {
      const container = await getGlobalContainer();
      const logService = await container.get('logService');
      
      expect(logService).toBeDefined();
      expect(logService.loggers.size).toBeGreaterThan(0);
    });
  });
});