export default async function handler(req, res) {
  const targetUrl = req.query.target;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'No target URL' });
  }

  try {
    const response = await fetch(decodeURIComponent(targetUrl), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });

    const data = await response.arrayBuffer();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(Buffer.from(data));
  } catch (error) {
    return res.status(500).json({ error: 'Failed' });
  }
}
