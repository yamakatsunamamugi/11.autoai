// docs-client.js - Google Docs APIクライアント

// authServiceをグローバルから取得
const getAuthService = () => {
  if (globalThis.authService) {
    return globalThis.authService;
  }
  console.warn("AuthService not found in globalThis");
  return null;
};

class DocsClient {
  constructor() {
    this.docsBaseUrl = "https://docs.googleapis.com/v1/documents";
    this.driveBaseUrl = "https://www.googleapis.com/drive/v3/files";
  }

  /**
   * 新しいGoogleドキュメントを作成
   * @param {string} title - ドキュメントのタイトル
   * @returns {Promise<Object>} 作成されたドキュメント情報
   */
  async createDocument(title) {
    const authService = getAuthService();
    if (!authService) throw new Error("AuthService not available");
    const token = await authService.getAuthToken();

    // ドキュメントを作成
    const createResponse = await fetch(this.docsBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: title || "無題のドキュメント",
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Docs API error: ${error.error.message}`);
    }

    const doc = await createResponse.json();

    // ドキュメントのURLを構築
    const documentUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;

    return {
      documentId: doc.documentId,
      title: doc.title,
      url: documentUrl,
      revisionId: doc.revisionId,
    };
  }

  /**
   * ドキュメントにテキストを挿入
   * @param {string} documentId - ドキュメントID
   * @param {string} text - 挿入するテキスト
   * @param {number} index - 挿入位置（デフォルトは1 = ドキュメントの先頭）
   * @returns {Promise<Object>} 更新結果
   */
  async insertText(documentId, text, index = 1) {
    const authService = getAuthService();
    if (!authService) throw new Error("AuthService not available");
    const token = await authService.getAuthToken();
    const url = `${this.docsBaseUrl}/${documentId}:batchUpdate`;

    const requests = [
      {
        insertText: {
          location: {
            index: index,
          },
          text: text,
        },
      },
    ];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: requests,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Docs API error: ${error.error.message}`);
    }

    return await response.json();
  }

  /**
   * ドキュメントのタイトルを更新
   * @param {string} documentId - ドキュメントID
   * @param {string} newTitle - 新しいタイトル
   * @returns {Promise<Object>} 更新結果
   */
  async updateTitle(documentId, newTitle) {
    const authService = getAuthService();
    if (!authService) throw new Error("AuthService not available");
    const token = await authService.getAuthToken();
    const url = `${this.driveBaseUrl}/${documentId}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newTitle,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Drive API error: ${error.error.message}`);
    }

    return await response.json();
  }

  /**
   * ドキュメントを作成してコンテンツを設定
   * @param {string} title - ドキュメントタイトル
   * @param {string} content - ドキュメントの内容
   * @returns {Promise<Object>} 作成されたドキュメント情報
   */
  async createAndWriteDocument(title, content) {
    console.log(`[DocsClient] Creating document: ${title}`);

    // ドキュメントを作成
    const doc = await this.createDocument(title);

    // コンテンツを挿入
    if (content) {
      await this.insertText(doc.documentId, content);
    }

    console.log(`[DocsClient] Document created: ${doc.url}`);

    return doc;
  }

  /**
   * 複数のセクションを持つドキュメントを作成
   * @param {string} title - ドキュメントタイトル
   * @param {Array<{title: string, content: string}>} sections - セクションの配列
   * @returns {Promise<Object>} 作成されたドキュメント情報
   */
  async createStructuredDocument(title, sections) {
    console.log(`[DocsClient] Creating structured document: ${title}`);

    // ドキュメントを作成
    const doc = await this.createDocument(title);

    // 各セクションを追加
    let content = "";
    for (const section of sections) {
      if (section.title) {
        content += `## ${section.title}\n\n`;
      }
      if (section.content) {
        content += `${section.content}\n\n`;
      }
    }

    // 一度にすべてのコンテンツを挿入
    if (content) {
      await this.insertText(doc.documentId, content);
    }

    console.log(`[DocsClient] Structured document created: ${doc.url}`);

    return doc;
  }

  /**
   * スプレッドシートのタスク結果からドキュメントを作成
   * @param {Object} taskResult - タスク実行結果
   * @returns {Promise<Object>} 作成されたドキュメント情報
   */
  async createDocumentFromTaskResult(taskResult) {
    // タイトルの生成（【AI自動化用】プレフィックス + プロンプトの冒頭30文字を使用）
    const titleBase = taskResult.prompt
      ? taskResult.prompt.substring(0, 30).replace(/[\n\r]/g, " ")
      : "AI回答";
    const title = `【AI自動化用】${titleBase} - ${new Date().toLocaleDateString("ja-JP")}`;

    // 回答のみをドキュメントの内容として設定
    const content = taskResult.response || "(回答なし)";
    
    // デバッグ: 受け取ったコンテンツの確認
    console.log(`[DocsClient] ドキュメント作成開始:`);
    console.log(`  - タイトル: ${title}`);
    console.log(`  - コンテンツ長: ${content.length}文字`);
    console.log(`  - 最初の200文字: ${content.substring(0, 200)}...`);
    console.log(`  - ChatGPT含む: ${content.includes('【ChatGPT回答】')}`);
    console.log(`  - Claude含む: ${content.includes('【Claude回答】')}`);
    console.log(`  - Gemini含む: ${content.includes('【Gemini回答】')}`);

    // シンプルなドキュメントを作成（回答のみ）
    return await this.createAndWriteDocument(title, content);
  }
}

// シングルトンインスタンスを作成してエクスポート
const docsClient = new DocsClient();

// グローバルに公開
if (typeof globalThis !== "undefined") {
  globalThis.docsClient = docsClient;
}
