import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTC Prediction Tracker — Binance Top Trader Monitor",
  description:
    "Real-time dashboard tracking top trader positions on Binance BTC Up/Down 5m prediction market. Analyze hedging patterns, trade entries, and win/loss history.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
