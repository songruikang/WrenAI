import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Collapse,
  Space,
  Switch,
  Tag,
  Typography,
  Empty,
  Tooltip,
  Select,
  Radio,
} from 'antd';
import styled from 'styled-components';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import CloseCircleOutlined from '@ant-design/icons/CloseCircleOutlined';
import LoadingOutlined from '@ant-design/icons/LoadingOutlined';
import SiderLayout from '@/components/layouts/SiderLayout';
import TraceDetail from '@/components/trace/TraceDetail';

const { Text, Title } = Typography;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 48px);
  padding: 16px 24px;
  overflow: hidden;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
`;

const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const TraceList = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const TraceHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`;

const TokenBadge = styled(Tag)`
  font-family: 'Menlo', monospace;
  font-size: 11px;
`;

export interface TraceStep {
  type: string;
  timestamp: string;
  pipeline: string;
  model: string;
  duration_ms: number;
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_prompt: string;
  user_prompt: string;
  response: string;
  error?: string;
}

export interface TraceGroup {
  query_id: string;
  question: string;
  steps: TraceStep[];
  total_tokens: { prompt: number; completion: number; total: number };
}

type ViewMode = 'by_question' | 'by_pipeline';
type StatusFilter = 'all' | 'success' | 'error';

// Derive status for a trace group
function getTraceStatus(trace: TraceGroup): 'success' | 'error' | 'running' {
  const hasError = trace.steps.some((s) => s.type === 'llm_error');
  if (hasError) return 'error';
  return 'success';
}

function StatusIcon({ status }: { status: 'success' | 'error' | 'running' }) {
  switch (status) {
    case 'success':
      return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />;
    case 'error':
      return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />;
    case 'running':
      return <LoadingOutlined style={{ color: '#1890ff', fontSize: 14 }} />;
  }
}

// Collect unique pipelines from all traces
function getUniquePipelines(traces: TraceGroup[]): string[] {
  const set = new Set<string>();
  traces.forEach((t) =>
    t.steps.forEach((s) => {
      if (s.pipeline) set.add(s.pipeline);
    }),
  );
  return Array.from(set).sort();
}

