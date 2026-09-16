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

  // Base64 デコードして「HMAC のバイト列そのもの」を比較する（QA #9・2026-09-16）。
  // Base64 は決定的なので文字列比較でも機能的には等価だが、
  // 本来比較したいのはハッシュ 32 バイトの生値であり、
  // バイナリ比較の方が仕様に忠実（32 バイト固定長で timingSafeEqual が安定）。
  //
  // 不正な Base64 が来た場合 Buffer.from は残り部分を切り捨てるため、
  // 32 バイトに満たない = 不正な署名として下の長さガードで弾く。
  const expectedBuf = Buffer.from(expected, "base64");
  const signatureBuf = Buffer.from(signature, "base64");

  // 長さが違う場合 timingSafeEqual は例外を投げるので先にガード
  //（SHA-256 なので正常時は必ず 32 バイト）
  if (expectedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
