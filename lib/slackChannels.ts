import type { Category } from "@/lib/classifyWithGemini";

/**
 * カテゴリ → Slack チャネルID のマッピング（T-11）
 *
 * チャネルID自体は環境変数で管理する（.env.example 参照）。
 * コード内にチャネルIDをハードコードしない（Slack側の変更時に env のみで追随できるように）。
 */
export function getSlackChannelId(category: Category): string {
  const channelIdByCategory: Record<Category, string | undefined> = {
    賃貸: process.env.SLACK_CHANNEL_RENTAL,
    売買: process.env.SLACK_CHANNEL_SALE,
    内見: process.env.SLACK_CHANNEL_VIEWING,
    クレーム: process.env.SLACK_CHANNEL_COMPLAINT,
    "要確認・その他": process.env.SLACK_CHANNEL_OTHER,
  };

  const channelId = channelIdByCategory[category];
  if (!channelId) {
    throw new Error(
      `カテゴリ「${category}」に対応する Slack チャネルIDが未設定です`,
    );
  }
  return channelId;
}
