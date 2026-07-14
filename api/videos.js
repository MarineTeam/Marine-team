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
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!token || !url || !anon) return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    return r.ok; // 200 ⇒ a valid, logged-in Supabase (staff) user
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const libraryId = (process.env.BUNNY_LIBRARY_ID || '').trim();
  const apiKey = (process.env.BUNNY_API_KEY || '').trim();
  if (!libraryId || !apiKey) { res.status(500).json({ error: 'bunny.net is not configured on the server.' }); return; }

  if (!(await verifyStaff(req))) { res.status(401).json({ error: 'Staff login required.' }); return; }

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
