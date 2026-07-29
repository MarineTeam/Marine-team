import { beforeEach, describe, expect, it, vi } from "vitest";

const pluginFindManyMock = vi.fn();
const overrideFindManyMock = vi.fn();
const categoryFindManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    plugin: { findMany: (...args: unknown[]) => pluginFindManyMock(...args) },
    pluginCategoryOverride: { findMany: (...args: unknown[]) => overrideFindManyMock(...args) },
    category: { findMany: (...args: unknown[]) => categoryFindManyMock(...args) },
  },
}));

const { getPluginStates } = await import("./plugins");

describe("getPluginStates", () => {
  beforeEach(() => {
    pluginFindManyMock.mockReset();
    overrideFindManyMock.mockReset().mockResolvedValue([]);
    categoryFindManyMock.mockReset().mockResolvedValue([]);
  });

  it("uses the site-wide value with no category context", async () => {
    pluginFindManyMock.mockResolvedValue([{ id: "p1", slug: "comments", enabled: false }]);
    const states = await getPluginStates();
    expect(states.comments).toBe(false);
    expect(categoryFindManyMock).not.toHaveBeenCalled();
  });

  it("fails open for a plugin with no seeded row", async () => {
    pluginFindManyMock.mockResolvedValue([]);
    const states = await getPluginStates();
    expect(states.comments).toBe(true);
  });

  it("applies a direct override on the given category", async () => {
    pluginFindManyMock.mockResolvedValue([{ id: "p1", slug: "comments", enabled: true }]);
    overrideFindManyMock.mockResolvedValue([{ pluginId: "p1", categoryId: "cat1", enabled: false }]);
    categoryFindManyMock.mockResolvedValue([{ id: "cat1", parentId: null }]);
    const states = await getPluginStates("cat1");
    expect(states.comments).toBe(false);
  });

  it("walks up to an ancestor's override when the category has none of its own", async () => {
    pluginFindManyMock.mockResolvedValue([{ id: "p1", slug: "comments", enabled: true }]);
    overrideFindManyMock.mockResolvedValue([{ pluginId: "p1", categoryId: "grandparent", enabled: false }]);
    categoryFindManyMock.mockResolvedValue([
      { id: "child", parentId: "parent" },
      { id: "parent", parentId: "grandparent" },
      { id: "grandparent", parentId: null },
    ]);
    const states = await getPluginStates("child");
    expect(states.comments).toBe(false);
  });

  it("prefers the nearest override over a more distant ancestor's", async () => {
    pluginFindManyMock.mockResolvedValue([{ id: "p1", slug: "comments", enabled: true }]);
    overrideFindManyMock.mockResolvedValue([
      { pluginId: "p1", categoryId: "grandparent", enabled: false },
      { pluginId: "p1", categoryId: "parent", enabled: true },
    ]);
    categoryFindManyMock.mockResolvedValue([
      { id: "child", parentId: "parent" },
      { id: "parent", parentId: "grandparent" },
      { id: "grandparent", parentId: null },
    ]);
    // Site-wide is enabled and the grandparent override disables it, but the
    // nearer parent override re-enables it — that's the one that should win.
    const states = await getPluginStates("child");
    expect(states.comments).toBe(true);
  });

  it("falls back to the site-wide value when no override matches the chain", async () => {
    pluginFindManyMock.mockResolvedValue([{ id: "p1", slug: "comments", enabled: true }]);
    overrideFindManyMock.mockResolvedValue([{ pluginId: "p1", categoryId: "unrelated", enabled: false }]);
    categoryFindManyMock.mockResolvedValue([
      { id: "child", parentId: "parent" },
      { id: "parent", parentId: null },
    ]);
    const states = await getPluginStates("child");
    expect(states.comments).toBe(true);
  });
});
