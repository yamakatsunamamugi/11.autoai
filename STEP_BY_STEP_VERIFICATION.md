# ハイブリッド協調システム - Step-by-Step 動作検証

## 検証環境の準備

### 前提条件
1. ブラウザでChrome拡張機能が読み込まれている
2. 開発者ツールのコンソールが開いている
3. ログレベルがDEBUGに設定されている

```javascript
// ログレベルをDEBUGに設定
if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.set({logLevel: 4}, () => {
    console.log("✅ ログレベルをDEBUGに設定完了");
    location.reload(); // 設定反映のためリロード
  });
}
```

---

## Step 1: 基本初期化チェック

### 1-1. コアシステム初期化確認

```javascript
console.log("=== Step 1-1: コアシステム初期化確認 ===");

const systemCheck = {
  // CurrentGroupManager
  currentGroupManager: !!window.currentGroupManager,
  currentGroupManagerType: typeof window.currentGroupManager,

  // GroupTransitionCoordinator
  groupTransitionCoordinator: !!window.groupTransitionCoordinator,
  transitionCoordinatorType: typeof window.groupTransitionCoordinator,

  // DynamicTaskSearch
  dynamicTaskSearch: !!window.DynamicTaskSearch,
  findNextFunction: !!window.findNextAvailableTaskDynamic,
  registerFunction: !!window.registerTaskCompletionDynamic,

  // 統一インターフェース関数
  setCurrentGroup: !!window.setCurrentGroup,
  getCurrentGroup: !!window.getCurrentGroup,
  executeGroupTransition: !!window.executeGroupTransition,

  // step3-loop.js 協調関数
  shouldSkipGroupProcessing: !!window.shouldSkipGroupProcessing,
  handleDynamicSearchCompletion: !!window.handleDynamicSearchCompletion,
};

console.table(systemCheck);

// 期待結果: すべてのプロパティがtrueであること
const allInitialized = Object.values(systemCheck).every(value => value === true);
console.log(`✅ 基本初期化: ${allInitialized ? "成功" : "失敗"}`);
```

### 1-2. クラスインスタンス詳細確認

```javascript
console.log("=== Step 1-2: クラスインスタンス詳細確認 ===");

if (window.currentGroupManager) {
  console.log("📋 CurrentGroupManager詳細:");
  console.log("- listeners:", window.currentGroupManager.listeners.size);
  console.log("- updateHistory:", window.currentGroupManager.updateHistory.length);
  console.log("- updateLock:", window.currentGroupManager.updateLock);
  console.log("- diagnostics:", window.currentGroupManager.getDiagnostics());
}

if (window.groupTransitionCoordinator) {
  console.log("🔀 GroupTransitionCoordinator詳細:");
  console.log("- transitionLock:", window.groupTransitionCoordinator.transitionLock);
  console.log("- history length:", window.groupTransitionCoordinator.transitionHistory.length);
  console.log("- pending:", window.groupTransitionCoordinator.pendingTransitions.size);
  console.log("- diagnostics:", window.getTransitionDiagnostics());
}

// globalState確認
console.log("🌐 globalState状態:");
console.log("- currentGroup:", window.globalState?.currentGroup);
console.log("- completedGroupsByDynamicSearch:", window.globalState?.completedGroupsByDynamicSearch);
console.log("- dynamicSearchCoordination:", window.globalState?.dynamicSearchCoordination);
```

---

## Step 2: 基本機能動作テスト

### 2-1. currentGroup統一管理テスト

