# ハイブリッド協調システム統合テスト計画

## 概要
AIタスク重複実行問題を解決するために実装したハイブリッド協調システムの統合テストと長期安定性検証計画です。

## 実装完了システム概要

### 1. DynamicSearchシステム (step4.5-dynamic-search.js)
- **機能**: 個別タスクの動的検索と実行
- **主な改善点**:
  - グループ内検索限定
  - スプレッドシート書き込み完了後の最新データ取得（リトライ機能付き）
  - グループ完了検出と制御移譲シグナル送信
  - 統一管理システムとの連携

### 2. step3-loop.js協調機能強化
- **機能**: メインループでの協調制御
- **主な改善点**:
  - DynamicSearch制御移譲シグナル受信（3方式）
  - グループスキップ判定
  - 処理ループ内でのDynamicSearch完了チェック
  - 協調システム初期化とクリーンアップ

### 3. globalState.currentGroup一元管理
- **機能**: 両システム間のcurrentGroup状態統一管理
- **主な改善点**:
  - CurrentGroupManagerクラスによる排他制御
  - リスナーシステムによる変更通知
  - 更新履歴と診断機能
  - 重複更新の防止

### 4. グループ間移行協調プロトコル
- **機能**: グループ間移行の安全な実行
- **主な改善点**:
  - GroupTransitionCoordinatorクラス
  - 3段階移行プロセス（検証・実行・完了）
  - ロールバック機能
  - 移行履歴と診断機能

## 統合テスト計画

### Phase 1: 基本機能テスト

#### Test 1.1: システム初期化テスト
```javascript
// テスト項目
- window.currentGroupManager の正常初期化
- window.groupTransitionCoordinator の正常初期化
- DynamicTaskSearch インスタンスの正常作成
- 各種リスナーの登録確認

// 検証方法
console.log("CurrentGroupManager:", !!window.currentGroupManager);
console.log("GroupTransitionCoordinator:", !!window.groupTransitionCoordinator);
console.log("DynamicTaskSearch functions:", {
  findNext: !!window.findNextAvailableTaskDynamic,
  registerCompletion: !!window.registerTaskCompletionDynamic
});
```

#### Test 1.2: currentGroup統一管理テスト
```javascript
// テスト項目
- setCurrentGroup()による安全な更新
- getCurrentGroup()による取得
- リスナー通知の正常動作

// 検証方法
const testGroup = { groupNumber: 1, taskType: "test" };
await window.setCurrentGroup(testGroup, "test");
const retrieved = window.getCurrentGroup();
console.log("Group management test:", retrieved.groupNumber === 1);
```

#### Test 1.3: グループ移行協調テスト
```javascript
// テスト項目
- executeGroupTransition()の正常動作
- 移行前検証の実行
- 移行履歴の記録

// 検証方法
const fromGroup = { groupNumber: 1 };
const toGroup = { groupNumber: 2 };
const result = await window.executeGroupTransition(fromGroup, toGroup, "test");
console.log("Transition test:", result);
console.log("Diagnostics:", window.getTransitionDiagnostics());
```

### Phase 2: 協調動作テスト

#### Test 2.1: DynamicSearch → step3制御移譲テスト
```javascript
// テスト項目
- DynamicSearchでのグループ完了検出
- step3への制御移譲シグナル送信
- step3でのシグナル受信と処理

// 検証方法
// 1. DynamicSearchでタスク検索を実行
const dynamicSearch = window.DynamicTaskSearch;
const nextTask = await dynamicSearch.findNextTask();

// 2. 完了シグナル送信のシミュレーション
// （実際のテストでは完了状態のスプレッドシートを用意）
```

#### Test 2.2: step3でのグループスキップテスト
```javascript
// テスト項目
- 完了済みグループのスキップ判定
- DynamicSearchで完了したグループの適切なスキップ

// 検証方法
const testGroup = { groupNumber: 1 };
window.globalState.completedGroupsByDynamicSearch = new Set([1]);
const shouldSkip = window.shouldSkipGroupProcessing(testGroup);
console.log("Skip test:", shouldSkip === true);
```

#### Test 2.3: 並行実行制御テスト
```javascript
// テスト項目
- 複数システムでの同時グループアクセス
- 排他制御の正常動作
- デッドロックの防止

// 検証方法
// 同時に複数のsetCurrentGroup()呼び出し
const promises = [
  window.setCurrentGroup({ groupNumber: 1 }, "system1"),
  window.setCurrentGroup({ groupNumber: 2 }, "system2"),
  window.setCurrentGroup({ groupNumber: 3 }, "system3")
];
const results = await Promise.all(promises);
console.log("Concurrent access test:", results);
```

