# requirements.md
# マルチチャネル通知システム｜機能要件・受入条件

---

## 機能要件一覧

| ID | 機能名 | 説明 | 優先度 | Phase | 受入条件 |
|---|---|---|---|---|---|
| F-01 | DB キュー設計 | `inquiry_queue` テーブルの作成 | 高 | MVP | AC-001 |
| F-02 | LINE Webhook 受信 | LINE 公式の問い合わせを受信して DB に保存 | 高 | MVP | AC-002・AC-003 |
| F-03 | Gmail 取り込み（Poller 方式） | Gmail API を OAuth2 でポーリングしラベル `multichannel-inbox` 付き未読を DB 保存（Cron 経由・Bearer 認証） | 高 | MVP | AC-002・AC-004 |
| F-04 | Gemini API 分類 | 5 カテゴリへの自動分類 | 高 | MVP | AC-005・AC-006・AC-007 |
| F-05 | Slack 自動振り分け | カテゴリ別 Slack チャネルへ自動投稿 | 高 | MVP | AC-008 |
| F-06 | GitHub Actions Cron | 5 分ごとのキュー消化処理（`main` push でも発火） | 高 | MVP | AC-009 |
| F-07 | 緊急通知パス | クレーム検出時の即時 LINE Push | 高 | MVP | AC-010・AC-011 |
| F-08 | 冪等性保証 | 同じメッセージの重複処理防止 | 高 | MVP | AC-003 |
| F-09 | 監視 SQL | Supabase で未処理・失敗件数を確認 | 中 | MVP | AC-012 |
| F-10 | デモ版（BYOK） | Gemini API キーを入力して分類体験 | 中 | デモ | AC-013 |
| F-11 | LP | ポートフォリオ用ランディングページ | 中 | デモ | AC-014 |
| F-12 | Gmail Pub/Sub Push | Gmail の新着メールを Pub/Sub 経由で数秒で検知（GitHub Actions schedule 遅延の影響を受けずクレーム SLA 5 分厳守を確実化） | 高 | MVP | AC-015 |
| F-13 | Gemini API 予算監視 | 月間トークン使用量が予算の 80% 到達時に営業部長 LINE Push でアラート | 中 | MVP | 非機能要件表 |

---

## DB スキーマ

```sql
-- 受信した問い合わせのキュー
CREATE TABLE inquiry_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT        NOT NULL,           -- 'gmail' / 'line'
  external_id   TEXT        UNIQUE,             -- 各APIのMessageId ★UNIQUE制約必須
  raw_content   TEXT        NOT NULL,           -- 受信した本文（全文保存）
  category      TEXT,                           -- 分類後のカテゴリ名（分類前はNULL）
  is_urgent     BOOLEAN     DEFAULT FALSE,      -- 緊急フラグ（TRUE=緊急パス経由）
  status        TEXT        DEFAULT 'pending',  -- pending → classified → notified / failed
  classified_at TIMESTAMPTZ,                    -- 分類完了時刻
  notified_at   TIMESTAMPTZ,                    -- 通知完了時刻
  created_at    TIMESTAMPTZ DEFAULT NOW()       -- 受信時刻
);

CREATE INDEX idx_inquiry_status ON inquiry_queue(status, created_at);
```

### カラム設計の意図

| カラム | 設計の理由 |
|---|---|
| `external_id TEXT UNIQUE` | Webhook はリトライされる。UNIQUE 制約がないと同じメッセージを 2 回処理して重複通知が発生する（R-07） |
| `is_urgent BOOLEAN` | 緊急パス経由のレコードを後から識別するために保存する |
| `status` | `pending`（未処理）→ `classified`（分類済）→ `notified`（通知済）/ `failed`（失敗）の遷移で処理状態を管理する |
| `classified_at` / `notified_at` | SLA 達成率の計測・遅延の検知に使用する |

---

## AI 分類の 5 カテゴリ定義

