import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter は next/font/google 経由でセルフホスト化される（外部リクエストなし・font-display swap）
// CSS 変数 --font-inter として注入し tailwind.config.ts の fontFamily.sans で参照
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MultiChannel Notify｜Gmail・LINE を Slack に自動集約",
  description:
    "届いた問い合わせを、AI が整理し、必要な人へ。不動産管理会社向けの AI 自動分類 + マルチチャネル通知システム。営業時間外の見落としをゼロに、クレームは 5 分以内に営業部長の LINE へ。",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <html lang="ja" className={inter.variable}>
      <body className="bg-brand-ink font-sans text-brand-text antialiased">
        {children}
      </body>
    </html>
  );
}
