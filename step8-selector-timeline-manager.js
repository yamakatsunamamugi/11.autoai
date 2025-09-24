/**
 * @fileoverview セレクタタイムライン表示管理
 * step8: セレクタ使用順序の可視化とインタラクション管理
 *
 * @version 1.0.0
 * @created 2024-12-XX
 */

import {
  AI_SELECTORS_TIMELINE,
  SELECTOR_CATEGORIES,
  SELECTOR_STATS,
  updateSelectorStats,
  getTotalSelectorsCount,
  getSelectorsByCategory,
  addSelectorError,
  clearSelectorError,
} from "./step7-selector-data-structure.js";

// ========================================
// タイムライン表示管理クラス
// ========================================
export class SelectorTimelineManager {
  constructor() {
    this.currentAI = "chatgpt";
    this.searchTerm = "";
    this.selectedCategory = "all";
    this.isInitialized = false;

    this.bindEvents();
  }

  // ========================================
  // 初期化とイベントバインディング
  // ========================================
  bindEvents() {
    // AI タブ切り替え
    document.addEventListener("click", (e) => {
      if (e.target.matches(".selector-ai-tab")) {
        const aiName = e.target.dataset.ai;
        this.switchAI(aiName);
      }
    });

    // 検索機能
    const searchInput = document.getElementById("selector-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.updateDisplay();
      });
    }

    // カテゴリフィルター
    const categorySelect = document.getElementById("selector-category-filter");
    if (categorySelect) {
      categorySelect.addEventListener("change", (e) => {
        this.selectedCategory = e.target.value;
        this.updateDisplay();
      });
    }

    // セレクタ行のクリックイベント（CSP対応）
    document.addEventListener("click", (e) => {
      // テストボタンのクリック処理
      if (e.target.matches(".selector-test-button")) {
        e.stopPropagation(); // 行クリックイベントを止める
        const aiName = e.target.dataset.ai;
        const selectorKey = e.target.dataset.selectorKey;
        this.testSelectorWithFocus(aiName, selectorKey);
        return;
      }

      // セレクタ行のクリック処理
      const row = e.target.closest(".selector-row");
      if (row) {
        const selectorKey = row.dataset.selectorKey;
        if (selectorKey) {
          this.toggleSelectorDetails(selectorKey);
        }
      }
    });
  }

  // ========================================
  // AI切り替え
  // ========================================
  switchAI(aiName) {
    if (!AI_SELECTORS_TIMELINE[aiName]) return;

    this.currentAI = aiName;

    // タブの状態更新
    document.querySelectorAll(".selector-ai-tab").forEach((tab) => {
      tab.classList.remove("active");
    });
    document.querySelector(`[data-ai="${aiName}"]`).classList.add("active");

    // タイムラインの表示更新
    this.updateDisplay();

  }

  // ========================================
  // 表示更新
  // ========================================
  updateDisplay() {
    const timelineContainer = document.getElementById(
      "selector-timeline-container",
    );
    if (!timelineContainer) return;

    timelineContainer.innerHTML = this.renderTimeline();
    this.updateStats();
  }

  // ========================================
  // タイムライン HTML 生成
  // ========================================
  renderTimeline() {
    const allAISelectors = this.getAllSelectorsFromAllAIs();

    return `
      <div class="selector-timeline">
        <div class="selector-timeline-header">
          <div class="ai-info">
            <h3>全AIセレクタ一覧</h3>
          </div>
          <div class="timeline-controls">
            <input type="text" id="selector-search" placeholder="セレクタを検索..." value="${this.searchTerm}">
            <select id="selector-category-filter">
              <option value="all">全カテゴリ</option>
              ${Object.entries(SELECTOR_CATEGORIES)
                .map(
                  ([key, cat]) =>
                    `<option value="${key}" ${this.selectedCategory === key ? "selected" : ""}>${cat.icon} ${cat.name}</option>`,
                )
                .join("")}
            </select>
          </div>
        </div>

        <div class="selector-table-container">
          ${this.renderAllSelectorsTable(allAISelectors)}
        </div>
      </div>
    `;
  }

  // ========================================
  // 全AIセレクタ表の生成
  // ========================================
  renderAllSelectorsTable(allAISelectors) {
    if (allAISelectors.length === 0) {
      return '<div class="no-selectors">該当するセレクタがありません</div>';
    }

    return `
      <div class="selectors-table-section">
        <h4>全AIセレクタ一覧</h4>
        <table class="selectors-table">
          <thead>
            <tr>
              <th>AI</th>
              <th>セレクタ名</th>
              <th>CSSセレクタ</th>
              <th>アクション</th>
            </tr>
          </thead>
          <tbody>
            ${allAISelectors
              .map((item) => this.renderAllSelectorRow(item))
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  renderAllSelectorRow(item) {
    const { aiName, aiInfo, key, selector } = item;
    const stats = SELECTOR_STATS[aiName][key] || {};
    const hasError = stats.hasError || false;
    const errorClass = hasError ? "selector-error-row" : "";

    return `
      <tr class="selector-row ${errorClass}" data-selector-key="${key}" data-ai="${aiName}">
        <td class="ai-name-cell">
          ${aiInfo.name}
        </td>
        <td class="selector-name-cell">
          ${selector.name}
          ${hasError ? '<span class="error-indicator">⚠️</span>' : ""}
        </td>
        <td class="selector-css-cell">
          ${
            hasError
              ? `<div class="error-message">❌ ${stats.lastError || "セレクタエラー"}</div>
             <div class="error-selectors">${selector.selectors
               .map(
                 (sel) =>
                   `<div><code class="css-selector error">${this.escapeHtml(sel)}</code></div>`,
               )
               .join("")}</div>`
              : selector.selectors
                  .map(
                    (sel) =>
                      `<div><code class="css-selector">${this.escapeHtml(sel)}</code></div>`,
                  )
                  .join("")
          }
        </td>
        <td class="selector-action-cell">
          <button class="selector-test-button" data-ai="${aiName}" data-selector-key="${key}">
            テスト
          </button>
        </td>
      </tr>
      <tr id="details-${key}" class="selector-details-row" style="display: none;">
        <td colspan="4" class="selector-details-cell">
          <div><strong>用途:</strong> ${selector.purpose}</div>
          ${
            hasError
              ? `
            <div style="margin-top: 8px; color: #d32f2f;">
              <strong>エラー詳細:</strong><br>
              エラー: ${stats.lastError}<br>
              発生時刻: ${stats.lastErrorTime ? new Date(stats.lastErrorTime).toLocaleString("ja-JP") : "不明"}<br>
              エラー回数: ${stats.errorCount || 0}回
            </div>
          `
              : ""
          }
        </td>
      </tr>
    `;
  }

  // ========================================
  // ステップ表の生成
  // ========================================
  renderStepsTable(filteredSteps) {
    if (filteredSteps.length === 0) {
      return '<div class="no-steps">該当するステップがありません</div>';
    }

    return `
      <div class="steps-table-section">
        <h4>📋 ステップ別使用順序</h4>
        <table class="steps-table">
          <thead>
            <tr>
              <th>ステップ</th>
              <th>処理内容</th>
              <th>使用するセレクタ</th>
            </tr>
          </thead>
          <tbody>
            ${filteredSteps.map((step) => this.renderStepRow(step)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  renderStepRow(step) {
    const visibleSelectors = this.filterSelectors(step.selectors);
    const selectorNames = Object.values(visibleSelectors).map((s) => s.name);
    const isConditional = step.conditional;

    return `
      <tr class="step-row ${isConditional ? "conditional" : ""}" data-step="${step.stepNumber}">
        <td class="step-number-cell">
          <span class="step-badge">${step.stepNumber}</span>
          ${isConditional ? '<span class="conditional-badge">条件付き</span>' : ""}
        </td>
        <td class="step-content-cell">
          <div class="step-name">${step.stepName}</div>
          <div class="step-description">${step.description}</div>
        </td>
        <td class="step-selectors-cell">
          ${selectorNames.length > 0 ? selectorNames.join(", ") : "なし"}
        </td>
      </tr>
    `;
  }

  // ========================================
  // フィルタリング機能
  // ========================================
  filterSteps(steps) {
    return steps.filter((step) => {
      const visibleSelectors = this.filterSelectors(step.selectors);
      return Object.keys(visibleSelectors).length > 0;
    });
  }

  filterSelectors(selectors) {
    const filtered = {};

    Object.entries(selectors).forEach(([key, selector]) => {
      // カテゴリフィルター
      if (
        this.selectedCategory !== "all" &&
        selector.category !== this.selectedCategory
      ) {
        return;
      }

      // 検索フィルター
      if (this.searchTerm) {
        const searchFields = [
          selector.name,
          selector.purpose,
          ...selector.selectors,
        ]
          .join(" ")
          .toLowerCase();

        if (!searchFields.includes(this.searchTerm)) {
          return;
        }
      }

      filtered[key] = selector;
    });

    return filtered;
  }

  // ========================================
  // セレクタ検証機能
  // ========================================
  async validateSelector(selectorArray) {
    if (!selectorArray || selectorArray.length === 0) {
      return {
        isValid: false,
        workingSelector: null,
        error: "セレクタが定義されていません",
      };
    }

    for (const selector of selectorArray) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          return { isValid: true, workingSelector: selector, error: null };
        }
      } catch (error) {
        console.warn(`Invalid selector syntax: ${selector}`, error);
      }
    }

    return {
      isValid: false,
      workingSelector: null,
      error: "要素が見つかりません",
    };
  }

  // ========================================
  // セレクタ収集機能
  // ========================================
  getAllSelectorsFromSteps(steps) {
    const allSelectors = {};

    steps.forEach((step) => {
      const filteredSelectors = this.filterSelectors(step.selectors);
      Object.entries(filteredSelectors).forEach(([key, selector]) => {
        if (!allSelectors[key]) {
          allSelectors[key] = selector;
        }
      });
    });

    return allSelectors;
  }

  // 全AIからセレクタを収集（ChatGPT、Claude、Geminiの順）
  getAllSelectorsFromAllAIs() {
    const allSelectors = [];
    const aiOrder = ["chatgpt", "claude", "gemini"];

    aiOrder.forEach((aiName) => {
      const aiData = AI_SELECTORS_TIMELINE[aiName];
      if (aiData) {
        const collectedSelectors = {};

        aiData.steps.forEach((step) => {
          const filteredSelectors = this.filterSelectors(step.selectors);
          Object.entries(filteredSelectors).forEach(([key, selector]) => {
            if (!collectedSelectors[key]) {
              collectedSelectors[key] = selector;
              allSelectors.push({
                aiName,
                aiInfo: {
                  name: aiData.name,
                  icon: aiData.icon,
                  color: aiData.color,
                },
                key,
                selector,
              });
            }
          });
        });
      }
    });

    return allSelectors;
  }

  // ========================================
  // 統計更新（簡略化）
  // ========================================
  updateStats() {
    const statsContainer = document.getElementById("selector-stats-summary");
    if (statsContainer) {
      const allAISelectors = this.getAllSelectorsFromAllAIs();
      const totalSelectors = allAISelectors.length;
      const aiCounts = this.getAICounts(allAISelectors);

      statsContainer.innerHTML = `
        <div class="simple-stats">
          <span>総セレクタ数: ${totalSelectors}個</span>
          ${Object.entries(aiCounts)
            .map(([aiName, count]) => {
              const aiData = AI_SELECTORS_TIMELINE[aiName];
              return aiData ? `<span>${aiData.name}: ${count}個</span>` : "";
            })
            .join("")}
        </div>
      `;
    }
  }

  // ========================================
  // ヘルパーメソッド
  // ========================================
  getCategoryStats() {
    const stats = {};
    Object.keys(SELECTOR_CATEGORIES).forEach((cat) => {
      stats[cat] = getSelectorsByCategory(this.currentAI, cat).length;
    });
    return stats;
  }

  getAICounts(allAISelectors) {
    const counts = { chatgpt: 0, claude: 0, gemini: 0 };
    allAISelectors.forEach((item) => {
      if (counts.hasOwnProperty(item.aiName)) {
        counts[item.aiName]++;
      }
    });
    return counts;
  }

  escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  // ========================================
  // セレクタ検証とエラー更新
  // ========================================
  // ========================================
  // AI URL定義とウィンドウ管理
  // ========================================
  AI_URLS = {
    chatgpt: ["chatgpt.com", "chat.openai.com"],
    claude: ["claude.ai"],
    gemini: ["gemini.google.com", "bard.google.com"],
  };

  getCurrentAIFromURL() {
    const hostname = window.location.hostname;

    if (
      hostname.includes("chatgpt.com") ||
      hostname.includes("chat.openai.com")
    ) {
      return "chatgpt";
    } else if (hostname.includes("claude.ai")) {
      return "claude";
    } else if (
      hostname.includes("gemini.google.com") ||
      hostname.includes("bard.google.com")
    ) {
      return "gemini";
    }

    return null; // AIページではない
  }

  // AIウィンドウを最前面に表示
  async focusAIWindow(aiName) {
    if (!chrome || !chrome.tabs) {
      console.warn("Chrome Extension APIが利用できません");
      return false;
    }

    try {
      const urlPatterns = this.AI_URLS[aiName];
      if (!urlPatterns) {
        console.error(`未知のAI: ${aiName}`);
        return false;
      }

      // すべてのタブを検索
      const tabs = await chrome.tabs.query({});

      // 該当するAIのタブを検索
      const aiTab = tabs.find((tab) => {
        return urlPatterns.some(
          (pattern) => tab.url && tab.url.includes(pattern),
        );
      });

      if (!aiTab) {
        console.warn(`${aiName}のタブが見つかりません`);
        return false;
      }

      // タブをアクティブにして最前面に表示
      await chrome.tabs.update(aiTab.id, { active: true });
      await chrome.windows.update(aiTab.windowId, { focused: true });

      return true;
    } catch (error) {
      console.error(`AIウィンドウフォーカスエラー:`, error);
      return false;
    }
  }

  async validateAllSelectors() {
    const currentAI = this.getCurrentAIFromURL();

    // AIページではない場合は検証をスキップ
    if (!currentAI) {
      return;
    }

    const allAISelectors = this.getAllSelectorsFromAllAIs();
    // 現在のAIのセレクタのみ検証
    const currentAISelectors = allAISelectors.filter(
      (item) => item.aiName === currentAI,
    );

    for (const item of currentAISelectors) {
      const { aiName, key, selector } = item;
      const validation = await this.validateSelector(selector.selectors);

      if (!validation.isValid) {
        addSelectorError(aiName, key, validation.error);
        console.warn(
          `❌ Selector validation failed for ${aiName}:${key} - ${validation.error}`,
        );
      } else {
        clearSelectorError(aiName, key);
      }
    }

    // 検証後に表示を更新
    this.updateDisplay();
  }

  // ========================================
  // 公開 API
  // ========================================
  init() {
    if (this.isInitialized) return;

    this.updateDisplay();
    this.isInitialized = true;

    // セレクタ検証は実行時のみ行う（初期化時は行わない）
  }

  getCurrentAI() {
    return this.currentAI;
  }

  // ========================================
  // セレクタテスト実行（ウィンドウフォーカス付き）
  // ========================================
  async testSelectorWithFocus(aiName, selectorKey) {
    const button = document.querySelector(
      `[data-selector-key="${selectorKey}"].selector-test-button`,
    );
    const originalText = button?.textContent || "テスト";

    try {
      // ボタンの状態を「テスト中」に変更
      if (button) {
        button.textContent = "テスト中...";
        button.disabled = true;
      }

      // 1. AIウィンドウを最前面に表示
      const focusSuccess = await this.focusAIWindow(aiName);
      if (!focusSuccess) {
        throw new Error(
          `${aiName}のタブが見つからないか、フォーカスに失敗しました`,
        );
      }

      // 2. 少し待機（ウィンドウフォーカスの安定化）
      await this.sleep(500);

      // 3. セレクタを取得
      const allAISelectors = this.getAllSelectorsFromAllAIs();
      const selectorData = allAISelectors.find(
        (item) => item.aiName === aiName && item.key === selectorKey,
      );

      if (!selectorData) {
        throw new Error("セレクタデータが見つかりません");
      }

      // 4. Chrome Extension経由でセレクタテストを実行
      const testResult = await this.executeRemoteSelectorTest(
        aiName,
        selectorData,
      );

      // 5. 結果を表示
      this.showTestResult(selectorData.selector.name, testResult);

      // 6. 統計を更新
      if (testResult.success) {
        clearSelectorError(aiName, selectorKey);
      } else {
        addSelectorError(aiName, selectorKey, testResult.error);
      }

      // 7. 表示を更新
      this.updateDisplay();
    } catch (error) {
      console.error(`セレクタテストエラー:`, error);
      this.showTestResult(`${aiName}:${selectorKey}`, {
        success: false,
        error: error.message,
        selector: null,
      });
    } finally {
      // ボタンの状態を元に戻す
      if (button) {
        button.textContent = originalText;
        button.disabled = false;
      }
    }
  }

  // Chrome Extension経由でセレクタテストを実行
  async executeRemoteSelectorTest(aiName, selectorData) {
    try {
      // Chrome Extension APIを使用してAIページでセレクタテストを実行
      if (!chrome || !chrome.tabs) {
        throw new Error("Chrome Extension APIが利用できません");
      }

      const result = await chrome.tabs.sendMessage(
        await this.getAITabId(aiName),
        {
          action: "testSelector",
          selectors: selectorData.selector.selectors,
          selectorKey: selectorData.key,
          aiName: aiName,
        },
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: `リモートテスト失敗: ${error.message}`,
        selector: null,
      };
    }
  }

  // AIタブのIDを取得
  async getAITabId(aiName) {
    const tabs = await chrome.tabs.query({});
    const urlPatterns = this.AI_URLS[aiName];

    const aiTab = tabs.find((tab) => {
      return urlPatterns.some(
        (pattern) => tab.url && tab.url.includes(pattern),
      );
    });

    if (!aiTab) {
      throw new Error(`${aiName}のタブが見つかりません`);
    }

    return aiTab.id;
  }

  // テスト結果表示
  showTestResult(name, result) {
    const resultDiv = document.createElement("div");
    resultDiv.className = `selector-test-result ${result.success ? "success" : "failure"}`;
    resultDiv.innerHTML = `
      <div class="test-result-header">
        <strong>${name}</strong> のテスト結果
        <button onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="test-result-content">
        <div><strong>結果:</strong> ${result.success ? "✅ 成功" : "❌ 失敗"}</div>
        ${result.selector ? `<div><strong>使用セレクタ:</strong> <code>${this.escapeHtml(result.selector)}</code></div>` : ""}
        ${result.error ? `<div><strong>エラー:</strong> ${result.error}</div>` : ""}
      </div>
    `;

    // 結果を画面上部に表示
    const container = document.getElementById("selector-timeline-container");
    if (container) {
      container.insertBefore(resultDiv, container.firstChild);

      // 5秒後に自動削除
      setTimeout(() => {
        if (resultDiv.parentNode) {
          resultDiv.remove();
        }
      }, 5000);
    }
  }

  // Sleep関数
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ========================================
  // セレクタ詳細表示切り替え
  // ========================================
  toggleSelectorDetails(selectorKey) {
    const detailsElement = document.getElementById(`details-${selectorKey}`);
    if (detailsElement) {
      const isVisible = detailsElement.style.display !== "none";
      detailsElement.style.display = isVisible ? "none" : "table-row";
    }
  }
}

// ========================================
// グローバル関数は削除（CSP対応のため）
// ========================================

// ========================================
// エクスポート
// ========================================
export default SelectorTimelineManager;
