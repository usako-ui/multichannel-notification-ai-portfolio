import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { pollGmailInbox, ensureGmailWatch } from "@/lib/gmailPoller";

/**
 * Gmail Pub/Sub Push 受信エンドポイント
 *
 * 目的（このファイルが存在する理由）:
 *   GitHub Actions Cron（5 分間隔）は schedule 遅延が発生し得るため、
 *   Gmail クレームの SLA 5 分以内 LINE Push が保証できないケースが発生する
 *   （2026-09-16 に schedule が 4 時間ノー発火する事象を実機検証で確認）。
 *   Gmail Push（Pub/Sub → このエンドポイント）を追加することで、
 *   LINE Webhook と同レベルの即時性（数秒）を Gmail 経路にも与える。
 *
 * ⚠️ Cron ポーリング（`lib/gmailPoller.ts` + `app/api/cron/classify`）はそのまま残す。
 *    このエンドポイントが失敗した場合のフォールバックとして機能させるため。
 *
 * 認証方式:
 *   Pub/Sub Push サブスクリプションの endpoint URL に `?token=<GMAIL_PUSH_SECRET>` を含める。
 *   Google 標準の OIDC 検証ではなく共有シークレット方式にしている理由：
 *     - GCP 側の追加設定（サービスアカウント OIDC audience 指定など）が不要
 *     - Vercel Function 側で jose / google-auth-library を追加せずに済む
 *     - 本エンドポイントは pollGmailInbox 経由でしか Gmail に触れないため、
 *       露呈しても攻撃者は「Gmail 取り込みを強制発火できる」だけで秘密情報は取れない
 *   タイミング攻撃を避けるため crypto.timingSafeEqual で定数時間比較する。
 *
 * 処理フロー:
 *   1. `?token=` を GMAIL_PUSH_SECRET と定数時間比較（不一致は 401）
 *   2. Pub/Sub エンベロープ（message.data / subscription 等）を JSON パース
 *   3. 存在すれば data を base64 デコードして観測ログに出す（emailAddress / historyId）
 *   4. `pollGmailInbox()` を同期呼び出し
 *      → ラベル `multichannel-inbox` 付きメールを取得
 *      → 件名＋本文で isUrgent() 判定
 *      → クレーム → handleUrgent() 即時実行（キュー非経由・SLA 5 分厳守）
 *      → 通常   → inquiry_queue に status='pending' で INSERT
 *   5. Pub/Sub がリトライを止められるよう常に 200 で返す
 *      （ここで 5xx を返すと Pub/Sub が指数バックオフで再送してくる。
 *        pollGmailInbox は内部で個別失敗をラベル残置で吸収する設計・
 *        重複処理は external_id UNIQUE で吸収されるため、200 で問題ない）
 *
 * ⚠️ 触ると壊れる箇所:
 *   - `pollGmailInbox()` を経由するため `handleUrgent()` の Cron 非経由制約は維持される
 *   - external_id は `gmail_${messageId}` 形式が維持される（gmailPoller.ts:241）
 *   - Pub/Sub の Push サブスクリプションは同じ historyId で複数回配信される可能性があり、
 *     external_id UNIQUE 制約（23505）で重複が吸収される前提
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// pollGmailInbox は最大 20 メール分の Gmail 取得 + handleUrgent 同期呼び出しを行う。
// Slack / LINE Push（3 回再送）を含めた最悪ケースを考慮して Vercel 上限まで延長。
export const maxDuration = 60;

// Pub/Sub Push のエンベロープ型（必要部分のみ最小定義）
type PubSubPushBody = {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
};

/**
 * 定数時間比較。長さが違う場合は timingSafeEqual が throw するので事前にガード。
 * URL クエリからの入力なので Buffer 化して比較する。
 */
function isValidPushToken(
  received: string | null,
  expected: string,
): boolean {
  if (!received) return false;
  const receivedBuf = Buffer.from(received, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (receivedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(receivedBuf, expectedBuf);
}

export async function POST(request: Request): Promise<Response> {
  const pushSecret = process.env.GMAIL_PUSH_SECRET;

  // 環境変数未設定 = デモ運用時（Pub/Sub Push 未有効化）は 503 で無効化する。
  // 実運用復帰時は Vercel で GMAIL_PUSH_SECRET を再設定すれば通常動作に戻る。
  // 200 を返すと Pub/Sub が「配信成功」と見なして通知を捨ててしまうため
  // 明示的にエラーコードを返し、内部設定名は含めない。
  if (!pushSecret) {
    return NextResponse.json(
      { error: "This endpoint is currently disabled." },
      { status: 503 },
    );
  }

  // ① 共有シークレット検証（?token= と GMAIL_PUSH_SECRET を定数時間比較）
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!isValidPushToken(token, pushSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ② Pub/Sub エンベロープを JSON パース（不正 JSON は 400）
  let body: PubSubPushBody;
  try {
    body = (await request.json()) as PubSubPushBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ③ 通知本体を base64 デコード（観測用ログのみ・処理判断には使わない）
  //    Gmail 通知のペイロード形式:
  //      {"emailAddress": "user@example.com", "historyId": "12345"}
  //    現在の設計では historyId を state 管理せず、pollGmailInbox 経由で
  //    ラベル付き未処理メールを取り込むため、この値はログ用途にのみ使う。
  let notification: { emailAddress?: string; historyId?: string } = {};
  if (body.message?.data) {
    try {
      const decoded = Buffer.from(body.message.data, "base64").toString("utf8");
      notification = JSON.parse(decoded);
    } catch (err) {
      console.warn("[Gmail Push] data デコード失敗（処理は継続）:", err);
    }
  }

  // ④ pollGmailInbox() を同期実行
  //    - 既存の緊急検知（isUrgent → handleUrgent）・通常キュー投入ロジックを再利用
  //    - 個別メール失敗はラベル残置で吸収され、次回 Cron / 次回 Push で再試行される
  //    - 全体失敗（Gmail API 認証切れ等）は catch でログのみ・Pub/Sub には 200 を返す
  let pollResult: {
    processed: number;
    errors: number;
    skipped: number;
  } | null = null;
  let pollError: string | null = null;
  try {
    pollResult = await pollGmailInbox();
  } catch (err) {
    pollError = err instanceof Error ? err.message : String(err);
    console.error("[Gmail Push] pollGmailInbox 失敗:", pollError);
  }

  // ⑤ Watch 期限の自動更新も一緒にチェック（Cron 発火が長時間止まっても
  //    Push が生きていれば Watch が期限切れにならない安全策）
  //    失敗しても Push 応答自体は 200 を返す。
  let watchInfo: {
    renewed: boolean;
    expiration: number | null;
    reason: string;
  } | null = null;
  try {
    watchInfo = await ensureGmailWatch();
  } catch (err) {
    console.error("[Gmail Push] ensureGmailWatch 失敗（後段は継続）:", err);
  }

  // ⑥ Pub/Sub に配信完了を伝える（常に 200）
  //    非 200 を返すと Pub/Sub が指数バックオフで大量にリトライしてくる。
  //    アプリ側の障害はログ + Vercel ダッシュボードで検知する運用にする。
  return NextResponse.json({
    ok: true,
    subscription: body.subscription ?? null,
    messageId: body.message?.messageId ?? null,
    notification,
    poll: pollResult,
    pollError,
    watch: watchInfo,
  });
}
