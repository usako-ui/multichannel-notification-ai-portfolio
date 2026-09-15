import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          // 背景（ダークネイビー）
          ink: "#0F1629",
          // カード背景（ink より少し明るく）
          card: "#1E2A45",
          // 境界線（ink と card の中間）
          line: "#26314E",
          // プライマリ（ビビッドブルー）
          primary: "#2563EB",
          // アクセント（シアン）
          accent: "#06B6D4",
          // テキスト primary（白）
          text: "#FFFFFF",
          // テキスト muted（グレー）
          muted: "#94A3B8",
        },
      },
      fontFamily: {
        // Inter は layout.tsx で next/font/google 経由でロードして CSS 変数 `--font-inter` に注入する
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // カードの glow エフェクト（ビビッドブルー）
        glow: "0 0 20px rgba(37, 99, 235, 0.3)",
        "glow-strong": "0 0 30px rgba(37, 99, 235, 0.45)",
        "glow-cyan": "0 0 20px rgba(6, 182, 212, 0.3)",
      },
      backgroundImage: {
        // Hero やセクション区切りで使うグラデーション
        "grad-hero":
          "radial-gradient(60% 60% at 50% 0%, rgba(37, 99, 235, 0.25), transparent 70%)",
        "grad-divider":
          "linear-gradient(180deg, rgba(37, 99, 235, 0.05) 0%, transparent 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
