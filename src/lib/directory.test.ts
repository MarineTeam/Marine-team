import { describe, it, expect } from "vitest";
import {
  directoryName,
  directoryStanding,
  listed,
  presentMember,
  searchDirectory,
  visibleDirectory,
  type DirectoryRow,
} from "./directory";

const row = (over: Partial<DirectoryRow> = {}): DirectoryRow => ({
  id: "u1",
  name: "Alice Member",
  displayName: null,
  email: "alice@example.com",
  phone: "+15550001",
  picture: null,
  authorized: true,
  directoryListed: true,
  directoryShowEmail: false,
  directoryShowPhone: false,
  directoryNote: null,
  ...over,
});

describe("listed", () => {
  it("needs them to have asked", () => {
    // The default is the feature: a directory somebody is in because they
    // never found the setting is a directory built without consent.
    expect(listed(row({ directoryListed: false }))).toBe(false);
    expect(listed(row({ directoryListed: true }))).toBe(true);
  });

  it("drops somebody whose access was withdrawn", () => {
    // Built from the same `authorized` flag every other page checks, so it
    // takes effect on the next read rather than when a job notices.
    expect(listed(row({ authorized: false }))).toBe(false);
  });

  it("drops somebody with no name to show", () => {
    expect(listed(row({ name: null, displayName: null }))).toBe(false);
    expect(listed(row({ name: "   ", displayName: "" }))).toBe(false);
  });
});

describe("directoryName", () => {
  it("prefers the name they chose", () => {
    expect(directoryName({ name: "Alice Member", displayName: "Ali" })).toBe("Ali");
    expect(directoryName({ name: "Alice Member", displayName: null })).toBe("Alice Member");
  });

  it("never falls back to an email address", () => {
    // rota.ts's personName does, which is right for a rota-builder telling two
    // Daves apart and wrong on a page this many people can open.
    expect(directoryName({ name: null, displayName: null })).toBe("");
  });
});

describe("presentMember", () => {
  it("publishes a name and nothing else by default", () => {
    const seen = presentMember(row());
    expect(seen.name).toBe("Alice Member");
    expect("email" in seen).toBe(false);
    expect("phone" in seen).toBe(false);
  });

  it("treats each contact detail as its own separate yes", () => {
    const withEmail = presentMember(row({ directoryShowEmail: true }));
    expect(withEmail.email).toBe("alice@example.com");
    expect("phone" in withEmail).toBe(false);

    const withPhone = presentMember(row({ directoryShowPhone: true }));
    expect(withPhone.phone).toBe("+15550001");
    expect("email" in withPhone).toBe(false);
  });

  it("leaves the field off rather than sending an empty one", () => {
    // An empty string is something a template will happily wrap a mailto:
    // around.
    const noPhone = presentMember(row({ directoryShowPhone: true, phone: "   " }));
    expect("phone" in noPhone).toBe(false);
  });

  it("carries no other account field out with it", () => {
    const seen = presentMember(row({ directoryShowEmail: true, directoryShowPhone: true }));
    expect(Object.keys(seen).sort()).toEqual(["email", "id", "name", "note", "phone", "picture"]);
  });
});

describe("visibleDirectory", () => {
  const rows = [
    row({ id: "c", name: "Cara" }),
    row({ id: "a", name: "alan" }),
    row({ id: "b", name: "Bea", directoryListed: false }),
    row({ id: "d", name: "Dev", authorized: false }),
  ];

  it("shows only those who asked and still have access, by name", () => {
    expect(visibleDirectory(rows).map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("sorts without caring about case", () => {
    expect(visibleDirectory(rows).map((m) => m.name)).toEqual(["alan", "Cara"]);
  });
});

describe("searchDirectory", () => {
  const members = visibleDirectory([
    row({ id: "a", name: "Alice Member", directoryShowEmail: true, directoryNote: "ask me about the youth group" }),
    row({ id: "b", name: "Bob Neighbour", directoryShowPhone: true }),
  ]);

  it("matches a name and a note", () => {
    expect(searchDirectory(members, "alice").map((m) => m.id)).toEqual(["a"]);
    expect(searchDirectory(members, "youth").map((m) => m.id)).toEqual(["a"]);
  });

  it("never matches a contact detail, even a published one", () => {
    // Searching contact details turns a directory into a lookup service: type
    // a number, find out whose it is. Publishing a phone is not opting in to
    // that.
    expect(searchDirectory(members, "alice@example.com")).toEqual([]);
    expect(searchDirectory(members, "+15550001")).toEqual([]);
  });

  it("returns everybody for an empty query", () => {
    expect(searchDirectory(members, "   ")).toHaveLength(2);
  });
});

describe("directoryStanding", () => {
  it("says plainly where somebody stands", () => {
    expect(directoryStanding({ directoryListed: false, directoryShowEmail: true, directoryShowPhone: true })).toBe(
      "You're not in the directory.",
    );
    expect(directoryStanding({ directoryListed: true, directoryShowEmail: false, directoryShowPhone: false })).toBe(
      "You're listed by name only.",
    );
    expect(directoryStanding({ directoryListed: true, directoryShowEmail: true, directoryShowPhone: false })).toBe(
      "You're listed, with your email.",
    );
    expect(directoryStanding({ directoryListed: true, directoryShowEmail: true, directoryShowPhone: true })).toBe(
      "You're listed, with your email and phone.",
    );
  });
});
