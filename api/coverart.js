export default async function handler(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const release = params.get('release') || '';
  if (!release) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: 'Missing "release" parameter' });
  }
  try {
    const url = `https://coverartarchive.org/release/${encodeURIComponent(release)}/front-500`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MeloTag/1.0 (https://melotag.app)' },
      redirect: 'follow'
    });
    if (!response.ok) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(response.status).json({ error: `Cover Art Archive returned ${response.status}` });
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(buffer);
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: err.message });
  }
}
