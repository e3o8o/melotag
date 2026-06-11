export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // The vercel rewrite sends /api/deezer/(.*) to this function.
  // We read the original path to determine the type of Deezer request.
  const originalPath = req.url || '';
  const params = new URL(req.url, 'http://localhost').searchParams;

  let deezerUrl = '';

  try {
    if (originalPath.includes('/search/album')) {
      // Album search: /api/deezer/search/album?q=...
      const q = params.get('q') || '';
      deezerUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(q)}`;
    } else if (originalPath.match(/\/album\/(\d+)\/tracks/)) {
      // Album tracklist: /api/deezer/album/:id/tracks
      const match = originalPath.match(/\/album\/(\d+)\/tracks/);
      const albumId = match[1];
      deezerUrl = `https://api.deezer.com/album/${albumId}/tracks`;
    } else if (originalPath.includes('/album/')) {
      // Album info: /api/deezer/album/:id
      const match = originalPath.match(/\/album\/(\d+)/);
      const albumId = match ? match[1] : '';
      deezerUrl = `https://api.deezer.com/album/${albumId}`;
    } else {
      // Default: track search
      const q = params.get('q') || '';
      deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(q)}`;
    }

    const response = await fetch(deezerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
