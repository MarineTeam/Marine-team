/**
 * The members' directory.
 *
 * The most sensitive list this app can publish, and the one with the simplest
 * rule: **nobody is in it who did not ask to be.** Not off-by-default-with-a-
 * nudge, not opted in when they joined a group — a member appears here because
 * they went to their settings and said so, and they leave the moment they say
 * otherwise.
 *
 * Being listed publishes a name. Every contact detail is a *separate* yes, so
 * somebody happy to be findable is not thereby publishing their phone number.
 * `VisibleMember` has no unconditional `email` or `phone`, so a page cannot
 * print one it was never given — the same shape as a small group's address.
 *
 * There is no staff exception. Whoever keeps the member list has
 * `/admin/users`, which exists for a different reason and says so; the
 * directory shows exactly what members agreed to share, to everybody alike. A
 * single rule with no special cases is also the only kind anybody can check.
 */

export type DirectoryRow = {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string;
  phone: string | null;
  picture: string | null;
  authorized: boolean;
  directoryListed: boolean;
  directoryShowEmail: boolean;
  directoryShowPhone: boolean;
  directoryNote: string | null;
};

/** A member as the directory is allowed to show them. */
export type VisibleMember = {
  id: string;
  name: string;
  picture: string | null;
  note: string | null;
  /** Present only if they chose to publish it. Absent, not null, otherwise. */
  email?: string;
  phone?: string;
};

/**
 * What to call somebody in the directory.
 *
 * Their chosen display name, then their account name. Never the email address:
 * `rota.ts`'s `personName` falls back to it, which is right when a rota-builder
 * needs to tell two Daves apart and wrong on a page this many people can open.
 * Somebody with no name at all is not listed — see `listed` below.
 */
export function directoryName(row: Pick<DirectoryRow, "name" | "displayName">): string {
  return row.displayName?.trim() || row.name?.trim() || "";
}

/**
 * Whether this row may appear at all.
 *
 * Three things, all required: they asked to be listed, they still have access
 * to the app, and there is a name to show. The second matters most — somebody
 * whose access was withdrawn stops being listed on the next read rather than
 * lingering until a job notices, because the directory is built from the same
 * `authorized` flag every other page checks.
 */
export function listed(row: DirectoryRow): boolean {
  return row.directoryListed && row.authorized && directoryName(row) !== "";
}

/**
 * The one place a contact detail may leave the database.
 *
 * Each field is spread in only when its own flag is set, so the absent case is
 * genuinely absent rather than an empty string a template would happily render
 * a mailto: around.
 */
export function presentMember(row: DirectoryRow): VisibleMember {
  return {
    id: row.id,
    name: directoryName(row),
    picture: row.picture,
    note: row.directoryNote?.trim() || null,
    ...(row.directoryShowEmail ? { email: row.email } : {}),
    ...(row.directoryShowPhone && row.phone?.trim() ? { phone: row.phone.trim() } : {}),
  };
}

/** Everybody who may be shown, in the order a directory reads. */
export function visibleDirectory(rows: readonly DirectoryRow[]): VisibleMember[] {
  return rows
    .filter(listed)
    .map(presentMember)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/**
 * Narrowing by a typed query.
 *
 * Matches the name and the note only — never the email or phone, even for
 * somebody who published them. Searching contact details turns a directory
 * into a lookup service: type a number, find out whose it is. Nobody opting in
 * to "people can see my phone" is opting in to that.
 */
export function searchDirectory(members: readonly VisibleMember[], query: string): VisibleMember[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...members];
  return members.filter(
    (member) =>
      member.name.toLowerCase().includes(needle) || (member.note ?? "").toLowerCase().includes(needle),
  );
}

/** What a member's own settings page says about where they stand. */
export function directoryStanding(row: Pick<DirectoryRow, "directoryListed" | "directoryShowEmail" | "directoryShowPhone">): string {
  if (!row.directoryListed) return "You're not in the directory.";
  const shared = [row.directoryShowEmail && "email", row.directoryShowPhone && "phone"].filter(Boolean);
  if (shared.length === 0) return "You're listed by name only.";
  return `You're listed, with your ${shared.join(" and ")}.`;
}
