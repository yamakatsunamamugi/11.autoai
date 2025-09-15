# 依存性注入（DI）コンテナ ガイド

## 📋 目次
1. [概要](#概要)
2. [基本的な使い方](#基本的な使い方)
3. [サービスの登録](#サービスの登録)
4. [サービスの取得](#サービスの取得)
5. [新しいサービスの追加方法](#新しいサービスの追加方法)
6. [テスト方法](#テスト方法)
7. [トラブルシューティング](#トラブルシューティング)

## 概要

DIコンテナは、アプリケーション全体のサービス（クラス・モジュール）の依存関係を管理する仕組みです。

### メリット
- ✅ **依存関係の明確化**: どのサービスがどのサービスに依存しているか一目瞭然
- ✅ **テストの容易性**: モックを簡単に注入できる
- ✅ **保守性の向上**: 変更の影響範囲が明確
- ✅ **循環依存の検出**: 問題を早期に発見

## 基本的な使い方

### 1. サービスを使用する（推奨方法）

```javascript
import { getGlobalContainer } from '../core/service-registry.js';

async function myFunction() {
  // コンテナを取得
  const container = await getGlobalContainer();

  // 必要なサービスを取得
  const authService = await container.get('authService');
  const sheetsClient = await container.get('sheetsClient');

  // サービスを使用
  const token = await authService.getAuthToken();
  const data = await sheetsClient.getSheetData(spreadsheetId, range);
}
```

### 2. 複数のサービスを一度に取得

```javascript
const container = await getGlobalContainer();
const services = await container.getMultiple([
  'authService',
  'sheetsClient',
  'spreadsheetLogger'
]);

// services.authService, services.sheetsClient等で使用
```

## サービスの登録

サービスは `src/core/service-registry.js` で登録されています。

### 登録済みサービス一覧

| サービス名 | クラス | 説明 |
|-----------|-------|------|
| `authService` | AuthService | OAuth2認証管理 |
| `sheetsClient` | SheetsClient | スプレッドシート操作 |
| `spreadsheetLogger` | SpreadsheetLogger | ログ記録 |
| `taskProcessor` | TaskProcessorAdapter | タスク処理 |
| `powerManager` | PowerManager | スリープ防止 |
| `retryManager` | RetryManager | リトライ処理 |
| `taskExecutor` | AITaskExecutor | AI実行 |
| `exclusiveControlManager` | - | 排他制御 |

## サービスの取得

### パターン1: 遅延初期化（推奨）

```javascript
let services = {};
let initialized = false;

async function initializeServices() {
  if (initialized) return services;

  const container = await getGlobalContainer();
  services.authService = await container.get('authService');
  services.sheetsClient = await container.get('sheetsClient');
  initialized = true;

  return services;
}

// 使用時
async function myFunction() {
  await initializeServices();
  const token = await services.authService.getAuthToken();
}
```

### パターン2: フォールバック付き

```javascript
async function getServiceWithFallback() {
  try {
    const container = await getGlobalContainer();
    return await container.get('sheetsClient');
  } catch (error) {
    // フォールバック: globalThisから取得
    return globalThis.sheetsClient;
  }
}
```

## 新しいサービスの追加方法

### Step 1: サービスクラスを作成

```javascript
// src/services/my-service.js
export class MyService {
  constructor(dependencies = {}) {
    this.authService = dependencies.authService;
    this.logger = dependencies.logger || console;
  }

  async doSomething() {
    const token = await this.authService.getAuthToken();
    this.logger.log('Doing something...');
    // 処理
  }
}

export default MyService;
```

### Step 2: インターフェースを定義（オプション）

```javascript
// src/core/interfaces/service-interfaces.js に追加
export class IMyService {
  async doSomething() {
    throw new Error('実装が必要です');
  }
}
```

### Step 3: service-registryに登録

```javascript
// src/core/service-registry.js
container.register('myService', async (container) => {
  const module = await import('../services/my-service.js');
  const MyService = module.default || module.MyService;

  // 依存サービスを取得
  const authService = await container.get('authService');

  // インスタンスを作成
  return new MyService({
    authService: authService
  });
});
```

### Step 4: 使用

```javascript
const container = await getGlobalContainer();
const myService = await container.get('myService');
await myService.doSomething();
```

## テスト方法

### 単体テスト例

```javascript
// test/test-my-service.js
import DIContainer from '../src/core/di-container.js';
import MyService from '../src/services/my-service.js';

describe('MyService', () => {
  it('should work with mock dependencies', async () => {
    // モックを作成
    const mockAuthService = {
      getAuthToken: async () => 'mock-token'
    };

    // DIコンテナにモックを登録
    const container = new DIContainer();
    container.register('authService', mockAuthService);
    container.register('myService', (c) => {
      return new MyService({
        authService: c.get('authService')
      });
    });

    // テスト実行
    const myService = await container.get('myService');
    await myService.doSomething();

    // 検証
    expect(mockAuthService.getAuthToken).toHaveBeenCalled();
  });
});
```

### 統合テスト

```bash
node test/test-di-container.js
```

## トラブルシューティング

### 問題: サービスが見つからない

```javascript
Error: サービス 'myService' は登録されていません
```

**解決策**: `service-registry.js` でサービスが登録されているか確認

### 問題: 循環依存エラー

```javascript
Error: 循環依存が検出されました: serviceA
```

**解決策**: サービス間の依存関係を見直し、循環を解消

### 問題: globalThisが使えない環境

**解決策**: DIコンテナから直接取得

```javascript
// ❌ 避ける
const client = globalThis.sheetsClient;

// ✅ 推奨
const container = await getGlobalContainer();
const client = await container.get('sheetsClient');
```

## ベストプラクティス

1. **サービスは単一責任原則に従う**
   - 1つのサービス = 1つの責務

2. **依存は最小限に**
   - 必要な依存のみを注入

3. **インターフェースを定義**
   - 契約を明確にする

4. **テストを書く**
   - モックを使った単体テスト

5. **段階的移行**
   - 一度に全部変えない
   - フォールバック機能を残す

## 移行状況

### 完了 ✅
- AuthService
- SheetsClient
- SpreadsheetLogger
- TaskProcessor (Adapter経由)

### 進行中 🔄
- message-handler.js (部分的)
- ai-task-handler.js (部分的)

### 未着手 ⏳
- 他のglobalThis使用箇所

## 関連ファイル

- `/src/core/di-container.js` - DIコンテナ本体
- `/src/core/service-registry.js` - サービス登録
- `/src/core/interfaces/service-interfaces.js` - インターフェース定義
- `/src/core/task-processor-adapter.js` - アダプターパターン例
- `/test/test-di-container.js` - テストコード