| カテゴリ | 判定基準 | 送り先 |
|---|---|---|
| 賃貸 | 賃貸物件への問い合わせ全般 | Slack `#賃貸` |
| 売買 | 購入・売却・査定への問い合わせ | Slack `#売買` |
| 内見 | 内見・見学の日程調整 | Slack `#内見` |
| クレーム | **クレームかどうか迷う場合も含む（安全側に倒す）** | Slack `#クレーム緊急`（記録用）＋ 営業部長 LINE Push（メイン通知）|
| 要確認・その他 | カテゴリが判断できないもの・迷惑メール・営業メール等 | Slack `#要確認` |

### 緊急キーワード（即時パス判定・正規表現）

```typescript
// Webhook 受信時に即時判定する正規表現
const URGENT_PATTERN = /クレームです|苦情|至急|緊急対応|怒り/;
```

> **「緊急」単体は含めない。**
> No.22「退去時の敷金精算について教えてください。これは**緊急ではありません**。」
> → 「緊急」が含まれていても通常パスに流れることを確認すること（AC-007）。

### Gemini API 分類プロンプトの核心

```
以下の不動産会社への問い合わせを1つのカテゴリに分類してください。

カテゴリ：賃貸 / 売買 / 内見 / クレーム / 要確認・その他

判定ルール：
- クレームかどうか迷う場合は「クレーム」を選ぶ（安全側に倒す）
- カテゴリが判断できないもの・迷惑メール等は「要確認・その他」を選ぶ

【問い合わせ】{rawContent}

カテゴリ名のみを返してください（説明不要）。
```

---

## 環境変数一覧

| キー名 | 用途 | 取得場所 | 公開範囲 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 接続 URL | Supabase ダッシュボード | ブラウザ可 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名キー | Supabase ダッシュボード | ブラウザ可 |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー側 DB 操作 | Supabase ダッシュボード | **サーバー専用** |
| `LINE_CHANNEL_SECRET` | LINE Webhook 署名検証 | LINE Developers | **サーバー専用** |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Push API | LINE Developers | **サーバー専用** |
| `LINE_MANAGER_USER_ID` | 営業部長の個人 LINE ID | LINE Developers で確認 | **サーバー専用** |
| `GMAIL_CLIENT_ID` | Gmail OAuth 認証 | Google Cloud Console | **サーバー専用** |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth 認証 | Google Cloud Console | **サーバー専用** |
| `GMAIL_REFRESH_TOKEN` | Gmail アクセストークン更新 | OAuth フロー実行後 | **サーバー専用** |
| `SLACK_BOT_TOKEN` | Slack チャネルへの投稿 | Slack App 設定 | **サーバー専用** |
| `SLACK_CHANNEL_RENTAL` | 賃貸チャネル ID | Slack 管理画面 | **サーバー専用** |
| `SLACK_CHANNEL_SALE` | 売買チャネル ID | Slack 管理画面 | **サーバー専用** |
| `SLACK_CHANNEL_VIEWING` | 内見チャネル ID | Slack 管理画面 | **サーバー専用** |
| `SLACK_CHANNEL_COMPLAINT` | クレームチャネル ID | Slack 管理画面 | **サーバー専用** |
| `SLACK_CHANNEL_OTHER` | 要確認チャネル ID | Slack 管理画面 | **サーバー専用** |
| `GEMINI_API_KEY` | Gemini API 分類 | Google AI Studio | **サーバー専用** |
| `GEMINI_MODEL` | 使用モデル名（切替用・任意）| - | **サーバー専用** |
| `GEMINI_MONTHLY_TOKEN_LIMIT` | 月間トークン予算（80% 到達で LINE アラート）| - | **サーバー専用** |
| `CRON_SECRET` | `/api/cron/classify` の Bearer 認証（GitHub Actions Cron 保護）| 任意生成（`openssl rand -hex 32`）| **サーバー専用** |
| `GOOGLE_CLOUD_PROJECT_ID` | Gmail Pub/Sub Push の GCP プロジェクト ID | GCP コンソール | **サーバー専用** |
| `PUBSUB_TOPIC_NAME` | Gmail Watch が publish する Pub/Sub トピック名 | GCP コンソール | **サーバー専用** |
| `GMAIL_PUSH_SECRET` | `/api/webhooks/gmail-push` の共有シークレット（GCP subscription URL の `?token=` と一致）| 任意生成（`openssl rand -hex 32`）| **サーバー専用** |

