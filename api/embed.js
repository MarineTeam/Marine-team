// ============================================================
//  /api/embed?video=<guid>   — Vercel serverless function (Node)
// ------------------------------------------------------------
//  Gates sermon video behind an Auth0 login and returns a short-lived,
//  signed bunny.net Stream embed URL. Mirrors the signing used in the
//  Marine video portals (SHA256(TOKEN_KEY + videoId + expires)).
//
//  The bunny token-auth key never reaches the browser — it lives only in
//  Vercel env. The browser sends the member's Auth0 access token; we verify
//  it against Auth0's /userinfo before signing.
//
//  Required Vercel env vars (Project → Settings → Environment Variables):
//    AUTH0_DOMAIN          e.g. your-tenant.us.auth0.com
//    BUNNY_LIBRARY_ID      your bunny Stream library id
//    BUNNY_TOKEN_AUTH_KEY  library → Security → Token Authentication key (SECRET)
// ============================================================
import crypto from 'crypto';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signEmbed(videoId, ttl = 3600) {
  const libraryId = (process.env.BUNNY_LIBRARY_ID || '').trim();
  const key = (process.env.BUNNY_TOKEN_AUTH_KEY || '').trim();
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const token = crypto.createHash('sha256').update(`${key}${videoId}${expires}`).digest('hex');
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}&autoplay=true`;
}

async function verifyMember(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const domain = (process.env.AUTH0_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!domain) return false;
  try {
    const r = await fetch(`https://${domain}/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok; // 200 ⇒ Auth0 accepted the access token
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const video = String(req.query.video || '');
  if (!GUID_RE.test(video)) { res.status(400).json({ error: 'Invalid or missing video id' }); return; }

  if (!process.env.BUNNY_LIBRARY_ID || !process.env.BUNNY_TOKEN_AUTH_KEY) {
    res.status(500).json({ error: 'Video hosting is not configured on the server.' }); return;
  }

  const ok = await verifyMember(req);
  if (!ok) { res.status(401).json({ error: 'Please sign in to watch this message.' }); return; }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ url: signEmbed(video), expiresIn: 3600 });
}
