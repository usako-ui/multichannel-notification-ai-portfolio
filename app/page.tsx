import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Hash,
  Inbox,
  Layers,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Timer,
  Triangle,
  Workflow,
  Zap,
} from "lucide-react";
import BYOKDemo from "./_components/BYOKDemo";

/**
 * ランディングページ（T-34・ダーク SaaS テーマ・PR #15）
 *
 * デザイン方針：
 *  - Dark navy 背景 (#0F1629) + ビビッドブルー (#2563EB) + シアン (#06B6D4)
 *  - Split Hero（左：キャッチ + CTA、右：Slack + LINE Push HTML モックアップ）
 *  - カード glow エフェクト (shadow-glow)・radial gradient で光の演出
 *  - Inter フォント（next/font 経由・外部リクエストなし）
 *  - 絵文字ゼロ・Lucide React SVG アイコンで統一
 *  - モバイルファースト（PC 2 カラム → SP 1 カラム）
 *
 * セクション順序：
 *  Header → Hero → Challenge → Solution → Demo → Metrics → Tech → CTA → Footer
 */

const NAV = [
  { href: "#challenge", label: "課題" },
  { href: "#solution", label: "仕組み" },
  { href: "#demo", label: "デモ" },
  { href: "#tech", label: "技術" },
  { href: "#contact", label: "相談" },
];

const CHALLENGES = [
  {
    icon: Inbox,
    title: "受信トレイを毎日ハシゴ",
    body: "LINE 公式・Gmail を個別に確認。営業時間外の LINE が朝には他の連絡に埋もれて見落としが発生。",
  },
  {
    icon: Timer,
    title: "クレーム対応が半日遅れる",
    body: "「エアコンが効かない」等の緊急連絡を営業部長が気付くまで数時間。SLA 未達がクライアント満足度に直結。",
  },
  {
    icon: Workflow,
    title: "誰が対応中か分からない",
    body: "スタッフ間で「これ返信した？」の確認が発生。同じお客様に複数スタッフが返信して信頼を失う。",
  },
];

const SOLUTION_STEPS = [
  { icon: Inbox, label: "受信", note: "LINE / Gmail" },
  { icon: Bot, label: "AI 分析", note: "Gemini API" },
  { icon: LayoutGrid, label: "分類", note: "5 カテゴリ判定" },
  { icon: Bell, label: "通知", note: "Slack + LINE Push" },
];

const METRICS = [
  {
    icon: Timer,
    value: "5 分以内",
    label: "クレーム SLA",
    note: "Webhook 同期実行で秒オーダー達成",
  },
  {
    icon: Gauge,
    value: "100%",
    label: "AI 分類精度",
    note: "テスト 21 件を全件正解に分類",
  },
  {
    icon: Layers,
    value: "2 → 1",
    label: "受信トレイ統合",
    note: "LINE・Gmail の 2 経路を Slack へ集約",
  },
];

const TECH_STACK = [
  { name: "Next.js 14", role: "App Router / Vercel Functions" },
  { name: "TypeScript", role: "any 禁止 / 型安全設計" },
  { name: "Supabase", role: "PostgreSQL / 行レベルセキュリティ" },
  { name: "Gemini API", role: "5 カテゴリ自動分類" },
  { name: "GitHub Actions", role: "External Cron（5 分間隔）" },
  { name: "Vercel", role: "本番デプロイ / 自動 CI/CD" },
];

