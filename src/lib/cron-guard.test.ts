import { describe, it, expect } from "vitest";
import { cronVerdict } from "./cron-guard";

describe("cronVerdict", () => {
  it("lets the right bearer token through", () => {
    expect(cronVerdict("Bearer s3cret", "s3cret", true)).toBe("ok");
  });

  it("refuses a wrong token, a missing header, and a token of another length", () => {
    expect(cronVerdict("Bearer nope", "s3cret", true)).toBe("refused");
    expect(cronVerdict(null, "s3cret", true)).toBe("refused");
    expect(cronVerdict("Bearer s3cret-but-longer", "s3cret", true)).toBe("refused");
    expect(cronVerdict("s3cret", "s3cret", true)).toBe("refused");
  });

  it("fails closed in production when no secret is configured", () => {
    // The old per-route check answered "ok" here. That is the finding.
    expect(cronVerdict(null, undefined, true)).toBe("unconfigured");
    expect(cronVerdict("Bearer anything", undefined, true)).toBe("unconfigured");
    expect(cronVerdict(null, "", true)).toBe("unconfigured");
  });

  it("stays open in development when no secret is configured", () => {
    expect(cronVerdict(null, undefined, false)).toBe("ok");
  });

  it("still checks a secret that is set, in development too", () => {
    expect(cronVerdict("Bearer nope", "s3cret", false)).toBe("refused");
  });
});
