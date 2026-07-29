/** A member's display name, falling back to their Auth0 name, then their email. */
export function getDisplayName(user: { displayName?: string | null; name?: string | null; email: string }): string {
  return user.displayName || user.name || user.email;
}
