import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase";
import { isUrgent } from "@/lib/urgentDetection";
import { handleUrgent } from "@/lib/handleUrgent";

/**
 * Gmail ポーリングロジック（T-07・T-08 再定義：ラベル方式）
 *
 * 方針（ラベル方式）:
 *   Gmail 側で振り分けルールを設定し、特定ラベル（TARGET_LABEL_NAME）が
 *   付いたメールのみを処理対象とする。処理後はラベル除去して
 *   再処理されないようにする。
 *
 * ⚠️ 全メールを対象にすると私用メールが Slack に流出するため、
 *    必ずラベルフィルタで対象を限定する。
 *
 * Cron エンドポイント経由でのみ呼ばれる想定。
 * 直接呼び出しても動くが、外部公開する場合は必ず認証を付けること。
 */

// Gmail 側で作成するラベル名（運用者が Gmail 上で作成 → 振り分けルール設定）
// 環境変数化する必要が出たら GMAIL_TARGET_LABEL 等で切り出す
const TARGET_LABEL_NAME = "multichannel-inbox";

// 1 回の Cron で処理する上限（Gemini API のレート制限に合わせる：R-13）
const MAX_MESSAGES_PER_RUN = 20;

// Gmail API のレスポンス型（必要部分だけ最小定義。any を使わない）
type GmailMessagePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailMessagePart[] | null;
};

// From ヘッダのパース結果。片方が取れない場合もあり得るので個別に null 可
type SenderInfo = {
  senderId: string | null;
  senderName: string | null;
};

/**
 * Gmail の From ヘッダを表示名とメールアドレスに分解する。
 *
 *   例1: '"山田太郎" <yamada@example.com>' → { senderName: '山田太郎', senderId: 'yamada@example.com' }
 *   例2: '山田太郎 <yamada@example.com>'   → { senderName: '山田太郎', senderId: 'yamada@example.com' }
 *   例3: 'yamada@example.com'              → { senderName: null,       senderId: 'yamada@example.com' }
 *   例4: undefined                         → { senderName: null,       senderId: null }
 *
 * 表示名の前後にある " や ' は Gmail の慣習で付くだけなので除去する。
 * 送信者が判別できない場合は Slack 側で「送信者：不明」にフォールバックさせる。
 */
