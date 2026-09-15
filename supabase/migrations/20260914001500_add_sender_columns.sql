-- inquiry_queue に送信者情報を保存するカラムを追加
-- 目的: Slack 投稿・LINE Push で「誰からのどの問い合わせか」を即座に判別できるようにする
--       （T-22 SLA 実機テスト・T-23 分類精度テスト中の運用要望への対応）
--
-- 設計:
--   - sender_id: LINE の userId or Gmail のメールアドレス（技術的な識別子）
--   - sender_name: LINE の displayName or Gmail の From ヘッダの表示名（人間可読）
--   - 両カラムとも NULL 可（既存行・sender 不明・API 失敗時のフォールバック）
--   - 既存の inquiry_queue の 4 行は sender_id / sender_name とも NULL のまま影響なし

ALTER TABLE inquiry_queue
  ADD COLUMN sender_id text,
  ADD COLUMN sender_name text;

COMMENT ON COLUMN inquiry_queue.sender_id IS 'LINE の userId or Gmail の送信元メールアドレス。NULL 可（不明時）';
COMMENT ON COLUMN inquiry_queue.sender_name IS 'LINE の displayName or Gmail の From ヘッダの表示名。NULL 可（取得失敗時は Slack で「送信者：不明」フォールバック）';
