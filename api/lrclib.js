export default async function handler(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const trackName = params.get('track_name') || '';
  const artistName = params.get('artist_name') || '';
  try {
    const searchParams = new URLSearchParams();
    if (trackName) searchParams.set('track_name', trackName);
    if (artistName) searchParams.set('artist_name', artistName);
    const url = `https://lrclib.net/api/search?${searchParams.toString()}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MeloTag/1.0 (https://melotag.app)' }
    });
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
