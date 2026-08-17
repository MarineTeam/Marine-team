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
  authorizeIdentity,
  denialReasonFor,
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
});

afterEach(() => {
  delete process.env.AUTH0_ORGANIZATION_ID;
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

describe("denialReasonFor", () => {
  it("names whichever halves failed", () => {
    expect(denialReasonFor(false, false)).toBe("NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED");
    expect(denialReasonFor(false, true)).toBe("NOT_ORG_MEMBER");
    expect(denialReasonFor(true, false)).toBe("EMAIL_NOT_AUTHORIZED");
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
