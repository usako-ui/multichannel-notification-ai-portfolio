/**
 * DB の channel 値（"line"/"gmail"）を通知本文用の表示ラベルに変換する。
 *
 * DB には小文字（"line"/"gmail"）で保存しているが、Slack・LINE Push の
 * 本文では大文字表記（"LINE"/"Gmail"）に揃えて見やすさを統一する。
 *
 * `lib/handleUrgent.ts` と `app/api/cron/classify/route.ts` の両方から利用される。
 * ここに集約することで、将来「Gmail」→「メール」等の表記変更を 1 箇所で完結させる。
 */
export function formatChannelLabel(channel: "line" | "gmail"): string {
  return channel === "line" ? "LINE" : "Gmail";
}
