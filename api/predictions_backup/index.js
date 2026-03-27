import Replicate from "replicate";


export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Check for API token early
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('REPLICATE_API_TOKEN is not set');
    res.status(500).json({ error: 'Server configuration error: Missing API token' });
    return;
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  try {
    const { input, version } = req.body;

    // Use provided version or default to OpenAI Whisper
    const modelString = version || "openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e";
    const versionId = modelString.includes(':') ? modelString.split(':')[1] : modelString;

    const prediction = await replicate.predictions.create({
      version: versionId,
      input: input
    });

    res.status(201).json(prediction);
  } catch (error) {
    console.error('Error running Whisper:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
