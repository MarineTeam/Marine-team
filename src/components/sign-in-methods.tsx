/** Auth0 connection strategy names are not presentable; these are. */
const PROVIDER_LABELS: Record<string, string> = {
  "google-oauth2": "Google",
  windowslive: "Microsoft",
  facebook: "Facebook",
  apple: "Apple",
  github: "GitHub",
  auth0: "Email and password",
  email: "Email link",
  sms: "SMS",
  samlp: "Single sign-on",
  waad: "Microsoft Entra ID",
  oidc: "Single sign-on",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export type SignInMethod = {
  id: string;
  provider: string;
  email: string;
  emailVerified: boolean;
  lastLoginAt: Date;
  isCurrent: boolean;
};

/**
 * The sign-in methods recorded against this member.
 *
 * Read-only on purpose. These rows record what has signed in as this member;
 * the identities themselves live in Auth0, so "unlink" would have to reach
 * the Management API to mean anything. Offering a button that only deleted
 * our local record would look like it revoked access while changing nothing
 * — worse than not offering it.
 */
export function SignInMethods({ methods }: { methods: SignInMethod[] }) {
  if (methods.length === 0) {
    return <p className="text-sm text-zinc-500">No sign-in methods recorded yet.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
      {methods.map((method) => (
        <li key={method.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="font-medium">
              {providerLabel(method.provider)}
              {method.isCurrent && (
                <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  This session
                </span>
              )}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {method.email}
              {!method.emailVerified && " — unverified"}
            </p>
          </div>
          <p className="text-xs text-zinc-400">
            Last used {method.lastLoginAt.toLocaleDateString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
