/**
 * エラー相関追跡システム
 * システム全体のエラーとイベントの時系列相関を追跡・分析
 */

class ErrorCorrelationTracker {
  constructor() {
    this.events = [];
    this.errors = [];
    this.maxEventHistory = 1000; // 最大イベント履歴数
    this.correlationWindow = 30000; // 30秒の相関ウィンドウ

    // グローバル利用のためにwindowに登録
    if (typeof window !== "undefined") {
      window.errorCorrelationTracker = this;
    }

    this.init();
  }

  init() {
    // エラーイベントの自動キャッチ
    if (typeof window !== "undefined") {
      window.addEventListener("error", (event) => {
        this.recordError({
          type: "javascript_error",
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        });
      });

      window.addEventListener("unhandledrejection", (event) => {
        this.recordError({
          type: "unhandled_promise_rejection",
          message: event.reason?.message || "Unhandled Promise Rejection",
          stack: event.reason?.stack,
        });
      });
    }

    console.log("🔍 [ERROR-CORRELATION] ErrorCorrelationTracker初期化完了");
  }

  /**
   * イベントを記録
   */
  recordEvent(eventType, data = {}) {
    const timestamp = Date.now();
    const event = {
      id: `${eventType}_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
      type: eventType,
      timestamp,
      data,
      iso: new Date().toISOString(),
    };

    this.events.push(event);

    // 履歴制限
    if (this.events.length > this.maxEventHistory) {
      this.events.shift();
    }

    // 重要なイベントをログ出力
    if (this.isImportantEvent(eventType)) {
      console.log(`🔍 [EVENT-TRACKING] ${eventType}:`, event);
    }

    return event;
  }

  /**
   * エラーを記録し相関分析を実行
   */
  recordError(errorData) {
    const timestamp = Date.now();
    const error = {
      id: `error_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp,
      ...errorData,
      iso: new Date().toISOString(),
    };

    this.errors.push(error);

    console.error(`🔍 [ERROR-CORRELATION] エラー記録:`, error);

    // 直近のエラー相関分析
    this.analyzeErrorCorrelation(error);

    return error;
  }

  /**
   * エラー相関分析
   */
  analyzeErrorCorrelation(currentError) {
    const windowStart = currentError.timestamp - this.correlationWindow;
    const recentEvents = this.events.filter(
      (event) => event.timestamp >= windowStart,
    );
    const recentErrors = this.errors.filter(
      (error) => error.timestamp >= windowStart && error.id !== currentError.id,
    );

    // パターン分析
    const patterns = this.detectPatterns(
      currentError,
      recentEvents,
      recentErrors,
    );

    if (patterns.length > 0) {
      console.warn(`🔍 [ERROR-CORRELATION] 相関パターン検出:`, {
        currentError: currentError.id,
        patterns,
        recentEventsCount: recentEvents.length,
        recentErrorsCount: recentErrors.length,
        analysisWindow: this.correlationWindow,
      });
    }

    return patterns;
  }

  /**
   * エラーパターン検出
   */
  detectPatterns(currentError, recentEvents, recentErrors) {
    const patterns = [];

    // 1. タブ関連エラーのパターン
    if (this.isTabRelatedError(currentError)) {
      const tabEvents = recentEvents.filter((e) =>
        this.isTabRelatedEvent(e.type),
      );
      if (tabEvents.length > 0) {
        patterns.push({
          type: "tab_lifecycle_correlation",
          description: "タブライフサイクルイベントとエラーの相関",
          events: tabEvents,
          severity: "high",
        });
      }
    }

    // 2. 状態変更とエラーのパターン
    if (this.isStateRelatedError(currentError)) {
      const stateEvents = recentEvents.filter((e) =>
        this.isStateRelatedEvent(e.type),
      );
      if (stateEvents.length > 2) {
        patterns.push({
          type: "state_transition_correlation",
          description: "状態変更の高頻度とエラーの相関",
          events: stateEvents,
          severity: "medium",
        });
      }
    }

    // 3. 競合状態パターン
    const raceConditionSignals = this.detectRaceConditionSignals(recentEvents);
    if (raceConditionSignals.length > 0) {
      patterns.push({
        type: "race_condition_correlation",
        description: "競合状態の兆候とエラーの相関",
        signals: raceConditionSignals,
        severity: "critical",
      });
    }

    return patterns;
  }

  /**
   * 競合状態の兆候検出
   */
  detectRaceConditionSignals(events) {
    const signals = [];

    // 同一タスクIDの短時間での複数操作
    const taskOperations = events.filter(
      (e) => e.type.includes("task") && e.data?.taskId,
    );

    const taskIdGroups = {};
    taskOperations.forEach((event) => {
      const taskId = event.data.taskId;
      if (!taskIdGroups[taskId]) taskIdGroups[taskId] = [];
      taskIdGroups[taskId].push(event);
    });

    for (const [taskId, operations] of Object.entries(taskIdGroups)) {
      if (operations.length > 1) {
        const timeSpan =
          operations[operations.length - 1].timestamp - operations[0].timestamp;
        if (timeSpan < 5000) {
          // 5秒以内の複数操作
          signals.push({
            type: "rapid_task_operations",
            taskId,
            operations: operations.length,
            timeSpan,
            events: operations,
          });
        }
      }
    }

    return signals;
  }

