// AI機能名の定数定義モジュール
// 全AI共通で使用する機能名を統一管理
(() => {
    'use strict';

    // ========================================
    // 機能名定数
    // ========================================
    const FEATURES = {
        // 共通機能
        NONE: 'none',
        DEEP_RESEARCH: 'DeepResearch',
        THINKING: 'Thinking',
        WEB_SEARCH: 'WebSearch',
        CANVAS: 'Canvas',
        
        // ChatGPT専用
        AGENT: 'Agent',
        IMAGE: 'Image',
        LEARNING: 'Learning',
        CONNECTOR: 'Connector',
        
        // Gemini専用
        IMAGE_JP: '画像',
        VIDEO_JP: '動画',
        
        // レガシー名（互換性のため）
        LEGACY: {
            DEEP_RESEARCH_HYPHEN: 'deep-research',
            DEEP_RESEARCH_SPACE: 'Deep Research',
            DEEP_RESEARCH_JP: 'リサーチ',
            THINKING_LOWER: 'thinking',
            THINKING_JP: 'じっくり考える',
            WEB_SEARCH_HYPHEN: 'web-search',
            WEB_SEARCH_JP: 'ウェブ検索'
        }
    };

    // ========================================
    // 判定関数
    // ========================================
    
    // DeepResearch判定
    function isDeepResearch(feature) {
        if (!feature) return false;
        
        const normalizedFeature = feature.toLowerCase().replace(/[\s-]/g, '');
        
        return feature === FEATURES.DEEP_RESEARCH ||
               feature === FEATURES.LEGACY.DEEP_RESEARCH_HYPHEN ||
               feature === FEATURES.LEGACY.DEEP_RESEARCH_SPACE ||
               feature === FEATURES.LEGACY.DEEP_RESEARCH_JP ||
               normalizedFeature === 'deepresearch' ||
               normalizedFeature === 'research' ||
               normalizedFeature === 'リサーチ';
    }
    
    // Thinking判定
    function isThinking(feature) {
        if (!feature) return false;
        
        return feature === FEATURES.THINKING ||
               feature === FEATURES.LEGACY.THINKING_LOWER ||
               feature === FEATURES.LEGACY.THINKING_JP ||
               feature.toLowerCase() === 'thinking' ||
               feature.includes('思考') ||
               feature.includes('考える');
    }
    
    // WebSearch判定
    function isWebSearch(feature) {
        if (!feature) return false;
        
        return feature === FEATURES.WEB_SEARCH ||
               feature === FEATURES.LEGACY.WEB_SEARCH_HYPHEN ||
               feature === FEATURES.LEGACY.WEB_SEARCH_JP ||
               feature.toLowerCase().includes('web') ||
               feature.includes('ウェブ検索');
    }
    
    // Canvas判定
    function isCanvas(feature) {
        if (!feature) return false;
        
        return feature === FEATURES.CANVAS ||
               feature.toLowerCase() === 'canvas';
    }

    // ========================================
    // 正規化関数
    // ========================================
    
    // レガシー名を正規の名前に変換
    function normalizeFeatureName(feature) {
        if (!feature) return FEATURES.NONE;
        
        // DeepResearch系
        if (isDeepResearch(feature)) {
            return FEATURES.DEEP_RESEARCH;
        }
        
        // Thinking系
        if (isThinking(feature)) {
            return FEATURES.THINKING;
        }
        
        // WebSearch系
        if (isWebSearch(feature)) {
            return FEATURES.WEB_SEARCH;
        }
        
        // Canvas系
        if (isCanvas(feature)) {
            return FEATURES.CANVAS;
        }
        
        // その他の機能名チェック
        const upperFeature = feature.toUpperCase().replace(/[\s-]/g, '_');
        if (FEATURES[upperFeature]) {
            return FEATURES[upperFeature];
        }
        
        // 変換できない場合は元の値を返す
        return feature;
    }

    // ========================================
    // ログ関数
    // ========================================
    function log(message, type = 'INFO') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            'INFO': '📝',
            'SUCCESS': '✅',
            'ERROR': '❌',
            'WARNING': '⚠️'
        }[type] || '📝';
        console.log(`[${timestamp}] ${prefix} [FeatureConstants] ${message}`);
    }

    // ========================================
    // グローバル公開
    // ========================================
    window.FeatureConstants = {
        FEATURES,
        isDeepResearch,
        isThinking,
        isWebSearch,
        isCanvas,
        normalizeFeatureName,
        log
    };

    log('機能名定数モジュールが利用可能になりました', 'SUCCESS');
    
    // 開発用: 定数一覧を表示
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('===== 利用可能な機能名定数 =====');
        console.log('FEATURES.DEEP_RESEARCH:', FEATURES.DEEP_RESEARCH);
        console.log('FEATURES.THINKING:', FEATURES.THINKING);
        console.log('FEATURES.WEB_SEARCH:', FEATURES.WEB_SEARCH);
        console.log('FEATURES.CANVAS:', FEATURES.CANVAS);
        console.log('================================');
    }
    
    return window.FeatureConstants;
})();