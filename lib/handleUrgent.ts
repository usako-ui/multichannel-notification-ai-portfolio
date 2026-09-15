import { supabaseAdmin } from "@/lib/supabase";
import { getSlackChannelId } from "@/lib/slackChannels";
import { postToSlack } from "@/lib/postToSlack";
import { pushLineToManager } from "@/lib/linePush";
import { formatChannelLabel } from "@/lib/formatChannelLabel";

/**
 * 緊急パス処理（クレーム即時対応）
 *
 * ⚠️ この関数は絶対に Cron 経由にしてはならない（R-10）
 *    Cron は 1 分毎＋コールドスタート最大 10 秒程度が重なると
 *    SLA 5 分以内を超えるリスクがある。Webhook / Poller の関数内で
 *    即時に呼び出すことで確実に SLA を守る。
 *
 * Day4 スコープ（T-14〜T-15）:
 *   - is_urgent=TRUE・status='classified'・category='クレーム' で INSERT
 *   - Slack #クレーム緊急 に 🚨 マーク付きで投稿（記録用・AC-010 #4）
 *   - 営業部長 LINE Push を送信する（SLA 5分以内の本命処理・AC-010 #2）
 *
 * 冪等性:
 *   external_id UNIQUE 制約により重複 INSERT は 23505 で失敗する。
 *   これは Webhook リトライ時の想定内エラーなので握りつぶす。
 */
export async function handleUrgent(params: {
  channel: "line" | "gmail";
  externalId: string;
  rawContent: string;
  // 送信者識別子（LINE userId or Gmail アドレス）。DB 保存のみ・通知本文には出さない
  senderId?: string | null;
  // 送信者表示名（LINE の displayName / Gmail の From 表示名）。取得できなかった場合は null。
  // null の場合は Slack/Push で「送信者：不明」扱い。
  senderName?: string | null;
}): Promise<void> {
  const supabase = supabaseAdmin();

  const { error } = await supabase.from("inquiry_queue").insert({
    channel: params.channel,
    external_id: params.externalId,
    raw_content: params.rawContent,
    category: "クレーム",
    is_urgent: true,
    // Cron の分類対象から外すため 'classified' で確定させる
    status: "classified",
    classified_at: new Date().toISOString(),
    sender_id: params.senderId ?? null,
    sender_name: params.senderName ?? null,
  });

  if (error) {
    // 23505 = unique_violation。同一 external_id の重複は正常系として無視
    if (error.code === "23505") {
      return;
    }
    throw new Error(`緊急パス INSERT 失敗: ${error.message}`);
  }

  // 誰からのクレームかを Slack と LINE Push で即座に判別できるよう、
  // 送信元チャネル（LINE/Gmail）と送信者名を先頭行にまとめる。
  // 表示名の取得失敗時は「不明」で継続し、SLA を優先する（R-10）。
  const channelLabel = formatChannelLabel(params.channel);
  const senderText = params.senderName
    ? `${params.senderName}さん`
    : "不明";
  const senderHeader = `送信元：${channelLabel}｜送信者：${senderText}`;

  // Slack #クレーム緊急 へ記録用投稿（AC-010 #4）。
  // この投稿の成否は緊急パス自体の成否と切り離す：
  // SLA 5分以内を担保する本命処理は Day4 の LINE Push であり、
  // ここで throw すると Webhook 側の処理（200 応答）を不必要に妨げるため、
  // 失敗はログに残すのみとする（postToSlack 内で3回再送・営業部長LINEアラートは実行済み）。
  try {
    const channelId = getSlackChannelId("クレーム");
    await postToSlack({
      channelId,
      text: `🚨 クレーム緊急\n${senderHeader}\n\n${params.rawContent}`,
    });
  } catch (err) {
    console.error("[handleUrgent] Slack #クレーム緊急 投稿失敗:", err);
  }

  // 営業部長 LINE Push（SLA 5分以内の本命処理・AC-010 #2）
  // ⚠️ Slack投稿と異なりここは握りつぶさない。失敗した場合は呼び出し元
  //    （LINE Webhook / Gmail Poller）の catch でログに残し、
  //    通知漏れに運用側が気づけるようにするため。
  try {
    await pushLineToManager(
      `🚨 クレーム検出\n${senderHeader}\n\n${params.rawContent}`,
    );
  } catch (err) {
    console.error("[handleUrgent] 営業部長 LINE Push 失敗:", err);
    throw err;
  }
}
