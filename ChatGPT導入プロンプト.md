# ChatGPT 導入プロンプト

**作成日時**: 2025/08/10 14:30:00  
**概要**: スプレッドシートから取得したデータ（モデル、機能、テキスト）を使用して、ChatGPT自動化コードにAI動作を統合するための仕様書およびプロンプト

## 現在のコードの動作仕様詳細

### 1. モデルの変更

**動作条件**:
- メインモデル: `GPT-5`がデフォルトで設定されている
- サブメニューモデル: `GPT-5 Thinking`と`GPT-5 Pro`が「その他のモデル」メニューから選択可能
- モデル切り替えボタンは`data-testid="model-switcher-gpt-5"`等の属性で識別

**操作手順**:
1. モデル選択ボタンをクリック（PointerEvent経由）
2. メニューが開くまで最大3秒待機
3. 対象モデルのメニュー項目を探索
4. サブメニューが必要な場合は、mouseenterイベントでサブメニューを開く
5. 選択後、Escapeキーとbody.click()でメニューを閉じる
6. 選択状態を`currentState.selectedModel`に保存

### 2. 機能の変更

**動作条件**:
- メイン機能: 5つの機能が即座にアクセス可能
  - 写真とファイルを追加（通常ボタン）
  - エージェントモード（ラジオボタン、「新規」バッジ付き）
  - Deep Research（ラジオボタン）
  - 画像を作成する（ラジオボタン）
  - より長く思考する（ラジオボタン）
- サブメニュー機能: 「さらに表示」経由でアクセス
  - コネクターを使用する、あらゆる学びをサポート、ウェブ検索、canvas（ラジオボタン）
  - OneDrive/Sharepoint接続（通常ボタン）

**操作手順**:
1. `[data-testid="composer-plus-btn"]`または`.composer-btn`をクリック
2. メニューが開くまで最大3秒待機
3. 機能番号（1〜11）に対応する項目を探索
4. ラジオボタンタイプの場合、`currentState.activeFunctions`に状態を記録
5. クリック後、300ms待機してからメニューを閉じる

### 3. テキストの入力

**動作条件**:
- 入力欄の識別優先順位:
  1. `#prompt-textarea`
  2. `[contenteditable="true"]`
  3. `.ProseMirror`
  4. `div[contenteditable="true"]`
  5. `textarea[data-testid="conversation-textarea"]`
  6. `textarea[placeholder*="メッセージ"]`
  7. 汎用`textarea`

**操作手順**:
1. 上記セレクタで入力欄を探索（表示されている要素のみ対象）
2. 入力欄にフォーカス
3. contentEditableの場合: `textContent`に直接設定
4. TEXTAREA/INPUTの場合: `value`に設定
5. ProseMirrorの場合: `<p>`タグで囲んだHTMLを設定
6. inputイベントを発火
7. TEXTAREAの高さを自動調整（scrollHeightに合わせる）
8. 入力完了後、100ms待機
9. 入力確認（最初の10文字で検証）

### 4. テキストの送信

**動作条件**:
- 送信ボタンの識別優先順位:
  1. `[data-testid="send-button"]`
  2. `#composer-submit-button`
  3. `[aria-label="プロンプトを送信する"]`
  4. `[aria-label*="送信"]`
  5. `button[data-testid="composer-send-button"]`
  6. `button[class*="send"]`

**操作手順**:
1. 上記セレクタで送信ボタンを探索（無効でない要素のみ）
2. ボタンの有効性を確認（disabled属性チェック）
3. PointerEventシーケンスでクリック（pointerdown → pointerup → click）
4. 送信後1秒待機

### 5. 回答待機のロジック

**通常の回答待機**:
- 停止ボタン（`[data-testid="stop-button"]`）の存在で処理中を判定
- 停止ボタンが消えたら完了と判定（3回連続チェックで確定）
- 最大待機時間のデフォルトは120秒

**Deep Research特殊処理**:
- **初期5分間の特別処理**:
  - 停止ボタンが消えても処理を継続
  - 500msごとにメッセージを監視
  - 新規メッセージの検出（テキスト長10文字以上の変更）
  - 追加質問の自動検出と返信