> **`NEXT_PUBLIC_` を付けてよいのは Supabase の URL・ANON_KEY のみ。**
> 他の環境変数に `NEXT_PUBLIC_` を付けると API キーがブラウザに配信される。

---

## 受入条件（AC）

> **「提案書に書いた内容＝実装時に守る約束」**を運用品質の指針とする。
> 「正常に動く」だけでなく「失敗させたときに設計通り動くか」まで確認すること。

---

### AC-001｜DB テーブル・冪等性

**機能：** `inquiry_queue` テーブルの作成・UNIQUE 制約の動作確認

| # | 確認内容 | 確認方法 | 期待結果 |
|---|---|---|---|
| 1 | テーブルが正しく作成されている | Supabase ダッシュボードで目視確認 | 全カラム・型が定義通り |
| 2 | `external_id` に UNIQUE 制約が設定されている | 同じ `external_id` を 2 回 INSERT する | 2 回目は UNIQUE 制約エラーが発生する |
| 3 | `idx_inquiry_status` インデックスが作成されている | Supabase ダッシュボードで確認 | インデックスが存在する |

---

### AC-002｜Webhook 署名検証 / Cron Bearer 認証

**機能：** LINE Webhook の署名検証（R-16 対策）と Gmail 取り込み経路の認証

> **📝 実装方針の変更（実装フェーズ中の判断・2026-09-16 に再更新）：**
>
> 当初：Google Cloud Pub/Sub による Push Webhook を候補としつつ、MVP 期間短縮のため
> **Vercel Function (Gmail Poller) が Gmail API を Bearer OAuth2 でポーリングする方式**を採用。
> Poller は `/api/cron/classify` から呼び出される（Cron は `CRON_SECRET` の Bearer 認証で保護）。
>
> **2026-09-16 追加：** GitHub Actions schedule の実測遅延（4 時間ノー発火の事例あり）で
> Gmail クレーム経路の SLA 5 分違反が発生し得ることが判明したため、
> **Poller は残しつつ Gmail Pub/Sub Push（`/api/webhooks/gmail-push`）を追加**した。
> Push は SLA-critical パスとして即時性を担保し、Poller は Push 失敗時のフォールバックとして機能する。
> Push エンドポイントは `?token=` クエリの `GMAIL_PUSH_SECRET` 共有シークレット認証で保護（AC-015 で詳細定義）。
>
> AC-002 #3・#4 は引き続き Cron エンドポイントの Bearer 認証を対象とし、
> Push の認証は AC-015 で別建てで扱う。

| # | 確認内容 | 確認方法 | 期待結果 |
|---|---|---|---|
| 1 | 正規の LINE リクエストが処理される | テストメッセージを LINE から送信 | DB に保存される |
| 2 | **不正な署名のリクエストが 401 を返す** | `x-line-signature` を改ざんして送信 | `401 Unauthorized` が返る |
| 3 | Gmail Poller が正しくラベル付きメールを取得する | ラベル `multichannel-inbox` 付き未読メールを送信 | DB に保存され Slack に投稿される |
| 4 | **Cron エンドポイントが Bearer 認証なしで 401 を返す** | `Authorization` ヘッダなしで `/api/cron/classify` を叩く | `401 Unauthorized` が返る |

> LINE 署名検証・Cron Bearer 認証は必ず本番デプロイ前に実機で確認すること（ローカルのモックでは不十分）。

---

### AC-003｜冪等性（重複処理防止）

**機能：** 同じメッセージの 2 回処理防止（R-07 対策）

