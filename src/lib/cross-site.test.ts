import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { isCrossSiteWrite } from "./cross-site";

const req = (method: string, path: string, site?: string) =>
  new NextRequest(`https://church.example${path}`, {
    method,
    headers: site === undefined ? {} : { "sec-fetch-site": site },
  });

describe("isCrossSiteWrite", () => {
  it("refuses a write to the API that the browser labels cross-site", () => {
    expect(isCrossSiteWrite(req("POST", "/api/view-events", "cross-site"))).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", "/api/notes/abc", "cross-site"))).toBe(true);
    expect(isCrossSiteWrite(req("PATCH", "/api/profile", "Cross-Site"))).toBe(true);
  });

  it("lets same-origin, same-site and typed-in requests through", () => {
    expect(isCrossSiteWrite(req("POST", "/api/view-events", "same-origin"))).toBe(false);
    expect(isCrossSiteWrite(req("POST", "/api/view-events", "same-site"))).toBe(false);
    expect(isCrossSiteWrite(req("POST", "/api/view-events", "none"))).toBe(false);
  });

  it("lets a caller with no such header through — servers and televisions", () => {
    // Auth0's registration check, a Roku polling for its token, an API key.
    expect(isCrossSiteWrite(req("POST", "/api/auth/registration-check"))).toBe(false);
    expect(isCrossSiteWrite(req("POST", "/api/tv/poll"))).toBe(false);
  });

  it("never touches a read, wherever it came from", () => {
    expect(isCrossSiteWrite(req("GET", "/api/v1/events", "cross-site"))).toBe(false);
    expect(isCrossSiteWrite(req("HEAD", "/api/tv/feed.json", "cross-site"))).toBe(false);
    expect(isCrossSiteWrite(req("OPTIONS", "/api/anything", "cross-site"))).toBe(false);
  });

  it("covers only the API, not pages or the SDK's auth routes", () => {
    expect(isCrossSiteWrite(req("POST", "/auth/callback", "cross-site"))).toBe(false);
    expect(isCrossSiteWrite(req("POST", "/some/page", "cross-site"))).toBe(false);
  });
});
