import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "海力士 ADR 价差 | Hynix Spread",
  description: "从 ADR 上市起，追踪 SK hynix 正股与 ADR 的价差、溢价率及同口径美元走势。行情来自 Hyperliquid。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
