import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const AI_SERVICE_URL =
  process.env.WREN_AI_ENDPOINT || 'http://wren-ai-service:5555';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const { query_id, tail } = req.query;
    const params = new URLSearchParams();
    if (query_id) params.set('query_id', query_id as string);
    if (tail) params.set('tail', tail as string);

    const response = await axios.get(
      `${AI_SERVICE_URL}/v1/traces?${params.toString()}`,
    );
    res.status(200).json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
