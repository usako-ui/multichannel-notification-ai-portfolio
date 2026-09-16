# AGENTS.md

AI コーディングエージェント向けの作業ルールです。人が読む資料は
[`docs/manual-operator.md`](docs/manual-operator.md)（運用マニュアル）と
[`docs/manual-developer.md`](docs/manual-developer.md)（開発者向け手順書）にあります。

このファイルは **「引き継いだ AI が最初に読む 1 枚」** として置いています。
Claude Code の場合は、起動後に次のように指示すれば読み込めます。

```
AGENTS.md と docs/manual-developer.md を読んで、現状を把握してから作業してください。
```

---

## このプロジェクトは何か

不動産管理会社向けのマルチチャネル通知システム。
Gmail・LINE 公式に届いた問い合わせを Slack へ自動集約し、
**Gemini API で 5 カテゴリに自動分類してチャネルへ振り分ける**。
クレーム検出時は営業部長の個人 LINE へ **5 分以内**に緊急通知する。

| レイヤー | 技術 |
|---|---|
| フレームワーク | Next.js 14（App Router） |
| DB | Supabase（PostgreSQL・RLS 有効） |
| AI | Gemini API（`gemini-flash-latest` エイリアス推奨・**バージョン固定は EOL リスク**） |
| Webhook 受信 | Vercel Functions |
| 定期実行 | **GitHub Actions Cron**（`.github/workflows/cron.yml`・PR #5/#6 で Vercel Cron から移行） |
| 通知 | Slack Web API・LINE Messaging API |
| デプロイ | Vercel（Git 連携・自動デプロイ有効） |
| 言語 | TypeScript（`any` 禁止） |

**本番 URL：** https://multichannel-notification-ai-dev.vercel.app/
**リポジトリ：** https://github.com/usako-ui/multichannel-notification-ai-portfolio

---

## 作業を始める前に読むもの

| 目的 | ファイル |
|---|---|
| まず動かす・全体像をつかむ | `docs/manual-developer.md` |
| 機能要件・DB スキーマ・受入条件 | `requirements.md` |
| AI 分類の検証シナリオと期待値 | `docs/case5-test-inquiries.csv`（テスト 22 件） |
| 環境変数の一覧 | `.env.example`（キー名）+ `docs/manual-developer.md`（用途・取得先） |

**⚠️ 本ファイル下部の「触ると壊れる箇所」は変更前に必ず読むこと。**

---

## 絶対に守ること

これを破ると、動いているように見えて壊れる。

### セキュリティ

- **Webhook は必ず署名検証を実装する。** LINE の HMAC-SHA256 検証をスキップしない
  - 署名検証なしで処理すると、外部から偽リクエストを投げて Slack・LINE を誤動作させられる
- **`external_id` には必ず UNIQUE 制約を維持する。** 削除・変更しない
  - Webhook はリトライがあるため UNIQUE がないと重複通知が発生する
- **API キーをコード・GitHub に書かない。** 環境変数のみで管理する
  - `NEXT_PUBLIC_` を付けない（付けた瞬間ブラウザに配信される）
  - `NEXT_PUBLIC_` は Supabase の URL と ANON_KEY のみに限定
- **緊急通知パス（`handleUrgent`）を Cron 経由に変更しない**
  - Cron は数分〜数十分の遅延があり得るため、SLA 5 分以内を超えるリスクがある
  - Webhook 内で同期呼び出しする現在の構造を維持する

### 設計

- AI 分類は `lib/classifyWithGemini.ts` に閉じる。他のファイルから直接 Gemini API を呼ばない
- 緊急キーワードは `requirements.md` / `lib/urgentDetection.ts` の正規表現定義を参照する。独自に変更しない
- Cron の 1 回あたりの取得件数は 20 件上限を維持する（レート制限・コスト超過防止）
- **transient エラー（5xx / 429 / タイムアウト）は `deferred` で pending 保持**（PR #8）
- permanent エラーのみ `status='failed'` にして再処理しない（無限ループ防止）

### コード

- `any` 型を使わない
- コメントは日本語で「なぜそうしたか」を書く
- エラーハンドリングを省略しない（try-catch・フォールバック必須）

