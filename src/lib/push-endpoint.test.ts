import { describe, it, expect } from "vitest";
import { isPushServiceEndpoint, MAX_SUBSCRIPTIONS_PER_USER, subscriptionsToEvict } from "./push-endpoint";

describe("isPushServiceEndpoint", () => {
  it("accepts the endpoints real browsers hand out", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/dA1b:APA91b...",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA...",
      "https://wns2-bn1p.notify.windows.com/w/?token=BQYAAA...",
      "https://web.push.apple.com/QGxnc2...",
      "https://eu.push.samsungosp.com/v1/abc",
      "https://android.googleapis.com/gcm/send/abc",
    ]) {
      expect(isPushServiceEndpoint(url, undefined), url).toBe(true);
    }
  });

  it("refuses anything else — including hosts that merely contain a service's name", () => {
    for (const url of [
      "https://example.com/hook",
      "https://fcm.googleapis.com.evil.net/x",
      "https://evilfcm.googleapis.com/x",
      "https://notify.windows.com.attacker.io/w",
      "https://10.0.0.5/internal",
      "https://localhost:3000/api/admin/users",
      "https://169.254.169.254/latest/meta-data/",
    ]) {
      expect(isPushServiceEndpoint(url, undefined), url).toBe(false);
    }
  });

  it("refuses plain http even to a real service, and credentials in the URL", () => {
    expect(isPushServiceEndpoint("http://fcm.googleapis.com/fcm/send/x", undefined)).toBe(false);
    expect(isPushServiceEndpoint("https://user:pw@fcm.googleapis.com/fcm/send/x", undefined)).toBe(false);
  });

  it("refuses what isn't a URL at all", () => {
    expect(isPushServiceEndpoint("not a url", undefined)).toBe(false);
    expect(isPushServiceEndpoint("", undefined)).toBe(false);
  });

  it("lets a deployment add a host suffix by environment", () => {
    expect(isPushServiceEndpoint("https://push.example-browser.org/v1/x", undefined)).toBe(false);
    expect(isPushServiceEndpoint("https://push.example-browser.org/v1/x", "push.example-browser.org")).toBe(true);
    expect(isPushServiceEndpoint("https://a.push.example-browser.org/v1/x", " Push.Example-Browser.org , other.net")).toBe(true);
  });
});

describe("subscriptionsToEvict", () => {
  const at = (n: number) => ({ id: `s${n}`, createdAt: new Date(2026, 0, n) });

  it("evicts nothing while there is room for one more", () => {
    const seven = Array.from({ length: MAX_SUBSCRIPTIONS_PER_USER - 1 }, (_, i) => at(i + 1));
    expect(subscriptionsToEvict(seven)).toEqual([]);
  });

  it("evicts the oldest to leave room for exactly one more", () => {
    const eight = Array.from({ length: MAX_SUBSCRIPTIONS_PER_USER }, (_, i) => at(i + 1));
    expect(subscriptionsToEvict(eight).map((s) => s.id)).toEqual(["s1"]);
  });

  it("evicts as many as it takes when a member is already far over", () => {
    const many = Array.from({ length: 30 }, (_, i) => at(30 - i));
    const gone = subscriptionsToEvict(many);
    expect(gone).toHaveLength(30 - (MAX_SUBSCRIPTIONS_PER_USER - 1));
    expect(gone[0].id).toBe("s1");
    expect(gone[gone.length - 1].id).toBe(`s${30 - (MAX_SUBSCRIPTIONS_PER_USER - 1)}`);
  });
});
