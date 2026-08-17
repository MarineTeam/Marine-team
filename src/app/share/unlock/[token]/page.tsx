import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionIdentity } from "@/lib/current-user";
import { shareLinkStatus } from "@/lib/share-access";
import { ShareUnlockForm } from "@/components/share-unlock-form";

/**
 * Where /s/[token] sends the recipient of a password-protected link. Only
 * renders the prompt — the check itself is POSTed to
 * /api/share-links/unlock, which is what can set the cookie that redeems the
 * link.
 *
 * The link's validity is re-checked here so a revoked or expired link shows
 * the usual explanation instead of a password box that could never work. The
 * content's title is deliberately not shown: someone who has the URL but not
 * the password shouldn't learn what's behind it.
 */
export default async function ShareUnlockPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [link, identity] = await Promise.all([
    prisma.shareLink.findUnique({
      where: { token },
      select: {
        visibility: true,
        revokedAt: true,
        expiresAt: true,
        passwordHash: true,
        recipients: { select: { email: true } },
      },
    }),
    getSessionIdentity(),
  ]);

  const status = shareLinkStatus(link, identity?.email ?? null);
  if (status === "login_required") {
    redirect(`/auth/login?returnTo=/s/${encodeURIComponent(token)}`);
  }
  if (status !== "ok" || !link) {
    redirect(`/share/unavailable?reason=${status}`);
  }
  // No password on this link after all (removed since the redirect, say):
  // send them back through the normal redemption route.
  if (!link.passwordHash) redirect(`/s/${encodeURIComponent(token)}`);

  return (
    <div className="max-w-sm mx-auto px-4 py-16 space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">This link is password protected</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Enter the password you were given to open it. Whoever shared the link has it.
        </p>
      </div>
      <ShareUnlockForm token={token} />
    </div>
  );
}