---

## システムのデータフロー

![システム全体構成図](docs/screenshots/system-architecture.svg)

<details>
<summary>Mermaid フローチャート（テキスト検索可能な等価図）</summary>

```mermaid
flowchart LR
    Src["Gmail / LINE 公式"]
    VF["Vercel Functions<br/>webhooks/line, gmailPoller"]
    Judge{"緊急判定<br/>urgentDetection.ts"}
    HU["handleUrgent()<br/>Cron 非経由 / SLA 5 分"]
    DB[("Supabase<br/>inquiry_queue")]
    Cron["Cron classify<br/>*/5 min + push:main"]
    Gemini["Gemini API<br/>gemini-flash-latest"]
    Notif["Slack + LINE Push<br/>送信元 / 送信者名付き"]

    Src --> VF
    VF --> Judge
    Judge -->|クレーム系| HU
    Judge -->|通常| DB
    DB -->|status=pending| Cron
    Cron --> Gemini
    Gemini -->|status=notified| DB
    HU -->|is_urgent=TRUE| DB
    HU --> Notif
    Gemini --> Notif

    classDef urgent fill:#fee5e5,stroke:#e53e3e,color:#000
    class HU urgent
```

</details>

- **緊急パス（赤）：** handleUrgent は Cron を経由せず Webhook 内で同期実行。SLA 5 分厳守。
- **通常パス：** Supabase pending → Cron → Gemini 分類 → Slack 投稿 → status=notified。
- **共通末端：** Slack + LINE Push は `送信元：LINE/Gmail｜送信者：XXX さん` フォーマット。

---

## 5 カテゴリ定義

| カテゴリ | 判定基準 | Slack チャネル | 環境変数 |
|---|---|---|---|
| 賃貸 | 賃貸物件への問い合わせ | `#賃貸` | `SLACK_CHANNEL_RENTAL` |
| 売買 | 購入・売却・査定 | `#売買` | `SLACK_CHANNEL_SALE` |
| 内見 | 内見・見学の日程調整 | `#内見` | `SLACK_CHANNEL_VIEWING` |
| クレーム | クレームかどうか迷う場合も含む（安全側） | `#クレーム緊急` | `SLACK_CHANNEL_COMPLAINT` |
| 要確認・その他 | 判断できないもの・迷惑メール等 | `#要確認` | `SLACK_CHANNEL_OTHER` |

### 緊急キーワード（正規表現・`lib/urgentDetection.ts`）
```typescript
const URGENT_PATTERN = /クレームです|苦情|至急|緊急対応|怒り/;
```
> ⚠️ **「緊急」単体は含めない**（「緊急ではありません」の誤検知防止・実機テストで検証済み）

---

## 環境の注意

- **Vercel Hobby プランの制約：** 定期 Cron は 1 日 1 回まで。**GitHub Actions に外部化して回避**（PR #5/#6）
- **Supabase 無料プランの制約：** 1 週間非活動でプロジェクトが一時停止する。週 1 回以上操作すること
- **LINE 無料プランの制約：** Push Message は月 200 通まで。クレームは月 75 件想定で範囲内
- **Gemini API 無料枠：** RPD 250 リクエスト/日・15 RPM。実測で 1 セッションのテスト連投で枯渇した実績あり

> 📌 **模擬案件クライアント想定との差分について**
>
> 元となる模擬案件の提案書では **Vercel 有料プラン（Pro）** を想定しており、その場合は Vercel Cron が実質無制限に使えるため `/api/cron/classify` は Vercel Cron のみでシンプルに構成できます。
> 本ポートフォリオ実装は **個人の無料開発環境（Vercel Hobby）** で構築する制約上、GitHub Actions Cron へ外部化しています。実運用時（有料プラン移行時）は `.github/workflows/cron.yml` を削除し `vercel.json` に `crons` を追加するだけで切り戻し可能で、アプリコードの変更は不要です。SLA 5 分厳守のクレーム経路は Webhook / Pub/Sub Push 側で処理されるため、Cron 構成差の影響は受けません。

---

## 触ると壊れる箇所

