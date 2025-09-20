/**
 * @fileoverview DOM操作ユーティリティ
 *
 * 安全なDOM操作のためのユーティリティ関数
 * XSS対策、パフォーマンス最適化を含む
 */

/**
 * テキストを安全にHTMLエスケープ
 * @param {string} text - エスケープするテキスト
 * @returns {string} エスケープ済みテキスト
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 安全にHTML要素を作成
 * @param {string} tagName - タグ名
 * @param {Object} attributes - 属性
 * @param {string|Element|Array} children - 子要素
 * @returns {Element} 作成された要素
 */
export function createElement(tagName, attributes = {}, children = null) {
  const element = document.createElement(tagName);

  // 属性を設定
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('data-')) {
      element.setAttribute(key, value);
    } else if (key === 'textContent') {
      element.textContent = value;
    } else {
      element[key] = value;
    }
  }

  // 子要素を追加
  if (children) {
    if (typeof children === 'string') {
      element.textContent = children;
    } else if (children instanceof Element) {
      element.appendChild(children);
    } else if (Array.isArray(children)) {
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof Element) {
          element.appendChild(child);
        }
      });
    }
  }

  return element;
}

/**
 * 要素の内容を安全に更新
 * @param {Element} element - 更新する要素
 * @param {string|Element|Array} content - 新しい内容
 */
export function safeSetContent(element, content) {
  // 既存の内容をクリア
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }

  // 新しい内容を追加
  if (typeof content === 'string') {
    element.textContent = content;
  } else if (content instanceof Element) {
    element.appendChild(content);
  } else if (Array.isArray(content)) {
    const fragment = document.createDocumentFragment();
    content.forEach(item => {
      if (typeof item === 'string') {
        fragment.appendChild(document.createTextNode(item));
      } else if (item instanceof Element) {
        fragment.appendChild(item);
      }
    });
    element.appendChild(fragment);
  }
}

/**
 * テンプレートから要素を作成
 * @param {string} template - HTMLテンプレート文字列
 * @param {Object} data - テンプレートに埋め込むデータ
 * @returns {DocumentFragment} 作成されたフラグメント
 */
export function createFromTemplate(template, data = {}) {
  const temp = document.createElement('template');

  // データをエスケープして埋め込み
  let processedTemplate = template;
  for (const [key, value] of Object.entries(data)) {
    const escapedValue = escapeHtml(String(value));
    processedTemplate = processedTemplate.replace(
      new RegExp(`{{${key}}}`, 'g'),
      escapedValue
    );
  }

  temp.innerHTML = processedTemplate;
  return temp.content;
}

/**
 * クラス名を安全に切り替え
 * @param {Element} element - 対象要素
 * @param {Object} classes - {追加するクラス: 条件}
 */
export function toggleClasses(element, classes) {
  for (const [className, condition] of Object.entries(classes)) {
    if (condition) {
      element.classList.add(className);
    } else {
      element.classList.remove(className);
    }
  }
}

/**
 * 要素の属性を安全に更新
 * @param {Element} element - 対象要素
 * @param {Object} attributes - 更新する属性
 */
export function updateAttributes(element, attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) {
      element.removeAttribute(key);
    } else {
      element.setAttribute(key, String(value));
    }
  }
}

/**
 * イベントリスナーを安全に追加（自動クリーンアップ付き）
 * @param {Element} element - 対象要素
 * @param {string} event - イベント名
 * @param {Function} handler - ハンドラー関数
 * @param {Object} options - オプション
 * @returns {Function} クリーンアップ関数
 */
export function addEventListenerSafe(element, event, handler, options = {}) {
  element.addEventListener(event, handler, options);

  // クリーンアップ関数を返す
  return () => {
    element.removeEventListener(event, handler, options);
  };
}

/**
 * 複数のイベントリスナーを管理
 */
export class EventManager {
  constructor() {
    this.listeners = [];
  }

  /**
   * イベントリスナーを追加
   * @param {Element} element - 対象要素
   * @param {string} event - イベント名
   * @param {Function} handler - ハンドラー関数
   * @param {Object} options - オプション
   */
  add(element, event, handler, options = {}) {
    const cleanup = addEventListenerSafe(element, event, handler, options);
    this.listeners.push(cleanup);
  }

  /**
   * すべてのイベントリスナーを削除
   */
  removeAll() {
    this.listeners.forEach(cleanup => cleanup());
    this.listeners = [];
  }
}

/**
 * DocumentFragmentを使用した効率的なDOM更新
 * @param {Element} container - コンテナ要素
 * @param {Array} items - 追加する要素の配列
 */
export function batchAppend(container, items) {
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    if (item instanceof Element) {
      fragment.appendChild(item);
    }
  });
  container.appendChild(fragment);
}

/**
 * 仮想DOMのような差分更新
 * @param {Element} container - コンテナ要素
 * @param {Array} newItems - 新しい要素の配列
 * @param {Function} keyFn - キー取得関数
 */
export function diffUpdate(container, newItems, keyFn = (item) => item.id) {
  const existingElements = new Map();
  const existingChildren = Array.from(container.children);

  // 既存要素をマップに格納
  existingChildren.forEach(child => {
    const key = child.dataset.key;
    if (key) {
      existingElements.set(key, child);
    }
  });

  // 新しい要素を処理
  newItems.forEach((item, index) => {
    const key = keyFn(item);
    const existing = existingElements.get(key);

    if (existing) {
      // 既存要素を更新
      if (container.children[index] !== existing) {
        container.insertBefore(existing, container.children[index]);
      }
      existingElements.delete(key);
    } else {
      // 新規要素を作成
      const newElement = item instanceof Element ? item : createElement('div', {
        'data-key': key,
        textContent: String(item)
      });

      if (index < container.children.length) {
        container.insertBefore(newElement, container.children[index]);
      } else {
        container.appendChild(newElement);
      }
    }
  });

  // 不要な要素を削除
  existingElements.forEach(element => {
    container.removeChild(element);
  });
}

export default {
  escapeHtml,
  createElement,
  safeSetContent,
  createFromTemplate,
  toggleClasses,
  updateAttributes,
  addEventListenerSafe,
  EventManager,
  batchAppend,
  diffUpdate
};