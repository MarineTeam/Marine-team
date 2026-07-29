import { beforeEach, describe, expect, it, vi } from "vitest";

const groupAssignmentFindManyMock = vi.fn();
const categoryFindManyMock = vi.fn();
const seriesFindUniqueMock = vi.fn();
const categoryChainIdsMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    groupAssignment: { findMany: (...args: unknown[]) => groupAssignmentFindManyMock(...args) },
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
    groupAssignmentFindManyMock.mockReset();
    categoryChainIdsMock.mockReset();
    seriesFindUniqueMock.mockReset().mockResolvedValue({ categoryId: null });
  });

  it("always passes for an admin, without querying assignments", async () => {
    expect(await hasCapability(admin, "manage_users")).toBe(true);
    expect(groupAssignmentFindManyMock).not.toHaveBeenCalled();
  });

  it("fails when the user has no matching assignment", async () => {
    groupAssignmentFindManyMock.mockResolvedValue([]);
    expect(await hasCapability(member, "manage_users")).toBe(false);
  });

  it("passes on a site-wide assignment (no category or series), even with no scope given", async () => {
    groupAssignmentFindManyMock.mockResolvedValue([{ categoryId: null, seriesId: null }]);
    expect(await hasCapability(member, "manage_users")).toBe(true);
  });

  it("fails a scoped-only assignment when no scope is given", async () => {
    groupAssignmentFindManyMock.mockResolvedValue([{ categoryId: "cat1", seriesId: null }]);
    expect(await hasCapability(member, "manage_series")).toBe(false);
  });

  it("passes when the assignment's seriesId exactly matches the requested scope", async () => {
    groupAssignmentFindManyMock.mockResolvedValue([{ categoryId: null, seriesId: "series1" }]);
    expect(await hasCapability(member, "manage_series", { seriesId: "series1" })).toBe(true);
  });

  it("passes when the assignment's category is an ancestor of the scoped category", async () => {
    groupAssignmentFindManyMock.mockResolvedValue([{ categoryId: "grandparent", seriesId: null }]);
    categoryChainIdsMock.mockResolvedValue(["child", "parent", "grandparent"]);
    expect(await hasCapability(member, "manage_series", { categoryId: "child" })).toBe(true);
    expect(categoryChainIdsMock).toHaveBeenCalledWith("child");
  });

  it("fails when the assignment's category is outside the scoped category's chain", async () => {
    groupAssignmentFindManyMock.mockResolvedValue([{ categoryId: "unrelated", seriesId: null }]);
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