**このセクションは本番リリースフェーズで判明した「変更すると連鎖的に壊れる箇所」を集約したものです。**
変更前に必ず読み、影響範囲を理解してから作業してください。

### 1. Next.js の fetch キャッシュ問題（`lib/supabase.ts`）

**症状：** Cron が pending 行を DB 更新後も「0 件」と返し続ける。同じ SELECT を別 endpoint で実行すると 1 件返る。

**原因：** `export const dynamic = "force-dynamic"` は Route Handler のプリレンダリング挙動を制御するだけで、**Supabase JS 内部の `fetch` は Next.js のデフォルトキャッシュに引っかかる**。

**対策：** `lib/supabase.ts` の `supabaseAdmin` で `global.fetch` を差し替え、すべての Supabase リクエストに `cache: "no-store"` を強制する。

```typescript
// lib/supabase.ts（正しい実装・シングルトン + fetch キャッシュ回避）
let cachedAdminClient: SupabaseClient | null = null;

export function supabaseAdmin() {
  if (cachedAdminClient) return cachedAdminClient;
  cachedAdminClient = createClient(url, serviceRoleKey, {
    // ⚠️ この global.fetch 差し替えを絶対に削除・簡略化しないこと（Cron 全体が壊れる）。
    // シングルトンでキャッシュしても差し替えは createClient 時に固定されるため
    // cache:"no-store" 挙動は維持される。
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cachedAdminClient;
}
```

> ⚠️ **絶対に触ってはいけないコード：** 上記の `global.fetch` 差し替え部分。削除・簡略化すると Cron 全体が壊れる。
> **PR #7 で導入・本番リリース時の障害で長時間デバッグの末に判明した根本原因。**
> シングルトン化（PR #3・portfolio 側）は 1 Function インスタンス内で `createClient` を毎回実行するコストを削減する目的で追加されたが、`global.fetch` 差し替え契約は温存されている。

---

### 2. Windows CRLF 問題（Vercel CLI で env を投入するとき）

**症状：** `.env.local` から値を grep で取り出して `vercel env add` に pipe すると、Vercel に保存された値で API 認証が通らない。

**原因：** Windows の `.env.local` は改行が **CRLF (`\r\n`)**。`tr -d '\n'` では `\r` が残り、Vercel に「値 + `\r`」で保存される。トークンが 1 文字ズレて認証失敗する。

**対策：** **必ず `tr -d '\r\n'` を使う**（`\r` と `\n` 両方を除去）。

```bash
# ❌ 悪い例（\r が残る・Slack 障害復旧テストで復元失敗の原因になった）
grep "^SLACK_BOT_TOKEN=" .env.local | cut -d= -f2- | tr -d '\n' | vercel env add SLACK_BOT_TOKEN production

# ✅ 良い例
grep "^SLACK_BOT_TOKEN=" .env.local | cut -d= -f2- | tr -d '\r\n' | vercel env add SLACK_BOT_TOKEN production
```

> ⚠️ **絶対に触ってはいけない箇所：** env 投入スクリプトを書くとき、Windows 開発環境を想定する。macOS/Linux 用と差別化する必要がある。

---

### 3. Gemini EOL 問題（`lib/classifyWithGemini.ts`）

**症状：** ある日から Gemini 呼び出しが全件 404 で失敗し始める。

**原因：** Gemini モデルの **具体的バージョン（例：`gemini-2.5-flash`）は EOL（End Of Life）**で提供終了される。新規ユーザーからのアクセスは即 404 を返す（既存ユーザー継続の場合もある）。

**対策：** **必ずエイリアス `gemini-flash-latest` を使う**。Google が管理する最新安定 flash モデルへ自動追随される。

```typescript
// lib/classifyWithGemini.ts（正しい実装）
const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
```

```bash
# .env / Vercel env（推奨）
# GEMINI_MODEL 未設定またはコメントアウト
# → コード内デフォルト gemini-flash-latest が使われる
```

> ⚠️ **絶対にやってはいけない：** `GEMINI_MODEL=gemini-2.5-flash` のようにバージョン固定する。
> **PR #7 で対応・本番リリース時の障害で発覚。**

---

### 4. Vercel env 変数キャッシュ（変更後は必ず Redeploy 必須）

