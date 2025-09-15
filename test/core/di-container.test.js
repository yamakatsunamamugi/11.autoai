/**
 * DIコンテナのユニットテスト
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import DIContainer from '../../src/core/di-container.js';

describe('DIContainer', () => {
  let container;

  beforeEach(() => {
    container = new DIContainer();
  });

  describe('register', () => {
    test('サービスを登録できる', () => {
      const service = { name: 'test' };
      container.register('testService', service);
      
      expect(container.has('testService')).toBe(true);
    });

    test('ファクトリ関数を登録できる', () => {
      const factory = () => ({ name: 'test' });
      container.register('testService', factory);
      
      expect(container.has('testService')).toBe(true);
    });

    test('シングルトンオプションを指定できる', () => {
      const factory = () => ({ name: 'test' });
      container.register('testService', factory, { singleton: true });
      
      const service = container.services.get('testService');
      expect(service.isSingleton).toBe(true);
    });
  });

  describe('get', () => {
    test('登録されたサービスを取得できる', async () => {
      const service = { name: 'test' };
      container.register('testService', service);
      
      const result = await container.get('testService');
      expect(result).toBe(service);
    });

    test('ファクトリ関数からサービスを作成できる', async () => {
      const service = { name: 'test' };
      const factory = () => service;
      container.register('testService', factory);
      
      const result = await container.get('testService');
      expect(result).toBe(service);
    });

    test('非同期ファクトリ関数からサービスを作成できる', async () => {
      const service = { name: 'test' };
      const factory = async () => service;
      container.register('testService', factory);
      
      const result = await container.get('testService');
      expect(result).toBe(service);
    });

    test('シングルトンは同一インスタンスを返す', async () => {
      let count = 0;
      const factory = () => ({ id: ++count });
      container.register('testService', factory, { singleton: true });
      
      const result1 = await container.get('testService');
      const result2 = await container.get('testService');
      
      expect(result1).toBe(result2);
      expect(result1.id).toBe(1);
    });

    test('非シングルトンは新しいインスタンスを返す', async () => {
      let count = 0;
      const factory = () => ({ id: ++count });
      container.register('testService', factory, { singleton: false });
      
      const result1 = await container.get('testService');
      const result2 = await container.get('testService');
      
      expect(result1).not.toBe(result2);
      expect(result1.id).toBe(1);
      expect(result2.id).toBe(2);
    });

    test('未登録のサービスはエラーを投げる', async () => {
      await expect(container.get('unknownService')).rejects.toThrow(
        'Service unknownService is not registered'
      );
    });

    test('依存サービスを注入できる', async () => {
      container.register('logger', { log: () => {} });
      container.register('service', (container) => ({
        logger: container.get('logger')
      }));
      
      const service = await container.get('service');
      expect(service.logger).toBeDefined();
      expect(service.logger.log).toBeDefined();
    });
  });

  describe('has', () => {
    test('登録されたサービスはtrueを返す', () => {
      container.register('testService', {});
      expect(container.has('testService')).toBe(true);
    });

    test('未登録のサービスはfalseを返す', () => {
      expect(container.has('unknownService')).toBe(false);
    });
  });

  describe('getMultiple', () => {
    test('複数のサービスを取得できる', async () => {
      container.register('service1', { name: 'service1' });
      container.register('service2', { name: 'service2' });
      
      const result = await container.getMultiple(['service1', 'service2']);
      
      expect(result.service1.name).toBe('service1');
      expect(result.service2.name).toBe('service2');
    });
  });

  describe('循環依存検出', () => {
    test('直接的な循環依存を検出する', async () => {
      container.register('service1', async (container) => {
        await container.get('service1');
      });
      
      await expect(container.get('service1')).rejects.toThrow(
        'Circular dependency detected: service1'
      );
    });

    test('間接的な循環依存を検出する', async () => {
      container.register('service1', async (container) => {
        await container.get('service2');
      });
      
      container.register('service2', async (container) => {
        await container.get('service1');
      });
      
      await expect(container.get('service1')).rejects.toThrow(
        'Circular dependency detected: service1'
      );
    });
  });

  describe('clearSingletons', () => {
    test('シングルトンをクリアできる', async () => {
      let count = 0;
      const factory = () => ({ id: ++count });
      container.register('testService', factory, { singleton: true });
      
      const result1 = await container.get('testService');
      expect(result1.id).toBe(1);
      
      container.clearSingletons();
      
      const result2 = await container.get('testService');
      expect(result2.id).toBe(2);
    });
  });

  describe('getRegisteredServices', () => {
    test('登録されたサービス名を取得できる', () => {
      container.register('service1', {});
      container.register('service2', {});
      container.register('service3', {});
      
      const services = container.getRegisteredServices();
      
      expect(services).toContain('service1');
      expect(services).toContain('service2');
      expect(services).toContain('service3');
      expect(services.length).toBe(3);
    });
  });
});