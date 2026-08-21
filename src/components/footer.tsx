import { getBranding } from "@/lib/branding";

/**
 * `only-browser`, not `only-web`: a footer is a website thing at every width,
 * so it goes when the app is installed — including on a desktop, where the
 * rest of the website layout stays. An installed app ends at its own chrome.
 */
export async function Footer() {
  const branding = await getBranding();

  return (
    <footer className="only-browser border-t border-sep py-6 text-center text-sm text-sec">
      © {new Date().getFullYear()} {branding.name}
    </footer>
  );
}