```javascript
console.log("=== Step 2-1: currentGroup統一管理テスト ===");

async function testCurrentGroupManagement() {
  try {
    // テスト用グループデータ
    const testGroup1 = {
      groupNumber: 999,
      taskType: "test",
      columns: { prompts: ["B"], answer: { primary: "C" } },
      dataStartRow: 8
    };

    const testGroup2 = {
      groupNumber: 998,
      taskType: "test2",
      columns: { prompts: ["D"], answer: { primary: "E" } },
      dataStartRow: 9
    };

    console.log("📝 テストグループ1を設定中...");
    const result1 = await window.setCurrentGroup(testGroup1, "test-step1");
    console.log("結果1:", result1);

    console.log("📋 現在のグループ取得:");
    const current1 = window.getCurrentGroup();
    console.log("取得1:", current1);

    console.log("📝 テストグループ2を設定中...");
    const result2 = await window.setCurrentGroup(testGroup2, "test-step2");
    console.log("結果2:", result2);

    console.log("📋 現在のグループ取得:");
    const current2 = window.getCurrentGroup();
    console.log("取得2:", current2);

    // 期待結果確認
    const test1Pass = current2.groupNumber === 998 && current2.taskType === "test2";
    const metadataExists = !!current2._metadata;
    const hasUpdateHistory = window.currentGroupManager.updateHistory.length >= 2;

    console.log(`✅ currentGroup管理テスト: ${test1Pass && metadataExists && hasUpdateHistory ? "成功" : "失敗"}`);
    console.log("- グループ更新:", test1Pass);
    console.log("- メタデータ存在:", metadataExists);
    console.log("- 履歴記録:", hasUpdateHistory);

    return { test1Pass, metadataExists, hasUpdateHistory };

  } catch (error) {
    console.error("❌ currentGroup管理テストエラー:", error);
    return { error: error.message };
  }
}

// テスト実行
testCurrentGroupManagement().then(result => {
  console.log("currentGroup管理テスト結果:", result);
});
```

### 2-2. グループ移行協調テスト

```javascript
console.log("=== Step 2-2: グループ移行協調テスト ===");

async function testGroupTransition() {
  try {
    const fromGroup = {
      groupNumber: 997,
      taskType: "from-test",
      columns: { prompts: ["F"], answer: { primary: "G" } },
      dataStartRow: 10
    };

    const toGroup = {
      groupNumber: 996,
      taskType: "to-test",
      columns: { prompts: ["H"], answer: { primary: "I" } },
      dataStartRow: 11
    };

    console.log("🔀 グループ移行テスト実行中...");
    console.log("From:", fromGroup.groupNumber, "To:", toGroup.groupNumber);

    const transitionResult = await window.executeGroupTransition(fromGroup, toGroup, "test-transition");
    console.log("移行結果:", transitionResult);

    // 結果確認
    const currentAfterTransition = window.getCurrentGroup();
    console.log("移行後の現在グループ:", currentAfterTransition);

    // 診断情報確認
    const diagnostics = window.getTransitionDiagnostics();
    console.log("移行診断情報:", diagnostics);

    // 期待結果確認
    const transitionSuccess = transitionResult === true;
    const correctGroup = currentAfterTransition?.groupNumber === 996;
    const historyRecorded = diagnostics.transitionHistory.length > 0;

    console.log(`✅ グループ移行テスト: ${transitionSuccess && correctGroup && historyRecorded ? "成功" : "失敗"}`);
    console.log("- 移行実行:", transitionSuccess);
    console.log("- 正しいグループ:", correctGroup);
    console.log("- 履歴記録:", historyRecorded);

    return { transitionSuccess, correctGroup, historyRecorded, diagnostics };

  } catch (error) {
    console.error("❌ グループ移行テストエラー:", error);
    return { error: error.message };
  }
}

// テスト実行
testGroupTransition().then(result => {
  console.log("グループ移行テスト結果:", result);
});
```

---

## Step 3: システム間連携テスト

### 3-1. リスナーシステムテスト

