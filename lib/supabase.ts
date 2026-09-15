import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase クライアントを 2 種類提供する理由：
 *  - supabaseBrowser: ブラウザ用（anon key）。RLS が効くので安全に公開できる。
 *  - supabaseAdmin:   サーバー用（service_role key）。RLS をバイパスするため、
 *                     絶対に Route Handler / Cron などサーバーコードでのみ使う。
 *                     'use client' コンポーネントから import してはならない。
 */

/**
 * 環境変数の必須チェック。
 * 未設定のまま createClient に undefined を渡すと実行時に不明瞭なエラーになるため、
 * 明示的に throw して原因を特定しやすくする。
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `環境変数 ${key} が未設定です。.env.local を確認してください。`,
    );
  }
  return value;
}

/**
 * ブラウザから使う Supabase クライアント（anon key）。
 * RLS ポリシーで守られたテーブルにのみアクセス可能。
 * 現時点で inquiry_queue は RLS 有効かつポリシー未定義のため、
 * このクライアントからは inquiry_queue にアクセスできない（意図した設計）。
 */
export function supabaseBrowser(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey);
}

/**
 * サーバー側専用の Supabase クライアント（service_role key）。
 * RLS をバイパスするため強力。inquiry_queue の INSERT/UPDATE はこちらを使う。
 *
 * autoRefreshToken / persistSession を false にする理由：
 * サーバーサイドはリクエスト毎に完結する処理で、
 * セッション永続化が不要かつメモリリークの原因になり得るため。
 *
 * ⚠️ このクライアントを 'use client' コンポーネントや app/ 配下の
 *    クライアント側モジュールから import すると、
 *    SERVICE_ROLE_KEY がバンドルされてブラウザに漏洩する。
 *    利用箇所は app/api/ 配下と lib/ のサーバーモジュールに限定する。
 */
export function supabaseAdmin(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Next.js App Router のデフォルト fetch キャッシュを回避する。
    // これがないと Route Handler 内の SELECT が初回結果をキャッシュし、
    // DB を更新しても Cron が「pending 0 件」を返し続ける事故が起きる。
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
