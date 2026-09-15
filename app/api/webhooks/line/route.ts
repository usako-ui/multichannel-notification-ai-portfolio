import { NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/verifyLineSignature";
import { isUrgent } from "@/lib/urgentDetection";
import { handleUrgent } from "@/lib/handleUrgent";
import { getLineDisplayName } from "@/lib/getLineProfile";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * LINE Webhook 受信エンドポイント（T-05・T-06・T-09）
 *
 * 処理の流れ:
 *   1. rawBody を取得（署名検証に生バイト列が必要）
 *   2. x-line-signature を HMAC-SHA256 で検証（NG → 401）
 *   3. events から type='message' かつ message.type='text' のみ処理
 *   4. 緊急キーワード検出時 → handleUrgent()（Fast Path・Cron 非経由）
 *   5. それ以外 → inquiry_queue に status='pending' で INSERT（Queue Path）
 *   6. 常に 200 を返す（LINE は非 200 でリトライしてくる）
 *
 * ⚠️ Node.js ランタイム必須（crypto モジュールを使用）
 * ⚠️ dynamic を force-dynamic にする理由：Webhook はキャッシュしてはならない
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LineTextMessageEvent = {
  type: "message";
  message: { id: string; type: "text"; text: string };
  timestamp: number;
  source: { type: string; userId?: string };
};

type LineEvent =
  | LineTextMessageEvent
  | { type: string; [key: string]: unknown };

type LineWebhookBody = {
  destination?: string;
  events?: LineEvent[];
};

/**
 * type='message' かつ message.type='text' のみ処理対象とする型ガード
 * スタンプ・画像・位置情報などは AC-004 #3 に従い無視する
 */
function isTextMessageEvent(ev: LineEvent): ev is LineTextMessageEvent {
  if (ev.type !== "message") return false;
  const message = (ev as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return false;
  const m = message as { type?: unknown; id?: unknown; text?: unknown };
  return (
    m.type === "text" &&
    typeof m.id === "string" &&
    typeof m.text === "string"
  );
}

export async function POST(request: Request): Promise<Response> {
  // ① 生バイト列で読む（JSON パース前）
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  // 環境変数未設定は設定ミス扱いで 500
  if (!channelSecret) {
    return NextResponse.json(
      { error: "LINE_CHANNEL_SECRET is not set" },
      { status: 500 },
    );
  }

  // ② 署名検証（不正リクエストは 401・AC-002 #2）
  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  // ③ JSON パース
  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const events = body.events ?? [];

  // ④ 各イベント処理
  for (const ev of events) {
    if (!isTextMessageEvent(ev)) {
      // スタンプ・画像・フォロー・アンフォローなどは無視
      continue;
    }

    const externalId = ev.message.id;
    const rawContent = ev.message.text;
    const senderUserId = ev.source.userId ?? null;

    // 誰からの問い合わせか Slack で即座に判別できるよう displayName を取得。
    // 緊急・通常どちらのパスでも同じ扱いにして DB に保存する。
    // 取得失敗時は null（handleUrgent/Cron で「送信者：不明」フォールバック）
    const senderName = senderUserId
      ? await getLineDisplayName(senderUserId)
      : null;

    // ⑤ 緊急判定（Fast Path・Cron 非経由で SLA 5分以内を守る）
    if (isUrgent(rawContent)) {
      try {
        await handleUrgent({
          channel: "line",
          externalId,
          rawContent,
          senderId: senderUserId,
          senderName,
        });
      } catch (err) {
        // 緊急パス失敗はログに残すが、LINE リトライを止めるため 200 は返す
        console.error("[LINE Webhook] handleUrgent 失敗:", err);
      }
      continue;
    }

    // ⑥ 通常パス: pending で INSERT。Cron が拾って Gemini 分類する
    const { error } = await supabase.from("inquiry_queue").insert({
      channel: "line",
      external_id: externalId,
      raw_content: rawContent,
      status: "pending",
      sender_id: senderUserId,
      sender_name: senderName,
    });

    if (error && error.code !== "23505") {
      // 23505 = UNIQUE 制約違反 = リトライによる重複（正常系）
      console.error("[LINE Webhook] inquiry_queue INSERT 失敗:", error);
    }
  }

  // ⑦ 常に 200（LINE のリトライを止めて冪等性を external_id UNIQUE に委ねる）
  return NextResponse.json({ ok: true });
}