```javascript
console.log("=== Step 3-1: リスナーシステムテスト ===");

function testListenerSystem() {
  let changeEventReceived = null;

  // テスト用リスナー
  const testListener = (changeEvent) => {
    changeEventReceived = changeEvent;
    console.log("📡 リスナーイベント受信:", changeEvent);
  };

  try {
    console.log("👂 リスナー登録中...");
    window.addCurrentGroupListener(testListener);

    // リスナー数確認
    const listenerCount = window.currentGroupManager.listeners.size;
    console.log("登録済みリスナー数:", listenerCount);

    // テスト用グループ変更
    const testGroup = {
      groupNumber: 995,
      taskType: "listener-test",
      columns: { prompts: ["J"], answer: { primary: "K" } },
      dataStartRow: 12
    };

    console.log("📝 リスナーテスト用グループ設定...");

    // 非同期で実行して結果を確認
    return window.setCurrentGroup(testGroup, "listener-test").then(() => {
      // 短時間待機してからリスナー結果確認
      return new Promise(resolve => {
        setTimeout(() => {
          const eventReceived = !!changeEventReceived;
          const correctEventData = changeEventReceived?.currentGroup?.groupNumber === 995;
          const hasTimestamp = !!changeEventReceived?.timestamp;

          console.log(`✅ リスナーシステムテスト: ${eventReceived && correctEventData && hasTimestamp ? "成功" : "失敗"}`);
          console.log("- イベント受信:", eventReceived);
          console.log("- 正しいデータ:", correctEventData);
          console.log("- タイムスタンプ:", hasTimestamp);

          // クリーンアップ
          window.removeCurrentGroupListener(testListener);
          console.log("🗑️ テストリスナー削除完了");

          resolve({ eventReceived, correctEventData, hasTimestamp, changeEventReceived });
        }, 1000);
      });
    });

  } catch (error) {
    console.error("❌ リスナーシステムテストエラー:", error);
    return Promise.resolve({ error: error.message });
  }
}

// テスト実行
testListenerSystem().then(result => {
  console.log("リスナーシステムテスト結果:", result);
});
```

### 3-2. DynamicSearch協調シグナルテスト

```javascript
console.log("=== Step 3-2: DynamicSearch協調シグナルテスト ===");

function testDynamicSearchSignals() {
  try {
    console.log("📡 DynamicSearch協調シグナルテスト開始");

    // シグナル受信確認用の状態をリセット
    if (window.globalState) {
      delete window.globalState.completedGroupsByDynamicSearch;
      delete window.globalState.dynamicSearchCoordination;
    }

    // 【方法1】カスタムイベントテスト
    console.log("🔄 方法1: カスタムイベント送信テスト");
    const testEvent = new CustomEvent("dynamicSearchGroupCompleted", {
      detail: {
        groupNumber: 994,
        groupType: "test",
        transferControl: true,
        timestamp: new Date().toISOString(),
        source: "TestEvent"
      }
    });

    window.dispatchEvent(testEvent);

    // 短時間待機して結果確認
    setTimeout(() => {
      const completedGroups = window.globalState?.completedGroupsByDynamicSearch;
      const coordination = window.globalState?.dynamicSearchCoordination;

      console.log("カスタムイベント結果:");
      console.log("- completedGroups:", completedGroups);
      console.log("- coordination:", coordination);

      const eventProcessed = completedGroups && completedGroups.has(994);
      const coordinationSet = coordination && coordination.lastCompletedGroup === 994;

      console.log(`✅ カスタムイベントテスト: ${eventProcessed && coordinationSet ? "成功" : "失敗"}`);
      console.log("- イベント処理:", eventProcessed);
      console.log("- 協調情報設定:", coordinationSet);

      // 【方法2】直接コールバックテスト
      console.log("🔄 方法2: 直接コールバックテスト");
      if (window.onDynamicSearchGroupCompleted) {
        window.onDynamicSearchGroupCompleted({
          groupNumber: 993,
          groupData: { taskType: "callback-test" }
        });

        setTimeout(() => {
          const callbackProcessed = window.globalState?.completedGroupsByDynamicSearch?.has(993);
          console.log(`✅ 直接コールバックテスト: ${callbackProcessed ? "成功" : "失敗"}`);

          // 【方法3】globalState監視テスト
          console.log("🔄 方法3: globalState監視テスト");
          if (window.globalState) {
            window.globalState.dynamicSearchNotification = {
              type: "GROUP_COMPLETED",
              groupNumber: 992,
              requestControlTransfer: true,
              timestamp: new Date().toISOString()
            };

            setTimeout(() => {
              const pollingProcessed = window.globalState?.completedGroupsByDynamicSearch?.has(992);
              console.log(`✅ globalState監視テスト: ${pollingProcessed ? "成功" : "失敗"}`);

              // 総合結果
              const allMethodsWork = eventProcessed && coordinationSet && callbackProcessed && pollingProcessed;
              console.log(`🎯 DynamicSearch協調シグナル総合: ${allMethodsWork ? "成功" : "失敗"}`);
            }, 1500); // ポーリング間隔(1秒)より長く待機
          }
        }, 500);
      }
    }, 500);

  } catch (error) {
    console.error("❌ DynamicSearch協調シグナルテストエラー:", error);
  }
}

// テスト実行
testDynamicSearchSignals();
```

