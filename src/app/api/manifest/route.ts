import { NextResponse } from "next/server";
import { getBranding } from "@/lib/branding";

/**
 * The web app manifest, built from the BrandSettings row rather than served as
 * a static file — otherwise renaming the site in the admin would leave the
 * installed app's home-screen label saying the old name until someone
 * remembered to edit public/manifest.json and redeploy.
 *
 * Icons stay static: they're real image files, and swapping those is a deploy
 * either way.
 */
export async function GET() {
  const branding = await getBranding();

  return NextResponse.json(
    {
      name: branding.name,
      short_name: branding.shortName,
      description: `${branding.name} — watch sermons, series, and downloads.`,
      start_url: "/",
      display: "standalone",
      background_color: branding.brandDeep,
      theme_color: branding.brandDeep,
      icons: [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
