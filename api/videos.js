// ============================================================
//  /api/videos  — Vercel serverless function (Node)
// ------------------------------------------------------------
//  Lists the bunny.net Stream library so staff can sync + publish videos,
//  exactly like the Marine video portals' lib/bunny.js listVideos().
//  The bunny API key stays server-side; only authenticated staff may call
//  this (we verify their Supabase access token against Supabase Auth).
//
//  Required Vercel env vars:
//    BUNNY_LIBRARY_ID, BUNNY_API_KEY
//    SUPABASE_URL, SUPABASE_ANON_KEY   (to verify the staff token)
//    BUNNY_CDN_HOSTNAME (optional, for thumbnails, e.g. vz-xxxx.b-cdn.net)
// ============================================================

async function verifyStaff(req) {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anon) return { ok: false, code: 500, error: 'Server is missing SUPABASE_URL / SUPABASE_ANON_KEY env vars.' };
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { ok: false, code: 401, error: 'No staff token — sign in to the admin, then Sync.' };
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (r.ok) return { ok: true };
    return { ok: false, code: 401, error: 'Staff session invalid or expired — sign in again.' };
  } catch { return { ok: false, code: 502, error: 'Could not reach Supabase to verify staff.' }; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const libraryId = (process.env.BUNNY_LIBRARY_ID || '').trim();
  const apiKey = (process.env.BUNNY_API_KEY || '').trim();
  if (!libraryId || !apiKey) { res.status(500).json({ error: 'Server is missing BUNNY_LIBRARY_ID / BUNNY_API_KEY env vars.' }); return; }

  const staff = await verifyStaff(req);
  if (!staff.ok) { res.status(staff.code).json({ error: staff.error }); return; }

  try {
    const r = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos?page=1&itemsPerPage=100&orderBy=date`,
      { headers: { AccessKey: apiKey, accept: 'application/json' } }
    );
    if (!r.ok) { res.status(502).json({ error: `bunny.net API error: ${r.status}` }); return; }
    const data = await r.json();
    const host = (process.env.BUNNY_CDN_HOSTNAME || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const items = (data.items || []).map(v => ({
      guid: v.guid,
      title: v.title || 'Untitled',
      length: v.length || 0,
      status: v.status,                                   // 4 = ready
      thumbnail: host && v.thumbnailFileName ? `https://${host}/${v.guid}/${v.thumbnailFileName}` : '',
      dateUploaded: v.dateUploaded
    }));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reach bunny.net.' });
  }
}
