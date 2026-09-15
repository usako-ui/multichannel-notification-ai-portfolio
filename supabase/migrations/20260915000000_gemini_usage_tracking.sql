-- Gemini API 月間トークン使用量の追跡テーブル
-- 目的：requirements.md 非機能要件「API コスト監視」対応
--       月間予算の 80% 到達時に営業部長 LINE Push で通知する
--
-- 設計：
--   - year_month（"YYYY-MM"）を主キーとして月次で 1 行に集約
--   - Gemini API 呼び出しのたびに usageMetadata から取得したトークン数を加算 upsert
--   - alert_80_sent_at は月に 1 度だけ送信するためのフラグ
--     （NULL の間は通知未送信・タイムスタンプが入ったら通知送信済み）
--   - 月替わりで新規行が作成される → 前月の alert フラグとは独立

CREATE TABLE IF NOT EXISTS gemini_usage_monthly (
  year_month text PRIMARY KEY,
  total_input_tokens bigint NOT NULL DEFAULT 0,
  total_output_tokens bigint NOT NULL DEFAULT 0,
  alert_80_sent_at timestamptz
);

COMMENT ON TABLE gemini_usage_monthly IS 'Gemini API の月間トークン使用量集計・80% 予算通知の送信履歴を管理';
COMMENT ON COLUMN gemini_usage_monthly.year_month IS 'YYYY-MM 形式（UTC 基準）。例：2026-09';
COMMENT ON COLUMN gemini_usage_monthly.total_input_tokens IS 'promptTokenCount の累積';
COMMENT ON COLUMN gemini_usage_monthly.total_output_tokens IS 'candidatesTokenCount の累積';
COMMENT ON COLUMN gemini_usage_monthly.alert_80_sent_at IS 'GEMINI_MONTHLY_TOKEN_LIMIT の 80% 到達通知を送信した時刻。NULL なら未送信';
