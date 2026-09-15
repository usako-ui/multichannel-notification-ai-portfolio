import { supabaseAdmin } from "@/lib/supabase";
import { pushLineToManager } from "@/lib/linePush";

/**
 * Gemini API 月間トークン使用量の集計と 80% 到達アラート
 *
 * 目的：
 *   requirements.md 非機能要件「API コスト監視」対応。
 *   月間予算（GEMINI_MONTHLY_TOKEN_LIMIT）の 80% に到達した時点で
 *   営業部長の個人 LINE Push で通知する。
 *
 * 設計方針：
 *   - 内部で全ての例外を try/catch で握りつぶし、Gemini 分類本体の結果に影響させない
 *     （呼び出し側は await するが本関数から throw されることはない）
 *   - 月次単位で集計行を upsert（year_month が主キー）
 *   - 80% 通知は月に 1 度だけ送信（alert_80_sent_at で二重送信防止）
 *   - GEMINI_MONTHLY_TOKEN_LIMIT が未設定 or 0 の場合は追跡のみ実施し通知はスキップ
 *
 * ⚠️ 呼び出し側の注意：
 *   Vercel Serverless では Response 返却時にコンテナ実行が停止するため、
 *   `void trackGeminiUsage(...)` の fire-and-forget では LINE Push が途中で切られる。
 *   必ず `await` して同期実行すること。
 *
 * 依存の切り出し方針：
 *   - `lib/linePush.ts` の pushLineToManager を共通末端として利用
 *   - 通知送信自体の失敗はログのみに留め、集計データは可能な限り保存する
 */

// GEMINI_MONTHLY_TOKEN_LIMIT のデフォルト（100 万トークン）
// 実運用では Vercel env で明示指定する想定
const DEFAULT_MONTHLY_TOKEN_LIMIT = 1_000_000;
const ALERT_THRESHOLD_RATIO = 0.8;

/**
 * Gemini generateContent レスポンスに含まれる usageMetadata の型
 * candidatesTokenCount / promptTokenCount は API のバージョンによって
 * undefined になることがあるため optional で受ける
 */
export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

/**
 * UTC 基準で現在の YYYY-MM 文字列を返す
 * 月次集計の主キーとして使用する（サーバーのタイムゾーンに依存しないよう UTC で固定）
 */
function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Gemini API 呼び出しの使用量を集計し、80% 到達時に営業部長 LINE Push で通知する
 *
 * @param usage Gemini API レスポンスの usageMetadata
 *              undefined / トークン数 0 の場合は何もしない
 *
 * @remarks
 *   - この関数は呼び出し元で必ず try/catch するか、await せずに fire-and-forget で
 *     呼び出すこと。集計・通知の失敗が分類結果に波及しないようにする。
 *   - 失敗時は console.error で記録するのみで throw しない。
 */
export async function trackGeminiUsage(
  usage: GeminiUsageMetadata | undefined,
): Promise<void> {
  try {
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    if (inputTokens === 0 && outputTokens === 0) {
      // 集計対象なし（Gemini が usageMetadata を返さなかった場合など）
      return;
    }

    const supabase = supabaseAdmin();
    const yearMonth = getCurrentYearMonth();

    // Postgres の RPC は使わず、SELECT + UPSERT のシンプル構成で実装。
    // 同時実行時は最後の書き込みが勝つ設計（分類は 1 秒間隔以下では発生しないため許容）。
    const { data: existing, error: selectError } = await supabase
      .from("gemini_usage_monthly")
      .select("total_input_tokens, total_output_tokens, alert_80_sent_at")
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (selectError) {
      console.error(
        "[trackGeminiUsage] gemini_usage_monthly SELECT 失敗:",
        selectError.message,
      );
      return;
    }

    const newInputTotal = (existing?.total_input_tokens ?? 0) + inputTokens;
    const newOutputTotal = (existing?.total_output_tokens ?? 0) + outputTokens;

    const { error: upsertError } = await supabase
      .from("gemini_usage_monthly")
      .upsert(
        {
          year_month: yearMonth,
          total_input_tokens: newInputTotal,
          total_output_tokens: newOutputTotal,
          alert_80_sent_at: existing?.alert_80_sent_at ?? null,
        },
        { onConflict: "year_month" },
      );

    if (upsertError) {
      console.error(
        "[trackGeminiUsage] gemini_usage_monthly UPSERT 失敗:",
        upsertError.message,
      );
      return;
    }

    // ===== 80% 到達判定と通知 =====
    // 予算未設定 or 送信済みならスキップ
    if (existing?.alert_80_sent_at) {
      return;
    }

    const monthlyLimit = readMonthlyTokenLimit();
    if (monthlyLimit <= 0) {
      // 予算 0 or 無効値：追跡のみ実施し通知はスキップ
      return;
    }

    const totalTokens = newInputTotal + newOutputTotal;
    const threshold = Math.floor(monthlyLimit * ALERT_THRESHOLD_RATIO);

    if (totalTokens < threshold) {
      // 未到達
      return;
    }

    // 80% 到達 → 営業部長 LINE Push を送信
    const percentage = Math.floor((totalTokens / monthlyLimit) * 100);
    const message = buildAlertMessage({
      totalTokens,
      monthlyLimit,
      percentage,
    });

    try {
      await pushLineToManager(message);
    } catch (err) {
      // 通知送信の失敗はログのみ・集計 upsert は成功しているため後続の再試行で通知される
      console.error("[trackGeminiUsage] 80% 通知 LINE Push 失敗:", err);
      return;
    }

    // 通知成功したので alert_80_sent_at を更新（月に 1 度のみ送信）
    const { error: updateError } = await supabase
      .from("gemini_usage_monthly")
      .update({ alert_80_sent_at: new Date().toISOString() })
      .eq("year_month", yearMonth);

    if (updateError) {
      console.error(
        "[trackGeminiUsage] alert_80_sent_at 更新失敗:",
        updateError.message,
      );
      // 更新失敗すると次回も通知が飛ぶ可能性はあるが、通知漏れよりは重複の方が安全
    }
  } catch (err) {
    // 予期しない例外もすべて握りつぶす（分類結果に影響させないため）
    console.error("[trackGeminiUsage] 予期しない例外:", err);
  }
}

function readMonthlyTokenLimit(): number {
  const raw = process.env.GEMINI_MONTHLY_TOKEN_LIMIT;
  if (!raw) return DEFAULT_MONTHLY_TOKEN_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    console.error(
      `[trackGeminiUsage] GEMINI_MONTHLY_TOKEN_LIMIT が数値に変換できません: ${raw}`,
    );
    return DEFAULT_MONTHLY_TOKEN_LIMIT;
  }
  return parsed;
}

function buildAlertMessage(params: {
  totalTokens: number;
  monthlyLimit: number;
  percentage: number;
}): string {
  const formatted = (n: number) => n.toLocaleString("en-US");
  return (
    `⚠️ Gemini API 使用量アラート\n\n` +
    `月間予算の ${params.percentage}% に到達しました。\n\n` +
    `今月の使用量：${formatted(params.totalTokens)} / ${formatted(params.monthlyLimit)} トークン\n` +
    `残り期間で分類処理が停止する可能性があります。\n\n` +
    `【対応】\n` +
    `- Google AI Studio で使用量を確認\n` +
    `- 必要に応じて上位プランへ切替 or 予算枠増枠を検討`
  );
}