**症状：** Vercel Dashboard で env を更新して Save したが、Function は古い値を使い続けている。

**原因：** Vercel Serverless Function は **ウォームコンテナが env を保持し続ける**。新しい env は次のコールドスタート時にしか読み込まれない。

**対策：** env 変更後は必ず以下のどちらかを実行する。

```bash
# 方法1（推奨・CLI）
vercel --prod --yes

# 方法2（Vercel Dashboard）
Deployments → 最新デプロイ → 「⋯」→ Redeploy
```

> ⚠️ **忘れがち：** 「保存したから反映されているはず」と思い込むと、後続のテストで謎のエラーが延々続く。
> **Slack 障害復旧テストで検出**。

---

### 5. GitHub Actions schedule 遅延（`.github/workflows/cron.yml`）

**症状：** `cron: "*/5 * * * *"` と書いてあるのに、5 分毎に発火しない。数時間〜半日発火しないことがある。

**原因：** GitHub Actions の `schedule` トリガーは **リポジトリが非アクティブ時に大幅遅延する既知の挙動**。GitHub 公式ドキュメントにも「高負荷時に schedule はスキップされることがある」と明記されている。

**対策：** **`push: main` トリガーを併設する**（PR #9 で追加済み）。

```yaml
# .github/workflows/cron.yml（現状の実装）
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:      # 手動発火
  push:                   # main へのマージで自動発火
    branches:
      - main
```

**運用時の意味：**
- 通常時：`push: main` トリガーで PR マージのたびに 1 回発火
- 手動確認したいとき：`gh workflow run cron.yml` で明示発火
- schedule は「あわよくば」で頼らない

> ⚠️ **絶対にやってはいけない：** `push` トリガーを外して schedule だけに戻す。緊急通知は即時 Webhook 経由なので影響しないが、通常パスの Slack 投稿が数時間遅延する。

---

### 6. LINE Webhook のリトライと冪等性（`handleUrgent.ts:57-59`）

**症状：** 同じクレームが Slack に複数投稿される・LINE Push が複数回営業部長に届く。

**原因の可能性：** LINE Webhook のリトライ挙動と、`23505 unique_violation` の握りつぶし忘れ。

**対策：** すべての INSERT パスで `23505` を **early return** する（重複時は Slack 投稿・LINE Push もスキップ）。

```typescript
// lib/handleUrgent.ts（正しい実装）
const { error } = await supabase.from("inquiry_queue").insert({ ... });
if (error) {
  if (error.code === "23505") return; // 重複＝正常系・即 return
  throw new Error(`緊急パス INSERT 失敗: ${error.message}`);
}
// この行以降で Slack 投稿と LINE Push を実行
```

> ⚠️ **触ってはいけない箇所：** early `return` を削除すると、Webhook リトライのたびに Slack + LINE に重複通知が飛ぶ。冪等性テストで検証済み。

---

### 7. `docs/manual-developer.md` セクション 8 のトラブルシュート

同じ症状が再発したときに参照する。**上記 1〜6 は開発者向けにも解説あり**：

- Vercel env キャッシュ問題 → §8「Vercel 環境変数を変更したのに反映されない」
- Windows CRLF 問題 → §8「Windows 環境で vercel env add に値をパイプすると壊れる」
- Gemini quota → §8「Gemini API が deferred を返し続ける」
- デプロイ待ちタイミング → §8「Vercel デプロイ完了直後の Webhook が失敗する」

---

### 8. Gmail Pub/Sub Push の設計制約（`app/api/webhooks/gmail-push/route.ts` + `lib/gmailPoller.ts`）

**症状：** Gmail クレームが管理者 LINE に届かない・Watch が期限切れで Push が止まる・同じメールで通知が二重に飛ぶ。

**背景：** 2026-09-16 の PR #7 で Gmail クレームの SLA 5 分以内を確実に達成するため Pub/Sub Push を追加。GitHub Actions schedule が数時間 skip される事象が実測されたのが導入動機。

**設計上の絶対ルール：**

