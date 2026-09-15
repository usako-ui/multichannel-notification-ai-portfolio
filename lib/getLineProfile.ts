/**
 * LINE Messaging API で User プロフィール（displayName）を取得する
 *
 * 用途: クレーム検出時に Slack #クレーム緊急 と 営業部長 LINE Push へ
 *       「送信者：XXX さん」を含めて誰からのクレームか即座に判別できるようにする（案件5 T-22 実機検証で判明した欠陥への対応）。
 *
 * ⚠️ SLA 5 分以内担保のため fetch タイムアウトを 3 秒で切る。
 *    プロフィール取得失敗時は null を返し、呼び出し側は「送信者：不明」で継続。
 *    友だち未追加・ブロック済み・API 障害いずれも null 扱いで緊急通知を止めない（R-10 の SLA 優先）。
 * ⚠️ このファイルは lib/linePush.ts と同じく、循環参照回避のため
 *    他の lib モジュールを一切 import しない。
 */

// LINE Profile API のタイムアウト。SLA 5 分に対し 3 秒はごく短いが、
// このロジック自体が Webhook 応答経路にあるため念のため小さく切る。
const LINE_PROFILE_TIMEOUT_MS = 3000;

export async function getLineDisplayName(
  userId: string,
): Promise<string | null> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    console.error(
      "[getLineDisplayName] LINE_CHANNEL_ACCESS_TOKEN が未設定です",
    );
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    LINE_PROFILE_TIMEOUT_MS,
  );

  try {
    const res = await fetch(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
        // Next.js の fetch キャッシュを回避（別ユーザーの名前が混ざる事故を防ぐ）
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.warn(
        `[getLineDisplayName] LINE Profile API 失敗 HTTP ${res.status}`,
      );
      return null;
    }

    const body = (await res.json()) as { displayName?: unknown };
    if (typeof body.displayName === "string" && body.displayName.length > 0) {
      return body.displayName;
    }
    return null;
  } catch (err) {
    // AbortError（3秒タイムアウト）・ネットワークエラー等は握りつぶす
    console.error("[getLineDisplayName] 例外:", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