function parseFromHeader(fromValue: string | undefined): SenderInfo {
  if (!fromValue) return { senderId: null, senderName: null };

  const match = fromValue.match(/^\s*(.*?)\s*<\s*([^<>]+@[^<>]+)\s*>\s*$/);
  if (match) {
    const rawName = match[1].replace(/^["']|["']$/g, "").trim();
    return {
      senderName: rawName.length > 0 ? rawName : null,
      senderId: match[2].trim(),
    };
  }

  // '<>' で囲われていない = アドレスのみのケース
  const trimmed = fromValue.trim();
  return {
    senderId: trimmed.length > 0 ? trimmed : null,
    senderName: null,
  };
}

/**
 * Gmail message ヘッダ配列から特定名（大文字小文字無視）のヘッダ値を取得する
 */
function findHeaderValue(
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const h of headers) {
    if (h.name && h.name.toLowerCase() === target) {
      return h.value ?? undefined;
    }
  }
  return undefined;
}

/**
 * OAuth2 クライアントを作成（refresh_token 方式）
 * リクエスト毎に作り直すことで、Vercel Function の cold/warm どちらでも安全に動く
 */
function createGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail 環境変数（GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN）が未設定です",
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

/**
 * Gmail の Base64URL エンコードを UTF-8 文字列にデコードする
 */
function decodeBase64Url(data: string): string {
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

/**
 * MIME マルチパートから本文テキストを抽出する
 *   優先順位: text/plain > text/html > ネストされたパートの再帰探索
 * HTML しかない場合は簡易的にタグを除去して返す（Gemini 分類に必要な最小限）
 */
function extractTextBody(
  payload: GmailMessagePart | null | undefined,
): string {
  if (!payload) return "";

  // 単一パート
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (Array.isArray(payload.parts)) {
    // text/plain を優先
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // フォールバック: text/html（簡易タグ除去）
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64Url(part.body.data)
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
    // ネスト（multipart/mixed など）を再帰探索
    for (const part of payload.parts) {
      const nested = extractTextBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

/**
 * ラベル名から Gmail のラベル ID を解決する
 * ラベルは運用者が Gmail 側で先に作成しておく必要がある
 */
async function resolveLabelId(
  gmail: ReturnType<typeof createGmailClient>,
  labelName: string,
): Promise<string | null> {
  const res = await gmail.users.labels.list({ userId: "me" });
  const label = res.data.labels?.find((l) => l.name === labelName);
  return label?.id ?? null;
}

/**
 * Gmail Watch 登録 / 再登録関数
 *
 * 目的：
 *   Gmail Pub/Sub Push（app/api/webhooks/gmail-push）を継続的に受信するには
 *   users.watch を定期的に叩き直す必要がある（Google 側の Watch 有効期限は最大 7 日）。
 *
 * 呼び出し方針：
 *   既存 Cron（/api/cron/classify）内で pollGmailInbox の後に呼ぶ。
 *   キャッシュした expiration が「残り 24 時間以下」または「未取得」の場合のみ
 *   users.watch を再発行する。冪等（何度呼んでも Watch は上書きされる）だが
 *   Gmail API の quota を無駄食いしないためインメモリキャッシュで頻度を抑える。
 *
 * ⚠️ Vercel Function インスタンスがコールドスタートすると cachedWatchExpiration は
 *    リセットされるため、その時点で 1 回 watch が走る。これは意図した挙動
 *    （インスタンス寿命は長くて数十分なので実質毎時 1 回程度に収まる）。
 */
let cachedWatchExpiration: number | null = null;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function ensureGmailWatch(): Promise<{
  renewed: boolean;
  expiration: number | null;
  reason: string;
}> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const topicName = process.env.PUBSUB_TOPIC_NAME;

  // Push が未有効化の環境（ローカル・Preview 等）ではスキップして Cron を止めない
  if (!projectId || !topicName) {
    return {
      renewed: false,
      expiration: null,
      reason: "GOOGLE_CLOUD_PROJECT_ID / PUBSUB_TOPIC_NAME 未設定のためスキップ",
    };
  }

  const now = Date.now();
  if (cachedWatchExpiration && cachedWatchExpiration - now > ONE_DAY_MS) {
    return {
      renewed: false,
      expiration: cachedWatchExpiration,
      reason: `残り ${Math.floor((cachedWatchExpiration - now) / 1000 / 60 / 60)}h あるためスキップ`,
    };
  }

  const gmail = createGmailClient();

  // ラベル ID を取得（Push 対象を multichannel-inbox ラベル付きメールに限定）
  // 私用メールが Push で流入するのを防ぐため labelFilterBehavior="INCLUDE" を指定
  const labelId = await resolveLabelId(gmail, TARGET_LABEL_NAME);
  if (!labelId) {
    throw new Error(
      `Gmail ラベル '${TARGET_LABEL_NAME}' が見つかりません（Watch 登録前に Gmail 側で作成してください）`,
    );
  }

  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: `projects/${projectId}/topics/${topicName}`,
      labelIds: [labelId],
      labelFilterBehavior: "INCLUDE",
    },
  });

  // expiration は Unix ms 文字列で返る（例："1737777777000"）
  const expirationRaw = res.data.expiration ?? null;
  cachedWatchExpiration = expirationRaw ? Number(expirationRaw) : null;

  return {
    renewed: true,
    expiration: cachedWatchExpiration,
    reason: "users.watch 再登録完了",
  };
}

/**
 * Gmail ポーリング本体
 * @returns 処理成功数と失敗数
 */
export async function pollGmailInbox(): Promise<{
  processed: number;
  errors: number;
  skipped: number;
}> {
  const gmail = createGmailClient();
  const supabase = supabaseAdmin();

  const labelId = await resolveLabelId(gmail, TARGET_LABEL_NAME);
  if (!labelId) {
    throw new Error(
      `Gmail ラベル '${TARGET_LABEL_NAME}' が見つかりません。Gmail 側でラベルと振り分けルールを設定してください`,
    );
  }

  // 対象ラベル付きメールのみ取得（既読/未読は問わない）。
  // 【変更履歴 2026-09-15】UNREAD フィルタを撤廃した。
  //   運用中に「利用者が Gmail アプリで受信確認 → 未読外れる → poller が拾えない」
  //   事象が慢性化していた（DB Gmail 経路 4 日間で 0 件）。
  //   ラベル `multichannel-inbox` のみで判定し、処理後にラベルを外すことで
  //   「既読・未読問わず 1 回だけ確実に取り込む」動作にする。
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelId],
    maxResults: MAX_MESSAGES_PER_RUN,
  });

  const messages = listRes.data.messages ?? [];
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const m of messages) {
    if (!m.id) {
      skipped++;
      continue;
    }

    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "full",
      });

      const body = extractTextBody(
        detail.data.payload as GmailMessagePart | null,
      ).trim();

      // From ヘッダから送信者情報を抽出（Slack 表示・DB 保存用）
      const fromHeader = findHeaderValue(detail.data.payload?.headers, "From");
      const { senderId, senderName } = parseFromHeader(fromHeader);

      // Subject を取得し、件名＋本文で緊急判定と Slack 通知本文を組み立てる。
      // 【変更履歴 2026-09-15】以前は本文のみで isUrgent 判定していたため、
      //   「至急対応お願いします」等が件名のみに書かれると緊急検知を取りこぼしていた。
      const subject = (
        findHeaderValue(detail.data.payload?.headers, "Subject") ?? ""
      ).trim();
      const rawContent = subject ? `【件名】${subject}\n${body}` : body;

      // 【変更履歴 2026-09-15】external_id に 'gmail_' prefix を付与。
      //   LINE 側は 'line_' prefix と対にすることで、UNIQUE(external_id) 制約下で
      //   将来的な ID 形式重複を明示的に回避する（既存レコード backfill はしない方針）。
      const externalId = `gmail_${m.id}`;

      if (!rawContent) {
        // 本文なし・添付のみ等はスキップ（Slack 通知しても価値がない）
        skipped++;
        // ただし処理済み扱いにしてラベル除去（次回もう見ない）
        await gmail.users.messages.modify({
          userId: "me",
          id: m.id,
          requestBody: {
            removeLabelIds: [labelId],
          },
        });
        continue;
      }

      // 緊急判定（Fast Path）
      // 緊急パス失敗時はラベルを残して次 Cron で再試行させる（QA #3 対応）。
      // 通知漏れ（SLA 5分以内 LINE Push 未達）を確実に検知するため、
      // 「ラベルが残り続けている＝処理未完了」を運用の指標にする。
      // 重複 LINE Push は handleUrgent 内で external_id UNIQUE + 23505 early return により
      // DB 側で吸収され、Slack 投稿と LINE Push は再送されない設計（handleUrgent.ts:57-59）。
      let urgentFailed = false;
      if (isUrgent(rawContent)) {
        try {
          await handleUrgent({
            channel: "gmail",
            externalId,
            rawContent,
            senderId,
            senderName,
          });
        } catch (urgentErr) {
          console.error(
            `[Gmail Poller] handleUrgent 失敗 id=${m.id}（ラベル残置・次 Cron で再試行）:`,
            urgentErr,
          );
          urgentFailed = true;
          errors++;
        }
      } else {
        // 通常パス: pending で INSERT。Cron が拾って分類する
        const { error } = await supabase.from("inquiry_queue").insert({
          channel: "gmail",
          external_id: externalId,
          raw_content: rawContent,
          status: "pending",
          sender_id: senderId,
          sender_name: senderName,
        });
        // 23505 = UNIQUE 制約違反（重複=正常系）
        if (error && error.code !== "23505") {
          throw new Error(error.message);
        }
      }

      // 処理済みマーク: ラベル除去のみ（既読状態は Gmail 側で自然に管理させる）。
      // 【変更履歴 2026-09-15】UNREAD 明示除去を撤廃。理由:
      //   - 受信メールに UNREAD が付いていないケース（利用者による既読後）でも動作させたい
      //   - ラベル除去のみで「1 回だけ取り込む」冪等性は担保できる（次 Cron ではもう対象外）
      // 緊急パス失敗時はスキップして、次 Cron で再処理させる（QA #3 対応）。
      if (urgentFailed) {
        continue;
      }
      await gmail.users.messages.modify({
        userId: "me",
        id: m.id,
        requestBody: {
          removeLabelIds: [labelId],
        },
      });

      processed++;
    } catch (err) {
      errors++;
      console.error(`[Gmail Poller] message ${m.id} 処理失敗:`, err);
      // 個別失敗は次のメッセージに進む（1件で全体を止めない）
    }
  }

  return { processed, errors, skipped };
}