| # | 確認内容 | 確認方法 | 期待結果 |
|---|---|---|---|
| 1 | 同じ `external_id` のメッセージを 2 回送信する | 同一 LINE メッセージを再送 | 2 回目は DB INSERT が失敗し、Slack に重複投稿されない |
| 2 | Webhook リトライ時に重複処理されない | 同じペイロードを 2 回 POST する | 1 件のみ処理される |

---

### AC-004｜LINE・Gmail からの受信

**機能：** メッセージ受信・DB 保存

| # | 確認内容 | 確認方法 | 期待結果 |
|---|---|---|---|
| 1 | LINE のテキストメッセージが DB に保存される | LINE からテキストを送信 | `inquiry_queue` に `channel='line'`・`status='pending'` で保存される |
| 2 | Gmail のメールが DB に保存される（Poller 経由） | ラベル `multichannel-inbox` 付きメールを Gmail 側で受信 → Cron 発火 | `inquiry_queue` に `channel='gmail'`・`status='pending'` で保存される |
| 3 | テキスト以外のイベント（スタンプ等）は無視される | LINE でスタンプを送信 | DB に保存されない |

---

### AC-005｜AI 分類精度（通常カテゴリ）

**機能：** テスト CSV 22 件での分類精度確認

| テスト No. | 問い合わせ本文（抜粋） | 期待カテゴリ | 確認項目 |
|---|---|---|---|
| No.1〜10 | 「駅近の1LDKを探しています」等 | 賃貸 | Slack `#賃貸` に投稿される |
| No.11〜14 | 「中古マンションの購入を検討」等 | 売買 | Slack `#売買` に投稿される |
| No.15〜18 | 「週末に内見をお願いできますか」等 | 内見 | Slack `#内見` に投稿される |
| No.19〜20 | 「エアコンが効きません。至急。苦情です」等 | クレーム | 緊急パス経由・LINE Push 届く |

---

### AC-006｜AI 分類精度（ノイズ耐性）

**機能：** 無関係なメッセージを正しく「要確認・その他」に分類する（R-06 対策）

| テスト No. | 問い合わせ本文 | 期待カテゴリ | 確認項目 |
|---|---|---|---|
| No.21 | 「今日の天気はどうですか？」 | 要確認・その他 | 賃貸・売買・内見・クレームのいずれにも**誤分類しない** |

> **余計な反応をしないか**が運用品質を分ける。

---

### AC-007｜緊急キーワード誤検知防止

**機能：** 「緊急」単体の誤検知防止（No.22 境界線テスト）

| テスト No. | 問い合わせ本文 | 期待カテゴリ | 確認項目 |
|---|---|---|---|
| No.22 | 「退去時の敷金精算について教えてください。これは**緊急ではありません**。」 | 賃貸 | 緊急パスに**流れない**。通常パスで `#賃貸` に投稿される |

---

### AC-008｜Slack 自動振り分け

**機能：** カテゴリ別 Slack チャネルへの正確な振り分け

| # | 確認内容 | 期待結果 |
|---|---|---|
| 1 | 賃貸カテゴリが `#賃貸` に投稿される | 他のチャネルには投稿されない |
| 2 | 売買カテゴリが `#売買` に投稿される | 他のチャネルには投稿されない |
| 3 | 内見カテゴリが `#内見` に投稿される | 他のチャネルには投稿されない |
| 4 | クレームカテゴリが `#クレーム緊急` に投稿される | 緊急パス経由・LINE Push も届く |
| 5 | 要確認が `#要確認` に投稿される | 担当者が目視確認できる状態 |

---

### AC-009｜GitHub Actions Cron 動作

**機能：** 5 分ごとのキュー消化処理（Vercel Hobby プランの Cron 1 日 1 回制約を回避するため GitHub Actions 側で `schedule: */5 * * * *` を実行。加えて `main` への push でも発火し、GitHub Actions の schedule 遅延をカバーする）

