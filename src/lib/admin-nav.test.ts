import { describe, expect, it } from "vitest";
import { ADMIN_GROUPS, adminGroupsFor, currentAdminLabel, type AdminAccess } from "./admin-nav";

const NOTHING: AdminAccess = {
  isAdmin: false,
  canManageUsers: false,
  canManagePermissions: false,
  canManagePlugins: false,
  canViewAuditLog: false,
  canManageApiKeys: false,
  canViewAnalytics: false,
  canManageVideosSiteWide: false,
  canManageFiles: false,
  canModerateComments: false,
  canShareContent: false,
  canManageEvents: false,
  canModeratePrayer: false,
  canSeeTrash: false,
};

const EVERYTHING: AdminAccess = {
  isAdmin: true,
  canManageUsers: true,
  canManagePermissions: true,
  canManagePlugins: true,
  canViewAuditLog: true,
  canManageApiKeys: true,
  canViewAnalytics: true,
  canManageVideosSiteWide: true,
  canManageFiles: true,
  canModerateComments: true,
  canShareContent: true,
  canManageEvents: true,
  canModeratePrayer: true,
  canSeeTrash: true,
};

const hrefs = (access: AdminAccess) =>
  adminGroupsFor(access).flatMap((group) => group.links.map((link) => link.href));

describe("adminGroupsFor", () => {
  it("gives an admin every section", () => {
    const all = ADMIN_GROUPS.flatMap((g) => g.links.map((l) => l.href));
    expect(hrefs(EVERYTHING)).toEqual(all);
  });

  it("gives a staff member with no grants only what every staff member gets", () => {
    expect(hrefs(NOTHING)).toEqual(["/admin/series", "/admin/videos", "/admin/files"]);
  });

  it("keeps the overview and categories admin-only, since /admin bounces everyone else", () => {
    expect(hrefs(NOTHING)).not.toContain("/admin");
    expect(hrefs(NOTHING)).not.toContain("/admin/categories");
    expect(hrefs({ ...NOTHING, canManagePlugins: true })).not.toContain("/admin");
  });

  it("drops a group whose every link is hidden, so no heading stands over nothing", () => {
    const labels = adminGroupsFor(NOTHING).map((g) => g.label);
    expect(labels).toEqual(["Library"]);
  });

  it("reveals sections one capability at a time", () => {
    expect(hrefs({ ...NOTHING, canManageUsers: true })).toContain("/admin/users");
    expect(hrefs({ ...NOTHING, canManageUsers: true })).toContain("/admin/authorized-emails");
    expect(hrefs({ ...NOTHING, canViewAuditLog: true })).toEqual(
      expect.arrayContaining(["/admin/audit", "/admin/access-attempts"]),
    );
    expect(hrefs({ ...NOTHING, canManageVideosSiteWide: true })).toEqual(
      expect.arrayContaining(["/admin/speakers", "/admin/live"]),
    );
    // Query Monitor rides with the plugin grant, as it always has.
    expect(hrefs({ ...NOTHING, canManagePlugins: true })).toContain("/admin/query-monitor");
  });

  it("lists no href twice", () => {
    const all = hrefs(EVERYTHING);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("currentAdminLabel", () => {
  const groups = adminGroupsFor(EVERYTHING);

  it("names the open section", () => {
    expect(currentAdminLabel(groups, "/admin/videos")).toBe("Videos");
    expect(currentAdminLabel(groups, "/admin/share-links")).toBe("Share links");
  });

  it("stays on the section while inside it", () => {
    expect(currentAdminLabel(groups, "/admin/series/advent-2026")).toBe("Series");
  });

  it("prefers the longest match, so a sub-section doesn't resolve to the overview", () => {
    expect(currentAdminLabel(groups, "/admin")).toBe("Overview");
    expect(currentAdminLabel(groups, "/admin/audit")).toBe("Audit log");
  });

  it("falls back rather than showing nothing for a page not in the nav", () => {
    expect(currentAdminLabel(groups, "/admin/something-new")).toBe("Admin");
  });
});