### Phase 3: エラーハンドリングテスト

#### Test 3.1: ネットワークエラー処理テスト
```javascript
// テスト項目
- スプレッドシートAPIエラー時の挙動
- リトライ機能の正常動作
- エラー時のグレースフルデグラデーション

// 検証方法
// ネットワークエラーをシミュレートして
// DynamicSearchのfetchLatestSpreadsheetData()をテスト
```

#### Test 3.2: 移行失敗時のロールバックテスト
```javascript
// テスト項目
- 移行検証失敗時の適切な処理
- ロールバック機能の正常動作
- 移行履歴への記録

// 検証方法
// 無効なグループ情報で移行を試行
const invalidGroup = { groupNumber: null };
const result = await window.executeGroupTransition(
  { groupNumber: 1 },
  invalidGroup,
  "test"
);
console.log("Rollback test:", result === false);
```

## 長期安定性検証

### 1. メモリリーク対策
- **懸念**: リスナーの蓄積、履歴データの無制限蓄積
- **対策**:
  - 履歴サイズ制限（20件まで）
  - リスナーの適切なクリーンアップ
  - reset()メソッドによる定期的なクリア

### 2. パフォーマンス対策
- **懸念**: ポーリング処理の負荷、頻繁な状態チェック
- **対策**:
  - ポーリング間隔の調整（1秒）
  - キャッシュ機能の活用
  - 診断情報による監視

### 3. データ整合性対策
- **懸念**: 複数システム間でのデータ不整合
- **対策**:
  - 排他制御による同期処理
  - 更新履歴による追跡可能性
  - 検証機能による整合性チェック

### 4. エラー回復対策
- **懸念**: 一時的な障害からの自動回復
- **対策**:
  - リトライ機能の実装
  - ロールバック機能
  - タイムアウト処理による無限待機の防止

## テスト実行チェックリスト

### 事前準備
- [ ] テスト用スプレッドシートの準備
- [ ] 各種API認証情報の確認
- [ ] ログレベルをDEBUGに設定
- [ ] ブラウザ開発者ツールの準備

### 基本機能テスト
- [ ] システム初期化テスト実行
- [ ] currentGroup統一管理テスト実行
- [ ] グループ移行協調テスト実行
- [ ] すべての統一インターフェースの動作確認

### 協調動作テスト
- [ ] DynamicSearch → step3制御移譲テスト実行
- [ ] step3でのグループスキップテスト実行
- [ ] 並行実行制御テスト実行
- [ ] イベント通知システムの動作確認

### エラーハンドリングテスト
- [ ] ネットワークエラー処理テスト実行
- [ ] 移行失敗時のロールバックテスト実行
- [ ] 各種異常系テストケースの実行

### 長期安定性テスト
- [ ] 連続実行テスト（2時間以上）
- [ ] メモリ使用量の監視
- [ ] 診断情報の定期確認
- [ ] エラーログの確認

## 成功基準

### 基本機能
- ✅ タスクの重複実行が発生しない
- ✅ グループ間の適切な移行が行われる
- ✅ 両システムの状態が同期される

### パフォーマンス
- ✅ 処理遅延が従来と同等以下
- ✅ メモリ使用量が安定している
- ✅ CPU使用率が許容範囲内

### 信頼性
- ✅ エラー発生時の適切な回復
- ✅ 長期間の安定動作
- ✅ データ整合性の維持

## 問題発生時の対応

### 緊急対応
1. ログの確認と問題箇所の特定
2. reset()メソッドによるシステムリセット
3. 必要に応じてリロードによる完全リセット

### 恒久対応
1. 問題原因の詳細分析
2. 修正パッチの適用
3. テストケースの追加
4. 監視機能の強化

## 今後の改善提案

### Phase 4: 高度な機能実装
- 自動診断機能の実装
- パフォーマンスメトリクスの収集
- 予防的メンテナンス機能
- 可視化ダッシュボード

### Phase 5: 運用最適化
- 設定可能なパラメータの外部化
- 運用監視用APIの提供
- 自動テスト基盤の構築
- CI/CDパイプラインとの統合

---

## 重要な注意事項

1. **テスト環境**: 本番データに影響しないテスト専用環境で実施すること
2. **バックアップ**: テスト前に現在の動作するコードをバックアップすること
3. **段階的導入**: 一度にすべてを有効化せず、段階的に機能を有効化すること
4. **監視継続**: 導入後も継続的に動作状況を監視すること

このテスト計画に従って検証を実施することで、ハイブリッド協調システムの長期安定性を確保できます。