  /**
   * 重要なイベントの判定
   */
  isImportantEvent(eventType) {
    const importantEvents = [
      "task_state_transition",
      "tab_lifecycle_change",
      "global_state_modification",
      "error_occurrence",
      "race_condition_detected",
    ];
    return importantEvents.some((important) => eventType.includes(important));
  }

  /**
   * タブ関連エラーの判定
   */
  isTabRelatedError(error) {
    return (
      error.message?.includes("Tab") ||
      error.message?.includes("tab") ||
      error.type?.includes("tab")
    );
  }

  /**
   * タブ関連イベントの判定
   */
  isTabRelatedEvent(eventType) {
    return eventType.includes("tab") || eventType.includes("Tab");
  }

  /**
   * 状態関連エラーの判定
   */
  isStateRelatedError(error) {
    return (
      error.message?.includes("state") ||
      error.message?.includes("processing") ||
      error.message?.includes("completed")
    );
  }

  /**
   * 状態関連イベントの判定
   */
  isStateRelatedEvent(eventType) {
    return (
      eventType.includes("state") ||
      eventType.includes("transition") ||
      eventType.includes("processing") ||
      eventType.includes("completed")
    );
  }

  /**
   * 診断レポート生成
   */
  generateDiagnosticReport() {
    const now = Date.now();
    const last30Min = now - 30 * 60 * 1000;

    const recentEvents = this.events.filter((e) => e.timestamp >= last30Min);
    const recentErrors = this.errors.filter((e) => e.timestamp >= last30Min);

    return {
      timestamp: new Date().toISOString(),
      timeWindow: "30分",
      summary: {
        totalEvents: recentEvents.length,
        totalErrors: recentErrors.length,
        errorRate:
          (recentErrors.length / Math.max(recentEvents.length, 1)) * 100,
      },
      errorBreakdown: this.categorizeErrors(recentErrors),
      eventBreakdown: this.categorizeEvents(recentEvents),
      correlationAnalysis: this.performCorrelationAnalysis(
        recentEvents,
        recentErrors,
      ),
    };
  }

  /**
   * エラーカテゴリ分析
   */
  categorizeErrors(errors) {
    const categories = {};
    errors.forEach((error) => {
      const category = this.categorizeError(error);
      if (!categories[category]) categories[category] = [];
      categories[category].push(error);
    });
    return categories;
  }

  /**
   * イベントカテゴリ分析
   */
  categorizeEvents(events) {
    const categories = {};
    events.forEach((event) => {
      const category = this.categorizeEvent(event);
      if (!categories[category]) categories[category] = [];
      categories[category].push(event);
    });
    return categories;
  }

  /**
   * エラーカテゴリ判定
   */
  categorizeError(error) {
    if (this.isTabRelatedError(error)) return "tab_errors";
    if (this.isStateRelatedError(error)) return "state_errors";
    if (error.type === "javascript_error") return "javascript_errors";
    if (error.type === "unhandled_promise_rejection") return "promise_errors";
    return "other_errors";
  }

  /**
   * イベントカテゴリ判定
   */
  categorizeEvent(event) {
    if (this.isTabRelatedEvent(event.type)) return "tab_events";
    if (this.isStateRelatedEvent(event.type)) return "state_events";
    return "other_events";
  }

  /**
   * 相関分析実行
   */
  performCorrelationAnalysis(events, errors) {
    const analysis = {
      strongCorrelations: [],
      weakCorrelations: [],
      noCorrelation: [],
    };

    // 簡単な相関分析の実装
    errors.forEach((error) => {
      const correlatedEvents = events.filter(
        (event) => Math.abs(event.timestamp - error.timestamp) < 5000, // 5秒以内
      );

      if (correlatedEvents.length > 3) {
        analysis.strongCorrelations.push({
          error: error.id,
          correlatedEvents: correlatedEvents.length,
          pattern: this.identifyCorrelationPattern(error, correlatedEvents),
        });
      } else if (correlatedEvents.length > 0) {
        analysis.weakCorrelations.push({
          error: error.id,
          correlatedEvents: correlatedEvents.length,
        });
      } else {
        analysis.noCorrelation.push(error.id);
      }
    });

    return analysis;
  }

  /**
   * 相関パターン識別
   */
  identifyCorrelationPattern(error, events) {
    // 簡単なパターン識別
    const eventTypes = events.map((e) => e.type);
    const uniqueTypes = [...new Set(eventTypes)];

    if (uniqueTypes.length === 1) {
      return `repeated_${uniqueTypes[0]}`;
    } else if (uniqueTypes.some((type) => type.includes("tab"))) {
      return "tab_related_sequence";
    } else if (uniqueTypes.some((type) => type.includes("state"))) {
      return "state_related_sequence";
    } else {
      return "mixed_event_sequence";
    }
  }
}

// 自動初期化
if (typeof window !== "undefined" && !window.errorCorrelationTracker) {
  new ErrorCorrelationTracker();
}

// エクスポート（Node.js環境用）
if (typeof module !== "undefined" && module.exports) {
  module.exports = ErrorCorrelationTracker;
}
