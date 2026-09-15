# 提案書からの実装差分説明書

> **対象読者：** 提案書レビュー担当（講師）・引き継ぎ開発者
> **目的：** 提案時の技術構成から実装時に判断で変更した箇所と、その意思決定過程を残す
> **最終更新：** 2026-09-15

---

## 概要

MVP フェーズの実装中に、提案書時点の 2 つの技術構成を実運用制約に合わせて変更した。
いずれも SLA 5 分（クレーム緊急通知）と機能要件（AC-002〜AC-010）を維持することを条件に選定している。

| # | 変更対象 | 提案時 | 実装時 | 影響を受けた要件 |
|---|---|---|---|---|
| 1 | 定期実行基盤 | Vercel Cron（1 分ごと） | **GitHub Actions Cron**（5 分ごと + `main` push トリガー） | AC-009 |
| 2 | Gmail 取り込み方式 | Push Webhook（Google Cloud Pub/Sub） | **Cron 経由の Poller**（`lib/gmailPoller.ts` を Cron から呼び出し） | AC-002 #3・AC-004 #2 |

---

## 変更 1｜Vercel Cron → GitHub Actions Cron

### 背景・きっかけ

Vercel Hobby プラン（本案件の想定コスト枠）を再確認した際、Vercel Cron の制約が提案時の想定と異なることが判明した。

| 項目 | 提案時の想定 | 実際の制約（2026-09 時点） |
|---|---|---|
| 実行頻度 | 1 分ごと（Cron Job 1 件） | **各 Cron ジョブは 1 日 1 回まで**（Hobby プラン） |
| 対応方法 | 有料プラン（Pro）にアップグレード | Pro プランは月額 $20/席で予算超過（月額 3,000〜3,300 円想定） |

### 選択肢と評価

| 案 | 実現方法 | コスト | SLA 影響 | 採用可否 |
|---|---|---|---|---|
| A | Vercel Pro プランへアップグレード | $20/席・月 → 予算超過 | なし | ❌ 予算超過 |
| B | 外部 Cron サービス（cron-job.org 等） | 無料あり・SLA 不明 | 外部サービス障害時に停止 | ❌ 依存増加 |
| C | **GitHub Actions Cron（5 分間隔）** | GitHub 無料枠内 | Cron 遅延あり・**緊急パスには非影響** | ✅ 採用 |

### 採用理由

- **無料枠内で完結**：Public リポジトリは GitHub Actions 無料枠が実質無制限
- **既に GitHub を利用**：追加サービスへの依存が増えない
- **緊急パス（SLA 5 分）はそもそも Cron 非経由**：LINE Webhook 内で `handleUrgent()` を同期実行する設計（`lib/handleUrgent.ts`）のため、Cron の実行間隔は SLA に影響しない

### SLA・要件への影響と対策

| 項目 | 提案時 | 実装後 | 対策 |
|---|---|---|---|
| クレーム SLA | 5 分以内（AC-010） | **維持** | 緊急パスは Cron を経由しないため無影響 |
| 通常経路の Slack 投稿タイミング | 1 分以内 | **5 分以内**（GitHub schedule 実行時） | AC-009 の期待値を「5 分以内」に更新 |
| GitHub schedule の遅延問題 | 想定外 | 数時間〜数日発火しないことがある（GitHub 公式挙動） | **`push: main` トリガーを併設**して PR マージのたびに発火（実質的な発火保証）+ `workflow_dispatch`（手動発火） |
| Cron 実行の可観測性 | Vercel Cron Jobs タブ | GitHub Actions の run ログ（`gh run view` で確認） | `docs/manual-developer.md` §8 に切替手順を明記 |

### 関連ファイル

- `.github/workflows/cron.yml`：GitHub Actions ワークフロー定義（PR #5・#6 で導入・PR #9 で `push:main` トリガー追加）
- `app/api/cron/classify/route.ts`：Cron の実処理（Bearer 認証で `CRON_SECRET` を検証）
- `docs/manual-developer.md` §7 確認 3・§8「Cron が動かない」：運用手順

---

## 変更 2｜Gmail Push Webhook → Cron Poller

### 背景・きっかけ

提案時は Gmail の新着メール即時受信のために **Google Cloud Pub/Sub の Push Webhook** を想定していた。実装フェーズで以下の追加コストが判明した。

| 追加で必要になるもの | 提案時 | 実装時に判明したコスト |
|---|---|---|
| Google Cloud プロジェクトの Pub/Sub トピック | 想定内 | **サービスアカウント作成 + IAM 権限設定 + OIDC トークン認証**が必要 |
| Vercel Function 側の Webhook 受信 | 想定内 | OIDC 検証ライブラリの導入（`google-auth-library`）+ 署名検証実装 |
| セットアップ手順の負荷 | 「Gmail の設定だけ」 | Google Cloud Console での Pub/Sub 有効化 + トピック作成 + サブスクリプション作成 + サービスアカウント作成 + Vercel Function URL 登録（**6 ステップ**） |