- **`gmail-push/route.ts` は `pollGmailInbox()` を再利用する。** `isUrgent` / `handleUrgent` / `supabaseAdmin` を独自に呼び直さない。
  重複実装すると片方だけロジック改修されて挙動がズレる（例：緊急判定を二段階化した PR #6 の修正が Push 側に反映されない等）。
- **Gmail Watch は 7 日で期限切れ。** `ensureGmailWatch()` が毎 Cron 実行時に「残り 24h 以下」で `users.watch` を自動再登録する。手動で止めない・キャッシュ変数（`cachedWatchExpiration`）を勝手に書き換えない。
- **`GMAIL_PUSH_SECRET` は 2 箇所で完全一致させる：**
  1. Vercel の環境変数 `GMAIL_PUSH_SECRET`
  2. GCP Pub/Sub サブスクリプションの Push エンドポイント URL の `?token=...`
  どちらか片方だけ変更すると即座に 401 Unauthorized で Push が全滅する（`crypto.timingSafeEqual` で 1 文字も違わずに一致していないと通らない）。
- **Push エンドポイントの URL は `/api/webhooks/gmail-push`（`?token=` クエリで認証）。** OIDC ではない・Authorization ヘッダは Google 側が勝手に付けるが本エンドポイントは無視する設計。
- **`historyId` はアプリで管理しない。** 重複配信は `external_id` UNIQUE 制約（23505）で吸収される。Supabase に Watch state 用テーブルを追加すると設計が複雑化するのでやらない。

**触ってはいけない：**
- `pollGmailInbox()` を経由せずに Push route から直接 `handleUrgent()` を呼ぶような「効率化」リファクタ（緊急判定・重複吸収・ラベル残置の各設計がすべて壊れる）
- Watch 期限のキャッシュを永続化するために新テーブルを足すこと（設計判断でインメモリのみに決めた・PR #7 の設計書参照）

> **PR #7 で導入・実機検証で Gmail クレーム SLA が 60 秒未満に短縮できた実績あり。**

---

### 9. GitHub Actions Cron のトリガー設計（`.github/workflows/cron.yml`）

**症状：** PR マージ直後に Cron が発火して古いコードを叩く・schedule が数時間発火しない・Cron が全く動かない。

**背景：**
- 2026-09-15 に schedule 遅延（4 時間ノー発火）が実測された
- 過去 PR #9 で「schedule の保険」として `push: main` トリガーを追加したが、Day8 分析で「merge の 5 秒後に発火するが Vercel デプロイは 30〜90 秒かかる → 旧コードを叩くだけ」と判明
- PR #7 で Gmail クレームも Cron 非依存になり、Cron の即時性要求そのものが消えた
- 上記を受けて **PR #8 で `push: main` トリガーを削除**した

**現状のトリガー：**
```yaml
on:
  workflow_dispatch:    # 手動発火（正規手段）
  schedule:
    - cron: "*/5 * * * *"  # ベストエフォート（遅延あり）
```

**運用ルール：**
- **通常運用：** schedule に任せる（数時間 skip されても Gmail クレームは Pub/Sub Push・LINE クレームは Webhook で処理されるため SLA 影響なし）
- **手動発火が必要な場面：** `gh workflow run cron.yml` または GitHub Actions UI から明示発火する
  - PR マージ後の実機テスト
  - schedule が長時間止まっていると気付いたとき
  - Gemini quota リセット後の deferred 消化を急ぎたいとき

**絶対にやってはいけない：**
- `push: main` トリガーを「気軽に」再追加する（PR #8 で削除した根拠を無効化するなら、事前に「Vercel デプロイ完了を待つ step」も同時に追加すること）
- schedule の間隔を 1 分毎などに短縮する（GitHub Actions の quota 消費が増えるだけで実効遅延は変わらない）

> **PR #8 で削除・詳細な削除理由は cron.yml のヘッダコメント参照。**

---

### 10. 緊急判定の二段階設計（`lib/urgentDetection.ts`）

**症状：** 「クレームではありません」が誤って緊急パスに流れて管理者 LINE に誤送信される・逆に「クレームとして正式に申し入れます」が拾われずに通常キューに流れる。

