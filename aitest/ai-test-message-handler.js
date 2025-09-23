/**
 * @fileoverview AI統合テスト用メッセージハンドラー
 *
 * 各AI Content Script（4-1, 4-2, 4-3）に追加する
 * PING/EXECUTE_TASKメッセージ処理
 *
 * @version 1.0.0
 * @updated 2025-09-23
 */

(function () {
  "use strict";

  // AIタイプを判定
  const getAIType = () => {
    const url = window.location.href;
    if (url.includes("chatgpt.com") || url.includes("chat.openai.com")) {
      return "chatgpt";
    } else if (url.includes("claude.ai")) {
      return "claude";
    } else if (url.includes("gemini.google.com")) {
      return "gemini";
    } else {
      return null;
    }
  };

  const AI_TYPE = getAIType();

  if (!AI_TYPE) {
    console.warn(
      "⚠️ [AI Test Handler] Unknown AI type for URL:",
      window.location.href,
    );
    return;
  }

  console.log(`✅ [AI Test Handler] Initialized for ${AI_TYPE}`);

  // メッセージリスナー
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // PING応答（準備完了確認）
    if (request.type === "PING" && request.aiType === AI_TYPE) {
      console.log(`📡 [${AI_TYPE}] PING received`);

      // 各AIのautomationスクリプトが読み込まれているかチェック
      let isReady = false;

      switch (AI_TYPE) {
        case "chatgpt":
          isReady =
            typeof window.ChatGPTAutomation !== "undefined" &&
            typeof window.ChatGPTAutomation.executeTask === "function";
          break;
        case "claude":
          // Claudeは2つの形式をチェック（下位互換性）
          isReady =
            (typeof window.ClaudeAutomation !== "undefined" &&
              typeof window.ClaudeAutomation.executeTask === "function") ||
            typeof window.executeTask === "function";
          break;
        case "gemini":
          isReady =
            typeof window.GeminiAutomation !== "undefined" &&
            typeof window.GeminiAutomation.executeTask === "function";
          break;
      }

      if (isReady) {
        sendResponse({
          success: true,
          aiType: AI_TYPE,
          ready: true,
          message: `${AI_TYPE} is ready`,
        });
      } else {
        sendResponse({
          success: false,
          aiType: AI_TYPE,
          ready: false,
          message: `${AI_TYPE} automation not loaded yet`,
        });
      }
      return true;
    }

    // タスク実行
    if (request.type === "EXECUTE_TASK" && request.aiType === AI_TYPE) {
      console.log(
        `🚀 [${AI_TYPE}] Task execution requested:`,
        request.taskData,
      );

      (async () => {
        try {
          let result = null;

          // 各AIのexecuteTask関数を呼び出し
          switch (AI_TYPE) {
            case "chatgpt":
              if (
                window.ChatGPTAutomation &&
                window.ChatGPTAutomation.executeTask
              ) {
                result = await window.ChatGPTAutomation.executeTask(
                  request.taskData,
                );
              } else {
                throw new Error("ChatGPT automation not available");
              }
              break;

            case "claude":
              // Claudeは2つの形式に対応（下位互換性）
              if (
                window.ClaudeAutomation &&
                window.ClaudeAutomation.executeTask
              ) {
                result = await window.ClaudeAutomation.executeTask(
                  request.taskData,
                );
              } else if (typeof window.executeTask === "function") {
                result = await window.executeTask(request.taskData);
              } else {
                throw new Error("Claude automation not available");
              }
              break;

            case "gemini":
              if (
                window.GeminiAutomation &&
                window.GeminiAutomation.executeTask
              ) {
                result = await window.GeminiAutomation.executeTask(
                  request.taskData,
                );
              } else {
                throw new Error("Gemini automation not available");
              }
              break;

            default:
              throw new Error(`Unknown AI type: ${AI_TYPE}`);
          }

          console.log(`✅ [${AI_TYPE}] Task completed:`, result);

          // 結果を送信
          sendResponse({
            success: true,
            aiType: AI_TYPE,
            result: result,
          });

          // background.jsにも完了通知
          chrome.runtime.sendMessage({
            type: "TASK_COMPLETE",
            aiType: AI_TYPE,
            taskId: request.taskData.taskId,
            result: result,
          });
        } catch (error) {
          console.error(`❌ [${AI_TYPE}] Task execution error:`, error);

          sendResponse({
            success: false,
            aiType: AI_TYPE,
            error: error.message,
          });

          // エラーもbackground.jsに通知
          chrome.runtime.sendMessage({
            type: "TASK_COMPLETE",
            aiType: AI_TYPE,
            taskId: request.taskData.taskId,
            result: {
              success: false,
              error: error.message,
            },
          });
        }
      })();

      return true; // 非同期レスポンス許可
    }
  });

  // 初期化完了を通知
  console.log(
    `✅ [AI Test Handler] Message listeners registered for ${AI_TYPE}`,
  );

  // 既存のexecuteTask関数をラップして、より安全にする
  const wrapExecuteTask = () => {
    switch (AI_TYPE) {
      case "chatgpt":
        if (window.ChatGPTAutomation && window.ChatGPTAutomation.executeTask) {
          const originalExecuteTask = window.ChatGPTAutomation.executeTask;
          window.ChatGPTAutomation.executeTask = async function (taskData) {
            console.log(
              `🎯 [${AI_TYPE}] Wrapped executeTask called:`,
              taskData,
            );
            try {
              const result = await originalExecuteTask.call(this, taskData);
              console.log(
                `✅ [${AI_TYPE}] Wrapped executeTask success:`,
                result,
              );
              return result;
            } catch (error) {
              console.error(
                `❌ [${AI_TYPE}] Wrapped executeTask error:`,
                error,
              );
              throw error;
            }
          };
        }
        break;

      case "claude":
        // Claudeは2つの形式に対応
        if (window.ClaudeAutomation && window.ClaudeAutomation.executeTask) {
          const originalExecuteTask = window.ClaudeAutomation.executeTask;
          window.ClaudeAutomation.executeTask = async function (taskData) {
            console.log(
              `🎯 [${AI_TYPE}] Wrapped ClaudeAutomation.executeTask called:`,
              taskData,
            );
            try {
              const result = await originalExecuteTask.call(this, taskData);
              console.log(
                `✅ [${AI_TYPE}] Wrapped ClaudeAutomation.executeTask success:`,
                result,
              );
              return result;
            } catch (error) {
              console.error(
                `❌ [${AI_TYPE}] Wrapped ClaudeAutomation.executeTask error:`,
                error,
              );
              throw error;
            }
          };
        } else if (typeof window.executeTask === "function") {
          const originalExecuteTask = window.executeTask;
          window.executeTask = async function (taskData) {
            console.log(
              `🎯 [${AI_TYPE}] Wrapped window.executeTask called:`,
              taskData,
            );
            try {
              const result = await originalExecuteTask.call(this, taskData);
              console.log(
                `✅ [${AI_TYPE}] Wrapped window.executeTask success:`,
                result,
              );
              return result;
            } catch (error) {
              console.error(
                `❌ [${AI_TYPE}] Wrapped window.executeTask error:`,
                error,
              );
              throw error;
            }
          };
        }
        break;

      case "gemini":
        if (window.GeminiAutomation && window.GeminiAutomation.executeTask) {
          const originalExecuteTask = window.GeminiAutomation.executeTask;
          window.GeminiAutomation.executeTask = async function (taskData) {
            console.log(
              `🎯 [${AI_TYPE}] Wrapped executeTask called:`,
              taskData,
            );
            try {
              const result = await originalExecuteTask.call(this, taskData);
              console.log(
                `✅ [${AI_TYPE}] Wrapped executeTask success:`,
                result,
              );
              return result;
            } catch (error) {
              console.error(
                `❌ [${AI_TYPE}] Wrapped executeTask error:`,
                error,
              );
              throw error;
            }
          };
        }
        break;
    }
  };

  // ラップ処理を少し遅延実行（automationスクリプトが読み込まれるのを待つ）
  setTimeout(wrapExecuteTask, 1000);
  setTimeout(wrapExecuteTask, 3000); // 念のため再実行
  setTimeout(wrapExecuteTask, 5000); // さらに念のため
})();
