# docs/screenshots/

**このフォルダの用途：** 各種マニュアルに埋め込む図表・スクリーンショットを集約。

**基本方針：** Claude Code で自動生成できる SVG で 90% カバー・実機撮影は最小限（3 枚）に抑える。

---

## ✅ Claude Code 自動生成済み SVG（7 ファイル）

すべて手書き SVG（Inter フォント指定）。GitHub / VS Code / ブラウザで直接レンダリング可能・PNG 変換不要。

| ファイル | 埋め込み先 | 内容 |
|---|---|---|
| `system-architecture.svg` | `../../README.md`（システムアーキテクチャ節）/ `../../AGENTS.md`（データフロー節）| 全体構成図（LINE / Gmail / Pub/Sub / Vercel / Supabase / Gemini / Slack / LINE Push）|
| `data-flow.svg` | `../../project-overview.md`（データフロー節）| 緊急パス（赤）と通常パス（緑）の 2 経路詳細 |
| `slack-channels-mockup.svg` | `../manual-operator.md`（普段の確認節）/ `../manual-operator-print.md`（同）| Slack 5 チャネル + 投稿メッセージ例 |
| `line-push-mockup.svg` | `../manual-operator.md`（緊急通知節）| iPhone LINE Push 通知バブル + 通知本文の見方 4 項目 |
| `db-erd.svg` | `../../requirements.md`（DB スキーマ節）| inquiry_queue + gemini_usage_monthly の ERD |
| `troubleshoot-flowchart.svg` | `../manual-developer-quickref.md`（判断フロー節）| 症状 → 一次確認 → 一次対応の分岐図 |
| `env-vars-map.svg` | `../manual-developer-quickref.md`（環境変数マトリクス節）| 全 20 変数を 7 グループに配置 |

---

## 🔴 実機撮影が必要な PNG（必須 3 枚のみ）

**なぜ 3 枚だけか：** ポートフォリオとしての視覚的訴求と、SLA 達成の裏付けに必要な最小限。設定画面や dashboard 系は SVG モック + 文字説明で代替可能なので撮影対象から外した。

### 撮影対象（合計 3 枚・作業時間 目安 10 分）

| # | ファイル名 | 撮影対象 | 埋め込み先 | 撮影のコツ |
|---|---|---|---|---|
| 01 | `01-lp-hero.png` | 本番 LP の Hero セクション（PC）| `../../README.md`（トップ画像）| Chrome PC で https://multichannel-notification-ai-dev.vercel.app/ を開き、Hero セクション（1st view）をキャプチャ |
| 02 | `02-lp-hero-mobile.png` | 本番 LP の Hero セクション（スマホ）| `../../README.md`（レスポンシブ実証）| ①の後に Chrome DevTools でモバイル表示（iPhone 14 Pro 等）に切り替え → 同じ Hero をキャプチャ・**PC 撮影と同じセッションで完結** |
| 03 | `03-line-push-real.png` **OR** `03-slack-real-channels.png` | クレーム LINE Push 実受信 **OR** Slack `#クレーム緊急` 実投稿 | `../manual-operator.md`（緊急通知節・裏付け）| どちらか撮りやすい方 1 枚だけで OK。LINE Push はスマホの通知センター画面が伝わりやすい |

**マスキング必須項目：** 個人名・メールアドレス・User ID・API キー・チャネル ID・実 URL 等（Misa さんが編集）

---

## 撮影手順（10 分で完了）

### 手順 1｜LP PC 版（3 分）
1. Chrome で https://multichannel-notification-ai-dev.vercel.app/ を開く
2. Hero セクション（画面上部のキャッチコピー + CTA ボタンが見える範囲）が画面いっぱいに表示された状態にする
3. `Win + Shift + S`（Windows）または `Cmd + Shift + 4`（Mac）で範囲キャプチャ
4. `docs/screenshots/01-lp-hero.png` として保存

### 手順 2｜LP モバイル版（3 分）
1. 同じ Chrome タブで `F12` → DevTools を開く
2. デバイスツールバー（Ctrl + Shift + M）→ iPhone 14 Pro を選択
3. Hero セクションが画面いっぱいの状態でキャプチャ
4. `docs/screenshots/02-lp-hero-mobile.png` として保存

### 手順 3｜動作裏付け 1 枚（4 分）

**選択肢 A: LINE Push 実受信（スマホ操作）**
1. スマホで公式 LINE にテストクレーム「エアコンが効きません、至急対応してください、苦情です」を送信
2. 60 秒以内に営業部長の個人 LINE に届く通知センターを表示
3. スマホでスクリーンショット → PC に送信
4. `docs/screenshots/03-line-push-real.png` として保存

**選択肢 B: Slack 実投稿（PC 完結）**
1. LINE や Gmail からテストクレームを送信
2. Slack `#クレーム緊急` チャネルを開いて 🚨 マーク付き投稿が表示された状態にする
3. Chrome または Slack アプリで範囲キャプチャ
4. `docs/screenshots/03-slack-real-channels.png` として保存

---

## 撮影後の埋め込み

3 枚保存したら、以下のコマンドで埋め込み確認：

```bash
# ファイルが揃っているか確認
ls docs/screenshots/*.png
# → 01-lp-hero.png / 02-lp-hero-mobile.png / 03-line-push-real.png (or 03-slack-real-channels.png)
```

その後、以下のドキュメントに `![]()` で埋め込む（未実施の場合は Claude Code に「01/02/03 のスクショを追加したので README と manual-operator に埋め込んで」と依頼）：

- `README.md` 冒頭に `![](docs/screenshots/01-lp-hero.png)` を追加
- `README.md` の適切な位置に `![](docs/screenshots/02-lp-hero-mobile.png)` を追加
- `docs/manual-operator.md` の緊急通知節（既に `line-push-mockup.svg` を配置済み）に実写を追加

---

## 「本当は撮った方がいいけど、なくても成立する」もの（オプション）

以下は撮る余裕があれば良いですが、なくても納品品質は保てます。時間に余裕ができたときに追加してください。

- Vercel Dashboard（Deployment / Env Vars / Function Logs）
- GitHub Actions のワークフロー実行結果
- Supabase の SQL Editor 実行結果 / inquiry_queue テーブル実データ
- LINE Developers Webhook URL 設定画面
- Gmail の振り分けルール設定画面
- GCP Console の Pub/Sub subscription 設定画面
- Slack App の OAuth & Permissions 画面

これらは全て `manual-developer.md` の該当セクションで文字と SVG により説明済みなので、撮影しなくても引き継ぎ担当者は迷いません。

---

## SVG の再生成・修正

SVG は手書きなので、修正時は該当ファイルを直接編集するか、Claude Code に「`docs/screenshots/xxx.svg` を〜のように変更して」と依頼してください。ブラウザで開いて表示確認できます。