**背景：**
- 初期実装では `URGENT_PATTERN = /クレームです|苦情|至急|緊急対応|怒り/` のみだった
- 「クレームとして申し入れます」を拾うために `クレーム` 単体を追加すると「クレームではありません」まで誤検知した
- PR #6 で **URGENT + NEGATION の二段階判定** に刷新して両立させた

**現状の設計（触るときの前提）：**

```typescript
// lib/urgentDetection.ts
export const URGENT_PATTERN = /クレーム|苦情|至急|緊急対応|怒り/;
const NEGATION_PATTERN = /(?:クレーム|苦情|至急|怒り).{0,15}(?:では(?:あり)?ま?せん|じゃ(?:あり)?ま?せん|ではない|じゃない)/;

export function isUrgent(content: string): boolean {
  if (!URGENT_PATTERN.test(content)) return false;
  if (NEGATION_PATTERN.test(content)) return false;
  return true;
}
```

- 拾い漏らさない（URGENT を広めに）→ 誤検知は NEGATION で除外という順番
- 「クレームとして」→ 緊急判定 ✅（URGENT に一致・NEGATION に不一致）
- 「クレームではありません」→ 通常判定 ✅（URGENT に一致するが NEGATION でも一致するため除外）
- 「緊急」単体は URGENT_PATTERN に **含めない**（「これは緊急ではありません」を通常パスに流すため・NEGATION で除外しきれないので）

**触るときの必須手順：**
- `URGENT_PATTERN` / `NEGATION_PATTERN` を変更したら **CSV テスト 22 件（`docs/case5-test-inquiries.csv`）で回帰確認必須**
- 特に境界例：No.19（クレーム系）・No.20（クレーム系）・No.21（無関係な話題）・No.22（「これは緊急ではありません」＝通常パス期待）
- CSV でテストできない新パターンを想定する場合は仮想テストケースを `node -e` で書き足してから変更する

**触ってはいけない：**
- 「緊急」単体を URGENT_PATTERN に追加する（No.22 が壊れる）
- NEGATION_PATTERN の距離 `.{0,15}` を短くする（「クレームだと思うがそうではない」等の長めの否定文が拾えなくなる）
- 件名を渡さずに本文だけで判定する（Gmail の場合は必ず `【件名】{subject}\n{body}` 形式で結合してから渡す・`lib/gmailPoller.ts` 参照）

> **PR #6 で導入・CSV 4 件 + 仮想 7 件の 11 テストで全 PASS 確認済み。**

---

## 環境変数

`.env.example` にキー名の一覧があります（全 18 件）。値は引き渡し元に確認してください。
詳細は `docs/manual-developer.md` の「3. 環境変数の投入手順」を参照。

---

## リポジトリに含まれないもの

| 必要なもの | 用途と代替手段 |
|---|---|
| **環境変数の実値** | 起動に必須。キー名は `.env.example` にある。値は管理者に確認する |
| **Slack Bot Token** | Slack App 設定から再発行できる |
| **LINE Channel Secret / Access Token** | LINE Developers から確認・再発行できる |
| **Gemini API キー** | Google AI Studio から再発行できる（無料） |

> 上記が揃わなくても、コードの変更・型チェック・Lint・ビルドは実行できる。
> **「ファイルが無い」で止まらず、できるところまで進めて、何が無くて何ができなかったかを報告すること。**

---

## 作業の進め方

1. **変更前に、何をどう変えるかを説明する。** いきなり書き換えない
2. 影響範囲を確認する（特に「絶対に守ること」「触ると壊れる箇所」に触れるか）
3. 実装する
4. 型チェック・ビルドを通す

```bash
npx tsc --noEmit      # 型チェック
npx next build        # ビルド確認（型検証含む）
# ※ npx next lint は本プロジェクトで未設定
```

5. 動作を確認する。確認できていないことを「できた」と書かない
6. 変更を PR にする。1 PR で 1 目的（トピックを混ぜない）

---

## API キーローテーション手順

キーが漏洩した場合の対応手順は `docs/manual-developer.md` §9「APIキーローテーション手順」を参照してください。
各サービスのキー再発行後、Vercel の環境変数を更新 → **必ず Redeploy**（触ると壊れる箇所 #4 参照）してください。
