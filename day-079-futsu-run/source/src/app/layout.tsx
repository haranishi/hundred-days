import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./product-ui.css";
import "./race-ui.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3017",
  ),
  title: "あなたの普通、何％？ | みんなの普通を走りぬけろ。",
  description:
    "あなたの「普通」は、みんなの「普通」？ 日常・恋愛・お金の二択を選んで走る、登録不要の3Dゲーム。",
  alternates: { canonical: "/" },
  openGraph: {
    title: "あなたの普通、何％？",
    description: "多数派を走りぬけろ。あなたの感覚で選ぶ、7つの分かれ道。",
    locale: "ja_JP",
    type: "website",
    images: ["/api/og"],
  },
  twitter: { card: "summary_large_image", images: ["/api/og"] },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8faf5",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
