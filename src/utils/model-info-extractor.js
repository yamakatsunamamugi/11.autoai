/**
 * @fileoverview モデル情報取得モジュール（後方互換性用ラッパー）
 * 
 * 【役割】
 * 新しいExtractorアーキテクチャへの移行のためのラッパー
 * 既存のコードとの互換性を保ちながら、新しいExtractorを使用
 * 
 * 【使用方法】
 * import { ModelInfoExtractor } from './src/utils/model-info-extractor.js';
 * const modelInfo = ModelInfoExtractor.extract('chatgpt');
 */

import { ModelExtractor } from '../features/logging/extractors/model-extractor.js';

export class ModelInfoExtractor {
    /**
     * 指定されたAI種別からモデル情報を取得
     * @param {string} aiType - AI種別 ('chatgpt', 'claude', 'gemini')
     * @returns {string} モデル名（取得失敗時は空文字）
     */
    static extract(aiType) {
        // 新しいModelExtractorに委譲
        return ModelExtractor.extract(aiType);
    }
    
    /**
     * ChatGPTからモデル情報を取得（後方互換性）
     * @returns {string} モデル名
     */
    static extractChatGPTModel() {
        return ModelExtractor.extract('chatgpt');
    }
    
    /**
     * Claudeからモデル情報を取得（後方互換性）
     * @returns {string} モデル名
     */
    static extractClaudeModel() {
        return ModelExtractor.extract('claude');
    }
    
    /**
     * Geminiからモデル情報を取得（後方互換性）
     * @returns {string} モデル名
     */
    static extractGeminiModel() {
        return ModelExtractor.extract('gemini');
    }
}

// デフォルトエクスポート（後方互換性のため）
export default ModelInfoExtractor;