/**
 * @fileoverview PC識別子ユーティリティ - 複数PC間での排他制御用の識別子生成
 * 
 * 特徴:
 * - Chrome拡張のランタイムIDを使用
 * - ランダム値を追加してユニーク性を確保
 * - シングルトンパターンで一貫性のある識別子を提供
 * - 将来的な拡張（ホスト名、ユーザー名など）を考慮した設計
 */

export class PCIdentifier {
  constructor() {
    this._identifier = null;
    this._metadata = {};
  }

  /**
   * シングルトンインスタンスを取得
   * @returns {PCIdentifier} インスタンス
   */
  static getInstance() {
    if (!this.instance) {
      this.instance = new PCIdentifier();
    }
    return this.instance;
  }

  /**
   * PC識別子を取得（一度生成したら同じ値を返す）
   * @returns {Object} 識別子情報
   */
  getIdentifier() {
    if (!this._identifier) {
      this._identifier = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        metadata: this.getMetadata()
      };
    }
    return this._identifier;
  }

  /**
   * 識別子文字列のみを取得
   * @returns {string} 識別子文字列
   */
  getId() {
    return this.getIdentifier().id;
  }

  /**
   * ユニークな識別子を生成
   * @returns {string} 識別子
   */
  generateId() {
    // Chrome拡張のランタイムIDとランダム値を組み合わせて一意性を確保
    try {
      let baseId = 'PC';
      
      // Chrome拡張のランタイムIDを取得
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        // ランタイムIDの末尾8文字を使用（長すぎると見づらいため）
        const runtimeId = chrome.runtime.id;
        baseId = runtimeId.substring(runtimeId.length - 8);
      }
      
      // ランダムなサフィックスを追加（5文字）
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      
      // 組み合わせて返す（例: "abcd1234_x7k9m"）
      return `${baseId}_${randomSuffix}`;
      
    } catch (error) {
      console.warn('[PCIdentifier] ID生成エラー:', error);
      // エラー時はランダムIDを生成
      return `PC_${Math.random().toString(36).substring(2, 10)}`;
    }
  }

  /**
   * メタデータを取得（将来の拡張用）
   * @returns {Object} メタデータ
   */
  getMetadata() {
    const metadata = {
      ...this._metadata,
      userAgent: this.getUserAgent(),
      platform: this.getPlatform(),
      extensionVersion: this.getExtensionVersion()
    };

    return metadata;
  }

  /**
   * カスタムメタデータを設定
   * @param {string} key - キー
   * @param {any} value - 値
   */
  setMetadata(key, value) {
    this._metadata[key] = value;
  }

  /**
   * ユーザーエージェントを取得
   * @returns {string} ユーザーエージェント
   */
  getUserAgent() {
    try {
      return navigator?.userAgent || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * プラットフォームを取得
   * @returns {string} プラットフォーム
   */
  getPlatform() {
    try {
      return navigator?.platform || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * 拡張機能のバージョンを取得
   * @returns {string} バージョン
   */
  getExtensionVersion() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        return manifest.version || 'unknown';
      }
    } catch (error) {
      console.warn('[PCIdentifier] Extension version取得失敗:', error);
    }
    return 'unknown';
  }

  /**
   * 識別子をリセット（テスト用）
   */
  reset() {
    this._identifier = null;
    this._metadata = {};
  }

  /**
   * 識別子が自分のものかチェック
   * @param {string} id - チェックする識別子
   * @returns {boolean} 自分の識別子の場合true
   */
  isMyIdentifier(id) {
    return id === this.getId();
  }
}

// デフォルトインスタンスをエクスポート
export const pcIdentifier = PCIdentifier.getInstance();