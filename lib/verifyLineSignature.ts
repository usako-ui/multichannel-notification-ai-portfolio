import crypto from "node:crypto";

/**
 * LINE Webhook 署名検証（HMAC-SHA256 + Base64）
 * https://developers.line.biz/ja/reference/messaging-api/#signature-validation
 *
 * body の生バイト列（rawBody）と x-line-signature ヘッダを比較する。
 * timingSafeEqual で比較することでサイドチャネル攻撃（タイミング攻撃）を防ぐ。
 *
 * ⚠️ JSON.parse 後の body から作った文字列を渡してはならない。
 *    パーサが空白を正規化して署名不一致になるため、必ず request.text() の結果を渡す。
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");

  // 長さが違う場合 timingSafeEqual は例外を投げるので先にガード
  if (expectedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
