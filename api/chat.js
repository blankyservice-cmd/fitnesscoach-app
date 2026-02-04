export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Validate request body
  const { chatInput, sessionId } = req.body || {};
  if (!chatInput || typeof chatInput !== 'string') {
    return res.status(400).json({ error: 'Missing chatInput' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatInput, sessionId: sessionId || '' }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Upstream error' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: 'Failed to reach coach service' });
  }
}
