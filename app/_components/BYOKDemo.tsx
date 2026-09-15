"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Lock, Sparkles, ArrowRight, AlertCircle } from "lucide-react";

/**
 * BYOK（Bring Your Own Key）デモ体験セクション（ダーク SaaS 版）
 *
 * 訪問者が自分の Gemini API キーを入力し、任意の問い合わせ文を
 * 5 カテゴリに分類する体験を提供する。
 *
 * ⚠️ API キーはブラウザから直接 Gemini API に送られる（サーバー保存なし）。
 * ⚠️ キー漏洩対策として送信ボタン押下時のみ利用し、送信後は state もクリアする。
 */

type Category = "賃貸" | "売買" | "内見" | "クレーム" | "要確認・その他";

const SAMPLE_PROMPTS: { label: string; text: string }[] = [
  {
    label: "賃貸",
    text: "駅近の1LDKを探しています。家賃8万円くらいで空いている物件はありますか？",
  },
  {
    label: "売買",
    text: "中古マンションの購入を検討しています。予算3000万円台で良い物件はありますか？",
  },
  {
    label: "内見",
    text: "先日問い合わせた港区の物件、週末に内見をお願いできますか？",
  },
  {
    label: "クレーム",
    text: "エアコンが効きません。至急対応してください。苦情です。",
  },
];

const CATEGORY_STYLES: Record<Category, { badge: string; slack: string }> = {
  賃貸: {
    badge: "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40",
    slack: "#賃貸",
  },
  売買: {
    badge: "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40",
    slack: "#売買",
  },
  内見: {
    badge: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40",
    slack: "#内見",
  },
  クレーム: {
    badge: "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40",
    slack: "#クレーム緊急（+ 営業部長 LINE Push 5 分以内）",
  },
  "要確認・その他": {
    badge: "bg-slate-500/20 text-slate-300 ring-1 ring-slate-500/40",
    slack: "#要確認",
  },
};

const CLASSIFY_PROMPT = `以下の問い合わせを、下記5カテゴリのいずれか1つに分類してください。カテゴリ名のみを日本語で1行で回答してください。

カテゴリ：賃貸 / 売買 / 内見 / クレーム / 要確認・その他

判定ルール：
- クレームかどうか迷う場合は「クレーム」を選ぶ（安全側に倒す）
- カテゴリが判断できないもの・迷惑メール等は「要確認・その他」を選ぶ

問い合わせ本文：
`;

function normalizeCategory(raw: string): Category {
  const trimmed = raw.trim();
  const candidates: Category[] = [
    "賃貸",
    "売買",
    "内見",
    "クレーム",
    "要確認・その他",
  ];
  for (const c of candidates) {
    if (trimmed.startsWith(c)) return c;
  }
  return "要確認・その他";
}

export default function BYOKDemo(): JSX.Element {
  const [apiKey, setApiKey] = useState("");
  const [inquiry, setInquiry] = useState(SAMPLE_PROMPTS[0].text);
  const [result, setResult] = useState<Category | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!apiKey.trim()) {
      setError("Gemini API キーを入力してください");
      return;
    }
    if (!inquiry.trim()) {
      setError("問い合わせ本文を入力してください");
      return;
    }

    setLoading(true);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${CLASSIFY_PROMPT}${inquiry}` }],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `Gemini API エラー（HTTP ${res.status}）: ${errText.slice(0, 200)}`,
        );
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!rawText) {
        throw new Error("Gemini から空の応答が返りました");
      }

      setResult(normalizeCategory(rawText));
    } catch (err) {
      setError(err instanceof Error ? err.message : "予期しないエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function applySample(text: string): void {
    setInquiry(text);
    setResult(null);
    setError(null);
  }

  return (
    <div className="relative rounded-2xl border border-white/10 bg-brand-card p-6 shadow-glow ring-1 ring-white/5 sm:p-8">
      {/* Subtle top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-primary/60 to-transparent" />

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="apiKey"
            className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"
          >
            <KeyRound className="h-4 w-4 text-brand-accent" strokeWidth={2} />
            Gemini API キー
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy... （Google AI Studio で無料取得）"
            className="w-full rounded-lg border border-white/10 bg-brand-ink px-3.5 py-2.5 text-sm text-white shadow-inner placeholder:text-brand-muted/60 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            autoComplete="off"
          />
          <p className="mt-2 flex items-start gap-1.5 text-xs text-brand-muted">
            <Lock
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-accent"
              strokeWidth={2}
            />
            <span>
              キーはブラウザから直接 Google に送信され、当サイトのサーバーには保存されません。取得は{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-accent underline decoration-brand-accent/40 underline-offset-2 transition hover:decoration-brand-accent"
              >
                Google AI Studio
              </a>{" "}
              から無料。
            </span>
          </p>
        </div>

        <div>
          <label
            htmlFor="inquiry"
            className="mb-2 block text-sm font-semibold text-white"
          >
            問い合わせ本文
          </label>
          <textarea
            id="inquiry"
            value={inquiry}
            onChange={(e) => setInquiry(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-lg border border-white/10 bg-brand-ink px-3.5 py-2.5 text-sm text-white shadow-inner placeholder:text-brand-muted/60 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-brand-muted">サンプル：</span>
            {SAMPLE_PROMPTS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => applySample(s.text)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-0.5 text-xs font-medium text-brand-muted transition hover:border-brand-primary/40 hover:bg-brand-primary/10 hover:text-white"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-primary to-brand-accent px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:shadow-glow-strong disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
        >
          {loading ? (
            "分類中..."
          ) : (
            <>
              <Sparkles className="h-4 w-4" strokeWidth={2} />
              AI で分類する
              <ArrowRight
                className="h-4 w-4 transition group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <div>
            <p className="font-semibold">エラー</p>
            <p className="mt-1 whitespace-pre-wrap break-all text-rose-200/90">
              {error}
            </p>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-3 rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-5 shadow-glow">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-accent">
            AI 分類結果
          </p>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-base font-bold ${CATEGORY_STYLES[result].badge}`}
            >
              {result}
            </span>
            <ArrowRight className="h-5 w-5 text-brand-muted" strokeWidth={2} />
            <span className="font-mono text-sm text-white">
              {CATEGORY_STYLES[result].slack}
            </span>
          </div>
          <p className="text-sm text-brand-muted">
            本番環境では、この分類結果に応じて対応する Slack チャネルへ自動投稿されます。
            {result === "クレーム" && (
              <span className="mt-1 block font-semibold text-rose-300">
                クレーム検出時は営業部長の個人 LINE にも 5 分以内に Push 通知が届きます。
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
