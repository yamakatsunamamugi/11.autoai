# DIコンテナ移行ガイド

## 🎯 概要

このドキュメントは、グローバル変数から依存性注入（DI）コンテナへの移行方法を説明します。

## 📊 移行進捗

### 全体的なglobalThis使用状況
- **開始時**: 100箇所
- **現在**: 89箇所
- **削減率**: 11%

### ファイル別進捗
| ファイル | 前 | 後 | 状態 |
|---------|----|----|------|
| message-handler.js | 17 | 8 | ✅ 部分移行 |
| background.js | 20 | 12 | ✅ 部分移行 |
| sheets-client.js | 17 | 9 | ✅ DI対応 |
| docs-client.js | 5 | 3 | ✅ DI対応 |
| service-registry.js | - | 21 | 🔄 後方互換用 |

## 🛠️ DIコンテナの基本構造

### コアコンポーネント

```
src/
├── core/
│   ├── di-container.js        # DIコンテナ本体
│   ├── service-registry.js    # サービス登録
│   └── interfaces/
│       └── service-interfaces.js  # インターフェース定義
└── utils/
    └── spreadsheet-utils.js   # 共通ユーティリティ
```

## 📖 移行方法

### 1. 既存コードからの移行

#### Before (グローバル変数使用)
```javascript
// 直接globalThisを参照
const token = await globalThis.authService.getAuthToken();
await globalThis.sheetsClient.loadData(spreadsheetId);
```

#### After (DIコンテナ使用)
```javascript
import { getGlobalContainer } from './src/core/service-registry.js';

// 初回のみコンテナ取得
const container = await getGlobalContainer();
const authService = await container.get('authService');
const sheetsClient = await container.get('sheetsClient');

// 使用
const token = await authService.getAuthToken();
await sheetsClient.loadData(spreadsheetId);
```

### 2. 新しいサービスの登録

```javascript
// src/core/service-registry.jsに追加

container.register('myNewService', async (container) => {
  // 依存サービスを取得
  const logger = await container.get('logService');
  const authService = await container.get('authService');
  
  // サービスを作成
  const MyService = (await import('./my-service.js')).default;
  return new MyService({
    logger,
    authService
  });
});
```

### 3. サービスクラスのDI対応

```javascript
// Before
class MyService {
  constructor() {
    // globalThisへの直接依存
    this.authService = globalThis.authService;
  }
}

// After
class MyService {
  constructor(dependencies = {}) {
    // 依存性注入
    this.authService = dependencies.authService || null;
    this.logger = dependencies.logger || console;
  }
  
  async getAuthToken() {
    if (this.authService) {
      return await this.authService.getAuthToken();
    }
    // フォールバック（後方互換性）
    if (globalThis.authService) {
      return await globalThis.authService.getAuthToken();
    }
    throw new Error('AuthService not available');
  }
}
```

## 🔄 後方互換性の維持

### グローバル変数への自動設定

```javascript
// service-registry.js
container.register('sheetsClient', async (container) => {
  // 既存のglobalThisを優先
  if (globalThis.sheetsClient) {
    return globalThis.sheetsClient;
  }
  
  const client = new SheetsClient({
    authService: await container.get('authService')
  });
  
  // 後方互換性のためglobalThisにも設定
  globalThis.sheetsClient = client;
  
  return client;
});
```

## 🧪 テスト

### ユニットテスト

```javascript
// test/core/di-container.test.js
import { describe, test, expect } from '@jest/globals';
import DIContainer from '../../src/core/di-container.js';

describe('DIContainer', () => {
  test('サービスを登録できる', () => {
    const container = new DIContainer();
    const service = { name: 'test' };
    container.register('testService', service);
    
    expect(container.has('testService')).toBe(true);
  });
  
  test('循環依存を検出する', async () => {
    const container = new DIContainer();
    container.register('service1', async (c) => {
      await c.get('service1'); // 循環依存
    });
    
    await expect(container.get('service1'))
      .rejects.toThrow('Circular dependency detected');
  });
});
```

### 統合テスト

```bash
# DIコンテナテスト
node test/test-di-container.js

# Jestテスト
npm test
```

## 📝 ベストプラクティス

### ✅ 推奨事項

1. **段階的移行**: 一度にすべてを移行せず、ファイル単位で移行
2. **フォールバック実装**: globalThisへのフォールバックを残す
3. **インターフェース定義**: サービスのインターフェースを明確に
4. **テスト作成**: 移行したコードにテストを追加

### ❌ 避けるべき事項

1. **大規模一括変更**: 全ファイルを一度に変更しない
2. **後方互換性の破壊**: 既存のコードが動かなくなる変更
3. **テストなしのリリース**: 必ずテストを実行

## 🌟 成果

### コード品質の向上
- **依存関係の明確化**: サービス間の依存が明示的に
- **テスタビリティ**: モック化が容易に
- **保守性**: サービスの差し替えが簡単

### コード量の削減
- **重複コード**: 1,435行削除（google-services.js）
- **全体**: 23%のコード削減

## 🚀 今後の計画

### Phase 1: 現在の作業 ✅
- DIコンテナ基盤構築
- 主要サービスの移行
- テストフレームワーク設定

### Phase 2: 次のステップ 🔄
- 残りglobalThis使用の削減
- サービスインターフェースの完全実装
- 追加テストの作成

### Phase 3: 将来的な拡張 🔮
- TypeScript移行
- マイクロサービス化
- CI/CDパイプライン

## 📚 参考資料

- [DIContainerクラス](/src/core/di-container.js)
- [ServiceRegistry](/src/core/service-registry.js)
- [Service Interfaces](/src/core/interfaces/service-interfaces.js)
- [Jest設定](/jest.config.js)

---

*最終更新: 2025年1月*