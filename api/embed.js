// ============================================================
//  /api/embed?video=<guid>   — Vercel serverless function (Node)
// ------------------------------------------------------------
//  Returns a short-lived, signed bunny.net Stream embed URL. Mirrors the
//  signing used in the Marine video portals (SHA256(TOKEN_KEY + videoId + expires)).
//
//  Access control per message:
//    • Guest message  (members_only = false) → anyone can watch, no login.
//    • Members message (members_only = true)  → requires a valid Auth0 login.
//  We look the message up in Supabase (by video_id) to decide. The bunny
//  token-auth key never reaches the browser — it lives only in Vercel env.
//
//  Required Vercel env vars:
//    BUNNY_LIBRARY_ID, BUNNY_TOKEN_AUTH_KEY
//    AUTH0_DOMAIN                       (verify member tokens)
//    SUPABASE_URL, SUPABASE_ANON_KEY    (look up the message's access level)
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

// Is this video attached to a PUBLISHED, GUEST (members_only=false) message?
// Uses the anon key, whose RLS only exposes published rows — so drafts and
// members-only messages never resolve as guest here.
async function isGuestVideo(videoId) {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anon) return false;
  try {
    const r = await fetch(
      `${url}/rest/v1/sermons?video_id=eq.${encodeURIComponent(videoId)}&members_only=eq.false&select=id&limit=1`,
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
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
    res.status(500).json({ error: 'Server is missing BUNNY_LIBRARY_ID / BUNNY_TOKEN_AUTH_KEY env vars.' }); return;
  }

  // Guest message → sign immediately. Otherwise require an Auth0 member.
  const guest = await isGuestVideo(video);
  if (!guest) {
    const ok = await verifyMember(req);
    if (!ok) {
      const why = (process.env.AUTH0_DOMAIN || '').trim()
        ? 'Please sign in to watch this message.'
        : 'Server is missing the AUTH0_DOMAIN env var.';
      res.status(401).json({ error: why }); return;
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ url: signEmbed(video), access: guest ? 'guest' : 'member', expiresIn: 3600 });
}
