/**
 * 緊急パス判定用の正規表現
 * requirements.md 定義：クレームです|苦情|至急|緊急対応|怒り
 *
 * ⚠️「緊急」単体は含めない。
 *    No.22「これは緊急ではありません」を通常パスに流すため（AC-007）。
 *    「緊急」を追加すると否定文まで拾ってしまう。
 */
export const URGENT_PATTERN = /クレームです|苦情|至急|緊急対応|怒り/;

/**
 * 本文に緊急キーワードが含まれるか判定する。
 * 迷ったら Gemini 分類でクレーム側に倒す設計のため、
 * ここでは正規表現の厳密一致のみ担当する。
 */
export function isUrgent(content: string): boolean {
  return URGENT_PATTERN.test(content);
}
