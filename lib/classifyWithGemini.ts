import { trackGeminiUsage, type GeminiUsageMetadata } from "@/lib/trackGeminiUsage";

/**
 * Gemini API（gemini-flash-latest）で問い合わせ本文を5カテゴリに分類する
 *
 * Fail-safe 設計（requirements.md 準拠・見逃しコスト > 誤検知コストの方針）：
 *  - 「クレームかどうか迷う」場合はプロンプト側で Gemini に「クレーム」を選ぶよう指示する
 *  - Gemini の応答が5カテゴリのいずれにも一致しない（判断不能）場合は
 *    コード側で「要確認・その他」に倒す（normalizeCategory）
 *
 * ⚠️ AI分類はこのファイルに閉じる。他のファイルから直接 Gemini API を呼び出さない。
 * ⚠️ API 呼び出し自体の失敗（未設定・ネットワークエラー・不正レスポンス）は
 *    握りつぶさず throw する。呼び出し元（Cron）で status='failed' として扱うため。
 *
 * 使用量集計：
 *   Gemini 応答成功時に usageMetadata を取得し、await で trackGeminiUsage を呼ぶ。
 *   月間予算 80% 到達時に営業部長 LINE Push でアラートを送る（requirements.md 非機能要件）。
 *   trackGeminiUsage 内部で全ての例外を try/catch で握りつぶすため、
 *   集計・通知の失敗は分類結果に影響しない設計。
 *   ⚠️ Vercel Serverless では Response 返却時にコンテナ実行が停止するため、
 *   fire-and-forget（void）ではなく await が必須（LINE Push が途中で切られる問題を回避）。
 */

const CATEGORIES = [
  "賃貸",
  "売買",
  "内見",
  "クレーム",
  "要確認・その他",
] as const;

export type Category = (typeof CATEGORIES)[number];

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// GEMINI_MODEL 未設定時のデフォルト。
// `gemini-flash-latest` は Google が管理する最新安定 flash モデルのエイリアス。
// 個別バージョン (2.5-flash 等) は EOL で 404 になるリスクがあるため、
// 明示的な理由なくバージョン固定しない。
const DEFAULT_MODEL = "gemini-flash-latest";

// Gemini API 呼び出しのタイムアウト（ミリ秒）。
// Cron の maxDuration=60秒 に対して 1件で長時間占有されると
// 後続のキューが処理されずに詰まるため、上限を設ける。
// 15秒は Gemini-flash の通常応答（1〜3秒）に対して十分な余裕。
const GEMINI_TIMEOUT_MS = 15_000;

// Gemini generateContent のレスポンス型（必要な部分のみ最小定義。any は使わない）
type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  // 月間トークン集計 + 80% 予算アラートで使用する
  usageMetadata?: GeminiUsageMetadata;
};

/**
 * requirements.md 記載のプロンプトをそのまま使用する。
 * 文言を変えると分類精度（AC-005〜AC-007）が変わるため、独自に変更しない。
 */
function buildPrompt(rawContent: string): string {
  return `以下の不動産会社への問い合わせを1つのカテゴリに分類してください。

カテゴリ：賃貸 / 売買 / 内見 / クレーム / 要確認・その他

判定ルール：
- クレームかどうか迷う場合は「クレーム」を選ぶ（安全側に倒す）
- カテゴリが判断できないもの・迷惑メール等は「要確認・その他」を選ぶ

【問い合わせ】${rawContent}

カテゴリ名のみを返してください（説明不要）。`;
}

/**
 * Gemini の応答テキストを5カテゴリのいずれかに正規化する。
 * 「カテゴリ名のみ返す」よう指示していても前後に空白や句読点が付く場合があるため
 * 部分一致で判定し、どれにも一致しない場合は「要確認・その他」に倒す（Fail-safe）。
 */
function normalizeCategory(text: string): Category {
  const trimmed = text.trim();
  for (const category of CATEGORIES) {
    if (trimmed.includes(category)) {
      return category;
    }
  }
  // 判断不能: コード側 Fail-safe として「要確認・その他」に倒す
  return "要確認・その他";
}

/**
 * Gemini API のエラー。呼び出し元が transient / permanent を判別できるように
 * HTTP status と `isTransient` フラグを付与する。
 *  - `isTransient=true`: 5xx / 429 / タイムアウト / ネットワーク断など、時間経過で
 *    自然回復し得るエラー。Cron 側は status='pending' のまま残して次周期で再試行させる。
 *  - `isTransient=false`: 4xx（429 除く）/ 認証エラー / モデル 404 / 応答不正など、
 *    人手介入が必要な永続エラー。Cron 側は status='failed' に固定する。
 */
export class GeminiApiError extends Error {
  readonly httpStatus: number | null;
  readonly isTransient: boolean;
  constructor(message: string, httpStatus: number | null, isTransient: boolean) {
    super(message);
    this.name = "GeminiApiError";
    this.httpStatus = httpStatus;
    this.isTransient = isTransient;
  }
}

/**
 * 問い合わせ本文を Gemini API で5カテゴリに分類する。
 *
 * @throws GeminiApiError - API 呼び出し自体が失敗した場合。
 *         呼び出し元は `err.isTransient` で pending 保持 / failed 固定を分岐する。
 */
export async function classifyWithGemini(
  rawContent: string,
): Promise<Category> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // 設定ミス（permanent）：人手介入で環境変数を修正しない限り解消しないため failed 扱い
    throw new GeminiApiError("環境変数 GEMINI_API_KEY が未設定です", null, false);
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  // AbortController でタイムアウトを実装。fetch のデフォルトはタイムアウトなしのため
  // ネットワーク側で応答が返らないと Cron の maxDuration まで占有されてしまう。
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(rawContent) }] }],
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      // 5xx と 429 は Google 側の一時的な問題 → transient として次 Cron に再試行を委ねる
      const transient = res.status === 429 || res.status >= 500;
      throw new GeminiApiError(
        `Gemini API エラー（HTTP ${res.status}）: ${errorBody}`,
        res.status,
        transient,
      );
    }

    const data = (await res.json()) as GeminiGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      // 200 で返ってきたが期待した形式でない = Google 側の一時的な返却揺らぎとして transient
      throw new GeminiApiError(
        "Gemini API のレスポンスにテキストが含まれていません",
        200,
        true,
      );
    }

    // 使用量集計（同期実行）
    // Vercel Serverless は Response 返却時にコンテナ実行が停止するため、
    // `void trackGeminiUsage(...)` の Fire-and-forget では LINE Push 送信が
    // 途中で切られる（DB upsert は完了するが LINE Push が失敗する挙動を実測）。
    // trackGeminiUsage 内部で全ての例外を try/catch で握りつぶしているため、
    // await しても分類結果には影響しない。
    await trackGeminiUsage(data.usageMetadata);

    return normalizeCategory(text);
  } catch (err) {
    if (err instanceof GeminiApiError) {
      throw err;
    }
    // AbortError（タイムアウト）は transient として次 Cron に委ねる
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeminiApiError(
        `Gemini API 呼び出しがタイムアウトしました（${GEMINI_TIMEOUT_MS}ms）`,
        null,
        true,
      );
    }
    // fetch 自体の失敗（DNS 引けない・接続拒否など）はネットワーク断として transient
    if (err instanceof Error) {
      throw new GeminiApiError(
        `Gemini API fetch 失敗: ${err.message}`,
        null,
        true,
      );
    }
    throw new GeminiApiError(
      `Gemini API 呼び出しで不明なエラーが発生しました: ${String(err)}`,
      null,
      false,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
