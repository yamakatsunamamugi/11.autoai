/**
 * @fileoverview 統合AIテスト開始 コントローラー
 * 
 * AI Orchestratorを開いてテスト環境を提供する機能を管理します。
 * 手動テスト、3連続テスト、プロンプト管理などのテスト機能を提供します。
 */

/**
 * 統合AIテストを実行
 * 【テスト実行】
 * AI Orchestratorを開いてテスト環境を提供します。
 * 手動テスト、3連続テスト、プロンプト管理などのテスト機能が使えます。
 * 
 * 主な用途:
 * - AI動作の手動確認
 * - 3連続テストでの性能測定
 * - プロンプトの登録・管理
 * - タスクリストのデバッグ（タスクリストがある場合は渡される）
 * 
 * 注意: これは本番実行ではなく、テスト・デバッグ用の機能です。
 */
export async function runIntegratedAITest() {
  try {
    console.log("【テスト実行】AI Orchestratorを開きます");
    
    // TaskQueueから現在のタスクリストを取得（デバッグ用）
    const taskList = await loadTaskList();
    
    if (taskList) {
      // タスクリストをJSON化してChrome Storageに保存
      const taskData = taskList.toJSON();
      await chrome.storage.local.set({
        'task_queue_for_test': taskData
      });
      console.log("📋 タスクリストをChrome Storageに保存しました:", taskData);
    }
    
    // AI Orchestratorページを開く（タスクリストモードで）
    const orchestratorUrl = chrome.runtime.getURL(
      "src/ai-execution/ai-orchestrator.html?mode=tasklist"
    );

    // ウィンドウ設定
    const windowFeatures = `
      width=1200,
      height=800,
      left=${(screen.width - 1200) / 2},
      top=${(screen.height - 800) / 2},
      scrollbars=yes,
      resizable=yes,
      status=no,
      toolbar=no,
      menubar=no,
      location=no
    `.replace(/\\s+/g, "");

    // 新しいウィンドウでAI Orchestratorを開く
    const orchestratorWindow = window.open(
      orchestratorUrl,
      `ai_orchestrator_test_${Date.now()}`,
      windowFeatures
    );

    if (orchestratorWindow) {
      console.log("✅ AI Orchestrator（テスト版）が開かれました");
      console.log("📋 タスクリストがある場合は、テスト環境で実行できます");
      console.log("🔧 手動テスト、3連続テスト、プロンプト管理が利用可能です");
      return { success: true, window: orchestratorWindow };
    } else {
      throw new Error("AI Orchestratorを開けませんでした。ポップアップブロッカーを確認してください。");
    }
  } catch (error) {
    console.error("統合AIテスト開始エラー:", error);
    alert(`AI Orchestratorを開けませんでした: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * TaskQueueからタスクリストを取得
 * @private
 */
async function loadTaskList() {
  try {
    const { default: TaskQueue } = await import("../../features/task/queue.js");
    const taskQueue = new TaskQueue();
    return await taskQueue.loadTaskList();
  } catch (error) {
    console.warn("TaskQueue読み込みエラー（テスト環境では正常）:", error);
    return null;
  }
}