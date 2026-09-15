import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { classifyWithGemini, GeminiApiError } from "@/lib/classifyWithGemini";
import { getSlackChannelId } from "@/lib/slackChannels";
import { postToSlack } from "@/lib/postToSlack";
import { pollGmailInbox } from "@/lib/gmailPoller";
import { formatChannelLabel } from "@/lib/formatChannelLabel";

/**
 * pending キュー消化用 Cron エンドポイント（T-13）
 *
 * 呼び出し元：GitHub Actions Cron（`.github/workflows/cron.yml`・5 分ごと + main push トリガー）。
 * Vercel Hobby プランの Cron 1 日 1 回制約を回避するため外部化した。
 * 呼び出し側は Authorization: Bearer $CRON_SECRET を必ず付与する。
 * 手動 / 外部から叩かれた場合（ヘッダなし・不一致）は 401 で拒否する。
 *
 * 単一エンドポイントに集約している理由：
 *   Vercel Hobby プランは Cron 1 件のみだったため Gmail ポーリング（旧 /api/cron/gmail）と
 *   pending 消化を統合した。GitHub Actions 移行後もこの構造を維持している
 *   （Gmail 取り込みと Slack 投稿は同じ pending キューを共有するため直列化した方が
 *   Gemini レート制限を跨いだ挙動が予測しやすい）。
 *
 * 処理の流れ：
 *   0. pollGmailInbox() で Gmail の未読メールを取得 → inquiry_queue に INSERT
 *      （緊急メールはこの中で handleUrgent が同期実行される）
 *   1. status='pending' を created_at 昇順で最大20件取得
 *   2. classifyWithGemini() で5カテゴリに分類
 *   3. postToSlack() でカテゴリ別チャネルへ投稿（失敗時は最大3回再送）
 *   4. 成功 → status='notified' / 失敗 → status='failed'（再処理しない・無限ループ防止）
 *
 * ⚠️ handleUrgent（緊急パス）はこの Cron を経由しない。ここで扱うのは通常問い合わせのみ。
 *    ただし Gmail ポーリング内では緊急検知時に handleUrgent が同期実行される。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gemini分類 + Slack投稿（最大3回再送）が複数件連続するため
// Vercel Function のデフォルト10秒制限を延長する（Hobbyプランでは最大60秒まで）
export const maxDuration = 60;

// Cron 1回あたりの処理上限（Gemini API のレート制限・コスト超過防止：R-13）
const MAX_RECORDS_PER_RUN = 20;

type PendingInquiry = {
  id: string;
  raw_content: string;
  // Slack 投稿本文に「送信元：LINE/Gmail｜送信者：XXX さん」を表示するため取得する
  channel: "line" | "gmail";
  sender_name: string | null;
};


export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;

  // 環境変数未設定は設定ミス扱いで 500
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set" },
      { status: 500 },
    );
  }

  // Bearer 認証（GitHub Actions Cron ワークフローが付与する Authorization ヘッダを検証）
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();

  // Step 0: Gmail ポーリング（旧 /api/cron/gmail の統合）
  // Hobby プラン Cron 1件制約のため、pending 消化前にここで Gmail を取り込む。
  // ポーリング失敗しても Slack/LINE 経由の pending は処理継続させたいので try で握って続行する。
  let gmailResult: { processed: number; errors: number; skipped: number } | null = null;
  let gmailError: string | null = null;
  try {
    gmailResult = await pollGmailInbox();
  } catch (err) {
    gmailError = err instanceof Error ? err.message : String(err);
    console.error("[Cron Classify] Gmail ポーリング失敗（後段は継続）:", gmailError);
  }

  let pending: PendingInquiry[];
  try {
    const { data, error } = await supabase
      .from("inquiry_queue")
      .select("id, raw_content, channel, sender_name")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_RECORDS_PER_RUN);

    if (error) {
      throw new Error(error.message);
    }
    pending = (data ?? []) as PendingInquiry[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Cron Classify] pending 取得失敗:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let notified = 0;
  let failed = 0;
  let deferred = 0;

  for (const record of pending) {
    try {
      const category = await classifyWithGemini(record.raw_content);
      const classifiedAt = new Date().toISOString();

      try {
        const channelId = getSlackChannelId(category);
        // 「どの問い合わせ手段（LINE/Gmail）」「誰から（表示名）」を先頭行にまとめて
        // Slack 画面で即座に判別できるようにする。表示名が取れなかった場合は「不明」で継続。
        const channelLabel = formatChannelLabel(record.channel);
        const senderText = record.sender_name
          ? `${record.sender_name}さん`
          : "不明";
        const senderHeader = `送信元：${channelLabel}｜送信者：${senderText}`;
        await postToSlack({
          channelId,
          text: `【${category}】\n${senderHeader}\n\n${record.raw_content}`,
        });

        const { error } = await supabase
          .from("inquiry_queue")
          .update({
            category,
            status: "notified",
            classified_at: classifiedAt,
            notified_at: new Date().toISOString(),
          })
          .eq("id", record.id);

        if (error) {
          throw new Error(error.message);
        }
        notified++;
      } catch (slackErr) {
        // Slack投稿が3回再送しても失敗（AC-009 #3）。再処理しないため failed に固定する。
        console.error(
          `[Cron Classify] Slack投稿失敗 id=${record.id}:`,
          slackErr,
        );
        const { error } = await supabase
          .from("inquiry_queue")
          .update({ category, status: "failed", classified_at: classifiedAt })
          .eq("id", record.id);
        if (error) {
          console.error(
            `[Cron Classify] failed 更新失敗 id=${record.id}:`,
            error.message,
          );
        }
        failed++;
      }
    } catch (classifyErr) {
      // Gemini API 失敗のうち transient（5xx / 429 / タイムアウト / ネットワーク断）は
      // status='pending' のまま残し、5 分後の次 Cron に再試行させる。
      // permanent（4xx 認証・モデル 404・API キー未設定など）は failed に固定して
      // 人手介入を促す。判定は GeminiApiError.isTransient に集約。
      const isTransient =
        classifyErr instanceof GeminiApiError && classifyErr.isTransient;

      if (isTransient) {
        console.error(
          `[Cron Classify] 分類 transient 失敗 id=${record.id}（pending 保持）:`,
          classifyErr,
        );
        deferred++;
        continue;
      }

      console.error(
        `[Cron Classify] 分類 permanent 失敗 id=${record.id}（failed 固定）:`,
        classifyErr,
      );
      const { error } = await supabase
        .from("inquiry_queue")
        .update({ status: "failed" })
        .eq("id", record.id);
      if (error) {
        console.error(
          `[Cron Classify] failed 更新失敗 id=${record.id}:`,
          error.message,
        );
      }
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: pending.length,
    notified,
    failed,
    deferred,
    gmail: gmailResult,
    gmailError,
  });
}