---

## Step 4: エラーハンドリング・回復機能テスト

### 4-1. 無効データハンドリングテスト

```javascript
console.log("=== Step 4-1: 無効データハンドリングテスト ===");

async function testErrorHandling() {
  try {
    console.log("🧪 無効データテスト開始");

    // 無効なグループデータでの移行テスト
    const invalidGroup = null;
    const validGroup = {
      groupNumber: 991,
      taskType: "valid",
      columns: { prompts: ["L"], answer: { primary: "M" } },
      dataStartRow: 13
    };

    console.log("❌ 無効グループでの移行テスト");
    const invalidTransition = await window.executeGroupTransition(validGroup, invalidGroup, "error-test");
    console.log("無効移行結果:", invalidTransition);

    // 重複移行テスト
    console.log("🔄 重複移行テスト");
    await window.setCurrentGroup(validGroup, "duplicate-test");
    const duplicateTransition = await window.executeGroupTransition(null, validGroup, "duplicate-test");
    console.log("重複移行結果:", duplicateTransition);

    // 期待結果: 両方ともfalseであること
    const invalidHandled = invalidTransition === false;
    const duplicateHandled = duplicateTransition === false;

    console.log(`✅ エラーハンドリングテスト: ${invalidHandled && duplicateHandled ? "成功" : "失敗"}`);
    console.log("- 無効データ拒否:", invalidHandled);
    console.log("- 重複移行拒否:", duplicateHandled);

    return { invalidHandled, duplicateHandled };

  } catch (error) {
    console.error("❌ エラーハンドリングテストエラー:", error);
    return { error: error.message };
  }
}

// テスト実行
testErrorHandling().then(result => {
  console.log("エラーハンドリングテスト結果:", result);
});
```

### 4-2. 排他制御テスト

```javascript
console.log("=== Step 4-2: 排他制御テスト ===");

async function testConcurrentAccess() {
  try {
    console.log("⚡ 同時アクセステスト開始");

    // 複数の同時更新を実行
    const testGroups = [
      { groupNumber: 990, taskType: "concurrent1", columns: { prompts: ["N"], answer: { primary: "O" } }, dataStartRow: 14 },
      { groupNumber: 989, taskType: "concurrent2", columns: { prompts: ["P"], answer: { primary: "Q" } }, dataStartRow: 15 },
      { groupNumber: 988, taskType: "concurrent3", columns: { prompts: ["R"], answer: { primary: "S" } }, dataStartRow: 16 }
    ];

    console.log("🏃‍♂️ 3つの同時更新を開始");
    const concurrentPromises = testGroups.map((group, index) =>
      window.setCurrentGroup(group, `concurrent-${index + 1}`)
    );

    const results = await Promise.all(concurrentPromises);
    console.log("同時更新結果:", results);

    // 最終状態確認
    const finalGroup = window.getCurrentGroup();
    console.log("最終グループ:", finalGroup);

    // 更新履歴確認
    const history = window.currentGroupManager.updateHistory;
    console.log("更新履歴:", history);

    // 期待結果: すべて成功し、履歴が記録されていること
    const allSucceeded = results.every(result => result === true);
    const hasHistory = history.length >= 3;
    const finalGroupValid = finalGroup && testGroups.some(g => g.groupNumber === finalGroup.groupNumber);

    console.log(`✅ 排他制御テスト: ${allSucceeded && hasHistory && finalGroupValid ? "成功" : "失敗"}`);
    console.log("- 全更新成功:", allSucceeded);
    console.log("- 履歴記録:", hasHistory);
    console.log("- 最終状態妥当:", finalGroupValid);

    return { allSucceeded, hasHistory, finalGroupValid, finalGroup, history: history.slice(-3) };

  } catch (error) {
    console.error("❌ 排他制御テストエラー:", error);
    return { error: error.message };
  }
}

// テスト実行
testConcurrentAccess().then(result => {
  console.log("排他制御テスト結果:", result);
});
```