export default function HomePage(): JSX.Element {
  return (
    <div className="relative min-h-screen bg-brand-ink text-brand-text">
      {/* ─────────────────────── Header ─────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-brand-ink/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-bold text-white"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-primary to-brand-accent text-white shadow-glow-cyan">
              <Triangle
                className="h-4 w-4 rotate-90"
                strokeWidth={2.5}
                fill="currentColor"
              />
            </span>
            <span className="hidden sm:inline">MultiChannel Notify</span>
            <span className="sm:hidden">MC Notify</span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-sm font-medium text-brand-muted transition hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href="#demo"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-blue-500 hover:shadow-glow-strong"
          >
            デモを試す
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </a>
        </div>
      </header>

      {/* ─────────────────────── Hero ─────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Glow accents */}
        <div className="absolute inset-x-0 top-0 -z-10 h-[700px] bg-grad-hero" />
        <div className="absolute -top-32 right-[-10%] -z-10 h-96 w-96 rounded-full bg-brand-accent/20 blur-[120px]" />
        <div className="absolute top-40 left-[-10%] -z-10 h-96 w-96 rounded-full bg-brand-primary/25 blur-[120px]" />

        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-8">
            {/* Left: copy + CTA */}
            <div className="lg:col-span-5 lg:pt-8">
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-accent">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
                AI × マルチチャネル通知
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
                届いた問い合わせを、
                <br />
                <span className="bg-gradient-to-r from-brand-primary via-blue-400 to-brand-accent bg-clip-text text-transparent">
                  AI が整理し、
                </span>
                <br />
                <span className="bg-gradient-to-r from-brand-primary via-blue-400 to-brand-accent bg-clip-text text-transparent">
                  必要な人へ。
                </span>
              </h1>
              <p className="mt-6 text-base leading-relaxed text-brand-muted sm:text-lg">
                LINE 公式・Gmail の問い合わせを Slack に自動集約。Gemini が 5 カテゴリに分類し、クレームは営業部長の個人 LINE に <span className="font-semibold text-white">5 分以内</span>で通知します。
              </p>

              <ul className="mt-8 space-y-3">
                {[
                  "2 つの受信トレイを 1 つの Slack へ",
                  "AI 自動分類の精度 100%（実測 21/21）",
                  "クレームは 5 分以内 LINE Push で確実に届く",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-brand-accent"
                      strokeWidth={2}
                    />
                    <span className="text-sm text-brand-muted sm:text-base">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-7 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:bg-blue-500 hover:shadow-glow-strong sm:text-base"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2.5} />
                  デモを試す
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </a>
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10 sm:text-base"
                >
                  業務改善について相談する
                </a>
              </div>
            </div>

            {/* Right: Slack / LINE UI mockup */}
            <div className="relative lg:col-span-7">
              <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-brand-primary/20 to-brand-accent/10 blur-2xl" />
              <SlackLineMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────── Challenge ─────────────────────── */}
      <section id="challenge" className="relative border-t border-white/5 py-20 sm:py-28">
        <div className="absolute inset-0 -z-10 bg-grad-divider" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-accent">
              Challenge
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              現場で起きている、
              <br className="sm:hidden" />
              こんな困りごと。
            </h2>
            <p className="mt-4 text-base text-brand-muted sm:text-lg">
              問い合わせが複数チャネルに分散すると、見落とし・遅延・重複対応が発生します。
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {CHALLENGES.map((c, i) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.title}
                  className="group relative rounded-2xl border border-white/10 bg-brand-card p-7 transition hover:border-brand-primary/40 hover:shadow-glow"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-accent ring-1 ring-brand-primary/20">
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-muted">
                      Issue 0{i + 1}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white sm:text-xl">
                    {c.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-brand-muted">
                    {c.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────── Solution ─────────────────────── */}
      <section id="solution" className="relative border-t border-white/5 py-20 sm:py-28">
        <div className="absolute top-0 left-1/2 -z-10 h-96 w-[600px] -translate-x-1/2 rounded-full bg-brand-primary/15 blur-[100px]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-accent">
              Solution
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              受信 → 分析 → 分類 → 通知。
            </h2>
            <p className="mt-4 text-base text-brand-muted sm:text-lg">
              LINE / Gmail に届いた瞬間から、担当者への通知までワンストップで自動化。
            </p>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {SOLUTION_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="relative">
                  <div className="flex h-full flex-col items-center rounded-2xl border border-white/10 bg-brand-card p-6 text-center shadow-lg transition hover:border-brand-primary/40 hover:shadow-glow">
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-accent text-white shadow-glow-cyan">
                      <Icon className="h-6 w-6" strokeWidth={2} />
                    </span>
                    <p className="mt-4 font-mono text-xs font-semibold text-brand-muted">
                      STEP {i + 1}
                    </p>
                    <p className="mt-1 text-base font-bold text-white sm:text-lg">
                      {s.label}
                    </p>
                    <p className="mt-1 text-xs text-brand-muted">{s.note}</p>
                  </div>
                  {i < SOLUTION_STEPS.length - 1 && (
                    <ArrowRight
                      className="absolute right-[-14px] top-1/2 hidden h-6 w-6 -translate-y-1/2 text-brand-primary/60 lg:block"
                      strokeWidth={2}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-5 text-center">
            <p className="text-sm text-brand-muted sm:text-base">
              <span className="font-bold text-white">クレーム検出時のみ</span> Cron を経由せず Webhook 同期実行で即時 LINE Push を送信。
              <span className="text-brand-accent"> SLA 5 分</span>を厳守します。
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────────── Demo ─────────────────────── */}
      <section id="demo" className="relative border-t border-white/5 py-20 sm:py-28">
        <div className="absolute inset-x-0 top-0 -z-10 h-96 bg-grad-divider" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-5">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-accent">
                Try it now
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                AI 分類を、
                <br />
                <span className="bg-gradient-to-r from-brand-primary to-brand-accent bg-clip-text text-transparent">
                  ここで体験。
                </span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-brand-muted sm:text-lg">
                ご自身の Gemini API キーで、本番と同じロジック・同じプロンプトの分類を試せます。
              </p>

              <ul className="mt-8 space-y-4">
                {[
                  {
                    icon: Zap,
                    title: "本番と同じ実装",
                    body: "本番サーバーと全く同じ分類プロンプトを使用し、同じ 5 カテゴリで判定します。",
                  },
                  {
                    icon: ShieldCheck,
                    title: "サーバー保存なし",
                    body: "API キー・入力本文はブラウザから直接 Google に送信され、当サイトのサーバーは経由しません。",
                  },
                  {
                    icon: MessageSquare,
                    title: "サンプル 4 種類",
                    body: "賃貸・売買・内見・クレームのボタンで、実際のテストケースの本文が自動入力されます。",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex gap-4">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-brand-card text-brand-accent">
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm text-brand-muted">
                          {item.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="lg:col-span-7">
              <BYOKDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────── Metrics ─────────────────────── */}
      <section className="relative border-t border-white/5 py-20 sm:py-28">
        <div className="absolute top-0 left-1/2 -z-10 h-72 w-[600px] -translate-x-1/2 rounded-full bg-brand-accent/15 blur-[100px]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-accent">
              Impact
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              数字で見る、導入効果。
            </h2>
          </div>

          <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-3">
            {METRICS.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.label}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-brand-card p-8 shadow-lg transition hover:border-brand-accent/40 hover:shadow-glow-cyan"
                >
                  <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-brand-primary/10 blur-2xl" />
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-primary/20 to-brand-accent/20 text-brand-accent ring-1 ring-brand-primary/20">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <p className="mt-5 bg-gradient-to-r from-brand-primary to-brand-accent bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
                    {m.value}
                  </p>
                  <p className="mt-2 text-base font-bold text-white sm:text-lg">
                    {m.label}
                  </p>
                  <p className="mt-2 text-sm text-brand-muted">{m.note}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────── Tech Stack ─────────────────────── */}
      <section id="tech" className="relative border-t border-white/5 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-muted">
              Technical Overview
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              長期保守を見据えた、モダンな技術構成。
            </h2>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TECH_STACK.map((t) => (
              <div
                key={t.name}
                className="rounded-lg border border-white/10 bg-brand-card px-4 py-3 transition hover:border-brand-primary/40"
              >
                <p className="text-sm font-bold text-white">{t.name}</p>
                <p className="mt-0.5 text-xs text-brand-muted">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── Final CTA ─────────────────────── */}
      <section id="contact" className="relative overflow-hidden border-t border-white/5 py-20 sm:py-28">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-primary/20 via-brand-ink to-brand-accent/10" />
        <div className="absolute -top-20 left-1/2 -z-10 h-80 w-[700px] -translate-x-1/2 rounded-full bg-brand-primary/25 blur-[120px]" />

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-accent">
            Contact
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            業務の「ちょっと困った」を、
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-brand-primary to-brand-accent bg-clip-text text-transparent">
              仕組みで解決しませんか？
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-brand-muted sm:text-lg">
            個人事業主・小規模〜中規模事業者向けに、業務課題に合わせた
            AI 活用・システム開発の相談を承ります。
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="https://line.me/R/ti/p/@745jejoa"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-8 py-4 text-sm font-semibold text-white shadow-glow-strong transition hover:bg-blue-500 sm:w-auto sm:text-base"
            >
              <MessageSquare className="h-4 w-4" strokeWidth={2.5} />
              LINE 公式で相談する
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </a>
            <a
              href="https://misako-profile-portfolio.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10 sm:w-auto sm:text-base"
            >
              ポートフォリオを見る
              <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
            </a>
          </div>
        </div>
      </section>

      {/* ─────────────────────── Footer ─────────────────────── */}
      <footer className="border-t border-white/10 bg-brand-ink py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-bold text-white"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-brand-primary to-brand-accent">
                <Triangle
                  className="h-3 w-3 rotate-90"
                  strokeWidth={2.5}
                  fill="currentColor"
                />
              </span>
              MultiChannel Notify
            </Link>
            <p className="text-xs text-brand-muted">
              © 2026 MultiChannel Notify Demo
            </p>
          </div>
          <p className="mt-6 border-t border-white/5 pt-6 text-center text-xs text-brand-muted">
            本プロジェクトは架空の不動産管理会社を想定したポートフォリオです。
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * Hero 右カラム：Slack + LINE Push の HTML/CSS モックアップ（ダーク版）
 */
function SlackLineMockup(): JSX.Element {
  const channels = [
    { name: "賃貸", count: 12, active: false },
    { name: "売買", count: 4, active: false },
    { name: "内見", count: 7, active: false },
    { name: "クレーム緊急", count: 1, active: true, urgent: true },
    { name: "要確認", count: 2, active: false },
  ];

  return (
    <div className="relative">
      {/* Browser frame */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-brand-card shadow-glow-strong ring-1 ring-white/5">
        {/* Chrome tab bar */}
        <div className="flex items-center gap-1.5 border-b border-white/5 bg-brand-ink px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <div className="ml-3 flex-1 truncate rounded bg-black/30 px-3 py-0.5 text-[10px] text-brand-muted ring-1 ring-white/5">
            app.slack.com/real-estate
          </div>
        </div>

        <div className="grid grid-cols-12">
          {/* Sidebar */}
          <div className="col-span-4 border-r border-white/5 bg-[#0B1120] px-3 py-4 text-white sm:col-span-3">
            <div className="mb-4 flex items-center gap-2 px-1">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-brand-primary to-brand-accent text-[10px] font-bold">
                RE
              </span>
              <span className="text-[11px] font-bold">Real Estate Co.</span>
            </div>
            <div className="mb-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-brand-muted">
              Channels
            </div>
            <ul className="space-y-0.5">
              {channels.map((c) => (
                <li
                  key={c.name}
                  className={`flex items-center justify-between rounded px-2 py-1 text-[11px] ${
                    c.active
                      ? "bg-brand-primary/20 font-semibold text-white ring-1 ring-brand-primary/40"
                      : "text-white/60"
                  }`}
                >
                  <span className="flex items-center gap-1 truncate">
                    <Hash className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                    <span className="truncate">{c.name}</span>
                  </span>
                  {c.urgent ? (
                    <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.6)]">
                      {c.count}
                    </span>
                  ) : (
                    <span className="ml-1 text-[9px] text-brand-muted">
                      {c.count}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Main pane */}
          <div className="col-span-8 bg-brand-card p-4 sm:col-span-9">
            <div className="mb-3 flex items-center gap-1.5 border-b border-white/5 pb-2">
              <Hash className="h-3.5 w-3.5 text-brand-muted" strokeWidth={2.5} />
              <span className="text-sm font-bold text-white">クレーム緊急</span>
              <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300 ring-1 ring-rose-500/40">
                URGENT
              </span>
            </div>

            <div className="space-y-3">
              <MockPost
                sender="佐藤花子"
                channelLabel="LINE"
                accent="rose"
                title="クレーム緊急"
                text="エアコンが効きません。至急対応してください。苦情です。"
                time="10:47"
              />
              <MockPost
                sender="山田太郎"
                channelLabel="LINE"
                accent="cyan"
                title="賃貸"
                text="駅近の1LDKを探しています。家賃8万円くらいで空いている物件はありますか？"
                time="10:52"
              />
            </div>
          </div>
        </div>
      </div>

      {/* LINE Push overlay */}
      <div className="absolute -bottom-6 -right-2 hidden w-56 rotate-2 rounded-2xl border border-white/10 bg-brand-card p-3 shadow-glow ring-1 ring-white/5 sm:block lg:-bottom-8 lg:-right-6 lg:w-64">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]">
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-[10px] font-semibold text-brand-muted">LINE</p>
            <p className="text-[10px] font-bold text-white">たった今</p>
          </div>
        </div>
        <p className="text-[11px] font-bold text-rose-400">クレーム検出</p>
        <p className="mt-0.5 text-[10px] leading-snug text-brand-muted">
          送信元：LINE｜送信者：佐藤花子さん
          <br />
          エアコンが効きません。至急対応してください…
        </p>
      </div>
    </div>
  );
}

/**
 * Slack モックアップ内の投稿カード（ダーク版）
 */
function MockPost({
  sender,
  channelLabel,
  accent,
  title,
  text,
  time,
}: {
  sender: string;
  channelLabel: string;
  accent: "cyan" | "rose";
  title: string;
  text: string;
  time: string;
}): JSX.Element {
  const accentColor =
    accent === "rose"
      ? "text-rose-300 bg-rose-500/15 ring-rose-500/40"
      : "text-brand-accent bg-brand-accent/15 ring-brand-accent/40";
  return (
    <div className="flex gap-2.5">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gradient-to-br from-brand-primary/40 to-brand-accent/30 text-[10px] font-bold text-white">
        Bot
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-bold text-white">
            multichannel-notify-bot
          </span>
          <span className="text-[9px] text-brand-muted">{time}</span>
        </div>
        <div className="mt-0.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ${accentColor}`}
          >
            【{title}】
          </span>
        </div>
        <p className="mt-1 text-[10px] font-medium text-brand-muted">
          送信元：{channelLabel}｜送信者：{sender}さん
        </p>
        <p className="mt-1 text-[11px] leading-snug text-white/85">{text}</p>
      </div>
    </div>
  );
}
