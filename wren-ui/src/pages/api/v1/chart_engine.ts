import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const CHART_ENGINE_ENDPOINT =
  process.env.CHART_ENGINE_ENDPOINT || 'http://localhost:8100';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, sql, data, mock } = req.body;

  if (!question || !data) {
    return res.status(400).json({ error: 'question and data are required' });
  }

  const isMock = mock !== false;
  console.log(
    `[chart_engine] mode=${isMock ? 'mock' : 'LLM'} question="${question}" data_rows=${data?.length || 0}`,
  );

  try {
    const startTime = Date.now();
    const response = await axios.post(
      `${CHART_ENGINE_ENDPOINT}/generate`,
      { question, sql: sql || '', data, mock: isMock },
      { timeout: 300000, headers: { 'Content-Type': 'application/json' } },
    );

    console.log(
      `[chart_engine] done in ${Date.now() - startTime}ms type=${response.data?.chart_type}`,
    );
    return res.status(200).json(response.data);
  } catch (error: any) {
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'Chart engine service is not available',
        hint: 'Run: python -m chart_engine serve --port 8100',
      });
    }

    return res.status(error?.response?.status || 500).json({
      error: error?.response?.data?.detail || error?.message || 'Unknown error',
    });
  }
}
