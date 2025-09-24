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
    const allSelectors = this.getAllSelectorsFromSteps(filteredSteps);

    return `
      <div class="selector-timeline" data-ai="${this.currentAI}">
        <div class="selector-timeline-header">
          <div class="ai-info">
            <span class="ai-icon">${aiData.icon}</span>
            <h3>${aiData.name} セレクタ一覧</h3>
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
          ${this.renderSelectorsTable(allSelectors)}
          ${this.renderStepsTable(filteredSteps)}
        </div>
      </div>
    `;
  }

  // ========================================
  // セレクタ表の生成
  // ========================================
  renderSelectorsTable(allSelectors) {
    if (Object.keys(allSelectors).length === 0) {
      return '<div class="no-selectors">該当するセレクタがありません</div>';
    }

    return `
      <div class="selectors-table-section">
        <h4>💻 セレクタ一覧</h4>
        <table class="selectors-table">
          <thead>
            <tr>
              <th>セレクタ名</th>
              <th>カテゴリ</th>
              <th>CSSセレクタ</th>
              <th>用途</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(allSelectors)
              .map(([key, selector]) => this.renderSelectorRow(key, selector))
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  renderSelectorRow(key, selector) {
    const category = SELECTOR_CATEGORIES[selector.category];
    const primarySelector = selector.selectors[0]; // 最優先のセレクタを表示

    return `
      <tr class="selector-row" data-selector-key="${key}">
        <td class="selector-name-cell">
          <strong>${selector.name}</strong>
          ${!selector.isRequired ? '<span class="optional-badge">オプション</span>' : ""}
        </td>
        <td class="selector-category-cell">
          <span class="category-icon" style="color: ${category.color}">${category.icon}</span>
          ${category.name}
        </td>
        <td class="selector-css-cell">
          <code class="css-selector">${this.escapeHtml(primarySelector)}</code>
          ${selector.selectors.length > 1 ? `<span class="alt-count">+${selector.selectors.length - 1}個</span>` : ""}
        </td>
        <td class="selector-purpose-cell">
          ${selector.purpose}
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

  // ========================================
  // 統計更新（簡略化）
  // ========================================
  updateStats() {
    const statsContainer = document.getElementById("selector-stats-summary");
    if (statsContainer) {
      const totalSelectors = getTotalSelectorsCount(this.currentAI);
      const categoryStats = this.getCategoryStats();

      statsContainer.innerHTML = `
        <div class="simple-stats">
          <span>総セレクタ数: ${totalSelectors}個</span>
          ${Object.entries(categoryStats)
            .map(([category, count]) => {
              const cat = SELECTOR_CATEGORIES[category];
              return `<span>${cat.icon} ${cat.name}: ${count}個</span>`;
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
}

// ========================================
// エクスポート
// ========================================
export default SelectorTimelineManager;
