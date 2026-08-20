import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { BottomNavServer } from "@/components/bottom-nav-server";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeSync } from "@/components/theme-sync";
import { AnnouncementBannerServer } from "@/components/announcement-banner-server";
import { QueryMonitorPanel } from "@/components/query-monitor-panel";
import { THEME_INIT_SCRIPT } from "@/lib/device-settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Lets per-page metadata (generateMetadata in videos/series/categories/
  // speakers) hand back relative OG image paths and have Next resolve them
  // to absolute URLs, instead of every page needing to know its own origin.
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  title: { default: "Marine Team", template: "%s | Marine Team" },
  description: "Watch sermons, series, and downloads.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Marine Team", statusBarStyle: "black-translucent" },
  icons: {
    // SVG first for crisp tabs on browsers that support it; the .ico is the
    // fallback for those that don't.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C4A6E",
  viewportFit: "cover",
};

// Every page depends on live auth/DB state (Navbar alone queries the current
// user and feature-flag state); force dynamic rendering site-wide so Next
// never attempts to statically prerender a page against a database that
// isn't reachable at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme script below adds a `dark`/`light` class to this element
      // before React hydrates, which is a deliberate mismatch with what the
      // server rendered.
      suppressHydrationWarning
    >
      <head>
        {/*
          Blocking and inline, ahead of any markup, so the stored theme is
          applied before first paint. A deferred script — or doing this in an
          effect — would show one frame of the wrong theme on every load.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <PwaRegister />
        <ThemeSync />
        <Suspense fallback={null}>
          <AnnouncementBannerServer />
        </Suspense>
        <Navbar />
        <main className="flex-1 pb-16 sm:pb-0">{children}</main>
        <Footer />
        <BottomNavServer />
        <Suspense fallback={null}>
          <QueryMonitorPanel />
        </Suspense>
      </body>
    </html>
  );
}
