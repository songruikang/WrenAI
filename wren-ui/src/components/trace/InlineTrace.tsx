import { useState, useEffect, useCallback } from 'react';
import { Empty, Spin, Tag, Space, Typography, Tooltip } from 'antd';
import styled from 'styled-components';
import TraceDetail from '@/components/trace/TraceDetail';
import type { TraceGroup, TraceStep } from '@/pages/logs';

const { Text } = Typography;

const Summary = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--gray-4);
`;

const TokenTag = styled(Tag)`
  font-family: 'Menlo', monospace;
  font-size: 11px;
`;

interface Props {
  queryId?: string | null;
}

export default function InlineTrace({ queryId }: Props) {
  const [trace, setTrace] = useState<TraceGroup | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTrace = useCallback(async () => {
    if (!queryId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/traces?query_id=${queryId}&tail=50`);
      const data = await res.json();
      if (data.traces && data.traces.length > 0) {
        setTrace(data.traces[0]);
      }
    } catch (e) {
      console.error('Failed to fetch trace:', e);
    } finally {
      setLoading(false);
    }
  }, [queryId]);

  useEffect(() => {
    fetchTrace();
    // Poll a few times in case data is still being written
    const timer = setTimeout(fetchTrace, 3000);
    return () => clearTimeout(timer);
  }, [fetchTrace]);

  if (!queryId) {
    return <Empty description="No query ID available" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  if (loading && !trace) {
    return <Spin size="small" />;
  }

  if (!trace || trace.steps.length === 0) {
    return <Empty description="No LLM calls recorded for this query" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const totalDuration = trace.steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

  return (
    <div>
      <Summary>
        <Space size={8}>
          <Text type="secondary">{trace.steps.length} LLM calls</Text>
          <Text type="secondary">
            {totalDuration > 1000
              ? `${(totalDuration / 1000).toFixed(1)}s`
              : `${totalDuration}ms`}
          </Text>
        </Space>
        <Space size={4}>
          <Tooltip title="Prompt tokens">
            <TokenTag color="blue">
              Prompt: {trace.total_tokens.prompt.toLocaleString()}
            </TokenTag>
          </Tooltip>
          <Tooltip title="Completion tokens">
            <TokenTag color="green">
              Completion: {trace.total_tokens.completion.toLocaleString()}
            </TokenTag>
          </Tooltip>
          <Tooltip title="Total tokens">
            <TokenTag color="orange">
              Total: {trace.total_tokens.total.toLocaleString()}
            </TokenTag>
          </Tooltip>
        </Space>
      </Summary>
      <TraceDetail steps={trace.steps} />
    </div>
  );
}
