import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { BottomNav } from "@/components/bottom-nav";
import { PwaRegister } from "@/components/pwa-register";
import { AnnouncementBannerServer } from "@/components/announcement-banner-server";
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
  title: "Marine Team",
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
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <PwaRegister />
        <Suspense fallback={null}>
          <AnnouncementBannerServer />
        </Suspense>
        <Navbar />
        <main className="flex-1 pb-16 sm:pb-0">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
