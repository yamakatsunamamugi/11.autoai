/**
 * Gemini Spreadsheet Adapter
 * 既存のスプレッドシートシステムとGemini統合レイヤーを接続するアダプター
 * Version: 1.0.0
 */

(function() {
    'use strict';

    // ========================================
    // GeminiSpreadsheetAdapter クラス
    // ========================================
    class GeminiSpreadsheetAdapter {
        constructor(integration, sheetsClient) {
            if (!integration || !integration.executeFromSpreadsheet) {
                throw new Error('有効なGeminiIntegrationインスタンスが必要です');
            }
            
            if (!sheetsClient || !sheetsClient.loadAutoAIData) {
                throw new Error('有効なSheetsClientインスタンスが必要です');
            }
            
            this.integration = integration;
            this.sheetsClient = sheetsClient;
            this.currentSpreadsheetId = null;
            this.currentGid = null;
            this.loadedData = null;
            this.executionQueue = [];
            this.isProcessing = false;
            this.pauseBetweenRows = 5000; // 行間の待機時間（ミリ秒）
            this.debugMode = false;
        }

        /**
         * スプレッドシートからデータを読み込み
         * @param {string} spreadsheetId - スプレッドシートID
         * @param {string} gid - シートのgid（オプション）
         * @returns {Promise<Object>} 読み込んだデータ
         */
        async loadSpreadsheet(spreadsheetId, gid = null) {
            this.log('📊 スプレッドシートを読み込み中...', 'header');
            
            try {
                this.currentSpreadsheetId = spreadsheetId;
                this.currentGid = gid;
                
                // スプレッドシートデータを読み込み
                this.loadedData = await this.sheetsClient.loadAutoAIData(spreadsheetId, gid);
                
                this.log(`✅ データ読み込み完了: ${this.loadedData.workRows.length}行の作業行を検出`, 'success');
                
                // 列マッピング情報を表示
                this.displayColumnMapping();
                
                return this.loadedData;
                
            } catch (error) {
                this.log(`❌ スプレッドシート読み込みエラー: ${error.message}`, 'error');
                throw error;
            }
        }

        /**
         * 列マッピング情報を表示
         */
        displayColumnMapping() {
            if (!this.loadedData || !this.loadedData.columnMapping) return;
            
            this.log('\n📋 列マッピング情報:', 'info');
            
            const mappings = Object.entries(this.loadedData.columnMapping)
                .sort(([a], [b]) => parseInt(a) - parseInt(b));
            
            for (const [colIndex, mapping] of mappings) {
                const colLetter = this.getColumnLetter(parseInt(colIndex));
                this.log(`  ${colLetter}列 (${colIndex}): ${mapping.keyword} [${mapping.type}/${mapping.aiType}]`, 'info');
            }
        }

        /**
         * 列インデックスを列文字に変換
         */
        getColumnLetter(index) {
            let letter = '';
            while (index >= 0) {
                letter = String.fromCharCode((index % 26) + 65) + letter;
                index = Math.floor(index / 26) - 1;
            }
            return letter;
        }

        /**
         * 作業行をGemini用のタスクフォーマットに変換
         * @param {Object} workRow - 作業行データ
         * @returns {Object} Gemini用タスクデータ
         */
        convertWorkRowToTask(workRow) {
            const task = {
                rowNumber: workRow.number,
                rowIndex: workRow.index,
                model: null,
                function: null,
                text: null,
                originalData: workRow.data
            };

            // 列マッピングを使用してデータを抽出
            for (const [colIndex, mapping] of Object.entries(this.loadedData.columnMapping)) {
                const cellValue = workRow.data[colIndex];
                
                if (!cellValue || cellValue.trim() === '') continue;
                
                // AIタイプに基づいて処理
                switch (mapping.aiType) {
                    case 'chatgpt':
                    case 'claude':
                    case 'gemini':
                        // プロンプト列の場合
                        if (mapping.type === 'prompt') {
                            task.text = cellValue.trim();
                            task.aiType = mapping.aiType;
                        }
                        break;
                        
                    case 'perplexity':
                    case 'notebooklm':
                        // 特殊なAIタイプは現在スキップ
                        this.log(`  特殊AIタイプ ${mapping.aiType} は現在未対応`, 'warning');
                        break;
                }
            }

            // モデルと機能の設定（特殊モデル行・特殊作業行から取得）
            if (this.loadedData.specialModelRow) {
                const modelColIndex = Object.keys(this.loadedData.columnMapping).find(
                    idx => this.loadedData.columnMapping[idx].aiType === 'gemini'
                );
                if (modelColIndex && this.loadedData.specialModelRow.data[modelColIndex]) {
                    task.model = this.loadedData.specialModelRow.data[modelColIndex].trim();
                }
            }

            if (this.loadedData.specialTaskRow) {
                const taskColIndex = Object.keys(this.loadedData.columnMapping).find(
                    idx => this.loadedData.columnMapping[idx].aiType === 'gemini'
                );
                if (taskColIndex && this.loadedData.specialTaskRow.data[taskColIndex]) {
                    task.function = this.loadedData.specialTaskRow.data[taskColIndex].trim();
                }
            }

            return task;
        }

        /**
         * 単一の作業行を実行
         * @param {number} rowNumber - 行番号（1ベース）
         * @returns {Promise<Object>} 実行結果
         */
        async executeRow(rowNumber) {
            if (!this.loadedData) {
                throw new Error('スプレッドシートが読み込まれていません');
            }

            const workRow = this.loadedData.workRows.find(row => row.number === rowNumber);
            
            if (!workRow) {
                throw new Error(`行番号 ${rowNumber} が見つかりません`);
            }

            // 制御列をチェック（B列）
            if (workRow.control && workRow.control.toLowerCase() === 'skip') {
                this.log(`⏭️ 行${rowNumber}はスキップ設定です`, 'info');
                return {
                    success: true,
                    skipped: true,
                    rowNumber,
                    reason: 'skip control'
                };
            }

            // タスクに変換
            const task = this.convertWorkRowToTask(workRow);
            
            if (!task.text) {
                this.log(`⚠️ 行${rowNumber}にGemini用のテキストがありません`, 'warning');
                return {
                    success: false,
                    rowNumber,
                    error: 'No text found for Gemini'
                };
            }

            this.log(`\n🔄 行${rowNumber}を実行中...`, 'header');
            this.log(`  テキスト: "${task.text.substring(0, 100)}${task.text.length > 100 ? '...' : ''}"`, 'info');
            
            try {
                // GeminiIntegrationを使用して実行
                const result = await this.integration.executeFromSpreadsheet({
                    model: task.model,
                    function: task.function,
                    text: task.text
                });

                // 結果をスプレッドシートに書き戻し（オプション）
                if (result.success && result.result?.response) {
                    await this.updateRowResult(rowNumber, result.result.response);
                }

                return result;
                
            } catch (error) {
                this.log(`❌ 行${rowNumber}の実行エラー: ${error.message}`, 'error');
                return {
                    success: false,
                    rowNumber,
                    error: error.message
                };
            }
        }

        /**
         * 複数の作業行を順次実行
         * @param {Array<number>} rowNumbers - 実行する行番号の配列（省略時は全行）
         * @returns {Promise<Array>} 実行結果の配列
         */
        async executeRows(rowNumbers = null) {
            if (!this.loadedData) {
                throw new Error('スプレッドシートが読み込まれていません');
            }

            // 行番号が指定されていない場合は全作業行を対象とする
            if (!rowNumbers) {
                rowNumbers = this.loadedData.workRows
                    .filter(row => row.control !== 'skip')
                    .map(row => row.number);
            }

            this.log(`\n📊 ${rowNumbers.length}行の実行を開始`, 'header');
            
            const results = [];
            
            for (let i = 0; i < rowNumbers.length; i++) {
                const rowNumber = rowNumbers[i];
                this.log(`\n--- ${i + 1}/${rowNumbers.length} ---`, 'progress');
                
                const result = await this.executeRow(rowNumber);
                results.push(result);
                
                // 次の行までの待機
                if (i < rowNumbers.length - 1) {
                    this.log(`⏳ 次の行まで${this.pauseBetweenRows / 1000}秒待機...`, 'info');
                    await this.wait(this.pauseBetweenRows);
                }
            }

            // 実行サマリー
            const successCount = results.filter(r => r.success && !r.skipped).length;
            const skipCount = results.filter(r => r.skipped).length;
            const failCount = results.filter(r => !r.success && !r.skipped).length;
            
            this.log('\n' + '='.repeat(60), 'info');
            this.log('📊 実行完了サマリー:', 'header');
            this.log(`  ✅ 成功: ${successCount}行`, 'success');
            this.log(`  ⏭️ スキップ: ${skipCount}行`, 'info');
            this.log(`  ❌ 失敗: ${failCount}行`, failCount > 0 ? 'error' : 'info');
            
            return results;
        }

        /**
         * 実行結果をスプレッドシートに書き戻し
         * @param {number} rowNumber - 行番号
         * @param {string} response - 応答テキスト
         */
        async updateRowResult(rowNumber, response) {
            if (!this.currentSpreadsheetId) return;
            
            try {
                // Gemini列を探す（回答を書き込む列）
                const geminiColIndex = Object.keys(this.loadedData.columnMapping).find(
                    idx => this.loadedData.columnMapping[idx].aiType === 'gemini' &&
                           this.loadedData.columnMapping[idx].type === 'answer'
                );
                
                if (geminiColIndex) {
                    const colLetter = this.getColumnLetter(parseInt(geminiColIndex));
                    const range = `${colLetter}${rowNumber}`;
                    
                    // 応答を短縮（必要に応じて）
                    const truncatedResponse = response.length > 1000 
                        ? response.substring(0, 997) + '...' 
                        : response;
                    
                    await this.sheetsClient.updateCell(
                        this.currentSpreadsheetId,
                        range,
                        truncatedResponse
                    );
                    
                    this.log(`  📝 結果を${range}に書き込みました`, 'success');
                }
            } catch (error) {
                this.log(`  ⚠️ 結果の書き込みエラー: ${error.message}`, 'warning');
            }
        }

        /**
         * 特定の列のGeminiプロンプトを取得
         * @param {string} columnLetter - 列文字（例: 'E'）
         * @returns {Array} プロンプトのリスト
         */
        getGeminiPrompts(columnLetter = null) {
            if (!this.loadedData) {
                throw new Error('スプレッドシートが読み込まれていません');
            }

            const prompts = [];
            
            for (const workRow of this.loadedData.workRows) {
                // スキップ行は除外
                if (workRow.control === 'skip') continue;
                
                if (columnLetter) {
                    // 特定の列のみ
                    const colIndex = this.letterToColumnIndex(columnLetter);
                    const mapping = this.loadedData.columnMapping[colIndex];
                    
                    if (mapping && mapping.aiType === 'gemini' && workRow.data[colIndex]) {
                        prompts.push({
                            rowNumber: workRow.number,
                            text: workRow.data[colIndex].trim(),
                            column: columnLetter
                        });
                    }
                } else {
                    // すべてのGemini列
                    for (const [colIndex, mapping] of Object.entries(this.loadedData.columnMapping)) {
                        if (mapping.aiType === 'gemini' && mapping.type === 'prompt' && workRow.data[colIndex]) {
                            prompts.push({
                                rowNumber: workRow.number,
                                text: workRow.data[colIndex].trim(),
                                column: this.getColumnLetter(parseInt(colIndex))
                            });
                        }
                    }
                }
            }
            
            return prompts;
        }

        /**
         * 列文字を列インデックスに変換
         */
        letterToColumnIndex(letter) {
            let index = 0;
            for (let i = 0; i < letter.length; i++) {
                index = index * 26 + (letter.charCodeAt(i) - 65) + 1;
            }
            return index - 1;
        }

        /**
         * 実行状態のリセット
         */
        reset() {
            this.loadedData = null;
            this.currentSpreadsheetId = null;
            this.currentGid = null;
            this.executionQueue = [];
            this.isProcessing = false;
            this.log('🔄 アダプターをリセットしました', 'info');
        }

        /**
         * デバッグモードの設定
         */
        setDebugMode(enabled) {
            this.debugMode = enabled;
            this.integration.setDebugMode(enabled);
            this.log(`デバッグモード: ${enabled ? 'ON' : 'OFF'}`, 'info');
        }

        /**
         * 行間待機時間の設定
         */
        setPauseBetweenRows(ms) {
            this.pauseBetweenRows = ms;
            this.log(`行間待機時間: ${ms}ms`, 'info');
        }

        // ========================================
        // ユーティリティメソッド
        // ========================================

        wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        log(message, type = 'info') {
            if (!this.debugMode && type === 'debug') return;
            
            const styles = {
                info: 'color: #2196F3',
                success: 'color: #4CAF50',
                warning: 'color: #FF9800',
                error: 'color: #F44336',
                header: 'color: #9C27B0; font-size: 14px; font-weight: bold',
                progress: 'color: #00BCD4; font-weight: bold',
                debug: 'color: #9E9E9E'
            };
            
            console.log(`%c[SpreadsheetAdapter] ${message}`, styles[type] || styles.info);
        }
    }

    // ========================================
    // 統合ヘルパー関数
    // ========================================
    
    /**
     * URLからスプレッドシートIDとgidを抽出
     */
    function parseSpreadsheetUrl(url) {
        const spreadsheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        const gidMatch = url.match(/[#&]gid=([0-9]+)/);
        
        return {
            spreadsheetId: spreadsheetIdMatch ? spreadsheetIdMatch[1] : null,
            gid: gidMatch ? gidMatch[1] : null
        };
    }

    /**
     * 完全な統合セットアップ
     */
    async function setupGeminiSpreadsheetIntegration() {
        console.log('\n%c🚀 Gemini Spreadsheet完全統合セットアップ', 'color: #4CAF50; font-size: 16px; font-weight: bold');
        
        try {
            // 1. Geminiインスタンスの確認
            if (!window.Gemini) {
                throw new Error('Geminiが初期化されていません。gemini-automation-control.jsを先に実行してください。');
            }
            
            // 2. GeminiIntegrationの初期化
            if (!window.GeminiIntegration) {
                throw new Error('GeminiIntegrationが見つかりません。gemini-spreadsheet-integration.jsを読み込んでください。');
            }
            
            const integration = new GeminiIntegration(window.Gemini);
            
            // 3. SheetsClientの確認
            if (!window.sheetsClient) {
                throw new Error('SheetsClientが見つかりません。スプレッドシートリーダーを読み込んでください。');
            }
            
            // 4. アダプターの作成
            const adapter = new GeminiSpreadsheetAdapter(integration, window.sheetsClient);
            
            // グローバルに公開
            window.geminiAdapter = adapter;
            
            console.log('✅ 統合セットアップ完了！');
            console.log('\n📝 使用方法:');
            console.log('1. スプレッドシートを読み込み:');
            console.log('   await geminiAdapter.loadSpreadsheet("SPREADSHEET_ID", "GID");');
            console.log('');
            console.log('2. 特定の行を実行:');
            console.log('   await geminiAdapter.executeRow(5);');
            console.log('');
            console.log('3. すべての行を実行:');
            console.log('   await geminiAdapter.executeRows();');
            console.log('');
            console.log('4. プロンプト一覧を取得:');
            console.log('   geminiAdapter.getGeminiPrompts();');
            
            return adapter;
            
        } catch (error) {
            console.error('❌ セットアップエラー:', error.message);
            throw error;
        }
    }

    // ========================================
    // API公開
    // ========================================
    window.GeminiSpreadsheetAdapter = GeminiSpreadsheetAdapter;
    window.parseSpreadsheetUrl = parseSpreadsheetUrl;
    window.setupGeminiSpreadsheetIntegration = setupGeminiSpreadsheetIntegration;

    // ヘルプ表示関数
    window.showGeminiAdapterHelp = function() {
        console.log('\n%c🚀 Gemini Spreadsheet Adapter v1.0', 'color: #4CAF50; font-size: 16px; font-weight: bold');
        console.log('━'.repeat(50));
        console.log('\n%c📌 セットアップ:', 'color: #2196F3; font-weight: bold');
        console.log('const adapter = await setupGeminiSpreadsheetIntegration();');
        console.log('');
        console.log('%c📊 スプレッドシート操作:', 'color: #2196F3; font-weight: bold');
        console.log('// URLから読み込み');
        console.log('const url = "https://docs.google.com/spreadsheets/d/xxx/edit#gid=0";');
        console.log('const {spreadsheetId, gid} = parseSpreadsheetUrl(url);');
        console.log('await adapter.loadSpreadsheet(spreadsheetId, gid);');
        console.log('');
        console.log('// 単一行の実行');
        console.log('await adapter.executeRow(5);  // 5行目を実行');
        console.log('');
        console.log('// 複数行の実行');
        console.log('await adapter.executeRows([5, 7, 9]);  // 特定の行を実行');
        console.log('await adapter.executeRows();  // すべての行を実行');
        console.log('');
        console.log('// プロンプト取得');
        console.log('const prompts = adapter.getGeminiPrompts();  // 全Gemini列');
        console.log('const promptsE = adapter.getGeminiPrompts("E");  // E列のみ');
        console.log('');
        console.log('%c⚙️ 設定:', 'color: #FF9800; font-weight: bold');
        console.log('adapter.setDebugMode(true);  // デバッグモード');
        console.log('adapter.setPauseBetweenRows(10000);  // 行間待機10秒');
        console.log('adapter.reset();  // 状態リセット');
        console.log('');
        console.log('%c💡 ヒント:', 'color: #9C27B0; font-weight: bold');
        console.log('- B列が"skip"の行は自動的にスキップされます');
        console.log('- 結果は自動的にスプレッドシートに書き戻されます');
        console.log('- Deep Research等の特殊機能も自動判定されます');
    };

    // 初期化完了メッセージ
    console.log('%c✅ Gemini Spreadsheet Adapter 初期化完了', 'color: #4CAF50; font-size: 14px; font-weight: bold');
    console.log('📝 ヘルプ: showGeminiAdapterHelp()');
    console.log('🚀 クイックスタート: await setupGeminiSpreadsheetIntegration()');

})();