- **追加質問の検出パターン**:
  - 「調べたいですか」「教えてください」「調査できます」
  - 「教えていただければ」「お知らせください」
  - 「どのような」「たとえば」「観点」「範囲」「ご希望」「具体的に」
- **5分経過後**:
  - 通常の停止ボタン消失による完了判定に移行
  - 最大40分まで待機可能

### 6. テキスト取得（Canvas/レポートと通常回答）

**メッセージ要素の識別**:
- セレクタ優先順位:
  1. `[data-message-author-role="assistant"]`
  2. `.text-message[data-message-author-role="assistant"]`
  3. `div[data-message-author-role="assistant"]`

**テキスト抽出方法**:
1. `.markdown`要素からの取得を優先
2. `textContent`での取得
3. `innerText`での取得
4. `p`および`li`要素を個別に取得して結合

**取得対象**:
- 最後のアシスタントメッセージ（配列の最後の要素）
- 結果は`currentState.lastText`に保存
- Canvas機能の出力も同じ方法で取得（特別な処理なし）

### 7. Deep Researchの操作

**完全自動化フロー**:
1. **機能有効化**: Deep Research機能を選択（機能番号3）
2. **クエリ入力**: 調査内容をテキスト入力
3. **送信**: 送信ボタンをクリック
4. **初期5分間の監視**:
   - 追加質問の検出（上記パターンマッチング）
   - 自動返信の送信（デフォルト: "いいから調べて"）
   - 停止ボタンの状態変化を記録
5. **本処理の監視**:
   - 最大40分間の待機
   - 3分ごとの進捗ログ出力
   - 停止ボタン消失で完了判定
6. **結果取得**: 通常のgetText()で最終結果を取得
7. **タイムライン記録**: 全イベントを時系列で記録

---

## AI導入プロンプト

以下のプロンプトを使用して、スプレッドシートとの統合を実装してください：

```
【タスク】
スプレッドシートから取得したデータ（モデル、機能、テキスト）を使用してChatGPTを自動操作するコードを実装してください。上記の動作仕様を参考に、統合テストで使用できる形にしてください。

【現在の状況】
- スプレッドシートからモデル、機能、テキストの取得は完了
- 上記の動作仕様に従った実装が必要
- 統合テストで他システムと連携可能な形にする

【要件】
1. 上記の動作仕様をすべて実装
2. スプレッドシートから受け取ったデータをそのまま活用
3. 拡張性を考慮したアーキテクチャ
4. データ変換処理を最小限に抑える
5. 統合テスト用のインターフェースを提供

【実装内容】
1. 完全なChatGPT自動操作コードの実装
   - 上記仕様に基づくすべての機能
   - モデル選択、機能選択、テキスト入力、送信、待機、結果取得
   - Deep Research対応（5分間の特殊処理を含む）

2. スプレッドシート統合インターフェース
   ```javascript
   // スプレッドシートからのデータを受け取って実行
   async function executeFromSpreadsheet(data) {
     // data = { model: "GPT-5", functions: ["Deep Research"], text: "調査内容" }
     
     // 1. モデル選択
     if (data.model) {
       await selectModel(data.model);
     }
     
     // 2. 機能の有効化
     for (const func of data.functions) {
       const funcIndex = getFunctionIndex(func);
       await selectFunction(funcIndex, true);
     }
     
     // 3. テキスト入力と送信
     await inputText(data.text);
     await sendText();
     
     // 4. 結果の待機と取得
     const result = await waitForCompletion();
     return await getText('response');
   }
   ```

3. 統合テスト用API
   ```javascript
   window.ChatGPT = {
     // スプレッドシート統合
     executeFromSpreadsheet: async function(data) { /* ... */ },
     
     // 個別機能（テスト用）
     selectModel: async function(modelName) { /* ... */ },
     selectFunction: async function(funcNumber, enable) { /* ... */ },
     inputText: async function(text) { /* ... */ },
     sendText: async function() { /* ... */ },
     getText: async function(source) { /* ... */ },
     
     // Deep Research専用
     testDeepResearch: async function(query, options) { /* ... */ },
     
     // バッチ処理
     executeBatch: async function(dataArray) { /* ... */ }
   };
   ```

4. データマッピングと変換
   - モデル名の正規化（大文字小文字、スペースの処理）
   - 機能名から番号への変換テーブル
   - エラーハンドリング（未知のモデル/機能）

【実装時の注意点】
- 上記の動作仕様をすべて実装する
- 待機時間設定（delays）を設定可能にする
- デバッグログ機能を実装
- エラー時は詳細なエラー情報を返す
- 統合テストで使いやすいAPIを提供

【統合テストシナリオ】
1. 基本フロー: スプレッドシートデータ → モデル選択 → 機能選択 → テキスト送信 → 結果取得
2. Deep Research: 40分間の完全自動実行、追加質問への自動返信
3. バッチ処理: 複数のスプレッドシート行を連続実行
4. エラー処理: 無効なデータ、タイムアウト、要素が見つからない場合

【統合方法】
```javascript
// 統合テストでの使用例
const spreadsheetData = {
  model: "GPT-5",
  functions: ["Deep Research"],
  text: "AIの歴史について詳しく調べてください"
};