引き継ぎ先の運用担当が非エンジニアであることを踏まえ、セットアップの複雑さがコストに合わないと判断した。

### 選択肢と評価

| 案 | 実現方法 | 実装コスト | 運用コスト | 遅延 | 採用可否 |
|---|---|---|---|---|---|
| A | Pub/Sub Push Webhook（提案書通り） | 大（OIDC 実装 + Google Cloud 6 ステップ） | 中（サービスアカウント鍵の管理） | 即時（数秒） | ❌ 引き継ぎコスト過大 |
| B | **Gmail API ポーリング**（Cron 経由） | 小（`google-auth-library` の Refresh Token 更新のみ） | 小（Refresh Token だけ管理） | 5 分（GitHub Actions Cron 間隔と同じ） | ✅ 採用 |

### 採用理由

- **OAuth Refresh Token 1 本で運用可能**：`GMAIL_REFRESH_TOKEN` 環境変数のみ・サービスアカウント不要
- **既存 Cron に統合できる**：`app/api/cron/classify/route.ts` の pending 消化前に `pollGmailInbox()` を呼び出す形（新規エンドポイント不要）
- **ラベル `multichannel-inbox` の未読メールのみ取得**：担当外のメールを処理しない安全設計
- **Cron エンドポイントの Bearer 認証（`CRON_SECRET`）で保護**：Push Webhook の署名検証と同等のセキュリティ

### SLA・要件への影響と対策

| 項目 | 提案時 | 実装後 | 対策 |
|---|---|---|---|
| Gmail 通知の受信遅延 | 数秒（即時 Push） | **最大 5 分**（Cron 間隔） | クレーム緊急検知は LINE 経由（Push）で **SLA 5 分維持**。Gmail 経路は通常問い合わせのため運用上許容 |
| Gmail の Webhook 署名検証（AC-002 #3） | Pub/Sub OIDC 検証 | **Cron エンドポイントの Bearer 認証**に置換 | AC-002 の #3・#4 を「Gmail Webhook 直接受信」ではなく「Cron エンドポイントの Bearer 認証」として再定義（`requirements.md` AC-002 に明記） |
| Gmail 取り込みの冪等性（AC-004） | Message-Id で UNIQUE | **同様に Message-Id で UNIQUE**（`external_id`） | 変更なし。ポーリングでも同じメールが 2 回 INSERT されると `23505` で early return |
| 緊急メール検知（Gmail 経由） | Webhook 内で即時判定 | **Poller 内で判定** → 検知時は `handleUrgent()` を Cron 内で同期呼び出し | Gmail 経由の緊急検知は「Cron 発火から 5 分以内」だが、そもそも Gmail 経由クレームは想定外（クレーム系は LINE メイン）で許容 |

### 関連ファイル

- `lib/gmailPoller.ts`：Gmail API 呼び出しとラベル管理
- `app/api/cron/classify/route.ts`：`pollGmailInbox()` を Cron 内で呼び出す（Step 0）
- `docs/manual-developer.md` §5・§6：Gmail OAuth 設定・ラベル作成手順
- `requirements.md` AC-002・AC-004：再定義後の受入条件

---

## 全体まとめ｜提案書 vs 実装

| 提案書の約束 | 実装後の実態 | 提案書からの逸脱 |
|---|---|---|
| クレーム緊急通知 SLA 5 分以内 | ✅ **維持**（LINE Webhook 同期実行・実測 3 回連続 1 分未満） | なし |
| 通常問い合わせの Slack 投稿 | 5 分以内（Cron 間隔） | 提案時「1 分以内」→ 実装「5 分以内」に緩和 |
| Gmail 受信の即時性 | 最大 5 分（Cron 間隔） | 提案時「即時 Push」→ 実装「ポーリング」に変更 |
| 月額コスト 3,000〜3,300 円以内 | ✅ **維持**（Vercel Hobby + Supabase Free + GitHub Actions 無料枠） | なし |
| セキュリティ（署名検証） | LINE は HMAC-SHA256 検証・Gmail は Cron Bearer 認証に置換 | Gmail 部分の実現方法を変更 |
| 冪等性 | ✅ **維持**（`external_id` UNIQUE + `23505` early return） | なし |

### 逸脱の判断基準

**「SLA 5 分以内（クレーム）」と「月額コスト」は絶対条件として維持。それ以外の期待値は運用実態・引き継ぎコストとバランスして調整した。**

- 通常経路 1 分→5 分は「Slack 投稿の視認遅延」であり業務影響が限定的
- Gmail 即時→ポーリングは「非エンジニア引き継ぎでの Google Cloud Pub/Sub 運用負荷」を回避する現実解

---

## 参考リンク

- 実装完了時のリポジトリ状態：`AGENTS.md`
- 詳細な運用手順：`docs/manual-developer.md`
- 現場スタッフ向け使い方：`docs/manual-operator.md`
- 更新された受入条件：`requirements.md` AC-002・AC-009
