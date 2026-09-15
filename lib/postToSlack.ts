import { pushLineToManager } from "@/lib/linePush";

/**
 * Slack chat.postMessage 投稿（指数バックオフ最大3回再送）（T-12・AC-011）
 *
 * 3回失敗した場合は Slack を使わず営業部長の個人LINEへ障害アラートを送る
 * （Slack が落ちている時に Slack へ通知しても届かないため・R-11対策）。
 * LINE Push 送信自体は lib/linePush.ts の pushLineToManager() に閉じる
 * （handleUrgent() のクレーム緊急通知と同じ関数を共用する）。
 *
 * ⚠️ 3回再送してもなお失敗した場合は throw する。
 *    呼び出し元（Cron・handleUrgent）で status='failed' 等の処理判断に使うため。
 */

const MAX_RETRIES = 3;
// 指数バックオフの基準待機時間。
// 1000ms だと 1回目失敗後1秒→2回目失敗後2秒（合計3秒）で
// Slack 側の一時障害を吸収するには短すぎる（数十秒級の過負荷が想定される）ため
// 2000ms に設定し、合計 6秒（2秒 + 4秒）まで待機する。
const BASE_DELAY_MS = 2000;

// Slack chat.postMessage の text は長すぎると 400 系エラーで拒否される。
// Gmail の長文メール（数万文字の HTML デコード後本文）を丸ごと送ると
// 毎回 failed → LINE アラート誤送信になるため送信前にトリムする（QA #2 対応）。
// linePush と揃えて Slack 側は 3000 字上限（Slack UI の視認性も考慮）。
const SLACK_TEXT_MAX_LENGTH = 3000;
const SLACK_TRUNCATE_SUFFIX =
  "\n…（本文が長いため省略。全文は Supabase inquiry_queue.raw_content を参照）";

function truncateForSlack(text: string): string {
  if (text.length <= SLACK_TEXT_MAX_LENGTH) return text;
  const head = text.slice(
    0,
    SLACK_TEXT_MAX_LENGTH - SLACK_TRUNCATE_SUFFIX.length,
  );
  return head + SLACK_TRUNCATE_SUFFIX;
}

type SlackPostMessageResponse = {
  ok: boolean;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Slack API のエラーコード or HTTP エラー文字列を、
 * 非エンジニアの営業部長でも「何が起きたか・次に何をすべきか」が
 * 即座に判断できる日本語メッセージに変換する。
 *
 * 未知のエラーは総称メッセージにフォールバックし、末尾に技術詳細を
 * 残して開発担当者の調査を助ける。
 */
function friendlyReason(rawError: string): { cause: string; action: string } {
  const err = rawError.toLowerCase();

  // Slack Bot Token 系（最頻出：Token 期限切れ・rotate 直後の未反映など）
  if (
    err.includes("invalid_auth") ||
    err.includes("token_revoked") ||
    err.includes("token_expired") ||
    err.includes("account_inactive")
  ) {
    return {
      cause: "Slack Bot Tokenが無効・期限切れの可能性",
      action: "開発担当者にBot Tokenの再取得と再設定を依頼してください",
    };
  }

  // チャネル設定系（環境変数のチャネル ID ミス・Bot 招待漏れ）
  if (
    err.includes("channel_not_found") ||
    err.includes("not_in_channel") ||
    err.includes("is_archived")
  ) {
    return {
      cause: "Slackチャネル設定に問題があります",
      action: "開発担当者にチャネルIDとBot招待状況の確認を依頼してください",
    };
  }

  // 権限スコープ不足（chat:write が付いていない等）
  if (err.includes("missing_scope") || err.includes("no_permission")) {
    return {
      cause: "Bot Tokenの権限が不足しています",
      action: "開発担当者にBot Tokenの権限（chat:write）追加を依頼してください",
    };
  }

  // レート制限（一時的・自動回復）
  if (err.includes("rate_limited") || err.includes("ratelimited")) {
    return {
      cause: "Slack APIの一時的なレート制限",
      action: "10分ほど時間を置くと自動回復します。以降も続く場合は開発担当者へ連絡してください",
    };
  }

  // Slack サーバ側障害（500 系）
  if (err.includes("http 5") || err.includes("service_unavailable")) {
    return {
      cause: "Slack側のサーバ障害",
      action: "10分ほど待って再発するようなら開発担当者へ連絡してください",
    };
  }

  // ネットワーク・タイムアウト
  if (
    err.includes("network") ||
    err.includes("timeout") ||
    err.includes("fetch failed") ||
    err.includes("econnrefused")
  ) {
    return {
      cause: "Slackとの通信障害",
      action: "10分ほど待って再発するようなら開発担当者へ連絡してください",
    };
  }

  // 未知エラーの総称フォールバック
  return {
    cause: "Slack側の予期しないエラー",
    action: "開発担当者に技術詳細を伝えて原因調査を依頼してください",
  };
}

/**
 * 営業部長の個人LINEへ Slack 障害アラートを送る。
 * ここで例外を投げると postToSlack の本来の失敗理由（lastError）が
 * 握りつぶされてしまうため、アラート送信自体の失敗はログのみに留める。
 *
 * メッセージは非エンジニアの営業部長向けに「原因（平易な日本語）+ 対応アクション」
 * を先頭に配置し、末尾に技術詳細（原文エラー）を残して開発担当者の調査を助ける。
 */
async function notifyManagerOfSlackFailure(reason: string): Promise<void> {
  const { cause, action } = friendlyReason(reason);
  try {
    await pushLineToManager(
      `⚠️ Slack通知が停止中です\n\n` +
        `Slackへの投稿が${MAX_RETRIES}回連続で失敗しました。\n` +
        `今後の問い合わせがSlackに届かない状態です。\n\n` +
        `【原因】${cause}\n` +
        `【対応】${action}\n\n` +
        `【技術詳細】${reason}`,
    );
  } catch (err) {
    console.error("[postToSlack] 営業部長 LINE Push アラート送信に失敗:", err);
  }
}

/**
 * Slack chat.postMessage を実行する。失敗時は指数バックオフで最大3回まで再送する。
 *
 * @throws MAX_RETRIES 回すべて失敗した場合（営業部長への LINE Push アラートは
 *         この throw の前に必ず実行される）
 */
export async function postToSlack(params: {
  channelId: string;
  text: string;
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("環境変数 SLACK_BOT_TOKEN が未設定です");
  }

  const safeText = truncateForSlack(params.text);
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: params.channelId,
          text: safeText,
        }),
      });

      const data = (await res.json()) as SlackPostMessageResponse;

      if (res.ok && data.ok) {
        return;
      }

      lastError = data.error ?? `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_RETRIES) {
      // 指数バックオフ: 1回目失敗後2秒 → 2回目失敗後4秒（合計 6秒）
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  await notifyManagerOfSlackFailure(lastError);

  throw new Error(
    `Slack投稿が${MAX_RETRIES}回失敗しました（channel=${params.channelId}）: ${lastError}`,
  );
}
