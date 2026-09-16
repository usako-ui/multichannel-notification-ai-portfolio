# docs/screenshots/

**このフォルダの用途：** 各種マニュアルに埋め込む図表・スクリーンショットを集約。

---

## ファイル種別

### ✅ Claude Code 自動生成の SVG（7 ファイル・PR #11 で追加）

| ファイル | 埋め込み先 | 内容 |
|---|---|---|
| `system-architecture.svg` | `../../README.md`（システムアーキテクチャ節）/ `../../AGENTS.md`（データフロー節）| 全体構成図（LINE / Gmail / Pub/Sub / Vercel / Supabase / Gemini / Slack / LINE Push）|
| `data-flow.svg` | `../../project-overview.md`（データフロー節）| 緊急パス（赤）と通常パス（緑）の 2 経路詳細 |
| `slack-channels-mockup.svg` | `../manual-operator.md`（普段の確認節）/ `../manual-operator-print.md`（同）| Slack 5 チャネル + 投稿メッセージ例 |
| `line-push-mockup.svg` | `../manual-operator.md`（緊急通知節）| iPhone LINE Push 通知バブル + 通知本文の見方 4 項目 |
| `db-erd.svg` | `../../requirements.md`（DB スキーマ節）| inquiry_queue + gemini_usage_monthly の ERD |
| `troubleshoot-flowchart.svg` | `../manual-developer-quickref.md`（判断フロー節）| 症状 → 一次確認 → 一次対応の分岐図 |
| `env-vars-map.svg` | `../manual-developer-quickref.md`（環境変数マトリクス節）| 全 20 変数を 7 グループに配置 |

すべて手書き SVG（Inter フォント指定）。GitHub / VS Code / ブラウザで直接レンダリング可能・PNG 変換不要。

---

### 🔴 ユーザー実機撮影が必要な PNG（T-29 で追加予定）

**命名規則：** `NN-対象-シーン.png`（連番 + kebab-case・ファイル名から内容が判別できる形式）

**マスキング必須項目：** 個人名・メールアドレス・User ID・API キー・チャネル ID・実 URL 等（Misa さんが編集）

#### 高優先度（納品時に必須）

| # | ファイル名（案）| 撮影対象 | 埋め込み先 |
|---|---|---|---|
| 01 | `01-lp-hero.png` | 本番 LP のヒーローセクション（PC）| `../../README.md`（トップ画像）|
| 02 | `02-lp-hero-mobile.png` | 本番 LP のヒーローセクション（スマホ）| `../../README.md`（レスポンシブ実証）|
| 03 | `03-slack-real-channels.png` | 実 Slack ワークスペースの 5 チャネル + 実投稿 | `../manual-operator.md`（普段の確認節・裏付け）|
| 04 | `04-line-push-real.png` | 実スマホで受信した緊急通知 | `../manual-operator.md`（緊急通知節・裏付け）|
| 05 | `05-vercel-dashboard.png` | Vercel Dashboard の Deployment 一覧 | `../manual-developer.md` §2 |
| 06 | `06-vercel-env-vars.png` | Vercel の Environment Variables 画面 | `../manual-developer.md` §3 |
| 07 | `07-github-actions-run.png` | GitHub Actions の cron.yml 実行結果 | `../manual-developer.md` §7 確認 3 |
| 08 | `08-supabase-sql-editor.png` | Supabase SQL Editor で監視 SQL を実行した結果 | `../manual-developer.md` §7 監視 SQL |
| 09 | `09-supabase-table-editor.png` | inquiry_queue テーブルの実データ | `../manual-developer.md` §3.5 |

#### 中優先度（あれば説得力向上）

| # | ファイル名（案）| 撮影対象 | 埋め込み先 |
|---|---|---|---|
| 10 | `10-line-developers-webhook.png` | LINE Developers の Webhook URL 設定画面 | `../manual-developer.md` §4 |
| 11 | `11-gmail-label-rule.png` | Gmail の振り分けルール（multichannel-inbox）| `../manual-developer.md` §6 |
| 12 | `12-gcp-pubsub-subscription.png` | GCP Console の Pub/Sub subscription 設定 | `../../AGENTS.md` §8 |
| 13 | `13-slack-app-oauth.png` | Slack App の OAuth & Permissions 画面 | `../manual-developer.md` §9 |
| 14 | `14-vercel-function-logs.png` | Vercel の Function Logs（gmail-push 200 応答）| `../manual-developer.md` §8 |

---

## 撮影のヒント

**Vercel Dashboard：** ダークテーマの方が印象が良い（Settings → Appearance → Dark）
**Slack：** 実ワークスペースが用意できない場合は開発用ワークスペースで代替可
**LINE Push 実受信：** スマホの通知センター（ロック画面）で撮影 → プライバシー配慮
**GitHub Actions run：** 成功したワークフローの詳細画面（steps 展開・response body 見える形）

**マスキングツール：**
- Windows：Snipping Tool の「編集で開く」→ 塗りつぶし・ぼかし
- Mac：プレビュー → ツールバーで注釈
- 汎用：GIMP・Photopea（ブラウザ版）

---

## 追加時の手順

1. 撮影して `docs/screenshots/NN-xxx.png` として保存
2. 埋め込み先ドキュメントの該当セクションに `![](screenshots/NN-xxx.png)` を追加
3. 本 README の対応表の該当行を「✅ 撮影済み」に更新
4. `git add . && git commit -m "docs: <対象> のスクショを追加"`

---

## SVG の再生成・修正

SVG は手書きなので、修正時は該当ファイルを直接編集するか、Claude Code に「`docs/screenshots/xxx.svg` を〜のように変更して」と依頼してください。ブラウザで開いて表示確認できます。
