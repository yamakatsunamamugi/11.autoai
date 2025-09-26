// background.js - Service Worker for Chrome Extension (Manifest V3)
// log.debug("🚀 Background Service Worker started");

// Extension初回インストール時の処理
chrome.runtime.onInstalled.addListener(() => {
  // log.debug("✅ Extension installed/updated");
});

// タブ更新時の処理を削除 - step4-tasklist.jsで統一管理
// Content Script注入はタスク実行時にのみ行う

// ========================================
// SimpleSheetsClient: スプレッドシート操作クラス
// ========================================
class SimpleSheetsClient {
  constructor() {
    this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    this.sheetNameCache = new Map(); // シート名キャッシュ
  }

  /**
   * 認証トークン取得
   */
  async getAuthToken() {
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.identity) {
        reject(new Error("Chrome Identity APIが利用できません"));
        return;
      }

      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }

  /**
   * スプレッドシートに値を書き込み（単一セル）
   */
  async updateValue(spreadsheetId, range, value) {
    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [[value]],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`書き込み失敗: HTTP ${response.status}, ${errorText}`);
    }

    return await response.json();
  }

  /**
   * リッチテキストでURLリンクを含むセルを書き込み
   */
  async updateRichTextValue(spreadsheetId, range, text, linkUrl) {
    const token = await this.getAuthToken();

    // リッチテキストフォーマットを適用
    const batchUpdateUrl = `${this.baseUrl}/${spreadsheetId}:batchUpdate`;

    // A1形式をGridRangeに変換
    const sheetMatch = range.match(/^'?([^'!]+)'?!/);
    const cellMatch = range.match(/([A-Z]+)(\d+)/);

    if (!cellMatch) {
      console.warn("リッチテキスト設定失敗: 範囲の解析エラー", range);
      return;
    }

    const col =
      cellMatch[1]
        .split("")
        .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
    const row = parseInt(cellMatch[2]) - 1;

    // URL部分を見つける（"URL: "プレフィックスを考慮）
    let urlStartIndex = text.indexOf(linkUrl);
    if (urlStartIndex === -1) {
      // "URL: "付きで検索
      const urlWithPrefix = `URL: ${linkUrl}`;
      const prefixIndex = text.indexOf(urlWithPrefix);
      if (prefixIndex !== -1) {
        urlStartIndex = prefixIndex + 5; // "URL: "の長さ分ずらす
      } else {
        console.warn(
          "リッチテキスト設定失敗: URLがテキスト内に見つかりません",
          {
            searchedUrl: linkUrl,
            textLength: text.length,
            textPreview: text.substring(0, 200),
          },
        );
        return;
      }
    }

    const urlEndIndex = urlStartIndex + linkUrl.length;

    // シートIDを取得
    let sheetId = null; // デフォルト値を null に変更

    try {
      // スプレッドシートメタデータを取得
      const token = await this.getAuthToken();
      const metadataUrl = `${this.baseUrl}/${spreadsheetId}`;
      const metadataResponse = await fetch(metadataUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();

        // シート名が指定されている場合は該当シートを検索
        if (sheetMatch && sheetMatch[1]) {
          const sheetName = sheetMatch[1];
          const sheet = metadata.sheets?.find(
            (s) => s.properties.title === sheetName,
          );
          if (sheet) {
            sheetId = sheet.properties.sheetId;
            console.log(`✅ シートID取得成功: "${sheetName}" → ID: ${sheetId}`);
          } else {
            // 指定されたシート名が見つからない場合は最初のシートを使用
            if (metadata.sheets && metadata.sheets.length > 0) {
              sheetId = metadata.sheets[0].properties.sheetId;
              console.warn(
                `⚠️ シート名 "${sheetName}" が見つからないため、最初のシート(ID: ${sheetId})を使用`,
              );
            }
          }
        } else {
          // シート名が指定されていない場合は最初のシートを使用
          if (metadata.sheets && metadata.sheets.length > 0) {
            sheetId = metadata.sheets[0].properties.sheetId;
            console.log(
              `💡 シート名が指定されていないため、最初のシート(ID: ${sheetId})を使用`,
            );
          }
        }
      } else {
        console.warn("⚠️ シートメタデータ取得失敗");
      }
    } catch (error) {
      console.warn("⚠️ シートID取得エラー:", error.message);
    }

    // シートIDが取得できない場合はリッチテキスト設定をスキップ
    if (sheetId === null) {
      console.warn(
        "⚠️ シートIDが取得できないため、リッチテキスト設定をスキップします",
      );
      return;
    }

    const requests = [
      {
        updateCells: {
          rows: [
            {
              values: [
                {
                  userEnteredValue: {
                    stringValue: text,
                  },
                  textFormatRuns: [
                    {
                      startIndex: urlStartIndex,
                      format: {
                        link: {
                          uri: linkUrl,
                        },
                        foregroundColor: {
                          blue: 1.0,
                        },
                        underline: true,
                      },
                    },
                    {
                      startIndex: urlEndIndex,
                      format: {},
                    },
                  ],
                },
              ],
            },
          ],
          fields: "userEnteredValue,textFormatRuns",
          range: {
            sheetId: sheetId, // 動的に取得したシートIDを使用
            startRowIndex: row,
            endRowIndex: row + 1,
            startColumnIndex: col,
            endColumnIndex: col + 1,
          },
        },
      },
    ];

    console.log("📝 リッチテキスト設定リクエスト:", {
      spreadsheetId: spreadsheetId,
      range: range,
      urlStartIndex: urlStartIndex,
      urlEndIndex: urlEndIndex,
      linkUrl: linkUrl,
      textPreview: text.substring(0, 100) + "...",
    });

    const response = await fetch(batchUpdateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `リッチテキスト設定失敗: HTTP ${response.status}, ${errorText}`,
      );
      throw new Error(`リッチテキスト設定失敗: ${errorText}`);
    }

    console.log("✅ リッチテキスト設定成功");
    return await response.json();
  }

  /**
   * スプレッドシートから全データを取得
   */
  async getAllValues(spreadsheetId) {
    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values/A1:Z1000`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`データ取得失敗: HTTP ${response.status}, ${errorText}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  /**
   * バッチ更新（複数範囲の一括更新）
   */
  async batchUpdate(spreadsheetId, updateRequests) {
    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values:batchUpdate`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updateRequests,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`バッチ更新失敗: HTTP ${response.status}, ${errorText}`);
    }

    return await response.json();
  }

  /**
   * GIDからシート名を取得
   */
  async getSheetNameFromGid(spreadsheetId, gid) {
    // キャッシュチェック
    const cacheKey = `${spreadsheetId}-${gid}`;
    if (this.sheetNameCache.has(cacheKey)) {
      return this.sheetNameCache.get(cacheKey);
    }

    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`スプレッドシート情報取得失敗: ${response.statusText}`);
    }

    const data = await response.json();
    const sheets = data.sheets || [];

    for (const sheet of sheets) {
      if (sheet.properties && sheet.properties.sheetId == gid) {
        const sheetName = sheet.properties.title;
        this.sheetNameCache.set(cacheKey, sheetName);
        return sheetName;
      }
    }

    return null; // 見つからない場合
  }
}

// グローバルインスタンス
const sheetsClient = new SimpleSheetsClient();

// ========================================
// ログ記録関数
// ========================================

/**
 * ログをフォーマット
 */
function formatLogEntry(request) {
  const parts = [];
  const aiType = request.taskInfo?.aiType || "AI不明";

  // AIタイプをヘッダーとして
  parts.push(`---------- ${aiType} ----------`);

  // モデル情報
  const selectedModel =
    request.taskInfo?.model && request.taskInfo?.model !== "不明"
      ? request.taskInfo.model
      : "不明";
  const displayedModel = request.taskInfo?.displayedModel || selectedModel;
  parts.push(`モデル: 選択: ${selectedModel} / 表示: ${displayedModel}`);

  // 機能情報
  const selectedFunction =
    request.taskInfo?.function && request.taskInfo?.function !== "通常"
      ? request.taskInfo.function
      : "通常";
  const displayedFunction =
    request.taskInfo?.displayedFunction || selectedFunction;
  parts.push(`機能: 選択: ${selectedFunction} / 表示: ${displayedFunction}`);

  // URLを機能の直後に追加（Gemini形式）
  const urlValue = request.taskInfo?.url;
  if (urlValue && typeof urlValue === "string" && urlValue.trim() !== "") {
    parts.push(`URL: ${urlValue}`);
    console.log("✅ [DEBUG-URL] URLをログに追加:", urlValue);
  } else {
    // フォールバック: 他の場所からURLを探索
    const fallbackUrl =
      request.url || request.taskInfo?.cellInfo?.url || request.data?.url;
    if (
      fallbackUrl &&
      typeof fallbackUrl === "string" &&
      fallbackUrl.trim() !== ""
    ) {
      parts.push(`URL: ${fallbackUrl}`);
      console.log("🔄 [DEBUG-URL] フォールバックURLをログに追加:", fallbackUrl);
    }
  }

  // 送信時刻（Gemini形式: YYYY/M/D HH:MM:SS）
  if (request.sendTime) {
    const sendTime = new Date(request.sendTime);
    const year = sendTime.getFullYear();
    const month = sendTime.getMonth() + 1; // 月は0-indexed
    const day = sendTime.getDate();
    const hours = String(sendTime.getHours()).padStart(2, "0");
    const minutes = String(sendTime.getMinutes()).padStart(2, "0");
    const seconds = String(sendTime.getSeconds()).padStart(2, "0");
    parts.push(
      `送信時刻: ${year}/${month}/${day} ${hours}:${minutes}:${seconds}`,
    );
  }

  // 記載時刻（タスク完了時刻を使用、秒数差も表示）
  if (request.completionTime) {
    const recordTime = new Date(request.completionTime);
    const year = recordTime.getFullYear();
    const month = recordTime.getMonth() + 1;
    const day = recordTime.getDate();
    const hours = String(recordTime.getHours()).padStart(2, "0");
    const minutes = String(recordTime.getMinutes()).padStart(2, "0");
    const seconds = String(recordTime.getSeconds()).padStart(2, "0");

    // 秒数差を計算
    let timeDiffText = "";
    if (request.sendTime) {
      const sendTime = new Date(request.sendTime);
      const timeDiff = Math.round(
        (recordTime.getTime() - sendTime.getTime()) / 1000,
      );
      timeDiffText = ` (${timeDiff}秒後)`;
    }

    parts.push(
      `記載時刻: ${year}/${month}/${day} ${hours}:${minutes}:${seconds}${timeDiffText}`,
    );
  } else {
    // completionTimeが無い場合は現在時刻を使用（後方互換性）
    const recordTime = new Date();
    const year = recordTime.getFullYear();
    const month = recordTime.getMonth() + 1;
    const day = recordTime.getDate();
    const hours = String(recordTime.getHours()).padStart(2, "0");
    const minutes = String(recordTime.getMinutes()).padStart(2, "0");
    const seconds = String(recordTime.getSeconds()).padStart(2, "0");

    // 秒数差を計算
    let timeDiffText = "";
    if (request.sendTime) {
      const sendTime = new Date(request.sendTime);
      const timeDiff = Math.round(
        (recordTime.getTime() - sendTime.getTime()) / 1000,
      );
      timeDiffText = ` (${timeDiff}秒後)`;
    }

    parts.push(
      `記載時刻: ${year}/${month}/${day} ${hours}:${minutes}:${seconds}${timeDiffText}`,
    );
  }

  // URLは機能の直後に移動済み（上記参照）

  return parts.join("\n");
}

/**
 * スプレッドシートにログを記録
 */
async function recordLogToSpreadsheet(request) {
  try {
    // Chrome storage からスプレッドシート情報とタスクグループ情報を取得
    const result = await chrome.storage.local.get([
      "spreadsheetId",
      "gid",
      "currentTaskGroup",
    ]);

    if (!result.spreadsheetId) {
      // スプレッドシートIDが未設定の場合は静かにスキップ
      throw new Error("スプレッドシートIDが設定されていません");
    }

    // requestオブジェクトからlogCellを複数の方法で取得試行
    let logCell = request.logCell;

    // フォールバック機能: 複数の場所からlogCellを探索
    if (!logCell) {
      logCell =
        request.task?.logCell ||
        request.taskData?.logCell ||
        request.taskInfo?.logCell ||
        request.data?.task?.logCell ||
        request.payload?.logCell;
    }

    if (!logCell) {
      console.error(
        "ログセル位置（logCell）が見つからないためログ記録をスキップ",
        JSON.stringify(
          {
            requestLogCell: request.logCell,
            requestLogCellType: typeof request.logCell,
            requestTaskId: request.taskId,
            requestKeys: Object.keys(request),
            allRequestData: request,
          },
          null,
          2,
        ),
      );
      return;
    }

    // デバッグ：requestの内容確認
    console.log("🔍 [DEBUG-URL] recordLogToSpreadsheet内のrequest:", {
      hasTaskInfo: !!request.taskInfo,
      taskInfoKeys: request.taskInfo ? Object.keys(request.taskInfo) : [],
      taskInfoUrl: request.taskInfo?.url,
      requestKeys: Object.keys(request),
      taskId: request.taskId,
      logCell: logCell,
    });

    // ログをフォーマット
    const logText = formatLogEntry(request);

    // 指定されたログセルにログを記録
    const range = logCell;

    // URLがある場合はリッチテキストで記録
    const urlValue = request.taskInfo?.url;
    if (urlValue && typeof urlValue === "string" && urlValue.trim() !== "") {
      try {
        await sheetsClient.updateRichTextValue(
          result.spreadsheetId,
          range,
          logText,
          urlValue,
        );
        console.log(
          `📊 ログ記録完了（リッチテキスト付き）: ${range} → ${logText}`,
        );
      } catch (richTextError) {
        console.warn(
          "⚠️ リッチテキスト設定失敗、通常テキストで記録:",
          richTextError,
        );
        await sheetsClient.updateValue(result.spreadsheetId, range, logText);
        console.log(`📊 ログ記録完了: ${range} → ${logText}`);
      }
    } else {
      // URLがない場合は通常のテキストとして記録
      await sheetsClient.updateValue(result.spreadsheetId, range, logText);
      console.log(`📊 ログ記録完了: ${range} → ${logText}`);
    }
  } catch (error) {
    console.error("❌ スプレッドシートログ記録エラー:", error);
    throw error;
  }
}

// ========================================
// AITestController クラス定義（background.js内）
// ========================================

// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO;

// ログユーティリティ
const log = {
  error: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) console.error(...args);
  },
  warn: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) console.warn(...args);
  },
  info: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) console.log(...args);
  },
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) console.log(...args);
  },
};

class AITestController {
  constructor() {
    this.windows = {
      chatgpt: null,
      claude: null,
      gemini: null,
    };

    this.tabs = {
      chatgpt: null,
      claude: null,
      gemini: null,
    };

    this.urls = {
      chatgpt: "https://chatgpt.com",
      claude: "https://claude.ai/new",
      gemini: "https://gemini.google.com/app",
    };

    this.readyStates = {
      chatgpt: false,
      claude: false,
      gemini: false,
    };

    this.testResults = {
      chatgpt: null,
      claude: null,
      gemini: null,
    };
  }

  async executeTest(testConfig) {
    // 設定の型を確認（文字列の場合は後方互換性のため変換）
    if (typeof testConfig === "string") {
      testConfig = {
        chatgpt: { prompt: testConfig },
        claude: { prompt: testConfig },
        gemini: { prompt: testConfig },
      };
    }

    // デフォルト値を設定
    testConfig = testConfig || {
      chatgpt: { prompt: "こんにちは！今日はいい天気ですね。AIテストです。" },
      claude: { prompt: "こんにちは！今日はいい天気ですね。AIテストです。" },
      gemini: { prompt: "こんにちは！今日はいい天気ですね。AIテストです。" },
    };

    log.info("🚀 AI統合テスト開始", testConfig);

    try {
      // Step 1: 画面サイズを取得
      const screenInfo = await this.getScreenInfo();

      // Step 2: 3つのウィンドウを配置して作成
      await this.createTestWindows(screenInfo);

      // Step 3: Content Scriptの準備を待つ
      await this.waitForContentScripts();

      // Step 4: 各AIに個別設定でテストタスクを送信
      await this.sendTestTasks(testConfig);

      // Step 5: 結果を待つ
      await this.waitForResults();

      log.info("✅ AI統合テスト完了", this.testResults);
      return {
        success: true,
        results: this.testResults,
      };
    } catch (error) {
      log.error("❌ AI統合テストエラー:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getScreenInfo() {
    return new Promise((resolve) => {
      chrome.system.display.getInfo((displays) => {
        const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];
        const workArea = primaryDisplay.workArea;
        log.debug("画面情報:", workArea);
        resolve(workArea);
      });
    });
  }

  async createTestWindows(screenInfo) {
    const windowWidth = Math.floor(screenInfo.width / 2);
    const windowHeight = Math.floor(screenInfo.height / 2);

    const positions = {
      chatgpt: { left: 0, top: 0 },
      claude: { left: windowWidth, top: 0 },
      gemini: { left: 0, top: windowHeight },
    };

    const createPromises = [];

    for (const [aiType, url] of Object.entries(this.urls)) {
      const position = positions[aiType];

      const windowOptions = {
        url: url,
        type: "popup",
        left: screenInfo.left + position.left,
        top: screenInfo.top + position.top,
        width: windowWidth,
        height: windowHeight,
        focused: false,
      };

      const promise = new Promise((resolve, reject) => {
        chrome.windows.create(windowOptions, (window) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `${aiType} ウィンドウ作成エラー: ${chrome.runtime.lastError.message}`,
              ),
            );
            return;
          }

          this.windows[aiType] = window;
          this.tabs[aiType] = window.tabs[0];

          log.info(`✅ ${aiType} ウィンドウ作成完了`, {
            windowId: window.id,
            tabId: window.tabs[0].id,
            position: position,
          });

          resolve(window);
        });
      });

      createPromises.push(promise);
    }

    await Promise.all(createPromises);
    log.info("✅ 全てのウィンドウを作成しました");
  }

  async waitForContentScripts() {
    log.info("⏳ Content Scriptの準備を待っています...");

    const maxWaitTime = 30000;
    const checkInterval = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const pingPromises = [];

      for (const [aiType, tabId] of Object.entries(this.tabs)) {
        if (!this.readyStates[aiType] && tabId) {
          const promise = chrome.tabs
            .sendMessage(tabId.id, {
              type: "PING",
              aiType: aiType,
            })
            .then(() => {
              this.readyStates[aiType] = true;
              log.info(`✅ ${aiType} Content Script準備完了`);
              return true;
            })
            .catch(() => {
              return false;
            });

          pingPromises.push(promise);
        }
      }

      await Promise.all(pingPromises);

      if (Object.values(this.readyStates).every((ready) => ready)) {
        log.info("✅ 全てのContent Scriptが準備完了");

        // 各AIのモデル・機能探索を実行
        await this.discoverAllAIFeatures();

        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    const notReady = Object.entries(this.readyStates)
      .filter(([_, ready]) => !ready)
      .map(([aiType, _]) => aiType);

    log.warn(
      `⚠️ 一部のContent Scriptが準備できませんでした: ${notReady.join(", ")}`,
    );

    // 準備できたものだけで続行して探索
    await this.discoverAllAIFeatures();

    return false;
  }

  // ========================================
  // 全AIのモデル・機能探索
  // ========================================
  async discoverAllAIFeatures() {
    log.info("🔍 各AIサービスのモデル・機能を探索中...");

    const discoveryPromises = [];

    // ChatGPTの探索
    if (this.readyStates["chatgpt"] && this.tabs["chatgpt"]) {
      discoveryPromises.push(
        this.discoverAIFeatures("chatgpt")
          .then((result) => {
            this.chatgptCapabilities = result;
            log.info("✅ ChatGPT探索完了", result);
          })
          .catch((error) => {
            log.error("❌ ChatGPT探索エラー:", error);
          }),
      );
    }

    // Claudeの探索
    if (this.readyStates["claude"] && this.tabs["claude"]) {
      discoveryPromises.push(
        this.discoverAIFeatures("claude")
          .then((result) => {
            this.claudeCapabilities = result;
            log.info("✅ Claude探索完了", result);
          })
          .catch((error) => {
            log.error("❌ Claude探索エラー:", error);
          }),
      );
    }

    // Geminiの探索
    if (this.readyStates["gemini"] && this.tabs["gemini"]) {
      discoveryPromises.push(
        this.discoverAIFeatures("gemini")
          .then((result) => {
            this.geminiCapabilities = result;
            log.info("✅ Gemini探索完了", result);
          })
          .catch((error) => {
            log.error("❌ Gemini探索エラー:", error);
          }),
      );
    }

    await Promise.all(discoveryPromises);
    log.info("✅ 全AIサービスの探索が完了しました");
  }

  // ========================================
  // 個別AIのモデル・機能探索
  // ========================================
  async discoverAIFeatures(aiType) {
    if (!this.readyStates[aiType] || !this.tabs[aiType]) {
      log.info(
        `⏭️ ${aiType}が準備できていないため、モデル・機能探索をスキップ`,
      );
      return null;
    }

    log.info(`🔍 ${aiType}のモデル・機能を探索中...`);

    try {
      const response = await chrome.tabs.sendMessage(this.tabs[aiType].id, {
        type: "DISCOVER_FEATURES",
        aiType: aiType,
      });

      if (response && response.success) {
        log.info(`✅ ${aiType}探索成功`, {
          models: response.result?.models || [],
          features: response.result?.features || [],
        });

        return response.result;
      } else {
        log.warn(`⚠️ ${aiType}探索失敗`, response);
        return null;
      }
    } catch (error) {
      log.error(`❌ ${aiType}探索エラー:`, error);
      return null;
    }
  }

  async sendTestTasks(testConfig) {
    log.info("📤 テストタスクを送信中...");

    const taskPromises = [];

    for (const [aiType, tabId] of Object.entries(this.tabs)) {
      if (this.readyStates[aiType] && tabId) {
        // 各AIサービスの個別設定を取得
        const aiConfig = testConfig[aiType] || {};

        const taskData = {
          prompt: aiConfig.prompt || "デフォルトプロンプト",
          model: aiConfig.model || "",
          feature: aiConfig.feature || "",
          taskId: `test_${aiType}_${Date.now()}`,
          timestamp: new Date().toISOString(),
        };

        log.debug(`📝 ${aiType}への送信タスク:`, taskData);

        const promise = chrome.tabs
          .sendMessage(tabId.id, {
            type: "EXECUTE_TASK",
            aiType: aiType,
            taskData: taskData,
          })
          .then((response) => {
            log.info(`✅ ${aiType} タスク送信成功`, response);

            // デバッグログ追加
            if (aiType === "claude") {
            }

            return response;
          })
          .catch((error) => {
            log.error(`❌ ${aiType} タスク送信エラー:`, error);
            return { success: false, error: error.message };
          });

        taskPromises.push(promise);
      }
    }

    const results = await Promise.all(taskPromises);
    log.info("📤 全てのタスクを送信しました", results);
    return results;
  }

  async waitForResults() {
    log.info("⏳ テスト結果を待っています...");

    const maxWaitTime = 180000;
    const checkInterval = 2000;
    const startTime = Date.now();

    const messageHandler = (request, sender, sendResponse) => {
      if (request.type === "TASK_COMPLETE") {
        const aiType = request.aiType;
        if (aiType && this.tabs[aiType]) {
          this.testResults[aiType] = request.result;
          log.info(`✅ ${aiType} テスト完了`, request.result);

          // デバッグログ追加
          if (aiType === "claude") {
          }
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageHandler);

    while (Date.now() - startTime < maxWaitTime) {
      const completedCount = Object.values(this.testResults).filter(
        (r) => r !== null,
      ).length;
      const expectedCount = Object.values(this.readyStates).filter(
        (r) => r,
      ).length;

      if (completedCount >= expectedCount) {
        log.info("✅ 全てのテスト結果を受信しました");
        chrome.runtime.onMessage.removeListener(messageHandler);
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));

      if ((Date.now() - startTime) % 10000 === 0) {
        log.debug(`待機中... (${completedCount}/${expectedCount} 完了)`);
      }
    }

    chrome.runtime.onMessage.removeListener(messageHandler);
    log.warn("⚠️ 一部のテストがタイムアウトしました");
    return false;
  }

  async discoverOnly() {
    log.info("🔍 AIモデル・機能探索のみ実行開始");

    try {
      // Step 1: 画面サイズを取得
      const screenInfo = await this.getScreenInfo();

      // Step 2: 3つのウィンドウを配置して作成
      await this.createTestWindows(screenInfo);

      // Step 3: Content Scriptの準備を待つ
      await this.waitForContentScripts();

      // Step 4: 探索は waitForContentScripts 内で実行済み

      // Step 5: 少し待ってからウィンドウを閉じる (無効化 - テスト用にウィンドウを残す)
      // await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 6: クリーンアップ (無効化 - テスト用にウィンドウを残す)
      // await this.cleanup();
      log.info("🔧 テスト用にウィンドウを残します（クリーンアップをスキップ）");

      log.info("✅ AIモデル・機能探索完了");
      return {
        success: true,
        capabilities: {
          chatgpt: this.chatgptCapabilities,
          claude: this.claudeCapabilities,
          gemini: this.geminiCapabilities,
        },
      };
    } catch (error) {
      log.error("❌ AIモデル・機能探索エラー:", error);
      // await this.cleanup(); // エラー時もウィンドウを残す
      log.info("🔧 エラー時もテスト用にウィンドウを残します");
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async cleanup() {
    log.info("🧹 テストウィンドウをクリーンアップ中...");

    const closePromises = [];

    for (const [aiType, window] of Object.entries(this.windows)) {
      if (window && window.id) {
        const promise = new Promise((resolve) => {
          chrome.windows.remove(window.id, () => {
            if (chrome.runtime.lastError) {
              log.warn(
                `${aiType} ウィンドウクローズエラー:`,
                chrome.runtime.lastError,
              );
            } else {
              log.debug(`✅ ${aiType} ウィンドウをクローズしました`);
            }
            resolve();
          });
        });
        closePromises.push(promise);
      }
    }

    await Promise.all(closePromises);

    this.windows = { chatgpt: null, claude: null, gemini: null };
    this.tabs = { chatgpt: null, claude: null, gemini: null };
    this.readyStates = { chatgpt: false, claude: false, gemini: false };
    this.testResults = { chatgpt: null, claude: null, gemini: null };

    log.info("✅ クリーンアップ完了");
  }
}

// ========================================
// メッセージリスナー
// ========================================

// Extension間メッセージの中継
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // log.debug("📨 Message received in background:", {
  //   type: request.type,
  //   from: sender.tab ? `Tab ${sender.tab.id}` : "Extension",
  // });

  // Content Script初期化確認
  if (request.type === "content_script_ready") {
    // log.debug("✅ Content Script initialized on tab:", sender.tab?.id);
    sendResponse({ success: true, message: "Background acknowledged" });
    return true;
  }

  // 📝 送信時刻記録要求（4-2-claude-automation.js:4295から）
  if (request.type === "recordSendTime") {
    console.log("📝 [BG-FIX] recordSendTime要求を受信:", {
      taskId: request.taskId,
      sendTime: request.sendTime,
      taskInfo: request.taskInfo,
      logCell: request.logCell, // 🔍 logCell受信状況確認
    });

    // 🔍 URL記録デバッグ - URLが含まれているかチェック
    console.log("🔍 [URL-DEBUG] taskInfo詳細:", {
      hasTaskInfo: !!request.taskInfo,
      taskInfoKeys: request.taskInfo ? Object.keys(request.taskInfo) : [],
      hasUrl: !!request.taskInfo?.url,
      urlValue: request.taskInfo?.url,
      aiType: request.taskInfo?.aiType,
    });

    // 非同期処理を適切にラップして実行
    (async () => {
      try {
        // 送信時刻のみを記録（後でタスク完了時に記載時刻と合わせて記録）
        // Chrome storageに一時保存（ディープコピーでデータ保護）
        const taskLogData = {
          taskId: request.taskId,
          sendTime: request.sendTime,
          taskInfo: JSON.parse(JSON.stringify(request.taskInfo)), // ディープコピー
          logCell: request.logCell,
        };

        // 🔍 保存前のURL確認ログ
        console.log("🔍 [DEBUG-STORAGE] 保存前のtaskLogData:", {
          hasTaskInfo: !!taskLogData.taskInfo,
          hasUrl: !!taskLogData.taskInfo?.url,
          urlValue: taskLogData.taskInfo?.url,
          taskInfoKeys: taskLogData.taskInfo
            ? Object.keys(taskLogData.taskInfo)
            : [],
        });

        // Promise版Chrome Storageを使用（非同期処理の確実性向上）
        await chrome.storage.local.set({
          [`taskLog_${request.taskId}`]: taskLogData,
        });

        // 🔍 保存後の確認読み取り
        const verifyResult = await chrome.storage.local.get([
          `taskLog_${request.taskId}`,
        ]);
        const savedData = verifyResult[`taskLog_${request.taskId}`];
        console.log("🔍 [DEBUG-STORAGE] 保存後の確認読み取り:", {
          dataExists: !!savedData,
          hasTaskInfo: !!savedData?.taskInfo,
          hasUrl: !!savedData?.taskInfo?.url,
          urlValue: savedData?.taskInfo?.url,
        });

        console.log("📝 送信時刻を一時保存しました:", request.taskId);

        // 成功レスポンスを送信
        sendResponse({
          success: true,
          message: "Send time recorded successfully",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Chrome Storage保存エラー:", error);
        // エラーレスポンスを送信
        sendResponse({
          success: false,
          message: "Failed to save send time",
          error: error.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 📝 タスク完了時のログ記録要求
  if (request.type === "recordCompletionTime") {
    console.log("📝 タスク完了時刻記録要求を受信:", {
      taskId: request.taskId,
      completionTime: request.completionTime,
      hasTaskInfo: !!request.taskInfo,
      taskInfoUrl: request.taskInfo?.url,
      requestKeys: Object.keys(request),
      fullRequest: request,
    });

    // 非同期処理を適切にラップして実行
    (async () => {
      try {
        // Chrome storageから送信時の情報を取得（Promise版で確実性向上）
        const result = await chrome.storage.local.get([
          `taskLog_${request.taskId}`,
        ]);
        const taskLogData = result[`taskLog_${request.taskId}`];

        // 🔍 取得後のURL確認ログ（強化版）
        console.log("🔍 [DEBUG-STORAGE] 取得後のtaskLogData:", {
          dataExists: !!taskLogData,
          hasTaskInfo: !!taskLogData?.taskInfo,
          hasUrl: !!taskLogData?.taskInfo?.url,
          urlValue: taskLogData?.taskInfo?.url,
          urlValueType: typeof taskLogData?.taskInfo?.url,
          urlValueLength: taskLogData?.taskInfo?.url?.length,
          taskInfoKeys: taskLogData?.taskInfo
            ? Object.keys(taskLogData.taskInfo)
            : [],
          allDataKeys: taskLogData ? Object.keys(taskLogData) : [],
          completeTaskInfo: taskLogData?.taskInfo,
        });

        // 🔍 URL値の詳細分析
        if (taskLogData?.taskInfo) {
          console.log("🔍 [URL-DETAILED-CHECK] taskInfo詳細分析:", {
            taskInfoStringified: JSON.stringify(taskLogData.taskInfo, null, 2),
            urlProperty: taskLogData.taskInfo.url,
            urlPropertyExists: "url" in taskLogData.taskInfo,
            urlPropertyType: typeof taskLogData.taskInfo.url,
            urlTruthyCheck: !!taskLogData.taskInfo.url,
            urlEmptyCheck: taskLogData.taskInfo.url === "",
            urlNullCheck: taskLogData.taskInfo.url === null,
            urlUndefinedCheck: taskLogData.taskInfo.url === undefined,
          });
        }

        if (taskLogData) {
          // 完了時のメッセージにtaskInfo（URL含む）が含まれている場合は更新
          if (request.taskInfo) {
            console.log("🔄 [URL-UPDATE] 完了時のtaskInfo情報で更新中:", {
              oldTaskInfo: taskLogData.taskInfo,
              newTaskInfo: request.taskInfo,
              hasNewUrl: !!request.taskInfo.url,
            });

            // 既存のtaskInfoを完了時の情報で更新（URLを含む）
            taskLogData.taskInfo = {
              ...taskLogData.taskInfo,
              ...request.taskInfo,
            };
          }

          // URL防御的チェック - もしURLが失われていたら警告
          if (!taskLogData.taskInfo?.url) {
            console.warn(
              "⚠️ [URL-WARNING] 取得されたデータにURLが含まれていません!",
              {
                taskId: request.taskId,
                taskInfo: taskLogData.taskInfo,
              },
            );
          }

          // 完了時刻を追加
          taskLogData.completionTime =
            request.completionTime || new Date().toISOString();

          // スプレッドシートにログを記録
          try {
            console.log(
              "📊 [BEFORE-RECORD] recordLogToSpreadsheet呼び出し前:",
              {
                taskId: request.taskId,
                hasTaskInfo: !!taskLogData.taskInfo,
                taskInfoUrl: taskLogData.taskInfo?.url,
                taskInfoKeys: taskLogData.taskInfo
                  ? Object.keys(taskLogData.taskInfo)
                  : [],
                fullTaskLogData: taskLogData,
              },
            );

            await recordLogToSpreadsheet(taskLogData);
            console.log("📊 タスク完了ログ記録成功:", request.taskId);

            // 使用済みデータを削除
            await chrome.storage.local.remove([`taskLog_${request.taskId}`]);
          } catch (error) {
            console.error("❌ タスク完了ログ記録エラー:", error);
            // エラーが発生してもレスポンスは返す
          }
        } else {
          console.warn("⚠️ 送信時刻データが見つかりません:", request.taskId);
        }

        // 成功レスポンスを送信
        sendResponse({
          success: true,
          message: "Completion time recorded successfully",
        });
      } catch (storageError) {
        console.error("❌ Chrome Storage取得エラー:", storageError);
        // エラーレスポンスを送信
        sendResponse({
          success: false,
          message: "Storage error occurred",
          error: storageError.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 🔧 関数注入要求（4-2-claude-automation.js:5728から）
  if (request.action === "injectClaudeFunctions") {
    // 実際の注入は既にContent Script側で完了済み
    sendResponse({
      success: true,
      message: "Functions already injected via content script",
      injected: true,
    });
    return true; // 非同期レスポンス許可
  }

  // 🔄 新規ウィンドウでのリトライ要求（ChatGPT, Geminiから）
  if (request.type === "RETRY_WITH_NEW_WINDOW") {
    // 実際のウィンドウ管理は実装なし（デバッグ用のみ）
    sendResponse({
      success: true,
      message: "Retry request acknowledged (not implemented yet)",
      timestamp: new Date().toISOString(),
    });
    return true; // 非同期レスポンス許可
  }

  // 🚨 全AI Overloadedエラー対応: ウィンドウリセット (汎用版)
  if (
    request.action === "RESET_AI_WINDOW" ||
    request.action === "RESET_CLAUDE_WINDOW"
  ) {
    const aiType = request.aiType || "claude";

    // AI別のURL設定
    const urlPatterns = {
      claude: "*://*.claude.ai/*",
      chatgpt: "*://chatgpt.com/*",
      gemini: "*://gemini.google.com/*",
      genspark: "*://genspark.ai/*",
    };

    const urlPattern = urlPatterns[aiType] || urlPatterns.claude;

    // 指定されたAIのタブを特定して閉じる
    chrome.tabs.query({ url: urlPattern }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.remove(tab.id);
      });
    });

    sendResponse({
      success: true,
      message: `${aiType.toUpperCase()} window reset completed`,
      aiType: aiType,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // 🚨 全AI Overloadedエラー対応: 新しいウィンドウを開く (汎用版)
  if (
    request.action === "OPEN_AI_WINDOW" ||
    request.action === "OPEN_CLAUDE_WINDOW"
  ) {
    const aiType = request.aiType || "claude";

    // AI別のURL設定
    const urls = {
      claude: "https://claude.ai/new",
      chatgpt: "https://chatgpt.com/",
      gemini: "https://gemini.google.com/",
      genspark: "https://genspark.ai/",
    };

    const targetUrl = urls[aiType] || urls.claude;

    // 新しいAIタブを開く
    chrome.tabs.create(
      {
        url: targetUrl,
        active: true,
      },
      (tab) => {
        sendResponse({
          success: true,
          message: `New ${aiType.toUpperCase()} window opened`,
          aiType: aiType,
          tabId: tab.id,
          targetUrl: targetUrl,
          timestamp: new Date().toISOString(),
        });
      },
    );

    return true;
  }

  // 🔍 AI モデル・機能情報更新要求
  if (request.type === "AI_MODEL_FUNCTION_UPDATE") {
    // UIウィンドウにメッセージを転送
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && tab.url.includes("chrome-extension://")) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "AI_MODEL_FUNCTION_UPDATE",
              aiType: request.aiType,
              data: request.data,
            })
            .catch(() => {
              // エラーは無視（UIタブが見つからない場合）
            });
        }
      });
    });

    sendResponse({
      success: true,
      message: "AI information forwarded to UI",
      timestamp: new Date().toISOString(),
    });
    return true; // 非同期レスポンス許可
  }

  // 🧪 AI統合テスト実行要求
  if (request.type === "RUN_AI_TEST_ALL") {
    // AITestControllerを直接実行
    (async () => {
      try {
        const controller = new AITestController();
        const result = await controller.executeTest(request.data);

        sendResponse({
          success: result.success,
          results: result.results,
          error: result.error,
        });
      } catch (error) {
        console.error("❌ [BG] AI統合テストエラー:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 🔍 AIモデル・機能探索のみ実行要求
  if (request.action === "DISCOVER_AI_FEATURES_ONLY") {
    // AITestControllerのdiscoverOnlyメソッドを実行
    (async () => {
      try {
        const controller = new AITestController();
        const result = await controller.discoverOnly();

        sendResponse({
          success: result.success,
          capabilities: result.capabilities,
          error: result.error,
        });
      } catch (error) {
        console.error("❌ [BG] AIモデル・機能探索エラー:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 🧹 スプレッドシートのログクリア要求
  if (request.type === "CLEAR_SPREADSHEET_LOG") {
    console.log("🧹 [ログクリア] 要求受信");

    (async () => {
      try {
        // 現在のスプレッドシートIDとシート情報を取得
        const result = await chrome.storage.local.get([
          "step1Result",
          "globalState",
          "spreadsheetId", // 直接保存されたIDも確認
        ]);

        // デバッグログ: storage内容を詳細に出力
        console.log("🔍 [ログクリア] chrome.storage.local内容:", {
          step1Result: result.step1Result,
          globalState: result.globalState,
          directSpreadsheetId: result.spreadsheetId,
        });

        const step1Result = result.step1Result || {};
        const globalState = result.globalState || {};

        // spreadsheetIDの取得: 複数の場所から試行
        const spreadsheetId =
          step1Result.spreadsheetId ||
          globalState.spreadsheetId ||
          result.spreadsheetId; // 直接保存されたIDも確認

        const specialRows =
          step1Result.specialRows || globalState.specialRows || {};
        const menuRow = specialRows.menuRow;
        const dataStartRow = specialRows.dataStartRow;

        console.log("🔍 [ログクリア] 現在の設定:", {
          spreadsheetId,
          menuRow,
          dataStartRow,
        });

        if (!spreadsheetId) {
          console.error("❌ [ログクリア] spreadsheetID取得失敗の詳細:", {
            "result.step1Result": result.step1Result,
            "result.globalState": result.globalState,
            "result.spreadsheetId": result.spreadsheetId,
            "step1Result.spreadsheetId": step1Result?.spreadsheetId,
            "globalState.spreadsheetId": globalState?.spreadsheetId,
          });
          throw new Error(
            "スプレッドシートIDが見つかりません。Step1(セットアップ)が完了していることを確認してください。",
          );
        }

        const sheetsClient = new SimpleSheetsClient();

        // 1. スプレッドシート全体を取得
        const sheetData = await sheetsClient.getAllValues(spreadsheetId);
        console.log("📊 [ログクリア] シートデータ取得:", {
          rows: sheetData.length,
          firstRow: sheetData[0],
        });

        // 2. メニュー行から"ログ"列を検索
        // menuRowが未定義の場合は、"ログ"というテキストを含む行を探す
        let actualMenuRow = menuRow;
        if (!actualMenuRow) {
          console.log("⚠️ [ログクリア] menuRow未定義、自動検出を試行");
          for (let i = 0; i < Math.min(20, sheetData.length); i++) {
            if (sheetData[i] && sheetData[i].includes("ログ")) {
              actualMenuRow = i + 1; // 1ベースの行番号
              console.log(
                `✅ [ログクリア] メニュー行を自動検出: 行${actualMenuRow}`,
              );
              break;
            }
          }
        }

        const menuRowData = actualMenuRow
          ? sheetData[actualMenuRow - 1] || []
          : [];
        console.log("📋 [ログクリア] メニュー行データ:", {
          menuRow: actualMenuRow,
          menuRowData: menuRowData,
        });

        const logColumns = [];
        menuRowData.forEach((cell, index) => {
          if (cell === "ログ") {
            logColumns.push(index);
          }
        });

        console.log("🔍 [ログクリア] ログ列検出:", logColumns);

        // 3. A列から"1"が入っている行を検索
        let targetStartRow = dataStartRow;
        if (!targetStartRow) {
          for (let i = 0; i < sheetData.length; i++) {
            if (sheetData[i] && sheetData[i][0] === "1") {
              targetStartRow = i + 1; // 1ベースの行番号
              break;
            }
          }
        }

        if (!targetStartRow) {
          throw new Error("A列に'1'が入っている行が見つかりません");
        }

        console.log("🔍 [ログクリア] データ開始行:", targetStartRow);

        // 4. バッチ更新リクエストを作成
        const updateRequests = [];

        // 各ログ列に対してクリアリクエストを作成
        logColumns.forEach((colIndex) => {
          const columnLetter = String.fromCharCode(65 + colIndex); // A, B, C...
          const range = `${columnLetter}${targetStartRow}:${columnLetter}`;

          updateRequests.push({
            range: range,
            values: [], // 空の配列でクリア
          });
        });

        console.log("🔍 [ログクリア] クリア対象:", updateRequests);

        // 5. バッチ更新を実行
        if (updateRequests.length > 0) {
          await sheetsClient.batchUpdate(spreadsheetId, updateRequests);
          console.log("✅ [ログクリア] 完了");
        }

        sendResponse({
          success: true,
          clearedColumns: logColumns.length,
          message: `${logColumns.length}列のログをクリアしました`,
        });
      } catch (error) {
        console.error("❌ [ログクリア] エラー:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 🗑️ スプレッドシートの回答削除要求
  if (request.type === "DELETE_SPREADSHEET_ANSWERS") {
    console.log("🗑️ [回答削除] 要求受信");

    (async () => {
      try {
        // 現在のスプレッドシートIDとシート情報を取得
        const result = await chrome.storage.local.get([
          "step1Result",
          "globalState",
          "spreadsheetId", // 直接保存されたIDも確認
        ]);

        // デバッグログ: storage内容を詳細に出力
        console.log("🔍 [回答削除] chrome.storage.local内容:", {
          step1Result: result.step1Result,
          globalState: result.globalState,
          directSpreadsheetId: result.spreadsheetId,
        });

        const step1Result = result.step1Result || {};
        const globalState = result.globalState || {};

        // spreadsheetIDの取得: 複数の場所から試行
        const spreadsheetId =
          step1Result.spreadsheetId ||
          globalState.spreadsheetId ||
          result.spreadsheetId; // 直接保存されたIDも確認

        const specialRows =
          step1Result.specialRows || globalState.specialRows || {};
        const menuRow = specialRows.menuRow;
        const dataStartRow = specialRows.dataStartRow;

        console.log("🔍 [回答削除] 現在の設定:", {
          spreadsheetId,
          menuRow,
          dataStartRow,
        });

        if (!spreadsheetId) {
          console.error("❌ [回答削除] spreadsheetID取得失敗の詳細:", {
            "result.step1Result": result.step1Result,
            "result.globalState": result.globalState,
            "result.spreadsheetId": result.spreadsheetId,
            "step1Result.spreadsheetId": step1Result?.spreadsheetId,
            "globalState.spreadsheetId": globalState?.spreadsheetId,
          });
          throw new Error(
            "スプレッドシートIDが見つかりません。Step1(セットアップ)が完了していることを確認してください。",
          );
        }

        const sheetsClient = new SimpleSheetsClient();

        // 1. スプレッドシート全体を取得
        const sheetData = await sheetsClient.getAllValues(spreadsheetId);
        console.log("📊 [回答削除] シートデータ取得:", {
          rows: sheetData.length,
          firstRow: sheetData[0],
        });

        // 2. メニュー行から"回答"列を検索
        // menuRowが未定義の場合は、"回答"というテキストを含む行を探す
        let actualMenuRow = menuRow;
        if (!actualMenuRow) {
          console.log("⚠️ [回答削除] menuRow未定義、自動検出を試行");
          for (let i = 0; i < Math.min(20, sheetData.length); i++) {
            if (sheetData[i] && sheetData[i].includes("回答")) {
              actualMenuRow = i + 1; // 1ベースの行番号
              console.log(
                `✅ [回答削除] メニュー行を自動検出: 行${actualMenuRow}`,
              );
              break;
            }
          }
        }

        const menuRowData = actualMenuRow
          ? sheetData[actualMenuRow - 1] || []
          : [];
        console.log("📋 [回答削除] メニュー行データ:", {
          menuRow: actualMenuRow,
          menuRowData: menuRowData,
        });

        const answerColumns = [];
        menuRowData.forEach((cell, index) => {
          if (cell === "回答") {
            answerColumns.push(index);
          }
        });

        console.log("🔍 [回答削除] 回答列検出:", answerColumns);

        // 3. A列から"1"が入っている行を検索
        let targetStartRow = dataStartRow;
        if (!targetStartRow) {
          for (let i = 0; i < sheetData.length; i++) {
            if (sheetData[i] && sheetData[i][0] === "1") {
              targetStartRow = i + 1; // 1ベースの行番号
              break;
            }
          }
        }

        if (!targetStartRow) {
          throw new Error("A列に'1'が入っている行が見つかりません");
        }

        console.log("🔍 [回答削除] データ開始行:", targetStartRow);

        // 4. バッチ更新リクエストを作成
        const updateRequests = [];

        // 各回答列に対してクリアリクエストを作成
        answerColumns.forEach((colIndex) => {
          const columnLetter = String.fromCharCode(65 + colIndex); // A, B, C...
          const range = `${columnLetter}${targetStartRow}:${columnLetter}`;

          updateRequests.push({
            range: range,
            values: [], // 空の配列でクリア
          });
        });

        console.log("🔍 [回答削除] 削除対象:", updateRequests);

        // 5. バッチ更新を実行
        if (updateRequests.length > 0) {
          await sheetsClient.batchUpdate(spreadsheetId, updateRequests);
          console.log("✅ [回答削除] 完了");
        }

        sendResponse({
          success: true,
          clearedColumns: answerColumns.length,
          message: `${answerColumns.length}列の回答を削除しました`,
        });
      } catch (error) {
        console.error("❌ [回答削除] エラー:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 注意: Content Script注入はmanifest.json自動注入に移行済み
  // Content Script注入要求は廃止

  return true; // 非同期レスポンスを許可
});

// 注意: Content Script注入機能は廃止
// manifest.json自動注入方式に移行済み

// エラーハンドリング
self.addEventListener("unhandledrejection", (event) => {
  console.error("❌ Unhandled promise rejection:", event.reason);
});

// log.debug("✅ Background Service Worker ready");
