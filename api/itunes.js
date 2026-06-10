export default async function handler(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const term = params.get('term') || '';
  const media = params.get('media') || 'music';
  const limit = params.get('limit') || '6';
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=${media}&limit=${limit}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