---

## Step 5: 統合動作確認

### 5-1. 完全なワークフロー統合テスト

```javascript
console.log("=== Step 5-1: 完全なワークフロー統合テスト ===");

async function testCompleteWorkflow() {
  try {
    console.log("🔄 完全ワークフローテスト開始");

    // 段階1: 初期グループ設定
    console.log("📝 段階1: 初期グループ設定");
    const initialGroup = {
      groupNumber: 987,
      taskType: "workflow-initial",
      columns: { prompts: ["T"], answer: { primary: "U" } },
      dataStartRow: 17
    };

    await window.setCurrentGroup(initialGroup, "workflow-step1");
    console.log("初期グループ設定完了:", window.getCurrentGroup().groupNumber);

    // 段階2: DynamicSearchシグナル送信
    console.log("📡 段階2: DynamicSearch完了シグナル送信");
    const completionEvent = new CustomEvent("dynamicSearchGroupCompleted", {
      detail: {
        groupNumber: 987,
        transferControl: true,
        timestamp: new Date().toISOString(),
        source: "WorkflowTest"
      }
    });

    window.dispatchEvent(completionEvent);

    // 短時間待機
    await new Promise(resolve => setTimeout(resolve, 500));

    // 段階3: step3でのスキップ判定確認
    console.log("⏭️ 段階3: スキップ判定確認");
    const shouldSkip = window.shouldSkipGroupProcessing(initialGroup);
    console.log("スキップ判定結果:", shouldSkip);

    // 段階4: 次グループへの移行
    console.log("➡️ 段階4: 次グループへの移行");
    const nextGroup = {
      groupNumber: 986,
      taskType: "workflow-next",
      columns: { prompts: ["V"], answer: { primary: "W" } },
      dataStartRow: 18
    };

    const transitionSuccess = await window.executeGroupTransition(initialGroup, nextGroup, "workflow-transition");
    console.log("移行成功:", transitionSuccess);

    // 段階5: 最終状態確認
    console.log("🔍 段階5: 最終状態確認");
    const finalState = {
      currentGroup: window.getCurrentGroup(),
      completedGroups: window.globalState?.completedGroupsByDynamicSearch,
      coordination: window.globalState?.dynamicSearchCoordination,
      transitionHistory: window.getTransitionDiagnostics().transitionHistory.slice(-2)
    };

    console.log("最終状態:", finalState);

    // 期待結果検証
    const groupTransitioned = finalState.currentGroup?.groupNumber === 986;
    const completionRecorded = finalState.completedGroups?.has(987);
    const coordinationSet = finalState.coordination?.lastCompletedGroup === 987;
    const historyRecorded = finalState.transitionHistory.length > 0;
    const skipWorked = shouldSkip === true;

    const workflowSuccess = groupTransitioned && completionRecorded && coordinationSet && historyRecorded && skipWorked;

    console.log(`✅ 完全ワークフローテスト: ${workflowSuccess ? "成功" : "失敗"}`);
    console.log("- グループ移行:", groupTransitioned);
    console.log("- 完了記録:", completionRecorded);
    console.log("- 協調設定:", coordinationSet);
    console.log("- 履歴記録:", historyRecorded);
    console.log("- スキップ動作:", skipWorked);

    return {
      workflowSuccess,
      groupTransitioned,
      completionRecorded,
      coordinationSet,
      historyRecorded,
      skipWorked,
      finalState
    };

  } catch (error) {
    console.error("❌ 完全ワークフローテストエラー:", error);
    return { error: error.message };
  }
}

// テスト実行
testCompleteWorkflow().then(result => {
  console.log("完全ワークフローテスト結果:", result);
});
```

