import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { ErrorReporter } from "@/components/analytics/error-reporter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800"],
});

/** Absolute URLs for link previews: the configured site address, else Vercel's production domain. */
function siteUrl(): URL | undefined {
  const raw =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  try {
    return raw ? new URL(raw) : undefined;
  } catch {
    return undefined;
  }
}

const description =
  "A quick party game for couples, best friends and whole friend groups. Share a link, play from your phones.";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Us vs. Us — How well do you really know your people?",
  description,
  openGraph: {
    type: "website",
    siteName: "Us vs. Us",
    title: "Us vs. Us — How well do you really know your people?",
    description,
    locale: "en_PH",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#1a1326",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
