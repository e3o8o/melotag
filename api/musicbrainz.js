export default async function handler(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const query = params.get('query') || '';
  const fmt = params.get('fmt') || 'json';
  try {
    const searchParams = new URLSearchParams();
    if (query) searchParams.set('query', query);
    searchParams.set('fmt', fmt);
    const url = `https://musicbrainz.org/ws/2/recording?${searchParams.toString()}`;
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
