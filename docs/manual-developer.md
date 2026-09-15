# 開発者向け手順書

# マルチチャネル通知システム｜manual-developer.md

> **対象読者：** このシステムを引き継いだ開発者・運用担当者
> **最終更新：** 2026-09-14（本番リリース時点の実装を反映）
> **本番 URL：** https://multichannel-notification-ai-dev.vercel.app/
> **リポジトリ：** https://github.com/usako-ui/multichannel-notification-ai-dev
>
> **本番リリース時に判明した実運用ポイントは「8. トラブルシューティング」に集約しています。**
> **AI エージェント向けの「触ると壊れる箇所」は `AGENTS.md` を参照してください（本ドキュメント section 10 から誘導）。**

---

## 目次

1. [ローカル開発環境のセットアップ](#1-ローカル開発環境のセットアップ)
2. [Vercel デプロイ手順](#2-vercel-デプロイ手順)
3. [環境変数の投入手順](#3-環境変数の投入手順)
3.5. [DB マイグレーション（Supabase）](#35-db-マイグレーションsupabase)
4. [LINE Webhook URL 本番登録](#4-line-webhook-url-本番登録)
5. [Gmail OAuth 本番設定](#5-gmail-oauth-本番設定)
6. [Gmail ラベル・振り分けルール作成](#6-gmail-ラベル振り分けルール作成)
7. [デプロイ後の疎通確認](#7-デプロイ後の疎通確認)
8. [トラブルシューティング](#8-トラブルシューティング)
9. [APIキーローテーション手順](#9-apiキーローテーション手順)
10. [触ると壊れる箇所](#10-触ると壊れる箇所) — 詳細は `AGENTS.md` 参照

---

## 1. ローカル開発環境のセットアップ

```bash
# リポジトリをクローン
git clone https://github.com/usako-ui/multichannel-notification-ai-dev.git
cd multichannel-notification-ai-dev

# 依存関係をインストール
npm install

# .env.example をコピーして環境変数を設定
cp .env.example .env.local
# .env.local を開いて各変数の値を埋める

# 開発サーバーを起動
npm run dev
```

動作確認：`http://localhost:3000` が表示されれば成功。

---



## 2. Vercel デプロイ手順



### STEP 1｜Vercel アカウントを作る

```
① https://vercel.com を開く
② 「Sign Up」→「Continue with GitHub」を選択
③ GitHub アカウントで認証する
④ Hobby プランを選択（無料）
```



### STEP 2｜GitHub リポジトリを接続する

```
① Vercel ダッシュボードで「Add New...」→「Project」を選択
② 「Import Git Repository」で GitHub を選択
③ リポジトリ一覧から「multichannel-notification-ai-dev」を選択
④ 「Import」をクリック
```



### STEP 3｜プロジェクト設定を確認する

```
Configure Project 画面で以下を確認する：

Framework Preset   : Next.js（自動検出されるはず）
Root Directory     : ./（デフォルトのまま）
Build Command      : next build（デフォルトのまま）
Output Directory   : .next（デフォルトのまま）

⚠️ 環境変数はこの画面では入れない。後の「3. 環境変数の投入手順」で行う。
```



### STEP 4｜初回デプロイを実行する

```
① 「Deploy」をクリック
② ビルドログが表示される（2〜3分）
③ 「Congratulations!」が出ればデプロイ成功
④ 表示された URL をメモする（例：https://multichannel-notification-ai-dev.vercel.app）

⚠️ 環境変数をまだ入れていないので、API は 500 エラーになる。
   次のステップで環境変数を投入してから再デプロイする。
```



### STEP 5｜本番 URL を取得する

```
Vercel ダッシュボード → プロジェクト名 → 「Domains」タブ
→ 本番 URL が表示される（.vercel.app のもの）
```

この URL を後の手順で使用する。以降 `https://YOUR-PROJECT.vercel.app` と表記する。

---



## 3. 環境変数の投入手順



### 環境変数の設定方法

```
Vercel ダッシュボード
→ プロジェクトを選択
→ 「Settings」タブ
→ 左メニュー「Environment Variables」
→ 「Add」ボタンで1件ずつ追加
```

各変数を入力したら「Save」をクリックする。
**全件入力後に「Deployments」→「Redeploy」で再デプロイが必要。**

---



### 環境変数チェックリスト（全 18 件）

> ⚠️ `NEXT_PUBLIC_` が付く変数はブラウザに公開される。付けてよいのは Supabase の URL と ANON_KEY のみ。
>
> **内訳：** Supabase 3 + LINE 3 + Gmail 3 + Slack 6 + Gemini 2 + Cron 保護 1 = **合計 18 件**



#### Supabase（3件）


| キー名                             | 用途                             | 取得先                                                                        | 公開区分          | Vercel スコープ                        |
| ------------------------------- | ------------------------------ | -------------------------------------------------------------------------- | ------------- | ---------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase プロジェクト URL            | Supabase ダッシュボード > Settings > API > Project URL                            | 公開OK（フロント使用）  | Production / Preview / Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名アクセス用キー（RLS が守る）             | Supabase ダッシュボード > Settings > API > Project API keys > anon public         | 公開OK（フロント使用）  | Production / Preview / Development |
| `SUPABASE_SERVICE_ROLE_KEY`     | RLS をバイパスできる強力なキー。**絶対に公開しない** | Supabase ダッシュボード > Settings > API > Project API keys > service_role secret | **機密・サーバー専用** | Production のみ                      |


**取得手順：**

```
① https://supabase.com/dashboard を開く
② 対象プロジェクトを選択
③ 左メニュー「Settings」→「API」を選択
④ 「Project URL」「anon public」「service_role secret」をそれぞれコピー
```

---



#### LINE Messaging API（3件）


| キー名                         | 用途                                | 取得先                                                          | 公開区分          | Vercel スコープ   |
| --------------------------- | --------------------------------- | ------------------------------------------------------------ | ------------- | ------------- |
| `LINE_CHANNEL_SECRET`       | Webhook 署名検証に使うシークレット             | LINE Developers > チャネル基本設定 > チャネルシークレット                      | **機密・サーバー専用** | Production のみ |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE API 呼び出し用トークン                | LINE Developers > Messaging API 設定 > チャネルアクセストークン（長期）        | **機密・サーバー専用** | Production のみ |
| `LINE_MANAGER_USER_ID`      | 緊急時に個人 LINE Push を送る営業部長の User ID | LINE Developers > Messaging API 設定 > 友だち追加後に User ID を確認（後述） | **機密・サーバー専用** | Production のみ |


**LINE_MANAGER_USER_ID の取得方法：**

```
① 営業部長に LINE 公式アカウントを友だち追加してもらう
② LINE Developers > チャネル > Messaging API 設定
③ 「Webhook URL を設定してテストメッセージを送る」
   （デプロイ後の Webhook URL 登録後に確認できる）
④ ログに "source.userId" として記録される User ID をコピーする

または：
① ngrok 等でローカルを公開してテスト Webhook を受信する
② LINE のテストメッセージを送る
③ ログの source.userId をコピーする
```

---



#### Gmail OAuth（3件）


| キー名                   | 用途                           | 取得先                                                           | 公開区分          | Vercel スコープ   |
| --------------------- | ---------------------------- | ------------------------------------------------------------- | ------------- | ------------- |
| `GMAIL_CLIENT_ID`     | Gmail API OAuth クライアント ID    | Google Cloud Console > API とサービス > 認証情報 > OAuth 2.0 クライアント ID | **機密・サーバー専用** | Production のみ |
| `GMAIL_CLIENT_SECRET` | Gmail API OAuth クライアントシークレット | 同上（「GOCSPX-」で始まる文字列）                                          | **機密・サーバー専用** | Production のみ |
| `GMAIL_REFRESH_TOKEN` | アクセストークン自動更新用（長期有効）          | OAuth フロー実行で取得（後述）                                            | **機密・サーバー専用** | Production のみ |


**GMAIL_REFRESH_TOKEN の取得手順（本番用）：**

```
① 以下の URL をブラウザで開く（YOUR_CLIENT_ID を書き換える）
   ※ YOUR_DOMAIN は本番デプロイ後の Vercel URL

https://accounts.google.com/o/oauth2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=https://YOUR_DOMAIN/api/auth/callback/google&response_type=code&scope=https://www.googleapis.com/auth/gmail.readonly&access_type=offline&prompt=consent

② Google アカウント（監視対象の Gmail アカウント）でログイン
③ 「許可」をクリック
④ リダイレクト後の URL の「code=」以降の値をコピー

⑤ 以下のコマンドを実行して refresh_token を取得する（値を書き換えること）

curl -X POST https://oauth2.googleapis.com/token \
  -d "code=YOUR_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://YOUR_DOMAIN/api/auth/callback/google" \
  -d "grant_type=authorization_code"

⑥ レスポンスの "refresh_token" の値を GMAIL_REFRESH_TOKEN として Vercel に設定する
```

> ⚠️ `prompt=consent` を付けないと refresh_token が返ってこない場合がある。

---



#### Slack（6件）


| キー名                       | 用途                                   | 取得先                                                    | 公開区分          | Vercel スコープ   |
| ------------------------- | ------------------------------------ | ------------------------------------------------------ | ------------- | ------------- |
| `SLACK_BOT_TOKEN`         | Slack への投稿に使う Bot トークン（`xoxb-` で始まる） | Slack App > OAuth & Permissions > Bot User OAuth Token | **機密・サーバー専用** | Production のみ |
| `SLACK_CHANNEL_RENTAL`    | 賃貸問い合わせ投稿先チャネル ID（`C` で始まる）          | Slack でチャネル名をクリック > 一番下に表示                             | 機密（サーバー専用）    | Production のみ |
| `SLACK_CHANNEL_SALE`      | 売買問い合わせ投稿先チャネル ID                    | 同上                                                     | 機密（サーバー専用）    | Production のみ |
| `SLACK_CHANNEL_VIEWING`   | 内見問い合わせ投稿先チャネル ID                    | 同上                                                     | 機密（サーバー専用）    | Production のみ |
| `SLACK_CHANNEL_COMPLAINT` | クレーム投稿先チャネル ID                       | 同上                                                     | 機密（サーバー専用）    | Production のみ |
| `SLACK_CHANNEL_OTHER`     | 要確認・その他投稿先チャネル ID                    | 同上                                                     | 機密（サーバー専用）    | Production のみ |


---



#### Gemini API（2件）


| キー名              | 用途                              | 取得先                                                                              | 公開区分          | Vercel スコープ                        |
| ---------------- | ------------------------------- | -------------------------------------------------------------------------------- | ------------- | ---------------------------------- |
| `GEMINI_API_KEY` | Gemini API の認証キー（`AIzaSy` で始まる） | [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | **機密・サーバー専用** | Production のみ                      |
| `GEMINI_MODEL`   | 使用するモデル名（任意）※未設定時はコード内デフォルト `gemini-flash-latest`（エイリアス）を使用 | 推奨：未設定またはエイリアス `gemini-flash-latest`。**バージョン固定（例：`gemini-2.5-flash`）は EOL で 404 になる実績あり**（本番リリース時に障害発生・PR #7 で対応） | 機密（サーバー専用）    | Production / Preview / Development |


---



#### Vercel Cron 保護（1件）


| キー名           | 用途                                 | 取得先          | 公開区分          | Vercel スコープ   |
| ------------- | ---------------------------------- | ------------ | ------------- | ------------- |
| `CRON_SECRET` | Cron エンドポイントへの不正アクセス防止 Bearer トークン | ターミナルで生成（後述） | **機密・サーバー専用** | Production のみ |


**CRON_SECRET の生成方法：**

PowerShell の場合：

```powershell
# ランダムな 32バイト（64文字）の16進数文字列を生成する
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Git Bash / WSL の場合：

```bash
openssl rand -hex 32
```

生成した値をそのまま `CRON_SECRET` として Vercel に設定する。

---



### 全件入力後の再デプロイ

```
Vercel ダッシュボード
→ プロジェクトを選択
→ 「Deployments」タブ
→ 最新のデプロイ右側「...」→「Redeploy」
→ 「Redeploy」ボタンをクリック
```

**CLI から一括投入する場合（Windows 環境のハマりポイント含む）：**

```bash
# 個別に投入する例（stdin パイプ・改行混入回避のため tr -d '\r\n' が必須）
grep "^SLACK_BOT_TOKEN=" .env.local | cut -d= -f2- | tr -d '\r\n' | vercel env add SLACK_BOT_TOKEN production
```

> ⚠️ Windows の `.env.local` は改行が **CRLF** のため、`tr -d '\n'` だけでは `\r` が混入してトークンが壊れます。
> **必ず `tr -d '\r\n'` を使ってください。**（詳細は section 8 参照）

---



## 3.5. DB マイグレーション（Supabase）

このプロジェクトは `supabase/migrations/` にマイグレーションファイルを管理しています。
現在のマイグレーション：

| Version | ファイル | 内容 |
|---|---|---|
| `20260910031210` | `create_inquiry_queue` | 初期テーブル作成 |
| `20260914001500` | `add_sender_columns.sql` | `sender_id`・`sender_name` カラム追加（Slack 表示改善・PR #11） |

### 適用済みマイグレーションの確認

Supabase MCP を使う場合：

```bash
# MCP 経由（Claude Code から）
mcp__supabase__list_migrations
```

または Supabase Dashboard の SQL Editor で以下を実行：

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

### 新規マイグレーションの追加手順

```bash
# 1. supabase/migrations/ 配下に新規 SQL ファイルを作成（命名：YYYYMMDDHHMMSS_description.sql）
# 例：supabase/migrations/20261001120000_add_priority_column.sql

# 2. Supabase MCP でリモート DB に適用（Claude Code 環境）
#    mcp__supabase__apply_migration
#      name: "add_priority_column"
#      query: "ALTER TABLE inquiry_queue ADD COLUMN priority integer;"

# 3. 適用済み一覧で反映を確認
```

> ⚠️ **カラム追加は NULL 可**にすると既存行への影響なし。NOT NULL 追加は必ずデフォルト値を指定してください。

---



## 4. LINE Webhook URL 本番登録



### STEP 1｜Webhook URL を設定する

```
① https://developers.line.biz を開く
② 対象のチャネルを選択
③ 「Messaging API 設定」タブを開く
④ 「Webhook URL」欄に以下を入力する

https://YOUR-PROJECT.vercel.app/api/webhooks/line

⑤ 「更新」をクリック
⑥ 「Webhook の利用」を「オン」に切り替える
⑦ 「検証」ボタンをクリック → 「成功」が表示されることを確認する
```

> ⚠️ 検証で「失敗」が出た場合は 8. トラブルシューティング → 「401 が返る」を参照。



### STEP 2｜応答メッセージをオフにする

```
同じ「Messaging API 設定」ページ
→ 「応答メッセージ」→「オフ」に切り替える

理由：応答メッセージがオンだと、受信したメッセージに自動返信してしまう。
```

---



## 5. Gmail OAuth 本番設定



### STEP 1｜本番リダイレクト URI を追加する

```
① https://console.cloud.google.com を開く
② 対象プロジェクトを選択
③ 「APIとサービス」→「認証情報」を開く
④ 対象の OAuth 2.0 クライアント ID をクリック
⑤ 「承認済みのリダイレクト URI」に以下を追加する

https://YOUR-PROJECT.vercel.app/api/auth/callback/google

⑥ 「保存」をクリック
```



### STEP 2｜Refresh Token を取得する（本番用）

「

1. 環境変数の投入手順 > Gmail OAuth > GMAIL_REFRESH_TOKEN の取得手順」を参照。



### STEP 3｜監視対象 Gmail の設定を確認する

```
ポーリング方式（Cron で定期取得）のため、以下を確認する：
① システムが読み取る Gmail アカウントでログインしている OAuth であること
② Gmail API が Google Cloud プロジェクトで有効になっていること（初期セットアップで設定済み）
```

---



## 6. Gmail ラベル・振り分けルール作成



### STEP 1｜ラベル「multichannel-inbox」を作成する

```
① 監視対象の Gmail アカウントで https://mail.google.com を開く
② 左サイドバーの「ラベル」→「新しいラベルを作成」
③ ラベル名：multichannel-inbox
④ 「作成」をクリック
```



### STEP 2｜振り分けフィルタを設定する（任意・推奨）

問い合わせフォームからのメールだけを取り込みたい場合は振り分けルールを設定する。

```
① Gmail の設定（歯車アイコン）→「すべての設定を表示」
② 「フィルタとブロック中のアドレス」タブ
③ 「新しいフィルタを作成」をクリック
④ 「From」に問い合わせフォームの送信元メールアドレスを入力
   例：noreply@example.com
⑤ 「フィルタを作成」→「ラベルを付ける」→「multichannel-inbox」を選択
⑥ 「フィルタを作成」をクリック
```

> ⚠️ ラベルを付けないメールも `lib/gmailPoller.ts` で `INBOX` ラベル全体をポーリングする。
> 振り分けルールは「特定メールだけ処理したい」場合の追加設定。

---



## 7. デプロイ後の疎通確認

以下の順序で確認する。

### 確認 1｜ビルド・デプロイが成功しているか

```
Vercel ダッシュボード → Deployments
→ 最新のデプロイに「Ready」と表示されていることを確認する
→ 「Failed」の場合はビルドログをクリックしてエラーを確認する
```



### 確認 2｜LINE テストメッセージを送る

```
① LINE で公式アカウントにテストメッセージを送る
   例：「賃貸物件について聞きたいです」

② Vercel ダッシュボード → プロジェクト → 「Logs」タブを確認する
   → 「LINE webhook received」のログが出ていれば Webhook 受信成功

③ Supabase ダッシュボード → Table Editor → inquiry_queue
   → レコードが 1 件追加されていることを確認する（status='pending'）
```



### 確認 3｜Cron の手動発火

**⚠️ 本プロジェクトは GitHub Actions Cron を採用しています**（Vercel Hobby プランの Cron 制約回避のため PR #5/#6 で移行）。
Vercel の Cron Jobs タブは使用しません。

```bash
# ① エンドポイント疎通確認（401 が返れば生きている）
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR-PROJECT.vercel.app/api/cron/classify
# → 401 期待（Bearer 認証なしのため）

# ② GitHub Actions Cron の手動発火（GitHub CLI 必要）
gh workflow run cron.yml

# ③ 実行結果の確認
gh run list --workflow=cron.yml --limit=1
gh run view <RUN_ID> --log 2>&1 | grep -E "notified|failed|deferred"
```

**期待されるレスポンス（成功時）：**
```json
{"ok":true,"total":N,"notified":N,"failed":0,"deferred":0,"gmail":{"processed":0,"errors":0,"skipped":0}}
```

- `deferred > 0` が続く場合は **Gemini quota 到達**（section 8 参照）
- `failed > 0` は Slack 投稿失敗（section 8 参照）



### 確認 4｜Slack への投稿確認

```
Cron 発火後（約 1 分以内）に Slack の各チャネルを確認する
→ テストメッセージが分類されて投稿されていれば成功

投稿されない場合は「8. トラブルシューティング → Slack 投稿されない」を参照。
```



### 確認 5｜SLA テスト（クレーム → 5 分以内 LINE Push）

```
① LINE で公式アカウントに以下を送信する
   「クレームです。対応してください。」

② 5 分以内に営業部長の個人 LINE に通知が届くことを確認する

③ Supabase の inquiry_queue で is_urgent=TRUE のレコードが作成されていることを確認する

⑤ もし通知が来ない場合は「8. トラブルシューティング → LINE Push が届かない」を参照。
```

---



## 8. トラブルシューティング



### Cron が動かない

**症状：** 1 分経っても pending レコードが notified にならない。

確認手順：

```
1. Vercel ダッシュボード → 「Settings」→「Cron Jobs」タブを開く
   → Cron が登録されているか確認する（2件：classify と gmail）
   → Vercel Hobby プランは Cron 2件まで。2件以内であることを確認する

2. 「Run」ボタンで手動発火し、Logs タブでエラーを確認する

3. よくある原因：
   - CRON_SECRET が未設定 → 401 エラーが出る
   - SUPABASE_SERVICE_ROLE_KEY が未設定 → DB 接続エラーが出る
   - GEMINI_API_KEY が未設定 → 分類エラーが出る
```



### 401 が返る（LINE Webhook 検証失敗）

**症状：** LINE Developers の「検証」で「失敗」が出る。

確認手順：

```
1. LINE_CHANNEL_SECRET の値が正しいか確認する
   → LINE Developers > チャネル基本設定 > チャネルシークレット と一致しているか

2. Vercel の環境変数を設定後に再デプロイしているか確認する
   → 環境変数を追加しただけでは反映されない。Redeploy が必要

3. Vercel Logs に署名検証の 401 ログが出ているか確認する
```



### Slack に投稿されない

**症状：** Cron は動いているが Slack にメッセージが来ない。

確認手順：

```
1. SLACK_BOT_TOKEN が正しいか確認する（xoxb- で始まるか）

2. Bot がチャネルに招待されているか確認する
   → チャネルを開いて /invite @multichannel-notify-bot を実行する
   → 「already_in_channel」が出れば招待済み

3. SLACK_CHANNEL_* の ID が正しいか確認する
   → Slack でチャネル名をクリック > 一番下の「チャネルID」と一致しているか

4. Vercel Logs で postToSlack のエラーを確認する
```



### LINE Push が届かない（緊急通知）

**症状：** クレームメッセージを送っても営業部長 LINE に通知が来ない。

確認手順：

```
1. LINE_MANAGER_USER_ID が正しいか確認する
   → 「U」で始まる 33文字の文字列

2. LINE_CHANNEL_ACCESS_TOKEN が有効か確認する
   → LINE Developers でトークンを再発行して再設定する

3. 営業部長が LINE 公式アカウントをブロックしていないか確認する

4. Vercel Logs で handleUrgent のエラーを確認する
```

**期待される LINE Push フォーマット（PR #10/#11 適用後）：**

```
🚨 クレーム検出
送信元：LINE｜送信者：山田太郎さん

エアコンが効きません。至急対応してください。苦情です。
```

- 「送信者」名が「不明」と表示される → LINE Profile API のタイムアウト（3 秒）に到達した可能性。連続する場合は Vercel Logs に `[getLineDisplayName]` エラーが出ていないか確認
- Slack 側投稿失敗時のみ **⚠️ Slack通知が停止中です**（PR #12 で日本語アラートに改善）というアラートが同じ LINE に届く。原因と対応が本文に書かれているのでそのまま従う



### Gmail のメールが取り込まれない

**症状：** Gmail にメールが届いているが inquiry_queue に保存されない。

確認手順：

```
1. GMAIL_REFRESH_TOKEN が有効か確認する
   → 以下のコマンドで Access Token が取得できるか確認する

curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "refresh_token=YOUR_REFRESH_TOKEN" \
  -d "grant_type=refresh_token"

   → "access_token" が返れば有効
   → エラーが返る場合は再度 OAuth フローを実行して Refresh Token を取得し直す

2. Gmail 取り込みは `/api/cron/classify` に統合されている（PR #5）
   → gh run view で pollGmailInbox の実行結果を確認する

3. Gmail API が Google Cloud プロジェクトで有効になっているか確認する

4. 対象 Gmail の受信箱に「multichannel-inbox」ラベル付き未読メールがあるか確認する
   → ラベルは Gmail 上で作成し、振り分けルールで自動付与する（section 6 参照）
```

---



### Vercel 環境変数を変更したのに反映されない（env キャッシュ問題）

**症状：** Vercel Dashboard で env を更新して Save したが、Function は古い値を使い続けている。

**原因：** Vercel Serverless Function は **ウォームコンテナが env を保持し続ける**。新しい env は次のコールドスタート時にしか読み込まれない。

**対処：**

```bash
# 方法1（推奨）：CLI から強制再デプロイでコールドスタートを起こす
vercel --prod --yes

# 方法2：Vercel Dashboard の Deployments → 最新デプロイ → Redeploy
```

> ⚠️ Slack 障害復旧テスト（SLACK_BOT_TOKEN 一時無効化）で判明した挙動。単純な env 保存だけでは Function に反映されない。

---



### Windows 環境で `vercel env add` に値をパイプすると壊れる（CRLF 問題）

**症状：** `.env.local` から grep して値を pipe で `vercel env add` に流したのに、Vercel に保存された値で API 認証が通らない。

**原因：** Windows の `.env.local` は改行が **CRLF (`\r\n`)**。`tr -d '\n'` では `\r` が残り、Vercel に「値 + `\r`」で保存される。トークンが 1 文字ズレて認証失敗する。

**対処：**

```bash
# ❌ 悪い例（\r が残る）
grep "^SLACK_BOT_TOKEN=" .env.local | cut -d= -f2- | tr -d '\n' | vercel env add SLACK_BOT_TOKEN production

# ✅ 良い例（\r\n 両方を除去）
grep "^SLACK_BOT_TOKEN=" .env.local | cut -d= -f2- | tr -d '\r\n' | vercel env add SLACK_BOT_TOKEN production
```

> ⚠️ Slack 障害復旧テストのトークン復元中に検出。復元後の Cron で Slack 投稿が失敗し続けたのが症状。

---



### Gemini API が deferred（transient エラー）を返し続ける

**症状：** Cron 発火のたびに `deferred: N, notified: 0` が続く。

**原因：**

1. **無料枠 RPD 到達**：`gemini-flash-latest` の 1 日リクエスト上限（現時点 250 RPD）を消費した
2. **一時的サーバー障害**：Gemini 側の HTTP 5xx / 429

**対処：**

```bash
# 1. 直前の Gemini 呼び出し状況を確認
gh run view <RUN_ID> --log 2>&1 | grep -E "GeminiApiError|transient|deferred"

# 2. RPD が原因の場合：
#    翌 UTC 00:00（JST 09:00）に quota リセット → 自動的に notified に流れる
#    急ぐ場合は AI Studio > API Key で新規キー発行 or 有料プランへ切り替え

# 3. 一時的 5xx の場合：
#    PR #8 で追加した transient retry ロジックにより pending 保持されるので放置で復旧
#    連続する場合は https://status.cloud.google.com/ で障害情報確認
```

**PR #8 の設計思想：** transient エラーは `deferred` 扱いで pending 保持 → 次 Cron で再試行。
permanent エラー（4xx 認証・モデル 404 など）のみ `status='failed'` に固定。

---



### Vercel デプロイ完了直後の Webhook が失敗する

**症状：** PR マージ直後（30〜60 秒以内）に LINE Webhook を送ると Function が応答しない or 500。

**原因：** Vercel は PR マージ → 新デプロイビルド開始。ビルド中のわずかな時間、canonical URL が新デプロイに切り替わる途中で瞬断が発生することがある。

**対処：**

- 動作確認は **デプロイ完了 30〜60 秒後** に実施する
- 確認方法：
  ```bash
  vercel ls --limit=1   # 最新デプロイの Status が Ready であること
  ```

> ⚠️ 本番リリース時の実測：PR マージ直後の LINE 送信は反映されず、約 15 分後の再送で正常受信した実績あり。

---



## 9. APIキーローテーション手順

**APIキーが漏洩した疑いがある場合の緊急対応手順：**

### 即座に行うこと（漏洩確認後 30 分以内）

```
1. 漏洩したキーを即時無効化する
   - LINE：LINE Developers > チャネルアクセストークン > 「発行」（古いトークンが無効化される）
   - Slack：Slack App > OAuth & Permissions > トークンを「Revoke」
   - Gemini：Google AI Studio > APIキー > 「Delete」
   - Supabase service_role：Supabase > Settings > API > 「Rotate」
   - Gmail OAuth：Google Cloud Console > 認証情報 > クライアントを「削除」して再作成

2. 新しいキーを発行する（各サービスの管理画面）

3. Vercel の環境変数を新しいキーに更新する
   Vercel ダッシュボード → Settings → Environment Variables → 値を上書き → Save

4. Vercel で Redeploy する（環境変数の変更を反映させる）

5. 動作確認する（7. デプロイ後の疎通確認 を実施）
```

---



## 10. 触ると壊れる箇所

このシステムには「見た目には無害でも、変更すると連鎖的に壊れる箇所」がいくつかあります。
AI エージェントや新規開発者が触る前に必ず読むべき詳細ドキュメントは **`AGENTS.md`** に集約しています。

### `AGENTS.md` を必ず読むべきタイミング

- LINE Webhook・Gmail Poller・Cron の実装を変更するとき
- `lib/supabase.ts` の Supabase クライアント生成ロジックを触るとき
- `handleUrgent` の緊急パス処理・冪等性ハンドリング（`23505`）を変更するとき
- `postToSlack` のリトライロジック・アラート通知経路を変更するとき
- Vercel の env 変数を CLI から一括投入するスクリプトを書くとき
- Gemini API モデルバージョンを固定値に変えたいとき

### この手順書との使い分け

| ドキュメント | 対象 | 内容 |
|---|---|---|
| `manual-developer.md`（本ファイル）| 引き継ぎ開発者・運用担当者 | セットアップ・デプロイ・環境変数・トラブルシュート |
| `AGENTS.md` | AI エージェント / 新規開発者 | **触ると壊れる箇所**・設計意図・過去に発生した障害と対処 |
| `docs/manual-operator.md` | 営業部長・現場スタッフ（非エンジニア）| Slack の使い方・緊急通知の意味・トラブル判断 |

---

