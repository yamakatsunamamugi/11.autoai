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
    console.log("🎯 SelectorTimelineManager initialized");
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

    // セレクタテスト機能
    document.addEventListener("click", (e) => {
      if (e.target.matches(".selector-test-btn")) {
        const selectorData = JSON.parse(e.target.dataset.selector);
        this.testSelector(selectorData);
      }
    });

    // セレクタ詳細表示
    document.addEventListener("click", (e) => {
      if (e.target.matches(".selector-item")) {
        this.toggleSelectorDetails(e.target);
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

    console.log(`🔄 AI switched to: ${aiName}`);
  }

  // ========================================
  // 表示更新
  // ========================================
  updateDisplay() {
    const timelineContainer = document.getElementById(
      "selector-timeline-container",
    );
    if (!timelineContainer) return;

    const aiData = AI_SELECTORS_TIMELINE[this.currentAI];
    if (!aiData) return;

    timelineContainer.innerHTML = this.renderTimeline(aiData);
    this.updateStats();
  }

  // ========================================
  // タイムライン HTML 生成
  // ========================================
  renderTimeline(aiData) {
    const filteredSteps = this.filterSteps(aiData.steps);

    return `
      <div class="selector-timeline" data-ai="${this.currentAI}">
        <div class="selector-timeline-header">
          <div class="ai-info">
            <span class="ai-icon">${aiData.icon}</span>
            <h3>${aiData.name} セレクタ使用順序</h3>
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

        <div class="selector-steps-container">
          ${filteredSteps.map((step, index) => this.renderStep(step, index)).join("")}
        </div>

        <div class="selector-timeline-footer">
          <div class="timeline-summary">
            <span>表示中: ${this.getVisibleSelectorsCount(filteredSteps)}個のセレクタ</span>
            <span>総数: ${getTotalSelectorsCount(this.currentAI)}個</span>
          </div>
        </div>
      </div>
    `;
  }

  // ========================================
  // ステップ HTML 生成
  // ========================================
  renderStep(step, stepIndex) {
    const visibleSelectors = this.filterSelectors(step.selectors);
    if (Object.keys(visibleSelectors).length === 0) return "";

    const isConditional = step.conditional;

    return `
      <div class="selector-step ${isConditional ? "conditional" : ""}" data-step="${step.stepNumber}">
        <div class="step-header">
          <div class="step-number">${step.stepNumber}</div>
          <div class="step-info">
            <h4>${step.stepName}</h4>
            <p class="step-description">${step.description}</p>
            ${isConditional ? '<span class="conditional-badge">条件付き</span>' : ""}
          </div>
        </div>

        <div class="step-selectors">
          ${Object.entries(visibleSelectors)
            .map(([key, selector]) =>
              this.renderSelector(key, selector, stepIndex),
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // ========================================
  // セレクタ HTML 生成
  // ========================================
  renderSelector(key, selector, stepIndex) {
    const category = SELECTOR_CATEGORIES[selector.category];
    const stats = SELECTOR_STATS[this.currentAI][key] || {};
    const successRate = stats.successRate || 0;
    const lastUsed = stats.lastUsed
      ? new Date(stats.lastUsed).toLocaleDateString("ja-JP")
      : "未使用";

    return `
      <div class="selector-item" data-selector-key="${key}">
        <div class="selector-header" onclick="toggleSelectorDetails('${key}')">
          <div class="selector-info">
            <span class="selector-category-icon" style="color: ${category.color}">${category.icon}</span>
            <span class="selector-name">${selector.name}</span>
            <span class="selector-purpose">${selector.purpose}</span>
            ${!selector.isRequired ? '<span class="optional-badge">オプション</span>' : ""}
          </div>

          <div class="selector-stats">
            <span class="success-rate ${this.getSuccessRateClass(successRate)}">
              成功率: ${successRate}%
            </span>
            <span class="last-used">最終使用: ${lastUsed}</span>
            <button class="selector-test-btn"
                    data-selector='${JSON.stringify({ key, selectors: selector.selectors, name: selector.name })}'>
              テスト
            </button>
          </div>
        </div>

        <div class="selector-details" id="details-${key}" style="display: none;">
          <div class="selector-list">
            <h5>セレクタ一覧 (優先順序)</h5>
            <ol class="selector-strings">
              ${selector.selectors
                .map(
                  (sel, index) =>
                    `<li class="selector-string">
                  <code>${this.escapeHtml(sel)}</code>
                  <button class="copy-selector-btn" data-selector="${this.escapeHtml(sel)}">📋</button>
                </li>`,
                )
                .join("")}
            </ol>
          </div>

          <div class="selector-metadata">
            <div class="metadata-item">
              <strong>カテゴリ:</strong> ${category.icon} ${category.name}
            </div>
            <div class="metadata-item">
              <strong>用途:</strong> ${selector.purpose}
            </div>
            <div class="metadata-item">
              <strong>必須:</strong> ${selector.isRequired ? "はい" : "いいえ"}
            </div>
            <div class="metadata-item">
              <strong>セレクタ数:</strong> ${selector.selectors.length}個
            </div>
            ${
              stats.hitCount
                ? `
              <div class="metadata-item">
                <strong>使用統計:</strong> 成功 ${stats.hitCount}回 / 失敗 ${stats.failCount || 0}回
              </div>
            `
                : ""
            }
          </div>
        </div>
      </div>
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
  // セレクタテスト機能
  // ========================================
  async testSelector(selectorData) {
    const { key, selectors, name } = selectorData;
    const startTime = Date.now();

    console.log(`🧪 Testing selector: ${name}`);

    try {
      let foundElement = null;
      let usedSelector = null;

      // 各セレクタを順番にテスト
      for (const selector of selectors) {
        try {
          foundElement = document.querySelector(selector);
          if (foundElement) {
            usedSelector = selector;
            break;
          }
        } catch (error) {
          console.warn(`Invalid selector: ${selector}`, error);
        }
      }

      const responseTime = Date.now() - startTime;
      const success = !!foundElement;

      // 統計を更新
      updateSelectorStats(this.currentAI, key, success, responseTime);

      // 結果を表示
      this.showTestResult(
        name,
        success,
        usedSelector,
        foundElement,
        responseTime,
      );

      // 表示を更新
      this.updateDisplay();
    } catch (error) {
      console.error(`Selector test failed:`, error);
      this.showTestResult(name, false, null, null, 0, error.message);
    }
  }

  // ========================================
  // テスト結果表示
  // ========================================
  showTestResult(
    name,
    success,
    usedSelector,
    element,
    responseTime,
    errorMessage,
  ) {
    const resultDiv = document.createElement("div");
    resultDiv.className = `selector-test-result ${success ? "success" : "failure"}`;
    resultDiv.innerHTML = `
      <div class="test-result-header">
        <strong>${name}</strong> のテスト結果
        <button onclick="this.parentElement.parentElement.remove()" style="float: right;">×</button>
      </div>
      <div class="test-result-content">
        <div><strong>結果:</strong> ${success ? "✅ 成功" : "❌ 失敗"}</div>
        ${usedSelector ? `<div><strong>使用セレクタ:</strong> <code>${this.escapeHtml(usedSelector)}</code></div>` : ""}
        ${element ? `<div><strong>要素タイプ:</strong> ${element.tagName.toLowerCase()}</div>` : ""}
        <div><strong>応答時間:</strong> ${responseTime}ms</div>
        ${errorMessage ? `<div><strong>エラー:</strong> ${errorMessage}</div>` : ""}
      </div>
    `;

    // 結果を画面上部に表示
    const container = document.getElementById("selector-timeline-container");
    if (container) {
      container.insertBefore(resultDiv, container.firstChild);

      // 3秒後に自動で削除
      setTimeout(() => {
        if (resultDiv.parentNode) {
          resultDiv.remove();
        }
      }, 3000);
    }
  }

  // ========================================
  // セレクタ詳細表示切り替え
  // ========================================
  toggleSelectorDetails(selectorKey) {
    const detailsElement = document.getElementById(`details-${selectorKey}`);
    if (detailsElement) {
      const isVisible = detailsElement.style.display !== "none";
      detailsElement.style.display = isVisible ? "none" : "block";
    }
  }

  // ========================================
  // 統計更新
  // ========================================
  updateStats() {
    const statsContainer = document.getElementById("selector-stats-summary");
    if (statsContainer) {
      const totalSelectors = getTotalSelectorsCount(this.currentAI);
      const categoryStats = this.getCategoryStats();

      statsContainer.innerHTML = `
        <div class="stats-item">
          <span class="stats-label">総セレクタ数:</span>
          <span class="stats-value">${totalSelectors}</span>
        </div>
        ${Object.entries(categoryStats)
          .map(([category, count]) => {
            const cat = SELECTOR_CATEGORIES[category];
            return `
            <div class="stats-item">
              <span class="stats-label">${cat.icon} ${cat.name}:</span>
              <span class="stats-value">${count}</span>
            </div>
          `;
          })
          .join("")}
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

  getVisibleSelectorsCount(steps) {
    let count = 0;
    steps.forEach((step) => {
      count += Object.keys(this.filterSelectors(step.selectors)).length;
    });
    return count;
  }

  getSuccessRateClass(rate) {
    if (rate >= 80) return "success-high";
    if (rate >= 50) return "success-medium";
    if (rate > 0) return "success-low";
    return "success-none";
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
  // 公開 API
  // ========================================
  init() {
    if (this.isInitialized) return;

    this.updateDisplay();
    this.isInitialized = true;
    console.log("✅ SelectorTimelineManager initialized successfully");
  }

  getCurrentAI() {
    return this.currentAI;
  }

  getStats() {
    return SELECTOR_STATS;
  }
}

// ========================================
// グローバル関数（HTML から呼び出し用）
// ========================================
window.toggleSelectorDetails = function (selectorKey) {
  const detailsElement = document.getElementById(`details-${selectorKey}`);
  if (detailsElement) {
    const isVisible = detailsElement.style.display !== "none";
    detailsElement.style.display = isVisible ? "none" : "block";
  }
};

window.copySelectorToClipboard = function (selector) {
  navigator.clipboard
    .writeText(selector)
    .then(() => {
      console.log("📋 Selector copied to clipboard:", selector);
    })
    .catch((err) => {
      console.error("Failed to copy selector:", err);
    });
};

// ========================================
// エクスポート
// ========================================
export default SelectorTimelineManager;
