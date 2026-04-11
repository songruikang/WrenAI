import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// [自定义] 从 JSONL 文件读取 LLM 调用追踪记录
// trace_callback.py (挂载到 ai-service) 写入 → 共享 volume → UI 读取
// wren-ui 容器内：/app/data 是 named volume（存 SQLite 等），
// /app/llm_data 是宿主机 ./data/ 的挂载（ai-service 写入的 trace 文件在这里）
const TRACE_FILE = path.join(
  process.env.LLM_TRACE_DIR || '/app/llm_data',
  'llm_traces.jsonl',
);

interface TraceEvent {
  type: string;
  timestamp: string;
  query_id?: string;
  pipeline?: string;
  question?: string;
  model?: string;
  duration_ms?: number;
  tokens?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  system_prompt?: string;
  user_prompt?: string;
  response?: string;
  error?: string;
}

interface TraceGroup {
  query_id: string;
  question: string;
  timestamp: string;
  steps: TraceEvent[];
}

function groupTraces(events: TraceEvent[]): TraceGroup[] {
  const groups: Record<string, TraceGroup> = {};

  for (const evt of events) {
    const key = evt.query_id || evt.timestamp;
    if (!groups[key]) {
      groups[key] = {
        query_id: evt.query_id || 'unknown',
        question: evt.question || '',
        timestamp: evt.timestamp,
        steps: [],
      };
    }
    groups[key].steps.push(evt);
    // 更新 question（有些步骤的 question 可能更完整）
    if (evt.question && !groups[key].question) {
      groups[key].question = evt.question;
    }
  }

  return Object.values(groups).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const tail = parseInt((req.query.tail as string) || '500', 10);

  try {
    if (!fs.existsSync(TRACE_FILE)) {
      return res.status(200).json({ traces: [], total: 0 });
    }

    const content = fs.readFileSync(TRACE_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const recent = lines.slice(-tail);

    const events: TraceEvent[] = [];
    for (const line of recent) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // 跳过解析失败的行
      }
    }

    const traces = groupTraces(events);

    res.status(200).json({ traces, total: lines.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
