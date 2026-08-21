import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { AppSidebarServer } from "@/components/app-sidebar-server";
import { Footer } from "@/components/footer";
import { BottomNavServer } from "@/components/bottom-nav-server";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeSync } from "@/components/theme-sync";
import { AnnouncementBannerServer } from "@/components/announcement-banner-server";
import { QueryMonitorPanel } from "@/components/query-monitor-panel";
import { brandingCss, getBranding } from "@/lib/branding";
import { THEME_INIT_SCRIPT } from "@/lib/device-settings";
import { STANDALONE_INIT_SCRIPT } from "@/lib/standalone";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Async because the site's name is an admin setting now, not a constant — see
 * lib/branding.ts. Everything else here is unchanged.
 */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();

  return {
    // Lets per-page metadata (generateMetadata in videos/series/categories/
    // speakers) hand back relative OG image paths and have Next resolve them
    // to absolute URLs, instead of every page needing to know its own origin.
    metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
    title: { default: branding.name, template: `%s | ${branding.shortName}` },
    description: "Watch sermons, series, and downloads.",
    // Generated per request from the same settings, so renaming the site also
    // renames the installed app — see api/manifest/route.ts.
    manifest: "/api/manifest",
    appleWebApp: { capable: true, title: branding.shortName, statusBarStyle: "black-translucent" },
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
}

/** The browser chrome around the installed app is painted in the brand colour too. */
export async function generateViewport(): Promise<Viewport> {
  const branding = await getBranding();
  return { themeColor: branding.brandDeep, viewportFit: "cover" };
}

// Every page depends on live auth/DB state (the header alone queries the current
// user and feature-flag state); force dynamic rendering site-wide so Next
// never attempts to statically prerender a page against a database that
// isn't reachable at build time.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await getBranding();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The scripts below add a `dark`/`light` class and, when installed, a
      // `data-standalone` attribute to this element before React hydrates —
      // both deliberate mismatches with what the server rendered.
      suppressHydrationWarning
    >
      <head>
        {/*
          Blocking and inline, ahead of any markup, so the stored theme and the
          installed-vs-tab decision are both applied before first paint. A
          deferred script — or doing either in an effect — would show one frame
          of the wrong theme, or of both shells at once, on every load.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: STANDALONE_INIT_SCRIPT }} />
        {/*
          The admin's colours, straight into the document: they come out of the
          database per render, so no build step could have baked them into a
          stylesheet, and fetching one separately would let the page paint in
          the fallback palette first. Every value here has been through
          normalizeBranding, which is what makes writing it into a stylesheet
          safe — see lib/branding.ts.
        */}
        <style dangerouslySetInnerHTML={{ __html: brandingCss(branding) }} />
      </head>
      <body className="min-h-full">
        <PwaRegister />
        <ThemeSync />
        <div className="flex min-h-screen">
          <Suspense fallback={null}>
            <AppSidebarServer />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">
            <Suspense fallback={null}>
              <AnnouncementBannerServer />
            </Suspense>
            <AppHeader />
            <main className="app-main flex-1 pb-16 sm:pb-0">{children}</main>
            <Suspense fallback={null}>
              <Footer />
            </Suspense>
          </div>
        </div>
        <BottomNavServer />
        <Suspense fallback={null}>
          <QueryMonitorPanel />
        </Suspense>
      </body>
    </html>
  );
}
