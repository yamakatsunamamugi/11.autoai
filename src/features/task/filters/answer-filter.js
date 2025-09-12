// answer-filter.js - 回答済みフィルター

class AnswerFilter {
  constructor() {
    this.name = "AnswerFilter";
    // 未回答とみなすマーカー
    this.emptyMarkers = [
      "TODO",
      "PENDING",
      "-",
      "N/A",
      "未回答",
      "未処理",
      "処理中",
      "処理完了",
      "エラー",
      "ERROR",
    ];
  }

  // セルに回答があるかチェック（回答があればtrue）
  hasAnswer(cellValue) {
    // null, undefined, 空文字は未回答
    if (!cellValue) {
      return false;
    }

    // 文字列でない場合は文字列に変換
    const value = String(cellValue);

    // 空白文字のみの場合は未回答
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return false;
    }

    // 特定のマーカーは未回答とみなす
    const upperTrimmed = trimmed.toUpperCase();
    if (
      this.emptyMarkers.some((marker) => upperTrimmed === marker.toUpperCase())
    ) {
      return false;
    }

    // プレースホルダーパターンをチェック（例: {{TODO}}, [未入力]）
    if (/^[\[{<].*[\]}>]$/.test(trimmed)) {
      const innerText = trimmed.slice(1, -1).trim().toUpperCase();
      if (
        this.emptyMarkers.some((marker) =>
          innerText.includes(marker.toUpperCase()),
        )
      ) {
        return false;
      }
    }

    // それ以外は回答済みとみなす
    return true;
  }

  // フィルタリング結果のログメッセージを生成
  getSkipMessage(cellId, existingAnswer) {
    const preview =
      existingAnswer && existingAnswer.length > 30
        ? existingAnswer.substring(0, 30) + "..."
        : existingAnswer;

    const now = new Date();
    const timestamp = now.toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    return `[AnswerFilter] ${cellId} は回答済み: "${preview}" (${timestamp})`;
  }
}

export default AnswerFilter;
