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

    // モデル・機能の探索
    if (request.type === "DISCOVER_FEATURES" && request.aiType === AI_TYPE) {
      console.log(`🔍 [${AI_TYPE}] Model/Feature discovery requested`);

      (async () => {
        try {
          let result = null;

          switch (AI_TYPE) {
            case "claude":
              // Claudeのモデル・機能探索
              const models = [];
              const features = [];

              // モデル探索
              if (typeof window.detectClaudeModelsFromOpenMenu === "function") {
                console.log(`📋 [Claude] Detecting models...`);
                try {
                  const detectedModels =
                    await window.detectClaudeModelsFromOpenMenu();
                  models.push(...detectedModels.map((m) => m.name || m));
                  console.log(`✅ [Claude] Models detected:`, models);
                } catch (error) {
                  console.error(`❌ [Claude] Model detection error:`, error);
                }
              }

              // 機能探索
              if (
                typeof window.detectClaudeFunctionsFromOpenMenu === "function"
              ) {
                console.log(`📋 [Claude] Detecting features...`);
                try {
                  const detectedFeatures =
                    await window.detectClaudeFunctionsFromOpenMenu();
                  features.push(...detectedFeatures.map((f) => f.name || f));
                  console.log(`✅ [Claude] Features detected:`, features);
                } catch (error) {
                  console.error(`❌ [Claude] Feature detection error:`, error);
                }
              }

              result = { models, features };
              break;

            case "chatgpt":
              // ChatGPTのモデル・機能探索（再試行ロジック付き）
              let detectionRetryCount = 0;
              const detectionMaxRetries = 30; // 6秒間（200ms × 30回）

              while (detectionRetryCount < detectionMaxRetries) {
                if (
                  window.ChatGPTAutomation &&
                  typeof window.ChatGPTAutomation
                    .detectChatGPTModelsAndFeatures === "function"
                ) {
                  console.log(
                    `📋 [ChatGPT] Detecting models and features... (retry ${detectionRetryCount})`,
                  );
                  try {
                    result =
                      await window.ChatGPTAutomation.detectChatGPTModelsAndFeatures();
                    console.log(`✅ [ChatGPT] Detection completed:`, result);
                    break;
                  } catch (error) {
                    console.error(`❌ [ChatGPT] Detection error:`, error);
                    result = { models: [], features: [] };
                    break;
                  }
                }

                console.log(
                  `⏳ [ChatGPT] Waiting for detection functions... (${detectionRetryCount}/${detectionMaxRetries})`,
                );
                await new Promise((resolve) => setTimeout(resolve, 200));
                detectionRetryCount++;
              }

              if (detectionRetryCount >= detectionMaxRetries) {
                console.log(
                  `⚠️ [ChatGPT] detectChatGPTModelsAndFeatures not available after retries`,
                );
                result = { models: [], features: [] };
              }
              break;

            case "gemini":
              // Geminiのモデル・機能探索
              if (
                window.GeminiAutomation &&
                window.GeminiAutomation.discoverModelsAndFeatures
              ) {
                result =
                  await window.GeminiAutomation.discoverModelsAndFeatures();
              } else {
                console.log(
                  `⚠️ [Gemini] discoverModelsAndFeatures not available`,
                );
                result = { models: [], features: [] };
              }
              break;

            default:
              throw new Error(`Unknown AI type: ${AI_TYPE}`);
          }

          console.log(`✅ [${AI_TYPE}] Discovery completed:`, result);

          sendResponse({
            success: true,
            aiType: AI_TYPE,
            result: result,
          });
        } catch (error) {
          console.error(`❌ [${AI_TYPE}] Discovery error:`, error);

          sendResponse({
            success: false,
            aiType: AI_TYPE,
            error: error.message,
          });
        }
      })();

      return true; // 非同期レスポンス許可
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

          // デバッグログ追加
          if (AI_TYPE === "gemini") {
            console.log(`🔍 [Handler Debug 1] Geminiから受け取った結果:`, {
              resultType: typeof result,
              resultKeys: Object.keys(result || {}),
              resultContent: result?.content,
              fullResult: result,
            });
          }

          // 結果を送信
          sendResponse({
            success: true,
            aiType: AI_TYPE,
            result: result,
          });

          // デバッグログ追加
          if (AI_TYPE === "gemini") {
            console.log(`🔍 [Handler Debug 2] sendResponseで送信するデータ:`, {
              aiType: AI_TYPE,
              resultInResponse: result,
            });
          }

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

  // 既存のexecuteTask関数をラップして、モデル・機能選択に対応
  const wrapExecuteTask = () => {
    switch (AI_TYPE) {
      case "chatgpt":
        if (!window.ChatGPTAutomation) {
          window.ChatGPTAutomation = {};
        }

        // 既にラップ済みの場合はスキップ（無限ループ防止）
        if (window.ChatGPTAutomation.__executeTaskWrapped) {
          console.log(`⚠️ [ChatGPT] executeTask already wrapped, skipping`);
          return;
        }

        // ラップ済みフラグを設定
        window.ChatGPTAutomation.__executeTaskWrapped = true;

        // ChatGPT用のexecuteTask実装
        window.ChatGPTAutomation.executeTask = async function (taskData) {
          console.log(`🎯 [ChatGPT] executeTask called:`, taskData);
          console.log(`📊 [ChatGPT] taskData type:`, typeof taskData);
          console.log(
            `📊 [ChatGPT] taskData keys:`,
            Object.keys(taskData || {}),
          );

          try {
            // taskDataから実際のプロンプトを取得
            const actualPrompt = taskData?.prompt || taskData || "";
            console.log(`📝 [ChatGPT] actualPrompt:`, actualPrompt);
            console.log(`📝 [ChatGPT] actualPrompt type:`, typeof actualPrompt);

            // ChatGPTAutomationV2の読み込みを待機（最大10秒）
            let retryCount = 0;
            const maxRetries = 50; // 10秒間（200ms × 50回）

            while (retryCount < maxRetries) {
              if (
                typeof window.ChatGPTAutomationV2?.executeTask === "function"
              ) {
                console.log(
                  `✅ [ChatGPT] Using ChatGPTAutomationV2.executeTask (retry ${retryCount})`,
                );
                const result =
                  await window.ChatGPTAutomationV2.executeTask(taskData);
                return {
                  success: true,
                  result: result,
                  timestamp: new Date().toISOString(),
                };
              } else if (
                typeof window.ChatGPTAutomationV2?.runAutomation === "function"
              ) {
                console.log(
                  `✅ [ChatGPT] Using ChatGPTAutomationV2.runAutomation (retry ${retryCount})`,
                );
                const config = {
                  prompt: actualPrompt,
                  model: taskData?.model || "",
                  feature: taskData?.feature || "",
                };

                console.log(`📝 [ChatGPT] runAutomation config:`, config);
                const result =
                  await window.ChatGPTAutomationV2.runAutomation(config);

                return {
                  success: true,
                  result: result,
                  timestamp: new Date().toISOString(),
                };
              }

              // まだ利用できない場合は少し待つ
              console.log(
                `⏳ [ChatGPT] Waiting for automation functions... (${retryCount}/${maxRetries})`,
              );
              await new Promise((resolve) => setTimeout(resolve, 200));
              retryCount++;
            }

            // 最終的に見つからない場合
            console.error(
              `❌ [ChatGPT] Available functions after ${maxRetries} retries:`,
              {
                ChatGPTAutomationV2: typeof window.ChatGPTAutomationV2,
                executeTask: typeof window.ChatGPTAutomationV2?.executeTask,
                runAutomation: typeof window.ChatGPTAutomationV2?.runAutomation,
              },
            );
            throw new Error(
              "ChatGPT automation functions not available after retries",
            );
          } catch (error) {
            console.error(`❌ [ChatGPT] executeTask error:`, error);
            throw error;
          }
        };
        break;

      case "claude":
        if (!window.ClaudeAutomation) {
          window.ClaudeAutomation = {};
        }

        // 既にラップ済みの場合はスキップ（無限ループ防止）
        if (window.ClaudeAutomation.__executeTaskWrapped) {
          console.log(`⚠️ [Claude] executeTask already wrapped, skipping`);
          return;
        }

        // ラップ済みフラグを設定
        window.ClaudeAutomation.__executeTaskWrapped = true;

        // Claude用のexecuteTask実装
        window.ClaudeAutomation.executeTask = async function (taskData) {
          console.log(`🎯 [Claude] executeTask called:`, taskData);
          console.log(`📊 [Claude] taskData type:`, typeof taskData);
          console.log(
            `📊 [Claude] taskData keys:`,
            Object.keys(taskData || {}),
          );
          console.log(`📊 [Claude] taskData.prompt:`, taskData?.prompt);
          console.log(
            `📊 [Claude] taskData.prompt type:`,
            typeof taskData?.prompt,
          );

          try {
            // 既存のexecuteTask関数がある場合はそれを使用
            if (typeof window.executeTask === "function") {
              console.log(`✅ [Claude] Using existing window.executeTask`);
              console.log(
                `📝 [Claude] Passing taskData directly to executeTask`,
              );

              // executeTaskは文字列のプロンプトまたはオブジェクトを受け取る
              const result = await window.executeTask(taskData);

              return {
                success: true,
                result: result,
                timestamp: new Date().toISOString(),
              };
            } else if (
              typeof window.ClaudeAutomation?.runAutomation === "function"
            ) {
              console.log(`✅ [Claude] Using ClaudeAutomation.runAutomation`);
              const actualPrompt = taskData?.prompt || taskData || "";
              const config = {
                prompt: actualPrompt,
                model: taskData?.model || "",
                feature: taskData?.feature || "",
              };

              console.log(`📝 [Claude] runAutomation config:`, config);
              const result =
                await window.ClaudeAutomation.runAutomation(config);

              return {
                success: true,
                result: result,
                timestamp: new Date().toISOString(),
              };
            } else {
              console.error(`❌ [Claude] Available functions:`, {
                executeTask: typeof window.executeTask,
                ClaudeAutomation: typeof window.ClaudeAutomation,
                runAutomation: typeof window.ClaudeAutomation?.runAutomation,
              });
              throw new Error("Claude automation functions not available");
            }
          } catch (error) {
            console.error(`❌ [Claude] executeTask error:`, error);
            throw error;
          }
        };
        break;

      case "gemini":
        if (!window.GeminiAutomation) {
          window.GeminiAutomation = {};
        }

        // 既にラップ済みの場合はスキップ（無限ループ防止）
        if (window.GeminiAutomation.__executeTaskWrapped) {
          console.log(`⚠️ [Gemini] executeTask already wrapped, skipping`);
          return;
        }

        // ラップ済みフラグを設定
        window.GeminiAutomation.__executeTaskWrapped = true;

        // Gemini用のexecuteTask実装
        window.GeminiAutomation.executeTask = async function (taskData) {
          console.log(`🎯 [Gemini] executeTask called:`, taskData);
          console.log(`📊 [Gemini] taskData type:`, typeof taskData);
          console.log(
            `📊 [Gemini] taskData keys:`,
            Object.keys(taskData || {}),
          );

          try {
            // taskDataが文字列の場合とオブジェクトの場合の両方に対応
            let actualPrompt = "";
            let model = "";
            let feature = "";

            if (typeof taskData === "string") {
              console.log(`📝 [Gemini] taskData is string, using as prompt`);
              actualPrompt = taskData;
            } else if (typeof taskData === "object" && taskData !== null) {
              console.log(
                `📝 [Gemini] taskData is object, extracting properties`,
              );
              actualPrompt = taskData.prompt || "";
              model = taskData.model || "";
              feature = taskData.feature || "";
            }

            console.log(`📝 [Gemini] Final prompt:`, actualPrompt);
            console.log(`📝 [Gemini] Final prompt type:`, typeof actualPrompt);

            // 既存のGeminiAutomationV3を探す
            if (typeof window.GeminiAutomationV3?.executeTask === "function") {
              console.log(`✅ [Gemini] Using GeminiAutomationV3.executeTask`);
              const result =
                await window.GeminiAutomationV3.executeTask(actualPrompt);
              return {
                success: true,
                result: result,
                timestamp: new Date().toISOString(),
              };
            } else if (
              typeof window.GeminiAutomation?.runAutomation === "function"
            ) {
              console.log(`✅ [Gemini] Using GeminiAutomation.runAutomation`);
              const config = {
                prompt: actualPrompt,
                model: model,
                feature: feature,
              };

              console.log(`📝 [Gemini] runAutomation config:`, config);
              const result =
                await window.GeminiAutomation.runAutomation(config);

              return {
                success: true,
                result: result,
                timestamp: new Date().toISOString(),
              };
            } else {
              console.error(`❌ [Gemini] Available functions:`, {
                GeminiAutomationV3: typeof window.GeminiAutomationV3,
                GeminiAutomation: typeof window.GeminiAutomation,
                executeTask: typeof window.GeminiAutomationV3?.executeTask,
                runAutomation: typeof window.GeminiAutomation?.runAutomation,
              });
              throw new Error("Gemini automation functions not available");
            }
          } catch (error) {
            console.error(`❌ [Gemini] executeTask error:`, error);
            throw error;
          }
        };
        break;
    }
  };

  // ラップ処理を即座に実行（既に読み込まれているはず）
  console.log(`🔄 [${AI_TYPE}] wrapExecuteTask 初回実行`);
  wrapExecuteTask();

  // 元の関数を保存して定期的にラップを再適用
  let originalExecuteTask = null;
  let wrappedExecuteTask = null;

  // Claudeの場合は特別な処理
  if (AI_TYPE === "claude") {
    // 0.5秒ごとにチェックして、元の関数が上書きされていたら再ラップ
    setInterval(() => {
      // window.executeTaskが存在し、ラップされていない場合
      if (
        typeof window.executeTask === "function" &&
        window.executeTask !== wrappedExecuteTask
      ) {
        console.log(`🔄 [Claude] executeTaskの再ラップが必要`);
        originalExecuteTask = window.executeTask;

        // ラッパー関数を作成
        wrappedExecuteTask = async function (taskData) {
          console.log(`🎯 [Claude] ラッパー経由でexecuteTask呼び出し`);
          console.log(`📊 taskData:`, taskData);

          // taskDataがオブジェクトの場合、プロンプトを抽出
          if (typeof taskData === "object" && taskData !== null) {
            const prompt = taskData.prompt || taskData.text || "";
            console.log(
              `📝 文字列プロンプトに変換: ${prompt.substring(0, 50)}...`,
            );
            return await originalExecuteTask(prompt);
          }

          // すでに文字列の場合はそのまま渡す
          return await originalExecuteTask(taskData);
        };

        // ラップした関数を設定
        window.executeTask = wrappedExecuteTask;
        console.log(`✅ [Claude] executeTaskを再ラップしました`);
      }
    }, 500);
  }

  // 他のAIサービスも念のため遅延実行
  setTimeout(() => {
    console.log(`🔄 [${AI_TYPE}] wrapExecuteTask 1秒後再実行`);
    wrapExecuteTask();
  }, 1000);

  setTimeout(() => {
    console.log(`🔄 [${AI_TYPE}] wrapExecuteTask 3秒後再実行`);
    wrapExecuteTask();
  }, 3000);
})();
