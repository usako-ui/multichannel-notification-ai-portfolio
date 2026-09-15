/**
 * LINE Messaging API で営業部長の個人LINEへPush送信する（T-14〜T-15）
 *
 * 用途は2つ（どちらも同じこの関数を経由する・障害通知一本化の方針：R-11）:
 *  1. handleUrgent(): クレーム検出時の緊急通知（SLA 5分以内の本命処理・AC-010）
 *  2. postToSlack(): Slack投稿が3回失敗した場合の障害アラート（AC-011）
 *
 * ⚠️ 送信先は LINE_MANAGER_USER_ID の個人LINEのみ。複数人へのブロードキャストや
 *    他のチャネル（グループ等）へは送らない。
 * ⚠️ このファイルは lib/handleUrgent.ts・lib/postToSlack.ts の両方から import される。
 *    循環参照を避けるため、このファイル自体は他の lib モジュールを import しない。
 */

// LINE Messaging API のテキストメッセージ上限は 5000 文字。
// 上限ぎりぎりに送ると絵文字等でカウントがずれてはじかれるリスクがあるため
// 少し余裕を持たせて 4900 文字で切り詰める。
// 上限超過を握りつぶさず 400 で throw させる設計にすると、長文の問い合わせが
// 来ただけでクレーム緊急通知（SLA 5分以内）が届かなくなるため、
// 関数内で必ずトリムして送信する。
const LINE_TEXT_MAX_LENGTH = 4900;
const TRUNCATE_SUFFIX = "\n…（以下省略・全文は Slack #クレーム緊急 参照）";

function truncateForLine(message: string): string {
  if (message.length <= LINE_TEXT_MAX_LENGTH) return message;
  const head = message.slice(0, LINE_TEXT_MAX_LENGTH - TRUNCATE_SUFFIX.length);
  return head + TRUNCATE_SUFFIX;
}

export async function pushLineToManager(message: string): Promise<void> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const managerUserId = process.env.LINE_MANAGER_USER_ID;

  if (!accessToken || !managerUserId) {
    throw new Error(
      "環境変数 LINE_CHANNEL_ACCESS_TOKEN / LINE_MANAGER_USER_ID が未設定です",
    );
  }

  const safeMessage = truncateForLine(message);

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: managerUserId,
        messages: [{ type: "text", text: safeMessage }],
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(
        `LINE Push API エラー（HTTP ${res.status}）: ${errorBody}`,
      );
    }
  } catch (err) {
    // fetch 自体の失敗（ネットワークエラー等）も Error に統一して呼び出し元に伝播させる
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(
      `LINE Push 呼び出しで不明なエラーが発生しました: ${String(err)}`,
    );
  }
}