| # | 確認内容 | 期待結果 |
|---|---|---|
| 1 | `pending` レコードが 5 分以内に処理される（GitHub Actions schedule 実行時） | `status` が `notified` に更新される |
| 2 | 1 回の処理は最大 20 件に制限されている | 21 件以上ある場合は次の Cron で処理される |
| 3 | **Slack 投稿が失敗した場合は `failed` になる** | `failed` ステータスで保存され、次の Cron で再処理されない |
| 4 | **Gemini transient エラーは `pending` のまま保持される**（PR #8） | 次の Cron 周期で再試行され `deferred` としてカウントされる |

> ⚠️ GitHub Actions の schedule はリポジトリ非アクティブ時に数時間〜数日遅延する既知の挙動がある（GitHub 公式ドキュメント記載）。`main` push トリガーを併設して PR マージ都度発火するように冗長化している（`.github/workflows/cron.yml`）。
> **緊急通知（SLA 5 分以内）は Webhook 内で同期実行されるため Cron 遅延の影響を受けない。** Cron 遅延は Gmail 通常経路の Slack 投稿タイミングにのみ影響する。

> 📌 **提案書とポートフォリオ実装の前提差分：**
> 提案書ではクライアントが **Vercel 有料プラン（Pro）** を契約する前提で見積もっており、その場合は Vercel Cron のみで 5 分毎の実行が可能です。ポートフォリオ実装は開発者側の個人 Vercel Hobby 環境で動作させる制約から GitHub Actions Cron へ外部化しています。
> **実運用（クライアント本番環境）への移行手順：** `.github/workflows/cron.yml` を削除し `vercel.json` に `crons` 設定を追加するだけで Vercel Cron に切り戻せます。アプリコードの変更は不要です。

---

### AC-010｜緊急通知パス（SLA 5 分以内）

**機能：** クレーム検出時の即時 LINE Push（R-10・R-12 対策）

| # | 確認内容 | 確認方法 | 期待結果 |
|---|---|---|---|
| 1 | クレームキーワードを含むメッセージが緊急パスに流れる | 「苦情です」「至急」等を含むメッセージを送信 | Cron を待たずに即時処理される |
| 2 | **Webhook 受信から 5 分以内に LINE Push が届く** | 送信時刻と受信時刻を記録して差分を確認 | 5 分以内（SLA 目標値） |
| 3 | `is_urgent=TRUE` で DB に保存される | Supabase で確認 | `status='classified'`・`is_urgent=TRUE` |
| 4 | Slack `#クレーム緊急` にも投稿される | Slack チャネルを確認 | 🚨 マーク付きで投稿される |

---

### AC-011｜Slack 失敗時の再送・アラート

**機能：** 「Slack 送信失敗時は最大 3 回再送」（提案書記載内容の検証・R-11 対策）

| # | 確認内容 | 確認方法 | 期待結果 |
|---|---|---|---|
| 1 | **Slack 投稿が失敗したときに自動再送される** | Slack Bot Token を一時的に無効化して送信 | 最大 3 回まで自動再送が実行される |
| 2 | 3 回失敗した場合に **営業部長の個人 LINE Push** で通知される | 3 回連続失敗させる | 営業部長 LINE に障害アラートが届く（Slack は使用しない） |

> 「Slack を失敗させたら本当に再送されるか」まで確認すること（設計時の重要要件）。

---

### AC-012｜監視 SQL

**機能：** Supabase で未処理・失敗件数を確認（R-09・R-15 対策）

