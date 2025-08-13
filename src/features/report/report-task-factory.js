// report-task-factory.js - レポートタスク生成専用ファクトリー

import { Task, TaskFactory } from '../task/models.js';

/**
 * レポートタスク生成ファクトリー
 * レポートタスクの生成に関する責任を持つ
 */
export class ReportTaskFactory {
  constructor(config = {}) {
    this.defaultAIType = config.defaultAIType || 'chatgpt';
    this.defaultPrompt = config.defaultPrompt || 'レポート生成タスク';
  }

  /**
   * レポートタスクを作成
   * @param {Object} params - タスク作成パラメータ
   * @param {string} params.sourceColumn - AI回答を取得する列
   * @param {string} params.reportColumn - レポートを書き込む列
   * @param {number} params.rowNumber - 行番号
   * @param {string} params.aiType - AIタイプ
   * @param {Object} params.columnGroup - 列グループ情報
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Task} レポートタスク
   */
  createTask(params, spreadsheetData) {
    // パラメータの検証
    this.validateParams(params);
    
    // AIタイプの正規化
    const normalizedAiType = this.normalizeAIType(params.aiType);
    
    // モデル情報の抽出（必要に応じて）
    const model = this.extractModel(params.sourceColumn, params.rowNumber, spreadsheetData);
    
    // プロンプト情報の取得
    const originalPrompt = this.extractOriginalPrompt(
      params.columnGroup.promptColumn,
      params.rowNumber,
      spreadsheetData
    );
    
    // タスクデータの構築
    const taskData = this.buildTaskData({
      ...params,
      normalizedAiType,
      model,
      originalPrompt,
      spreadsheetData
    });
    
    // タスクオブジェクトの作成
    return new Task(TaskFactory.createTask(taskData));
  }

  /**
   * パラメータの検証
   */
  validateParams(params) {
    const required = ['sourceColumn', 'reportColumn', 'rowNumber', 'columnGroup'];
    
    for (const field of required) {
      if (!params[field]) {
        throw new Error(`ReportTaskFactory: ${field} is required`);
      }
    }
    
    if (typeof params.rowNumber !== 'number' || params.rowNumber < 1) {
      throw new Error('ReportTaskFactory: rowNumber must be a positive number');
    }
  }

  /**
   * AIタイプの正規化
   */
  normalizeAIType(aiType) {
    if (aiType === 'single' || aiType === '3type' || !aiType) {
      return this.defaultAIType;
    }
    return aiType;
  }

  /**
   * モデル情報の抽出
   */
  extractModel(sourceColumn, rowNumber, spreadsheetData) {
    if (!spreadsheetData?.modelRow?.index || !spreadsheetData?.values) {
      return null;
    }
    
    const modelRowIndex = spreadsheetData.modelRow.index;
    const columnIndex = this.getColumnIndex(sourceColumn);
    const modelRow = spreadsheetData.values[modelRowIndex];
    
    if (!modelRow) {
      return null;
    }
    
    const modelValue = modelRow[columnIndex];
    return modelValue?.trim() || null;
  }

  /**
   * 元のプロンプトテキストを抽出
   */
  extractOriginalPrompt(promptColumn, rowNumber, spreadsheetData) {
    if (!promptColumn || !spreadsheetData?.values) {
      return '';
    }
    
    const rowData = spreadsheetData.values[rowNumber - 1];
    if (!rowData) {
      return '';
    }
    
    const columnIndex = this.getColumnIndex(promptColumn);
    return rowData[columnIndex] || '';
  }

  /**
   * タスクデータの構築
   */
  buildTaskData(params) {
    const {
      sourceColumn,
      reportColumn,
      rowNumber,
      normalizedAiType,
      model,
      originalPrompt,
      columnGroup,
      spreadsheetData
    } = params;
    
    const taskData = {
      // 基本情報
      id: this.generateTaskId(reportColumn, rowNumber),
      column: reportColumn,
      row: rowNumber,
      taskType: 'report',
      
      // AI情報
      aiType: normalizedAiType,
      
      // 列情報
      sourceColumn: sourceColumn,  // AI回答を取得する列
      reportColumn: reportColumn,  // レポートURLを書き込む列
      promptColumn: columnGroup.promptColumn || '',  // プロンプト列（参照用）
      
      // プロンプト
      prompt: this.defaultPrompt,  // 説明的なテキスト
      
      // スプレッドシート情報
      spreadsheetId: spreadsheetData?.spreadsheetId || null,
      sheetGid: spreadsheetData?.gid || null,
      
      // グループ情報
      groupId: `group_row${rowNumber}_report_${reportColumn}`,
      groupInfo: {
        type: 'report',
        sourceColumn: sourceColumn,
        reportColumn: reportColumn,
        promptColumn: columnGroup.promptColumn,
        columns: []
      },
      
      // メタデータ
      metadata: {
        originalPrompt: originalPrompt,
        columnGroupType: columnGroup.type,
        note: 'AI回答は実行時にsourceColumnから取得'
      }
    };
    
    // モデル情報（存在する場合のみ）
    if (model) {
      taskData.model = model;
    }
    
    return taskData;
  }

  /**
   * タスクIDの生成
   */
  generateTaskId(column, row) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `${column}${row}_${timestamp}_${random}`;
  }

  /**
   * 列名から列インデックスを計算
   */
  getColumnIndex(columnName) {
    let index = 0;
    for (let i = 0; i < columnName.length; i++) {
      index = index * 26 + (columnName.charCodeAt(i) - 64);
    }
    return index - 1;
  }
}

export default ReportTaskFactory;