const result = await ChatGPT.executeFromSpreadsheet(spreadsheetData);
console.log('実行結果:', result);
```

この実装により、スプレッドシートのデータを使用してChatGPTを完全自動で操作し、統合テストで他システムと連携できるようになります。
```

---

## 実装の構成

### 1. コア機能の実装
```javascript
// 完全な自動操作コードの実装
(function() {
  'use strict';
  
  // CONFIG部分（上記仕様に基づく）
  const CONFIG = {
    models: { /* ... */ },
    functions: { /* ... */ },
    delays: { /* ... */ }
  };
  
  // すべての操作関数を実装
  // - selectModel()
  // - selectFunction()
  // - inputText()
  // - sendText()
  // - getText()
  // - waitForCompletion()
  // - testDeepResearch()
  
  // 統合テスト用API
  window.ChatGPT = {
    executeFromSpreadsheet,
    executeBatch,
    // その他のメソッド
  };
})();
```

### 2. データマッピング層
```javascript
const DataMapper = {
  // モデル名の正規化
  normalizeModel: (name) => {
    const modelMap = {
      'gpt-5': 'GPT-5',
      'gpt5': 'GPT-5',
      'gpt-5-thinking': 'GPT-5 Thinking',
      'gpt-5-pro': 'GPT-5 Pro'
    };
    return modelMap[name.toLowerCase().replace(/\s+/g, '-')] || name;
  },
  
  // 機能名から番号への変換
  getFunctionIndex: (name) => {
    const functionMap = {
      '写真とファイルを追加': 1,
      'エージェントモード': 2,
      'Deep Research': 3,
      '画像を作成する': 4,
      'より長く思考する': 5,
      'コネクターを使用する': 6,
      'あらゆる学びをサポート': 7,
      'ウェブ検索': 8,
      'canvas': 9,
      'OneDrive を接続する': 10,
      'Sharepoint を接続する': 11
    };
    return functionMap[name] || 0;
  },
  
  // データバリデーション
  validateData: (data) => {
    if (!data.text || data.text.trim() === '') {
      throw new Error('テキストは必須です');
    }
    return true;
  }
};
```

### 3. エラーハンドリングとリトライ
```javascript
const ErrorHandler = {
  // リトライ機能付き要素探索
  findElementWithRetry: async (selector, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      const element = document.querySelector(selector);
      if (element) return element;
      await wait(1000);
    }
    throw new Error(`要素が見つかりません: ${selector}`);
  },
  
  // タイムアウト管理
  withTimeout: async (promise, timeout) => {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('タイムアウト')), timeout)
    );
    return Promise.race([promise, timeoutPromise]);
  }
};
```

この構成により、スプレッドシートとの統合テストが可能な、完全なChatGPT自動操作システムが実現できます。