// Group steps by pipeline across all traces
function groupByPipeline(
  traces: TraceGroup[],
  pipelineFilter: string | null,
  statusFilter: StatusFilter,
): {
  pipeline: string;
  steps: (TraceStep & { question?: string })[];
  totalTokens: number;
}[] {
  const map: Record<string, (TraceStep & { question?: string })[]> = {};
  traces.forEach((t) => {
    t.steps.forEach((s) => {
      const p = s.pipeline || 'unknown';
      if (pipelineFilter && p !== pipelineFilter) return;
      if (statusFilter === 'success' && s.type === 'llm_error') return;
      if (statusFilter === 'error' && s.type !== 'llm_error') return;
      if (!map[p]) map[p] = [];
      map[p].push({ ...s, question: t.question });
    });
  });
  return Object.entries(map)
    .map(([pipeline, steps]) => ({
      pipeline,
      steps,
      totalTokens: steps.reduce(
        (sum, s) => sum + (s.tokens?.total_tokens || 0),
        0,
      ),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

const PIPELINE_LABELS: Record<string, string> = {
  ask_start: '开始',
  historical_question_retrieval: '历史问题检索（embedding）',
  intent_classification: '意图分类（LLM）',
  db_schema_retrieval_and_column_pruning: '表列检索 + 列裁剪',
  sql_generation_reasoning: 'SQL生成推理（LLM）',
  sql_generation: 'SQL生成',
  sql_correction: 'SQL纠错',
  question_recommendation: '推荐问题生成（LLM）',
  sql_pairs_retrieval: 'SQL样例检索（embedding）',
  instructions_retrieval: '指令检索（embedding）',
  sql_functions_retrieval: 'SQL函数检索',
  followup_sql_generation: '追问SQL生成',
  chart_generation: '图表生成（LLM）',
  data_assistance: '数据助手（LLM）',
  misleading_assistance: '无关问题处理（LLM）',
  sql_answer: 'SQL结果解读（LLM）',
  preprocess_sql_data: 'SQL数据预处理（LLM）',
  schema_embedding: '表结构向量检索（embedding）',
  column_pruning: '列裁剪（LLM）',
  sql_generation_llm: 'SQL生成（LLM）',
  sql_correction_llm: 'SQL纠错（LLM）',
};

export default function LogsPage() {
  const [traces, setTraces] = useState<TraceGroup[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('by_question');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);

  const fetchTraces = useCallback(async () => {
    try {
      const res = await fetch('/api/traces?tail=500');
      const data = await res.json();
      // API 返回的 trace 没有 total_tokens，需要从 steps 计算
      const enriched = (data.traces || []).map((t: any) => ({
        ...t,
        total_tokens: (t.steps || []).reduce(
          (acc: any, s: any) => ({
            prompt: acc.prompt + (s.tokens?.prompt_tokens || 0),
            completion: acc.completion + (s.tokens?.completion_tokens || 0),
            total: acc.total + (s.tokens?.total_tokens || 0),
          }),
          { prompt: 0, completion: 0, total: 0 },
        ),
      }));
      setTraces(enriched.reverse());
    } catch (e) {
      console.error('Failed to fetch traces:', e);
    }
  }, []);

  useEffect(() => {
    fetchTraces();
    if (!autoRefresh) return;
    const timer = setInterval(fetchTraces, 5000);
    return () => clearInterval(timer);
  }, [fetchTraces, autoRefresh]);

  const uniquePipelines = useMemo(() => getUniquePipelines(traces), [traces]);

  // Filtered traces for "by question" view
  const filteredTraces = useMemo(() => {
    return traces.filter((t) => {
      // Status filter
      if (statusFilter !== 'all') {
        const status = getTraceStatus(t);
        if (statusFilter === 'success' && status !== 'success') return false;
        if (statusFilter === 'error' && status !== 'error') return false;
      }
      // Pipeline filter - keep trace if any step matches
      if (pipelineFilter) {
        return t.steps.some((s) => s.pipeline === pipelineFilter);
      }
      return true;
    });
  }, [traces, statusFilter, pipelineFilter]);

  // Grouped data for "by pipeline" view
  const pipelineGroups = useMemo(
    () => groupByPipeline(traces, pipelineFilter, statusFilter),
    [traces, pipelineFilter, statusFilter],
  );

  // Stats
  const stats = useMemo(() => {
    const total = traces.length;
    const success = traces.filter(
      (t) => getTraceStatus(t) === 'success',
    ).length;
    const error = traces.filter((t) => getTraceStatus(t) === 'error').length;
    const totalTokens = traces.reduce(
      (sum, t) => sum + t.total_tokens.total,
      0,
    );
    return { total, success, error, totalTokens };
  }, [traces]);

  return (
    <SiderLayout loading={false}>
      <Container>
        <Toolbar>
          <Space size={12}>
            <Title level={5} style={{ margin: 0 }}>
              LLM Traces
            </Title>
            <Space size={4}>
              <Tag>{stats.total} queries</Tag>
              <Tag color="green">{stats.success} ok</Tag>
              {stats.error > 0 && <Tag color="red">{stats.error} err</Tag>}
              <TokenBadge color="orange">
                {stats.totalTokens.toLocaleString()} tokens
              </TokenBadge>
            </Space>
          </Space>
          <Space size={8}>
            <Tag color={autoRefresh ? 'green' : 'default'}>
              {autoRefresh ? 'LIVE' : 'PAUSED'}
            </Tag>
            <Switch
              size="small"
              checked={autoRefresh}
              onChange={setAutoRefresh}
            />
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchTraces}
            />
          </Space>
        </Toolbar>

        <FilterBar>
          <Radio.Group
            size="small"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="by_question">By Question</Radio.Button>
            <Radio.Button value="by_pipeline">By Pipeline</Radio.Button>
          </Radio.Group>

          <Select
            size="small"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 110 }}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'success', label: 'Success' },
              { value: 'error', label: 'Error' },
            ]}
          />

          <Select
            size="small"
            allowClear
            placeholder="All Pipelines"
            value={pipelineFilter}
            onChange={(v) => setPipelineFilter(v || null)}
            style={{ width: 260 }}
            options={uniquePipelines.map((p) => ({
              value: p,
              label: PIPELINE_LABELS[p] || p,
            }))}
          />
        </FilterBar>

        <TraceList>
          {viewMode === 'by_question' ? (
            // === By Question View ===
            filteredTraces.length === 0 ? (
              <Empty description="No matching traces" />
            ) : (
              <Collapse accordion>
                {filteredTraces.map((trace, idx) => {
                  const status = getTraceStatus(trace);
                  return (
                    <Collapse.Panel
                      key={trace.query_id + idx}
                      header={
                        <TraceHeader>
                          <Space size={8}>
                            <StatusIcon status={status} />
                            <Text strong style={{ maxWidth: 450 }} ellipsis>
                              {trace.question || trace.query_id}
                            </Text>
                            <Tag>{trace.steps.length} steps</Tag>
                          </Space>
                          <Space size={4}>
                            <Tooltip title="Prompt tokens">
                              <TokenBadge color="blue">
                                P: {trace.total_tokens.prompt.toLocaleString()}
                              </TokenBadge>
                            </Tooltip>
                            <Tooltip title="Completion tokens">
                              <TokenBadge color="green">
                                C:{' '}
                                {trace.total_tokens.completion.toLocaleString()}
                              </TokenBadge>
                            </Tooltip>
                            <Tooltip title="Total tokens">
                              <TokenBadge color="orange">
                                T: {trace.total_tokens.total.toLocaleString()}
                              </TokenBadge>
                            </Tooltip>
                          </Space>
                        </TraceHeader>
                      }
                    >
                      <TraceDetail steps={trace.steps} />
                    </Collapse.Panel>
                  );
                })}
              </Collapse>
            )
          ) : // === By Pipeline View ===
          pipelineGroups.length === 0 ? (
            <Empty description="No matching traces" />
          ) : (
            <Collapse accordion>
              {pipelineGroups.map((group) => {
                const successCount = group.steps.filter(
                  (s) => s.type !== 'llm_error',
                ).length;
                const errorCount = group.steps.filter(
                  (s) => s.type === 'llm_error',
                ).length;
                return (
                  <Collapse.Panel
                    key={group.pipeline}
                    header={
                      <TraceHeader>
                        <Space size={8}>
                          <Text strong>
                            {PIPELINE_LABELS[group.pipeline] || group.pipeline}
                          </Text>
                          <Tag>{group.steps.length} calls</Tag>
                          {successCount > 0 && (
                            <Tag color="green" icon={<CheckCircleOutlined />}>
                              {successCount}
                            </Tag>
                          )}
                          {errorCount > 0 && (
                            <Tag color="red" icon={<CloseCircleOutlined />}>
                              {errorCount}
                            </Tag>
                          )}
                        </Space>
                        <TokenBadge color="orange">
                          {group.totalTokens.toLocaleString()} tokens
                        </TokenBadge>
                      </TraceHeader>
                    }
                  >
                    <TraceDetail steps={group.steps} />
                  </Collapse.Panel>
                );
              })}
            </Collapse>
          )}
        </TraceList>
      </Container>
    </SiderLayout>
  );
}
