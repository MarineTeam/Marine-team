import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.fn();
const findManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
    watchProgress: { findMany: (...args: unknown[]) => findManyMock(...args) },
  },
}));

const { canAccess, categoryChainIds, getSequentialLockedVideoIds } = await import("./content");

describe("canAccess", () => {
  it("allows anyone to a non-member-only item", () => {
    expect(canAccess(false, false)).toBe(true);
    expect(canAccess(false, true)).toBe(true);
  });

  it("requires login for a member-only item", () => {
    expect(canAccess(true, false)).toBe(false);
    expect(canAccess(true, true)).toBe(true);
  });
});

describe("categoryChainIds", () => {
  beforeEach(() => queryRawMock.mockReset());

  it("maps the recursive query's rows to a flat id list, root-most last", async () => {
    queryRawMock.mockResolvedValue([{ id: "child" }, { id: "parent" }, { id: "grandparent" }]);
    const ids = await categoryChainIds("child");
    expect(ids).toEqual(["child", "parent", "grandparent"]);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("returns just the category itself when it has no parent", async () => {
    queryRawMock.mockResolvedValue([{ id: "only" }]);
    expect(await categoryChainIds("only")).toEqual(["only"]);
  });
});

describe("getSequentialLockedVideoIds", () => {
  beforeEach(() => findManyMock.mockReset());

  it("locks nothing for an anonymous viewer, without querying progress", async () => {
    const locked = await getSequentialLockedVideoIds(null, {
      requireSequential: true,
      videos: [
        { id: "v1", position: 0 },
        { id: "v2", position: 1 },
      ],
    });
    expect(locked.size).toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("locks nothing when the series doesn't require sequential viewing", async () => {
    const locked = await getSequentialLockedVideoIds("user1", {
      requireSequential: false,
      videos: [
        { id: "v1", position: 0 },
        { id: "v2", position: 1 },
      ],
    });
    expect(locked.size).toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("locks every video after the first one not yet completed", async () => {
    findManyMock.mockResolvedValue([{ videoId: "v1", completed: true }]);
    const locked = await getSequentialLockedVideoIds("user1", {
      requireSequential: true,
      videos: [
        { id: "v1", position: 0 },
        { id: "v2", position: 1 },
        { id: "v3", position: 2 },
      ],
    });
    // v2 unlocks because v1 is completed; v3 stays locked because v2 isn't.
    expect(locked).toEqual(new Set(["v3"]));
  });

  it("locks everything past the first video when nothing is completed", async () => {
    findManyMock.mockResolvedValue([]);
    const locked = await getSequentialLockedVideoIds("user1", {
      requireSequential: true,
      videos: [
        { id: "v1", position: 0 },
        { id: "v2", position: 1 },
      ],
    });
    expect(locked).toEqual(new Set(["v2"]));
  });

  it("sorts by position before deriving locks, regardless of input order", async () => {
    findManyMock.mockResolvedValue([{ videoId: "v1", completed: true }]);
    const locked = await getSequentialLockedVideoIds("user1", {
      requireSequential: true,
      videos: [
        { id: "v2", position: 1 },
        { id: "v1", position: 0 },
      ],
    });
    expect(locked.size).toBe(0);
  });
});
