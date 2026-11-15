import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geo-Vis",
  description:
    "MapLibre GL + FlatGeobuf 全球國家與多層級行政區 (ADM0/ADM1/ADM2) 視覺化、自訂投影切換與多區域 Union 系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://flagcdn.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased selection:bg-sky-500/30 selection:text-sky-200">
        {children}
      </body>
    </html>
  );
}