```sql
-- 直近 24 時間の処理状況を一発で確認
SELECT status, COUNT(*)
FROM inquiry_queue
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

| # | 確認内容 | 期待結果 |
|---|---|---|
| 1 | SQL が正しく件数を返す | `pending`・`notified`・`failed` の件数が表示される |
| 2 | `failed` 件数が増加していないかを定期確認できる | 5 件以上の場合はアラートを検討 |

---

### AC-013｜デモ版（BYOK 分類体験）

**機能：** Gemini API キーを入力して実際に分類を体験できる（Supabase・LINE・Slack 不要）

| # | 確認内容 | 期待結果 |
|---|---|---|
| 1 | Supabase・LINE・Slack なしで動作する | 外部サービスへの接続エラーが出ない |
| 2 | Gemini API キーを入力後にテキストを送ると 5 カテゴリに分類される | 分類結果が画面に表示される |
| 3 | サンプル質問ボタンが用意されている | 賃貸・売買・内見・クレーム・その他の例文を 1 クリックで入力できる |
| 4 | デモ版であることが明記されている | 「本番ではこのカテゴリが Slack #XXX に投稿されます」等の説明がある |
| 5 | 入力した API キーはサーバーに保存されない | プライバシーポリシーまたは画面上で明記する |

---

### AC-014｜LP（ランディングページ）

**機能：** ポートフォリオ用ランディングページ

| # | 確認内容 | 期待結果 |
|---|---|---|
| 1 | システム概要が非エンジニアにも分かる説明になっている | 技術用語を使わずに価値を説明している |
| 2 | デモへの導線が分かりやすい | 「試してみる」等のボタンからデモページへ遷移できる |
| 3 | 技術スタックが表示されている | 使用技術の一覧が確認できる |
| 4 | 模擬案件であることが明記されている | 「架空の不動産管理会社を想定した模擬案件」等の説明がある |

---

### AC-015｜Gmail Pub/Sub Push 動作（SLA 5 分厳守の即時経路）

**機能：** Gmail クレーム検知の SLA 5 分以内を保証するための Pub/Sub Push 受信（F-12・GitHub Actions schedule 遅延の影響を受けない即時経路）

| # | 確認内容 | 確認方法 | 期待結果 |
|---|---|---|---|
| 1 | `?token=` クエリが `GMAIL_PUSH_SECRET` と一致しないリクエストが 401 を返す | 誤った token 付きで POST | `401 Unauthorized`（`crypto.timingSafeEqual` で定数時間比較） |
| 2 | Push 受信で `pollGmailInbox()` が同期実行され、緊急検知時 `handleUrgent` が呼ばれる | ラベル `multichannel-inbox` 付きクレームメールを送信 | 数秒以内に営業部長個人 LINE Push が到達（実測 60 秒以内） |
| 3 | Push 受信で通常メールが inquiry_queue に `status='pending'` で保存される | ラベル付き通常メールを送信 | 数秒以内に Supabase に INSERT され、次 Cron で分類される |
| 4 | 同じメールで Push が複数配信されても Slack/LINE 通知が重複しない | 同じ historyId で 2 回配信（GCP コンソールから手動再配信）| `external_id` UNIQUE 制約（23505）で 2 通目は握りつぶされる |
| 5 | Gmail Watch 期限が残り 24h 以下になったら `ensureGmailWatch()` が自動再登録する | Cron を発火 → Vercel ログの `gmailWatch.renewed` を確認 | 期限内なら `renewed: false, reason: "残り Xh"`・24h 以下なら `renewed: true` |
| 6 | Push endpoint は 障害時でも 200 を返す（Pub/Sub のリトライ抑止）| pollGmailInbox が throw する状況で Push 受信 | `200 OK` + `pollError` にエラーメッセージ・Pub/Sub は再送しない |

> **設計の要：** Push が壊れても Cron（`/api/cron/classify`）が Gmail Watch を維持し続けるフォールバック構造（AGENTS.md「触ると壊れる箇所」§8 参照）。
> **認証方式：** OIDC ではなく共有シークレット方式（GCP 追加設定不要・依存ライブラリ追加なし・攻撃面が小さい）。詳細は AGENTS.md §8。

---

## 非機能要件

| 項目 | 要件 | 根拠 |
|---|---|---|
| SLA | クレーム検出から LINE Push まで 5 分以内 | 提案書記載・クライアント合意済み |
| API コスト監視 | Gemini API の月間トークン使用量が予算の 80% 到達時に営業部長 LINE Push で通知 | Cron 実行時に使用量を確認して閾値超過時に通知 |
| 冪等性 | 同じ `external_id` を 2 回処理しない | UNIQUE 制約による保証（R-07） |
| セキュリティ | 全 Webhook で署名検証を実装 | 偽リクエスト対策（R-16） |
| コスト | 月額 3,000〜3,300 円以内（実運用時） | 提案書記載 |
| 可用性 | **提案書ではクライアント側 Vercel 有料プラン（Pro）契約前提**。ポートフォリオ実装は開発者側 Hobby プランで代替構成（Cron は 1 日 1 回まで・**GitHub Actions Cron に外部化して回避**） | 詳細は AC-009 の補足を参照 |

---

## スコープ

### 含むもの（In Scope）

- Gmail の問い合わせ自動受信・Slack 転送
- LINE 公式の問い合わせ自動受信・Slack 転送
- Gemini API による 5 カテゴリ自動分類
- Slack カテゴリ別チャネル自動振り分け
- クレーム検出時の営業部長個人 LINE 緊急通知（SLA 5 分以内）
- Slack 失敗時の最大 3 回自動再送
- システム停止・エラー検知時の営業部長 LINE Push（Slack チャネルは使用しない）
- API 料金 80% 到達時の営業部長 LINE 通知
- 問い合わせの DB 記録（Supabase）
- 監視用 Supabase SQL クエリ
- デモ版 LP（BYOK・Supabase 不要で動作）

### 含まないもの（Out of Scope / Phase 2 以降）

- 電話の自動化（録音→テキスト変換）→ Phase 2
- 対応状況管理画面（未対応/対応中/完了）→ Phase 2
- 過去問い合わせの全文検索 → Phase 2
- SLA レポート自動生成 → Phase 2
- 営業担当の自動アサイン → Phase 2

---

## 設計決定ログ

| 決定事項 | 採用した方針 | 採用理由 |
|---|---|---|
| 緊急パスの設計 | Cron を経由しない。Webhook 受信と同じ関数内で即時処理 | GitHub Actions Cron は 5 分間隔かつ schedule 遅延の可能性があり、SLA 5 分厳守を保証できない（R-10）|
| 定期実行の実装 | Vercel Cron → GitHub Actions Cron（5 分・当初は push:main 併用）→ 2026-09-16 に push:main トリガーを削除して schedule + workflow_dispatch の 2 段構えへ簡素化 | Hobby プランの Cron 1 日 1 回制約回避。push:main は Vercel デプロイ完了前に発火して旧コードを叩く問題があり、かつ PR #7 で SLA-critical パスが Cron 非依存化したため削除（詳細は `.github/workflows/cron.yml` ヘッダコメント）|
| Gmail 取り込み | 当初 Poller のみ → 2026-09-16 に **Pub/Sub Push 併用** へ発展。Push が SLA-critical パス・Poller が Push 失敗時のフォールバック | GitHub Actions schedule 遅延（4 時間ノー発火の実測あり）で Gmail クレームの SLA 5 分違反が起こり得るため、Pub/Sub Push で即時性を担保（F-12・AC-015）|
| 緊急キーワード | URGENT_PATTERN `/クレーム\|苦情\|至急\|緊急対応\|怒り/` + NEGATION_PATTERN で否定形除外の 2 段階判定 | No.20「クレームとして」等の派生表現を拾いつつ、No.22「緊急ではありません」や仮想の「クレームではありません」等の否定形を除外する。「緊急」単体は含めない |
| クレームの境界線 | 迷った場合は「クレーム」に分類（安全側） | 見逃しのコストが誤検知のコストより大きい |
| Cron 上限 | 1 回あたり最大 20 件 | Gemini API のレート制限・コスト超過防止（R-13） |
| AI サービス | Gemini API（gemini-2.5-flash）・検証時は無料枠 | 検証コスト削減。実運用時に再評価する |
| 監視手段 | Supabase SQL のみ（APM ツールなし） | 月額予算 3,000 円以内に収める低コスト監視 |
| Git 管理外 | `.env.local` ほか内部作業ファイル | 内部実装指示・進行管理・API キーを公開リポジトリに含めない |