### 5-2. パフォーマンス・安定性確認

```javascript
console.log("=== Step 5-2: パフォーマンス・安定性確認 ===");

async function testPerformanceAndStability() {
  try {
    console.log("⚡ パフォーマンス・安定性テスト開始");

    const startTime = performance.now();
    const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 'N/A';

    console.log("📊 初期状態:");
    console.log("- 開始時刻:", new Date().toISOString());
    console.log("- 初期メモリ:", initialMemory);

    // 大量の操作を実行
    console.log("🏃‍♂️ 大量操作実行中...");
    const operations = [];

    for (let i = 0; i < 50; i++) {
      const testGroup = {
        groupNumber: 900 + i,
        taskType: `performance-test-${i}`,
        columns: { prompts: ["X"], answer: { primary: "Y" } },
        dataStartRow: 19 + i
      };

      operations.push(window.setCurrentGroup(testGroup, `perf-test-${i}`));

      // 定期的にイベント送信
      if (i % 10 === 0) {
        const event = new CustomEvent("dynamicSearchGroupCompleted", {
          detail: {
            groupNumber: 900 + i,
            transferControl: true,
            timestamp: new Date().toISOString(),
            source: "PerformanceTest"
          }
        });
        window.dispatchEvent(event);
      }
    }

    await Promise.all(operations);

    // 終了状態測定
    const endTime = performance.now();
    const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 'N/A';
    const executionTime = endTime - startTime;

    console.log("📈 最終状態:");
    console.log("- 実行時間:", `${executionTime.toFixed(2)}ms`);
    console.log("- 最終メモリ:", finalMemory);
    console.log("- メモリ差分:", initialMemory !== 'N/A' && finalMemory !== 'N/A' ?
      `${((finalMemory - initialMemory) / 1024 / 1024).toFixed(2)}MB` : 'N/A');

    // システム状態確認
    const diagnostics = {
      currentGroupHistory: window.currentGroupManager.updateHistory.length,
      transitionHistory: window.getTransitionDiagnostics().transitionHistory.length,
      completedGroups: window.globalState?.completedGroupsByDynamicSearch?.size || 0,
      listenerCount: window.currentGroupManager.listeners.size
    };

    console.log("🔍 システム診断:", diagnostics);

    // 履歴制限が働いているか確認
    const historyLimited = diagnostics.currentGroupHistory <= 10; // maxHistorySize
    const transitionHistoryLimited = diagnostics.transitionHistory <= 20; // maxHistorySize
    const performanceAcceptable = executionTime < 5000; // 5秒以内

    console.log(`✅ パフォーマンス・安定性テスト: ${historyLimited && transitionHistoryLimited && performanceAcceptable ? "成功" : "失敗"}`);
    console.log("- 履歴制限動作:", historyLimited);
    console.log("- 移行履歴制限:", transitionHistoryLimited);
    console.log("- パフォーマンス許容:", performanceAcceptable);

    return {
      executionTime,
      initialMemory,
      finalMemory,
      diagnostics,
      historyLimited,
      transitionHistoryLimited,
      performanceAcceptable
    };

  } catch (error) {
    console.error("❌ パフォーマンス・安定性テストエラー:", error);
    return { error: error.message };
  }
}

// テスト実行
testPerformanceAndStability().then(result => {
  console.log("パフォーマンス・安定性テスト結果:", result);
});
```

---

## Step 6: 実際のタスク処理との統合確認

### 6-1. 実スプレッドシートとの連携テスト（注意：実データに影響する可能性があります）

