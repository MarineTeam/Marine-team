import type { Role } from "@prisma/client";

/**
 * What somebody with `manage_users` may do to another account.
 *
 * `manage_users` is a grantable capability: a permission group can carry it,
 * and whoever holds `manage_permissions` can make such a group and assign it —
 * to themselves included. That is what "manage permissions" means, and it is
 * fine as far as it goes. What was not fine is where it went: the route that
 * changes a role blocked only the *granting* of ADMIN, and the route that
 * deletes an account checked nothing at all. So a staff member with
 * `manage_permissions` could grant themselves `manage_users`, demote every
 * administrator, or delete them, and be the only person left who could let
 * anybody back in.
 *
 * The rule this file holds is the missing half of "only an ADMIN grants
 * ADMIN": **only an ADMIN may take it away, either by demotion or by
 * deletion.** Everything else `manage_users` allows — granting and suspending
 * access for ordinary members, editing them, removing them — is untouched.
 */

export type Actor = { id: string; role: Role };
export type Target = { id: string; role: Role };

export type UserActionRefusal =
  | { ok: true }
  | { ok: false; status: number; error: string };

const allowed: UserActionRefusal = { ok: true };

/** Whether this actor may set `role` on this target. */
export function canChangeRole(actor: Actor, target: Target, role: Role | undefined): UserActionRefusal {
  if (role === undefined || role === target.role) return allowed;
  if (actor.role === "ADMIN") return allowed;

  if (role === "ADMIN") {
    return { ok: false, status: 403, error: "Only a site admin can grant the Admin role" };
  }
  // The other direction, which used to be unguarded: taking the role away.
  if (target.role === "ADMIN") {
    return { ok: false, status: 403, error: "Only a site admin can change another admin's role" };
  }
  return allowed;
}

/** Whether this actor may delete this account. */
export function canDeleteUser(actor: Actor, target: Target): UserActionRefusal {
  if (actor.id === target.id) {
    return { ok: false, status: 400, error: "You can't remove your own access" };
  }
  if (target.role === "ADMIN" && actor.role !== "ADMIN") {
    return { ok: false, status: 403, error: "Only a site admin can remove another admin" };
  }
  return allowed;
}

/** Whether this actor may set `authorized` on this target. */
export function canSetAuthorized(
  actor: Actor,
  target: Target,
  authorized: boolean | undefined,
): UserActionRefusal {
  if (authorized === undefined) return allowed;
  if (actor.id === target.id && authorized === false) {
    return { ok: false, status: 400, error: "You can't revoke your own access" };
  }
  // Suspending an admin locks them out as surely as demoting them does, so it
  // answers to the same rule.
  if (authorized === false && target.role === "ADMIN" && actor.role !== "ADMIN") {
    return { ok: false, status: 403, error: "Only a site admin can suspend another admin" };
  }
  return allowed;
}

/** The first refusal among the checks, or `{ ok: true }`. */
export function firstRefusal(...checks: UserActionRefusal[]): UserActionRefusal {
  return checks.find((check) => !check.ok) ?? allowed;
}
