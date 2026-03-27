export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    console.error('REPLICATE_API_TOKEN is not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching prediction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
