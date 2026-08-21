import { getBranding } from "@/lib/branding";

/**
 * `only-web`: a footer is a website thing. The installed app ends at the tab
 * strip, and a copyright line above it would just be something to scroll past.
 */
export async function Footer() {
  const branding = await getBranding();

  return (
    <footer className="only-web border-t border-sep py-6 text-center text-sm text-sec">
      © {new Date().getFullYear()} {branding.name}
    </footer>
  );
}
