import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();
const upsertMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    authorizedEmail: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      upsert: (...args: unknown[]) => upsertMock(...args),
    },
  },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

const {
  allowedOrganizationIds,
  authorizationMode,
  authorizeIdentity,
  denialReasonFor,
  isAuthorized,
  isEmailAuthorized,
  isOrganizationMember,
  isValidEmail,
  normalizeEmail,
} = await import("./authorization");

const ORG = "org_marineteam";

beforeEach(() => {
  findUniqueMock.mockReset().mockResolvedValue(null);
  upsertMock.mockReset().mockResolvedValue({});
  process.env.AUTH0_ORGANIZATION_ID = ORG;
  process.env.ADMIN_EMAILS = "";
  delete process.env.AUTHORIZATION_MODE;
});

afterEach(() => {
  delete process.env.AUTH0_ORGANIZATION_ID;
  delete process.env.AUTHORIZATION_MODE;
});

describe("normalizeEmail", () => {
  it("lowercases and trims, so casing and stray spaces can't make a second identity", () => {
    expect(normalizeEmail("Alice@Example.com")).toBe("alice@example.com");
    expect(normalizeEmail("  ALICE@EXAMPLE.COM  ")).toBe("alice@example.com");
    expect(normalizeEmail("\talice@example.com\n")).toBe("alice@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
    expect(isValidEmail("alice.smith+tag@sub.example.co.uk")).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("alice")).toBe(false);
    expect(isValidEmail("alice@localhost")).toBe(false);
    expect(isValidEmail("a@b@c.com")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });

  it("rejects anything that could be used for header, log, or SQL-ish injection", () => {
    expect(isValidEmail("alice@example.com\nBcc: evil@example.com")).toBe(false);
    expect(isValidEmail("alice@example.com\r\nSubject: x")).toBe(false);
    expect(isValidEmail("alice'@example.com")).toBe(false);
    expect(isValidEmail("alice;drop@example.com")).toBe(false);
    expect(isValidEmail("alice <alice@example.com>")).toBe(false);
  });
});

describe("isOrganizationMember", () => {
  it("accepts only the configured organization", () => {
    expect(isOrganizationMember(ORG)).toBe(true);
    expect(isOrganizationMember("org_someone_else")).toBe(false);
  });

  it("refuses a missing claim — a personal account carries no org_id", () => {
    expect(isOrganizationMember(null)).toBe(false);
    expect(isOrganizationMember(undefined)).toBe(false);
    expect(isOrganizationMember("")).toBe(false);
  });

  it("fails closed when the organization isn't configured, rather than passing everyone", () => {
    delete process.env.AUTH0_ORGANIZATION_ID;
    expect(isOrganizationMember(ORG)).toBe(false);
    expect(isOrganizationMember(null)).toBe(false);
  });

  it("accepts any organization in a comma-separated list, and rejects one that isn't listed", () => {
    process.env.AUTH0_ORGANIZATION_ID = "org_a,org_b";
    expect(isOrganizationMember("org_a")).toBe(true);
    expect(isOrganizationMember("org_b")).toBe(true);
    expect(isOrganizationMember("org_c")).toBe(false);
  });

  it("tolerates whitespace around each id in the list", () => {
    process.env.AUTH0_ORGANIZATION_ID = "  org_a ,  org_b  ";
    expect(isOrganizationMember("org_a")).toBe(true);
    expect(isOrganizationMember("org_b")).toBe(true);
  });

  it("fails closed on a whitespace- or comma-only value, not just an unset one", () => {
    process.env.AUTH0_ORGANIZATION_ID = " , , ";
    expect(isOrganizationMember(ORG)).toBe(false);
    expect(allowedOrganizationIds()).toEqual([]);
  });
});

describe("allowedOrganizationIds", () => {
  it("parses a single value the same as before — the existing single-org deployment shape", () => {
    expect(allowedOrganizationIds()).toEqual([ORG]);
  });

  it("parses a comma-separated list, trimmed and with empties dropped", () => {
    process.env.AUTH0_ORGANIZATION_ID = "org_a, org_b ,,org_c";
    expect(allowedOrganizationIds()).toEqual(["org_a", "org_b", "org_c"]);
  });

  it("is empty when unset", () => {
    delete process.env.AUTH0_ORGANIZATION_ID;
    expect(allowedOrganizationIds()).toEqual([]);
  });
});

describe("isEmailAuthorized", () => {
  it("passes an ACTIVE row", async () => {
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    expect(await isEmailAuthorized("alice@example.com")).toBe(true);
  });

  it("looks the address up normalized, whatever casing or spacing was given", async () => {
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    await isEmailAuthorized("  Alice@Example.COM ");
    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "alice@example.com" } }),
    );
  });

  it("refuses a SUSPENDED row", async () => {
    findUniqueMock.mockResolvedValue({ status: "SUSPENDED" });
    expect(await isEmailAuthorized("alice@example.com")).toBe(false);
  });

  it("refuses an address with no row", async () => {
    expect(await isEmailAuthorized("stranger@example.com")).toBe(false);
  });

  it("refuses empty or malformed input without querying at all", async () => {
    expect(await isEmailAuthorized(null)).toBe(false);
    expect(await isEmailAuthorized("")).toBe(false);
    expect(await isEmailAuthorized("not-an-email")).toBe(false);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("adopts an ADMIN_EMAILS address with no row, creating a visible entry for it", async () => {
    process.env.ADMIN_EMAILS = "boss@example.com";
    expect(await isEmailAuthorized("Boss@Example.com")).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "boss@example.com" } }),
    );
  });

  it("does not revive an ADMIN_EMAILS address an administrator suspended", async () => {
    process.env.ADMIN_EMAILS = "boss@example.com";
    findUniqueMock.mockResolvedValue({ status: "SUSPENDED" });
    expect(await isEmailAuthorized("boss@example.com")).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("authorizationMode", () => {
  it("defaults to requiring both checks", () => {
    expect(authorizationMode()).toBe("BOTH");
  });

  it("accepts the three modes, case-insensitively and untrimmed", () => {
    process.env.AUTHORIZATION_MODE = "organization";
    expect(authorizationMode()).toBe("ORGANIZATION");
    process.env.AUTHORIZATION_MODE = "  AllowList  ";
    expect(authorizationMode()).toBe("ALLOWLIST");
    process.env.AUTHORIZATION_MODE = "BOTH";
    expect(authorizationMode()).toBe("BOTH");
  });

  it("falls back to BOTH for anything unrecognised, rather than to something permissive", () => {
    // A typo in an environment variable must never be what opens a door.
    for (const value of ["", "  ", "NONE", "OFF", "false", "EITHER", "ALL"]) {
      process.env.AUTHORIZATION_MODE = value;
      expect(authorizationMode()).toBe("BOTH");
    }
  });
});

describe("isAuthorized — every mode against every combination", () => {
  const cases: [string, boolean, boolean, boolean, boolean, boolean][] = [
    // mode label,        org,   email, BOTH,  ORGANIZATION, ALLOWLIST
    ["neither", false, false, false, false, false],
    ["email only", false, true, false, false, true],
    ["org only", true, false, false, true, false],
    ["both", true, true, true, true, true],
  ];

  for (const [label, org, email, both, orgMode, allowlistMode] of cases) {
    it(`${label}: BOTH=${both} ORGANIZATION=${orgMode} ALLOWLIST=${allowlistMode}`, () => {
      expect(isAuthorized("BOTH", org, email)).toBe(both);
      expect(isAuthorized("ORGANIZATION", org, email)).toBe(orgMode);
      expect(isAuthorized("ALLOWLIST", org, email)).toBe(allowlistMode);
    });
  }

  it("never lets any mode admit someone who failed every check", () => {
    for (const mode of ["BOTH", "ORGANIZATION", "ALLOWLIST"] as const) {
      expect(isAuthorized(mode, false, false)).toBe(false);
    }
  });
});

describe("denialReasonFor", () => {
  it("names whichever halves failed, under BOTH", () => {
    expect(denialReasonFor("BOTH", false, false)).toBe("NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED");
    expect(denialReasonFor("BOTH", false, true)).toBe("NOT_ORG_MEMBER");
    expect(denialReasonFor("BOTH", true, false)).toBe("EMAIL_NOT_AUTHORIZED");
  });

  it("only blames checks the mode actually enforces", () => {
    // Under ORGANIZATION mode the allowlist didn't cause the refusal, so
    // saying it did would send an administrator to fix the wrong thing.
    expect(denialReasonFor("ORGANIZATION", false, false)).toBe("NOT_ORG_MEMBER");
    expect(denialReasonFor("ALLOWLIST", false, false)).toBe("EMAIL_NOT_AUTHORIZED");
  });
});

describe("authorizeIdentity in a single-check mode", () => {
  it("ORGANIZATION: an org member gets in with no allowlist row", async () => {
    process.env.AUTHORIZATION_MODE = "ORGANIZATION";
    const result = await authorizeIdentity({ email: "newhire@example.com", orgId: ORG });
    expect(result.allowed).toBe(true);
    // Both results are still reported, so a later tightening can be planned.
    expect(result).toMatchObject({ organizationMember: true, emailAuthorized: false });
  });

  it("ORGANIZATION: a non-member is still refused even when allowlisted", async () => {
    process.env.AUTHORIZATION_MODE = "ORGANIZATION";
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    expect((await authorizeIdentity({ email: "alice@example.com", orgId: null })).allowed).toBe(false);
  });

  it("ALLOWLIST: an allowlisted address gets in with no organization claim", async () => {
    process.env.AUTHORIZATION_MODE = "ALLOWLIST";
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    const result = await authorizeIdentity({ email: "alice@example.com", orgId: null });
    expect(result.allowed).toBe(true);
  });

  it("ALLOWLIST: an org member with no allowlist row is still refused", async () => {
    process.env.AUTHORIZATION_MODE = "ALLOWLIST";
    expect((await authorizeIdentity({ email: "newhire@example.com", orgId: ORG })).allowed).toBe(false);
  });

  it("ALLOWLIST: suspension still revokes", async () => {
    process.env.AUTHORIZATION_MODE = "ALLOWLIST";
    findUniqueMock.mockResolvedValue({ status: "SUSPENDED" });
    expect((await authorizeIdentity({ email: "alice@example.com", orgId: ORG })).allowed).toBe(false);
  });

  it("an unrecognised mode is treated as BOTH, not as a bypass", async () => {
    process.env.AUTHORIZATION_MODE = "NONE";
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    expect((await authorizeIdentity({ email: "alice@example.com", orgId: null })).allowed).toBe(false);
  });
});

describe("authorizeIdentity — the whole truth table", () => {
  it("DENY: not in the organization, not on the allowlist", async () => {
    const result = await authorizeIdentity({ email: "stranger@example.com", orgId: null });
    expect(result.allowed).toBe(false);
    expect(result).toMatchObject({ organizationMember: false, emailAuthorized: false });
  });

  it("DENY: not in the organization, but on the allowlist", async () => {
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    const result = await authorizeIdentity({ email: "alice@example.com", orgId: null });
    expect(result.allowed).toBe(false);
    expect(result).toMatchObject({ organizationMember: false, emailAuthorized: true });
  });

  it("DENY: in the organization, but not on the allowlist", async () => {
    const result = await authorizeIdentity({ email: "newhire@example.com", orgId: ORG });
    expect(result.allowed).toBe(false);
    expect(result).toMatchObject({ organizationMember: true, emailAuthorized: false });
  });

  it("ALLOW: in the organization and on the allowlist", async () => {
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    const result = await authorizeIdentity({ email: "alice@example.com", orgId: ORG });
    expect(result.allowed).toBe(true);
  });

  it("DENY: a different organization's id can't stand in for ours", async () => {
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    const result = await authorizeIdentity({ email: "alice@example.com", orgId: "org_attacker" });
    expect(result.allowed).toBe(false);
  });

  it("ALLOW is unaffected by casing or whitespace in the email", async () => {
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    expect((await authorizeIdentity({ email: "  ALICE@example.com ", orgId: ORG })).allowed).toBe(true);
  });

  it("DENY: suspending the allowlist entry revokes an existing organization member", async () => {
    findUniqueMock.mockResolvedValue({ status: "SUSPENDED" });
    const result = await authorizeIdentity({ email: "alice@example.com", orgId: ORG });
    expect(result.allowed).toBe(false);
    expect(result).toMatchObject({ organizationMember: true, emailAuthorized: false });
  });

  it("evaluates both halves even when the first fails, so the record says which", async () => {
    findUniqueMock.mockResolvedValue({ status: "ACTIVE" });
    await authorizeIdentity({ email: "alice@example.com", orgId: "org_wrong" });
    expect(findUniqueMock).toHaveBeenCalled();
  });
});
