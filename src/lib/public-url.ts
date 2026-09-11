/**
 * Whether a URL an administrator typed points somewhere public.
 *
 * Webhooks are URLs this server POSTs to on publish. An address inside the
 * network the server runs on would turn "notify my Zapier" into "make the
 * server call something only it can reach". On the platform this app deploys
 * to there is no such network, so this is belt and braces — but it is cheap,
 * and a self-hosted copy would be glad of it.
 *
 * This is a check of the *literal* host. It does not resolve names, so a
 * public hostname that resolves to a private address is not caught here;
 * that would need a lookup at send time, which is a different change.
 */

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".intranet"];

function ipv4Private(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, and cloud metadata services
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast and reserved
  );
}

function ipv6Private(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80:") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("ff")) return true; // multicast
  // IPv4 mapped. Typed as ::ffff:10.0.0.1, but the URL parser serialises it
  // as ::ffff:a00:1 — two hex words — so both spellings are unpacked.
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (dotted) return ipv4Private(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return false;
}

export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (!host) return false;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  // A bare name — `intranet`, `db`, and `localhost` itself — only means
  // something inside a network. (A mutation test showed a separate localhost
  // check here did nothing this line doesn't; it was removed rather than kept
  // as decoration.)
  if (!host.includes(".") && !host.startsWith("[")) return false;

  if (host.startsWith("[") && host.endsWith("]")) return !ipv6Private(host.slice(1, -1));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !ipv4Private(host);
  return true;
}
