import { describe, it, expect } from "vitest";
import { isPublicHttpUrl } from "./public-url";

describe("isPublicHttpUrl", () => {
  it("accepts ordinary public endpoints", () => {
    expect(isPublicHttpUrl("https://hooks.zapier.com/hooks/catch/1/abc")).toBe(true);
    expect(isPublicHttpUrl("http://example.org/notify")).toBe(true);
    expect(isPublicHttpUrl("https://8.8.8.8/x")).toBe(true);
    expect(isPublicHttpUrl("https://[2001:db8::1]/x")).toBe(true);
  });

  it("refuses loopback, private and link-local addresses", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://172.16.0.1/",
      "http://172.31.255.255/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/",
      "http://0.0.0.0/",
      "http://[::1]/",
      "http://[fe80::1]/",
      "http://[fd00::1]/",
      "http://[::ffff:10.0.0.1]/",
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it("refuses names that only mean something inside a network", () => {
    for (const url of [
      "http://localhost/",
      "http://localhost:3000/api/admin/users",
      "http://db.internal/",
      "http://printer.local/",
      "http://router.home.arpa/",
      "http://intranet/",
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it("does not block a public range that merely neighbours a private one", () => {
    expect(isPublicHttpUrl("http://172.15.0.1/")).toBe(true);
    expect(isPublicHttpUrl("http://172.32.0.1/")).toBe(true);
    expect(isPublicHttpUrl("http://100.63.0.1/")).toBe(true);
    expect(isPublicHttpUrl("http://100.128.0.1/")).toBe(true);
    expect(isPublicHttpUrl("http://11.0.0.1/")).toBe(true);
  });

  it("refuses other schemes, credentials, and non-URLs", () => {
    expect(isPublicHttpUrl("ftp://example.org/")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isPublicHttpUrl("https://user:pw@example.org/")).toBe(false);
    expect(isPublicHttpUrl("nope")).toBe(false);
  });
});
