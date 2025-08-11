/**
 * Gemini Spreadsheet Integration Layer
 * スプレッドシートデータを使用してGeminiを自動操作する統合レイヤー
 * Version: 1.0.0
 */

(function() {
    'use strict';

    // ========================================
    // GeminiIntegrationクラス
    // ========================================
    class GeminiIntegration {
        constructor(geminiInstance) {
            if (!geminiInstance || !geminiInstance.model) {
                throw new Error('有効なGeminiインスタンスが必要です');
            }
            
            this.gemini = geminiInstance;
            this.lastExecutionResult = null;
            this.executionHistory = [];
            this.debugMode = false;
            this.maxRetries = 3;
            this.retryDelay = 2000;
        }

        /**
         * スプレッドシートからのデータを実行
         * @param {Object} data - スプレッドシートの行データ
         * @returns {Promise<Object>} 実行結果
         */
        async executeFromSpreadsheet(data) {
            const startTime = Date.now();
            
            try {
                this.log('📊 スプレッドシートデータの処理開始', 'header');
                this.log(`入力データ: ${JSON.stringify(data, null, 2)}`, 'info');

                // データをマッピング
                const mappedTask = this.mapSpreadsheetData(data);
                
                // タスクを実行
                const result = await this.executeTask(mappedTask);
                
                // 実行結果を記録
                const executionRecord = {
                    timestamp: new Date().toISOString(),
                    input: data,
                    mappedTask,
                    result,
                    duration: Date.now() - startTime,
                    success: result.success
                };
                
                this.executionHistory.push(executionRecord);
                this.lastExecutionResult = executionRecord;
                
                this.log('✅ タスク実行完了', 'success');
                return executionRecord;
                
            } catch (error) {
                const errorRecord = {
                    timestamp: new Date().toISOString(),
                    input: data,
                    error: error.message,
                    duration: Date.now() - startTime,
                    success: false
                };
                
                this.executionHistory.push(errorRecord);
                this.lastExecutionResult = errorRecord;
                
                this.log(`❌ エラー: ${error.message}`, 'error');
                throw error;
            }
        }

        /**
         * スプレッドシートデータをタスク形式にマッピング
         * @param {Object} data - スプレッドシートの行データ
         * @returns {Object} マッピングされたタスク
         */
        mapSpreadsheetData(data) {
            // 必須フィールドのチェック
            if (!data.text || data.text.trim() === '') {
                throw new Error('テキストフィールドが必要です');
            }

            const task = {
                model: null,
                functions: [],
                text: data.text.trim(),
                type: 'normal',
                waitForResponse: true,
                maxWaitMinutes: 40
            };

            // モデルのマッピング（大文字小文字を正規化）
            if (data.model && data.model.trim() !== '') {
                const modelStr = data.model.trim().toLowerCase();
                
                // モデル名のマッピング辞書
                const modelMappings = {
                    'flash': 'Flash',
                    'flash2': 'Flash 2.0',
                    'flash 2.0': 'Flash 2.0',
                    'flash 2': 'Flash 2.0',
                    'pro': 'Pro',
                    'pro1.5': 'Pro 1.5',
                    'pro 1.5': 'Pro 1.5',
                    'pro2': 'Pro 2.0',
                    'pro 2.0': 'Pro 2.0',
                    'pro 2': 'Pro 2.0'
                };

                // 完全一致を試みる
                if (modelMappings[modelStr]) {
                    task.model = modelMappings[modelStr];
                } else {
                    // 部分一致を試みる
                    for (const [key, value] of Object.entries(modelMappings)) {
                        if (modelStr.includes(key) || key.includes(modelStr)) {
                            task.model = value;
                            break;
                        }
                    }
                    
                    // それでも見つからない場合は元の値を使用
                    if (!task.model) {
                        task.model = data.model.trim();
                    }
                }
                
                this.log(`モデル「${data.model}」→「${task.model}」にマッピング`, 'info');
            }

            // 機能のマッピング
            if (data.function && data.function.trim() !== '') {
                const functionStr = data.function.trim().toLowerCase();
                
                // 機能名のマッピング辞書
                const functionMappings = {
                    'deepresearch': 'Deep Research',
                    'deep research': 'Deep Research',
                    'research': 'Deep Research',
                    '調査': 'Deep Research',
                    'リサーチ': 'Deep Research',
                    'image': '画像',
                    'imagen': '画像',
                    '画像生成': '画像',
                    '画像': '画像',
                    'code': 'コード',
                    'コード実行': 'コード',
                    'コード': 'コード',
                    'python': 'コード'
                };

                // カンマ区切りで複数の機能を処理
                const functions = functionStr.split(',').map(f => f.trim());
                
                for (const func of functions) {
                    let mappedFunction = null;
                    
                    // 完全一致を試みる
                    if (functionMappings[func]) {
                        mappedFunction = functionMappings[func];
                    } else {
                        // 部分一致を試みる
                        for (const [key, value] of Object.entries(functionMappings)) {
                            if (func.includes(key) || key.includes(func)) {
                                mappedFunction = value;
                                break;
                            }
                        }
                        
                        // それでも見つからない場合は元の値を使用
                        if (!mappedFunction) {
                            mappedFunction = func;
                        }
                    }
                    
                    if (mappedFunction && !task.functions.includes(mappedFunction)) {
                        task.functions.push(mappedFunction);
                        this.log(`機能「${func}」→「${mappedFunction}」にマッピング`, 'info');
                    }
                }

                // Deep Researchの場合は特殊処理タイプに設定
                if (task.functions.includes('Deep Research')) {
                    task.type = 'deepResearch';
                    // Deep Research用の待機時間を設定（カスタマイズ可能）
                    if (data.maxWaitMinutes && !isNaN(parseInt(data.maxWaitMinutes))) {
                        task.maxWaitMinutes = parseInt(data.maxWaitMinutes);
                    }
                }
            }

            return task;
        }

        /**
         * マッピングされたタスクを実行
         * @param {Object} task - 実行するタスク
         * @returns {Promise<Object>} 実行結果
         */
        async executeTask(task) {
            this.log(`\n🚀 タスク実行開始`, 'header');
            this.log(`タスクタイプ: ${task.type}`, 'info');
            
            let retryCount = 0;
            let lastError = null;

            while (retryCount < this.maxRetries) {
                try {
                    // 機能をクリア
                    if (task.functions.length > 0 || task.type === 'deepResearch') {
                        this.log('機能をクリア中...', 'info');
                        await this.gemini.clearFunctions();
                        await this.wait(2000);
                    }

                    // モデルを選択
                    if (task.model) {
                        this.log(`モデル「${task.model}」を選択中...`, 'info');
                        const modelResult = await this.gemini.model(task.model);
                        if (!modelResult) {
                            this.log(`警告: モデル「${task.model}」の選択に失敗`, 'warning');
                        }
                        await this.wait(1000);
                    }

                    // 機能を有効化
                    for (const func of task.functions) {
                        this.log(`機能「${func}」を有効化中...`, 'info');
                        const funcResult = await this.gemini.func(func);
                        if (!funcResult) {
                            this.log(`警告: 機能「${func}」の有効化に失敗`, 'warning');
                        }
                        await this.wait(1000);
                    }

                    // タスクタイプに応じて実行
                    let result;
                    
                    if (task.type === 'deepResearch') {
                        this.log('Deep Researchモードで実行', 'info');
                        result = await this.executeDeepResearch(task);
                    } else {
                        this.log('通常モードで実行', 'info');
                        result = await this.executeNormal(task);
                    }

                    return result;

                } catch (error) {
                    lastError = error;
                    retryCount++;
                    
                    if (retryCount < this.maxRetries) {
                        this.log(`リトライ ${retryCount}/${this.maxRetries}: ${error.message}`, 'warning');
                        await this.wait(this.retryDelay * retryCount);
                    }
                }
            }

            // 全てのリトライが失敗
            throw new Error(`実行失敗（${this.maxRetries}回リトライ）: ${lastError.message}`);
        }

        /**
         * 通常タスクの実行
         */
        async executeNormal(task) {
            this.log(`📝 テキスト入力: "${task.text}"`, 'info');
            
            // テキスト入力
            const inputResult = await this.gemini.inputText(task.text);
            if (!inputResult) {
                throw new Error('テキスト入力に失敗しました');
            }

            // 送信
            this.log('📤 送信中...', 'info');
            const sendResult = await this.gemini.send();
            if (!sendResult) {
                throw new Error('送信に失敗しました');
            }

            // 応答待機
            if (task.waitForResponse) {
                this.log('⏳ 応答を待機中...', 'info');
                await this.waitForResponse();
            }

            // 結果を取得
            const texts = await this.gemini.getText();
            
            return {
                success: true,
                type: 'normal',
                query: task.text,
                model: task.model,
                functions: task.functions,
                response: texts.latestResponse,
                responseLength: texts.latestResponse ? texts.latestResponse.length : 0,
                inputText: texts.inputText,
                allText: texts.all
            };
        }

        /**
         * Deep Researchタスクの実行
         */
        async executeDeepResearch(task) {
            this.log(`🔬 Deep Research実行: "${task.text}"`, 'info');
            this.log(`最大待機時間: ${task.maxWaitMinutes}分`, 'info');

            // Deep Research機能が有効化されていることを確認
            if (!task.functions.includes('Deep Research')) {
                const funcResult = await this.gemini.func('research');
                if (!funcResult) {
                    throw new Error('Deep Research機能の有効化に失敗');
                }
                await this.wait(1000);
            }

            // テキスト入力
            const inputResult = await this.gemini.inputText(task.text);
            if (!inputResult) {
                throw new Error('テキスト入力に失敗しました');
            }

            // 送信
            const sendResult = await this.gemini.send();
            if (!sendResult) {
                throw new Error('送信に失敗しました');
            }

            // Deep Research専用の待機処理
            const result = await this.waitForDeepResearch(task.maxWaitMinutes);
            
            // 結果を取得
            const texts = await this.gemini.getText();
            
            return {
                success: true,
                type: 'deepResearch',
                query: task.text,
                model: task.model,
                functions: task.functions,
                response: texts.latestResponse,
                responseLength: texts.latestResponse ? texts.latestResponse.length : 0,
                inputText: texts.inputText,
                allText: texts.all,
                researchDetails: result
            };
        }

        /**
         * 通常の応答を待機
         */
        async waitForResponse(maxSeconds = 30) {
            const startTime = Date.now();
            let lastStopButton = null;

            while ((Date.now() - startTime) / 1000 < maxSeconds) {
                const stopButton = document.querySelector('[aria-label="回答を停止"]');
                
                if (stopButton) {
                    lastStopButton = Date.now();
                    await this.wait(1000);
                } else if (lastStopButton && (Date.now() - lastStopButton) > 3000) {
                    // 停止ボタンが3秒以上表示されていない
                    this.log('✅ 応答完了', 'success');
                    return true;
                }
                
                await this.wait(1000);
            }

            this.log('⚠️ 応答待機タイムアウト', 'warning');
            return false;
        }

        /**
         * Deep Researchの応答を待機
         */
        async waitForDeepResearch(maxMinutes = 40) {
            const startTime = Date.now();
            let researchStartClicked = false;
            let noStopButtonSeconds = 0;

            this.log('📋 Deep Research処理を開始...', 'info');

            // フェーズ1: リサーチ計画（最初の5分）
            const planPhaseMinutes = 5;
            
            while ((Date.now() - startTime) / 60000 < planPhaseMinutes) {
                // リサーチ開始ボタンを探す
                const researchButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    const text = btn.textContent?.trim() || '';
                    const ariaLabel = btn.getAttribute('aria-label') || '';
                    return text.includes('リサーチを開始') || ariaLabel.includes('リサーチを開始');
                });

                if (researchButtons.length > 0 && !researchStartClicked) {
                    this.log('🎯 「リサーチを開始」ボタンを検出', 'success');
                    await this.clickElement(researchButtons[0]);
                    researchStartClicked = true;
                    await this.wait(3000);
                    break;
                }

                // 既に処理中かチェック
                const stopButton = document.querySelector('[aria-label="回答を停止"]');
                if (stopButton) {
                    this.log('📝 リサーチが既に開始されています', 'info');
                    break;
                }

                await this.wait(2000);
            }

            // フェーズ2: メイン処理（長時間待機）
            const totalSeconds = maxMinutes * 60;
            let elapsedMinutes = 0;

            for (let seconds = Math.floor((Date.now() - startTime) / 1000); 
                 seconds < totalSeconds; 
                 seconds++) {
                
                await this.wait(1000);

                const stopButton = document.querySelector('[aria-label="回答を停止"]');
                
                if (stopButton) {
                    noStopButtonSeconds = 0;
                    
                    // 5分ごとに進捗表示
                    const currentMinutes = Math.floor(seconds / 60);
                    if (currentMinutes > 0 && currentMinutes % 5 === 0 && currentMinutes !== elapsedMinutes) {
                        elapsedMinutes = currentMinutes;
                        this.log(`⏳ 処理中... ${elapsedMinutes}分経過`, 'progress');
                    }
                } else {
                    noStopButtonSeconds++;
                    
                    // 5秒間停止ボタンが表示されない = 完了
                    if (noStopButtonSeconds >= 5) {
                        const totalMinutes = Math.floor((Date.now() - startTime) / 60000);
                        this.log(`✅ Deep Research完了（${totalMinutes}分）`, 'success');
                        return {
                            completed: true,
                            duration: totalMinutes,
                            researchStartClicked
                        };
                    }
                }
            }

            // タイムアウト
            this.log(`⚠️ Deep Researchタイムアウト（${maxMinutes}分）`, 'warning');
            return {
                completed: false,
                duration: maxMinutes,
                researchStartClicked,
                reason: 'timeout'
            };
        }

        /**
         * 複数のスプレッドシート行を連続実行
         */
        async executeBatch(dataArray, options = {}) {
            const results = [];
            const { pauseBetweenTasks = 5000, stopOnError = false } = options;

            this.log(`\n📊 バッチ実行開始: ${dataArray.length}個のタスク`, 'header');

            for (let i = 0; i < dataArray.length; i++) {
                this.log(`\n--- タスク ${i + 1}/${dataArray.length} ---`, 'info');
                
                try {
                    const result = await this.executeFromSpreadsheet(dataArray[i]);
                    results.push(result);
                    
                    // 次のタスクまで待機
                    if (i < dataArray.length - 1) {
                        this.log(`次のタスクまで${pauseBetweenTasks / 1000}秒待機...`, 'info');
                        await this.wait(pauseBetweenTasks);
                    }
                    
                } catch (error) {
                    results.push({
                        success: false,
                        error: error.message,
                        input: dataArray[i]
                    });
                    
                    if (stopOnError) {
                        this.log('エラーによりバッチ実行を中止', 'error');
                        break;
                    }
                }
            }

            this.log(`\n✅ バッチ実行完了: 成功 ${results.filter(r => r.success).length}/${dataArray.length}`, 'success');
            return results;
        }

        /**
         * 実行履歴を取得
         */
        getHistory() {
            return this.executionHistory;
        }

        /**
         * 実行履歴をクリア
         */
        clearHistory() {
            this.executionHistory = [];
            this.lastExecutionResult = null;
            this.log('実行履歴をクリアしました', 'info');
        }

        /**
         * 実行結果をエクスポート
         */
        exportResults(format = 'json') {
            if (format === 'json') {
                return JSON.stringify(this.executionHistory, null, 2);
            } else if (format === 'csv') {
                return this.convertToCSV(this.executionHistory);
            }
            
            throw new Error(`未対応のフォーマット: ${format}`);
        }

        /**
         * CSV変換
         */
        convertToCSV(data) {
            if (!data || data.length === 0) return '';
            
            const headers = ['timestamp', 'success', 'query', 'model', 'functions', 'responseLength', 'duration', 'error'];
            const rows = data.map(item => {
                return [
                    item.timestamp || '',
                    item.success || false,
                    item.mappedTask?.text || item.input?.text || '',
                    item.mappedTask?.model || '',
                    (item.mappedTask?.functions || []).join(';'),
                    item.result?.responseLength || 0,
                    item.duration || 0,
                    item.error || ''
                ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
            });
            
            return [headers.join(','), ...rows].join('\n');
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
            
            console.log(`%c[GeminiIntegration] ${message}`, styles[type] || styles.info);
        }

        async clickElement(element) {
            if (!element) return false;

            try {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.wait(200);
                element.click();
                await this.wait(1000);
                return true;
            } catch (e) {
                this.log(`クリック失敗: ${e.message}`, 'debug');
                
                try {
                    const event = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    element.dispatchEvent(event);
                    await this.wait(1000);
                    return true;
                } catch (e2) {
                    this.log(`イベントディスパッチ失敗: ${e2.message}`, 'debug');
                    return false;
                }
            }
        }

        setDebugMode(enabled) {
            this.debugMode = enabled;
            this.log(`デバッグモード: ${enabled ? 'ON' : 'OFF'}`, 'info');
        }

        setRetryConfig(maxRetries, retryDelay) {
            this.maxRetries = maxRetries;
            this.retryDelay = retryDelay;
            this.log(`リトライ設定: 最大${maxRetries}回, 間隔${retryDelay}ms`, 'info');
        }
    }

    // ========================================
    // サンプルデータ生成関数
    // ========================================
    function generateSampleData() {
        return [
            {
                model: 'Flash 2.0',
                function: '',
                text: 'こんにちは、今日の天気はどうですか？'
            },
            {
                model: 'Pro',
                function: 'Deep Research',
                text: 'AIの最新動向について詳しく調査してください',
                maxWaitMinutes: 20
            },
            {
                model: 'Flash',
                function: '画像',
                text: '美しい夕日の風景を生成してください'
            },
            {
                model: 'Pro 1.5',
                function: 'コード',
                text: 'フィボナッチ数列を計算するPythonコードを書いて実行してください'
            }
        ];
    }

    // ========================================
    // API公開
    // ========================================
    window.GeminiIntegration = GeminiIntegration;

    // 使用例を表示する関数
    window.showGeminiIntegrationHelp = function() {
        console.log('\n%c🚀 Gemini Spreadsheet Integration v1.0', 'color: #4CAF50; font-size: 16px; font-weight: bold');
        console.log('━'.repeat(50));
        console.log('\n%c📌 基本的な使い方:', 'color: #2196F3; font-weight: bold');
        console.log('');
        console.log('// 1. 統合クラスの初期化');
        console.log('const integration = new GeminiIntegration(window.Gemini);');
        console.log('');
        console.log('// 2. デバッグモードを有効化（任意）');
        console.log('integration.setDebugMode(true);');
        console.log('');
        console.log('// 3. 単一タスクの実行');
        console.log('const data = {');
        console.log('  model: "Pro",');
        console.log('  function: "Deep Research",');
        console.log('  text: "AIの未来について調査して"');
        console.log('};');
        console.log('const result = await integration.executeFromSpreadsheet(data);');
        console.log('');
        console.log('// 4. 複数タスクのバッチ実行');
        console.log('const tasks = generateSampleData();');
        console.log('const results = await integration.executeBatch(tasks, {');
        console.log('  pauseBetweenTasks: 5000,  // タスク間の待機時間(ms)');
        console.log('  stopOnError: false         // エラー時に続行するか');
        console.log('});');
        console.log('');
        console.log('// 5. 実行履歴の取得');
        console.log('const history = integration.getHistory();');
        console.log('');
        console.log('// 6. 結果のエクスポート');
        console.log('const jsonData = integration.exportResults("json");');
        console.log('const csvData = integration.exportResults("csv");');
        console.log('');
        console.log('%c💡 サンプルデータ生成:', 'color: #FF9800; font-weight: bold');
        console.log('const sampleData = generateSampleData();');
        console.log('');
        console.log('%c📊 対応するスプレッドシート列:', 'color: #9C27B0; font-weight: bold');
        console.log('  - model: モデル名（Flash, Pro, Pro 1.5, etc）');
        console.log('  - function: 機能名（Deep Research, 画像, コード, etc）');
        console.log('  - text: 実行するテキスト/プロンプト');
        console.log('  - maxWaitMinutes: Deep Research最大待機時間（省略可）');
    };

    // 初期化完了メッセージ
    console.log('%c✅ Gemini Spreadsheet Integration 初期化完了', 'color: #4CAF50; font-size: 14px; font-weight: bold');
    console.log('📝 使い方: showGeminiIntegrationHelp()');
    console.log('🎯 クイックスタート:');
    console.log('  const integration = new GeminiIntegration(window.Gemini);');
    console.log('  const data = { model: "Pro", function: "", text: "こんにちは" };');
    console.log('  await integration.executeFromSpreadsheet(data);');

})();