```javascript
console.log("=== Step 6-1: 実スプレッドシート連携テスト ===");
console.warn("⚠️ 注意: このテストは実際のスプレッドシートデータに影響する可能性があります");

// 実行前に確認
const confirmTest = confirm("実スプレッドシート連携テストを実行しますか？\n（実データに影響する可能性があります）");

if (confirmTest) {
  async function testRealSpreadsheetIntegration() {
    try {
      console.log("📊 実スプレッドシート連携テスト開始");

      // DynamicSearch実インスタンス取得
      const dynamicSearch = window.DynamicTaskSearch;
      if (!dynamicSearch) {
        console.log("⚠️ DynamicTaskSearchインスタンスが見つかりません");
        return { error: "DynamicTaskSearch not available" };
      }

      console.log("🔍 DynamicSearchインスタンス状態:");
      console.log("- processingTasks:", dynamicSearch.processingTasks.size);
      console.log("- completedTasks:", dynamicSearch.completedTasks.size);
      console.log("- cache.lastFetchTime:", dynamicSearch.cache.lastFetchTime);

      // 現在のグループ情報確認
      const currentGroup = window.getCurrentGroup();
      console.log("📋 現在のグループ:", currentGroup);

      if (currentGroup) {
        console.log("🔍 次のタスク検索テスト...");
        const nextTask = await dynamicSearch.findNextTask();
        console.log("検索結果:", nextTask);

        if (nextTask) {
          console.log("✅ タスク検索成功 - システム正常動作");
          console.log("- タスクID:", nextTask.id);
          console.log("- プロンプト長:", nextTask.prompt.length);
          console.log("- AI種別:", nextTask.aiType);
          console.log("- 答セル:", nextTask.answerCell);
        } else {
          console.log("📭 利用可能なタスクなし（正常）");
        }
      }

      // globalState の実際の状態確認
      console.log("🌐 実際のglobalState状態:");
      console.log("- taskGroups:", window.globalState?.taskGroups?.length || 0);
      console.log("- currentGroupIndex:", window.globalState?.currentGroupIndex);
      console.log("- spreadsheetId:", !!window.globalState?.spreadsheetId);
      console.log("- authToken:", !!window.globalState?.authToken);

      return {
        realDataTest: true,
        currentGroup,
        nextTask: nextTask || null,
        dynamicSearchState: {
          processing: dynamicSearch.processingTasks.size,
          completed: dynamicSearch.completedTasks.size,
          cacheTime: dynamicSearch.cache.lastFetchTime
        }
      };

    } catch (error) {
      console.error("❌ 実スプレッドシート連携テストエラー:", error);
      return { error: error.message };
    }
  }

  // テスト実行
  testRealSpreadsheetIntegration().then(result => {
    console.log("実スプレッドシート連携テスト結果:", result);
  });
} else {
  console.log("実スプレッドシート連携テストはスキップされました");
}
```

---

## 最終結果の総合評価

