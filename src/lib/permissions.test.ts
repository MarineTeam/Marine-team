import { beforeEach, describe, expect, it, vi } from "vitest";

// A member's assignments now arrive as one join rather than one query per
// capability, so the capability filter that used to be in the WHERE clause is
// applied in memory. The rows here therefore carry their group's capabilities,
// and the mock stands in for that query.
const assignmentsQueryMock = vi.fn();
const categoryFindManyMock = vi.fn();
const seriesFindUniqueMock = vi.fn();
const categoryChainIdsMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => assignmentsQueryMock(...args),
    categoryEditor: { findMany: async () => [] },
    seriesEditor: { findMany: async () => [] },
    category: { findMany: (...args: unknown[]) => categoryFindManyMock(...args) },
    series: { findUnique: (...args: unknown[]) => seriesFindUniqueMock(...args) },
  },
}));

vi.mock("@/lib/content", () => ({
  categoryChainIds: (...args: unknown[]) => categoryChainIdsMock(...args),
}));

const { hasCapability, descendantCategoryIds } = await import("./permissions");

const member = { id: "u1", role: "MEMBER" } as Parameters<typeof hasCapability>[0];
const admin = { id: "u2", role: "ADMIN" } as Parameters<typeof hasCapability>[0];

describe("hasCapability", () => {
  beforeEach(() => {
    assignmentsQueryMock.mockReset();
    categoryChainIdsMock.mockReset();
    seriesFindUniqueMock.mockReset().mockResolvedValue({ categoryId: null });
  });

  it("always passes for an admin, without querying assignments", async () => {
    expect(await hasCapability(admin, "manage_users")).toBe(true);
    expect(assignmentsQueryMock).not.toHaveBeenCalled();
  });

  it("fails when the user has no matching assignment", async () => {
    assignmentsQueryMock.mockResolvedValue([]);
    expect(await hasCapability(member, "manage_users")).toBe(false);
  });

  it("passes on a site-wide assignment (no category or series), even with no scope given", async () => {
    assignmentsQueryMock.mockResolvedValue([{ categoryId: null, seriesId: null, capabilities: ["manage_users"] }]);
    expect(await hasCapability(member, "manage_users")).toBe(true);
  });

  it("fails a scoped-only assignment when no scope is given", async () => {
    assignmentsQueryMock.mockResolvedValue([{ categoryId: "cat1", seriesId: null, capabilities: ["manage_series"] }]);
    expect(await hasCapability(member, "manage_series")).toBe(false);
  });

  it("passes when the assignment's seriesId exactly matches the requested scope", async () => {
    assignmentsQueryMock.mockResolvedValue([{ categoryId: null, seriesId: "series1", capabilities: ["manage_series"] }]);
    expect(await hasCapability(member, "manage_series", { seriesId: "series1" })).toBe(true);
  });

  it("passes when the assignment's category is an ancestor of the scoped category", async () => {
    assignmentsQueryMock.mockResolvedValue([{ categoryId: "grandparent", seriesId: null, capabilities: ["manage_series"] }]);
    categoryChainIdsMock.mockResolvedValue(["child", "parent", "grandparent"]);
    expect(await hasCapability(member, "manage_series", { categoryId: "child" })).toBe(true);
    expect(categoryChainIdsMock).toHaveBeenCalledWith("child");
  });

  it("fails when the assignment's group doesn't carry the capability at all", async () => {
    // This used to be the WHERE clause's job and is now a filter in memory,
    // so it is worth a case of its own.
    assignmentsQueryMock.mockResolvedValue([
      { categoryId: null, seriesId: null, capabilities: ["manage_files", "publish_content"] },
    ]);
    expect(await hasCapability(member, "manage_users")).toBe(false);
  });

  it("fails when the assignment's category is outside the scoped category's chain", async () => {
    assignmentsQueryMock.mockResolvedValue([{ categoryId: "unrelated", seriesId: null, capabilities: ["manage_series"] }]);
    categoryChainIdsMock.mockResolvedValue(["child", "parent", "grandparent"]);
    expect(await hasCapability(member, "manage_series", { categoryId: "child" })).toBe(false);
  });
});

describe("descendantCategoryIds", () => {
  beforeEach(() => categoryFindManyMock.mockReset());

  it("returns an empty list for no roots, without querying", async () => {
    expect(await descendantCategoryIds([])).toEqual([]);
    expect(categoryFindManyMock).not.toHaveBeenCalled();
  });

  it("returns just the root when it has no children", async () => {
    categoryFindManyMock.mockResolvedValue([{ id: "root", parentId: null }]);
    expect(await descendantCategoryIds(["root"])).toEqual(["root"]);
  });

  it("includes every descendant regardless of row order", async () => {
    categoryFindManyMock.mockResolvedValue([
      { id: "grandchild", parentId: "child" },
      { id: "root", parentId: null },
      { id: "child", parentId: "root" },
    ]);
    const ids = await descendantCategoryIds(["root"]);
    expect(new Set(ids)).toEqual(new Set(["root", "child", "grandchild"]));
  });

  it("doesn't pull in a sibling subtree outside the given roots", async () => {
    categoryFindManyMock.mockResolvedValue([
      { id: "root", parentId: null },
      { id: "child", parentId: "root" },
      { id: "other-root", parentId: null },
      { id: "other-child", parentId: "other-root" },
    ]);
    const ids = await descendantCategoryIds(["root"]);
    expect(new Set(ids)).toEqual(new Set(["root", "child"]));
  });
});