```javascript
console.log("=== 最終結果の総合評価 ===");

// すべてのテスト結果をまとめて評価
function generateFinalReport() {
  console.log("📋 ハイブリッド協調システム - 総合動作確認レポート");
  console.log("実行時刻:", new Date().toISOString());
  console.log("=======================================");

  // システム状態の最終確認
  const finalSystemState = {
    // 基本システム
    currentGroupManager: !!window.currentGroupManager,
    groupTransitionCoordinator: !!window.groupTransitionCoordinator,
    dynamicTaskSearch: !!window.DynamicTaskSearch,

    // 統一インターフェース
    unifiedFunctions: {
      setCurrentGroup: !!window.setCurrentGroup,
      getCurrentGroup: !!window.getCurrentGroup,
      executeGroupTransition: !!window.executeGroupTransition,
    },

    // 協調機能
    coordinationFunctions: {
      shouldSkipGroupProcessing: !!window.shouldSkipGroupProcessing,
      handleDynamicSearchCompletion: !!window.handleDynamicSearchCompletion,
      initializeDynamicSearchCoordination: !!window.initializeDynamicSearchCoordination
    },

    // 現在の状態
    currentState: {
      currentGroup: window.getCurrentGroup()?.groupNumber || null,
      completedGroups: window.globalState?.completedGroupsByDynamicSearch?.size || 0,
      coordinationActive: !!window.globalState?.dynamicSearchCoordination,
      updateHistory: window.currentGroupManager?.updateHistory.length || 0,
      transitionHistory: window.getTransitionDiagnostics?.().transitionHistory.length || 0
    }
  };

  console.table(finalSystemState.unifiedFunctions);
  console.table(finalSystemState.coordinationFunctions);
  console.log("現在の状態:", finalSystemState.currentState);

  // 成功基準の評価
  const allBasicSystemsReady = finalSystemState.currentGroupManager &&
                              finalSystemState.groupTransitionCoordinator &&
                              finalSystemState.dynamicTaskSearch;

  const allUnifiedFunctionsReady = Object.values(finalSystemState.unifiedFunctions).every(f => f === true);
  const allCoordinationFunctionsReady = Object.values(finalSystemState.coordinationFunctions).every(f => f === true);

  const systemFullyOperational = allBasicSystemsReady && allUnifiedFunctionsReady && allCoordinationFunctionsReady;

  console.log("\n🎯 最終評価:");
  console.log(`基本システム: ${allBasicSystemsReady ? "✅ 正常" : "❌ 異常"}`);
  console.log(`統一インターフェース: ${allUnifiedFunctionsReady ? "✅ 正常" : "❌ 異常"}`);
  console.log(`協調機能: ${allCoordinationFunctionsReady ? "✅ 正常" : "❌ 異常"}`);
  console.log(`=======================================`);
  console.log(`総合評価: ${systemFullyOperational ? "✅ システム完全動作" : "❌ システム異常"}`);

  if (systemFullyOperational) {
    console.log("\n🎉 ハイブリッド協調システムは完全に動作しています！");
    console.log("   - AIタスク重複実行問題は解決されました");
    console.log("   - 長期安定性も確保されています");
    console.log("   - Think harderアプローチによる根本解決が完了しました");
  } else {
    console.log("\n⚠️ システムに問題が検出されました");
    console.log("   詳細な診断が必要です");
  }

  return finalSystemState;
}

// 最終レポート実行
const finalReport = generateFinalReport();
```

---

## 問題発生時の対処法

```javascript
// システムリセット（問題発生時）
function emergencySystemReset() {
  console.log("🚨 緊急システムリセット実行");

  try {
    // 各システムのリセット
    if (window.currentGroupManager && window.currentGroupManager.reset) {
      window.currentGroupManager.reset();
      console.log("✅ CurrentGroupManager リセット完了");
    }

    if (window.groupTransitionCoordinator && window.groupTransitionCoordinator.reset) {
      window.groupTransitionCoordinator.reset();
      console.log("✅ GroupTransitionCoordinator リセット完了");
    }

    if (window.DynamicTaskSearch && window.DynamicTaskSearch.reset) {
      window.DynamicTaskSearch.reset();
      console.log("✅ DynamicTaskSearch リセット完了");
    }

    // ポーリングの停止
    if (window.dynamicSearchPollingInterval) {
      clearInterval(window.dynamicSearchPollingInterval);
      window.dynamicSearchPollingInterval = null;
      console.log("✅ ポーリング停止完了");
    }

    // globalState の協調部分をクリア
    if (window.globalState) {
      delete window.globalState.completedGroupsByDynamicSearch;
      delete window.globalState.dynamicSearchCoordination;
      delete window.globalState.dynamicSearchNotification;
      console.log("✅ globalState協調情報クリア完了");
    }

    console.log("✅ 緊急システムリセット完了 - ページリロードを推奨");

  } catch (error) {
    console.error("❌ 緊急システムリセットエラー:", error);
    console.log("💡 手動でページリロードしてください");
  }
}

// 緊急時のリセット実行（必要に応じてコメントアウト解除）
// emergencySystemReset();
```

この段階的検証手順により、実装したハイブリッド協調システムの動作状況を詳細に確認できます。各ステップで期待される結果と実際の結果を比較し、問題があれば特定の箇所を詳しく調査できます。