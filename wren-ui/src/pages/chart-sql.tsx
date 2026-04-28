import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Switch,
  Tabs,
  Table,
  Space,
  Spin,
  Alert,
  message,
  Typography,
} from 'antd';
import styled from 'styled-components';
import PlayCircleOutlined from '@ant-design/icons/PlayCircleOutlined';
import ClearOutlined from '@ant-design/icons/ClearOutlined';
import SiderLayout from '@/components/layouts/SiderLayout';

const { TextArea } = Input;
const { Text } = Typography;

// ─── Styles ──────────────────────────────────────────────────────

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 48px);
  padding: 16px 24px;
  overflow: hidden;
  background: #f5f5f5;
`;

const EditorSection = styled.div`
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
`;

const ResultSection = styled.div`
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .ant-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .ant-tabs-content {
    flex: 1;
    overflow: auto;
  }
  .ant-tabs-tabpane {
    height: 100%;
  }
`;

const ToolbarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
`;

const ChartContainer = styled.div`
  width: 100%;
  height: 450px;
`;

const StyledTextArea = styled(TextArea)`
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: #666;
  margin-top: 8px;
`;

// ─── Types ───────────────────────────────────────────────────────

interface Column {
  name: string;
  type: string;
}

interface SqlResult {
  records: Record<string, unknown>[];
  columns: Column[];
  totalRows: number;
}

interface PipelineStep {
  name: string;
  duration_ms: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

interface LLMTrace {
  model: string;
  system_prompt: string;
  user_prompt: string;
  response: string;
  duration_ms: number;
}

interface ChartResult {
  chart_type: string;
  echarts_option: Record<string, unknown>;
  reasoning: string;
  warnings: string[];
  fallback: boolean;
  pipeline: PipelineStep[];
  llm_trace: LLMTrace | null;
}

// ─── Component ───────────────────────────────────────────────────

export default function ChartSqlPage() {
  const [sql, setSql] = useState('');
  const [question, setQuestion] = useState('');
  const [chartMode, setChartMode] = useState(false);
  const [useLLM, setUseLLM] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sqlResult, setSqlResult] = useState<SqlResult | null>(null);
  const [chartResult, setChartResult] = useState<ChartResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('table');
  const [duration, setDuration] = useState(0);

  const chartRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<any>(null);

  // 渲染 ECharts
  const renderChart = useCallback(async (option: Record<string, unknown>) => {
    if (!chartRef.current) return;

    // 动态 import echarts 避免 SSR
    const echarts = await import('echarts');

    if (echartsRef.current) {
      echartsRef.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    chart.setOption(option as any);
    echartsRef.current = chart;
  }, []);

  // chart 结果或 tab 切换时重新渲染
  useEffect(() => {
    if (
      activeTab === 'chart' &&
      chartResult?.echarts_option &&
      !chartResult.echarts_option.table &&
      !chartResult.echarts_option.kpi_card
    ) {
      const timer = setTimeout(
        () => renderChart(chartResult.echarts_option),
        100,
      );
      return () => clearTimeout(timer);
    }
  }, [chartResult, activeTab, renderChart]);

  // 窗口 resize
  useEffect(() => {
    const handleResize = () => echartsRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      echartsRef.current?.dispose();
    };
  }, []);

  // 执行
  const handleExecute = async () => {
    if (!sql.trim()) {
      message.warning('请输入 SQL');
      return;
    }
    if (chartMode && !question.trim()) {
      message.warning('Chart 模式需要填写问题');
      return;
    }

    setLoading(true);
    setError(null);
    setSqlResult(null);
    setChartResult(null);
    const startTime = Date.now();

    try {
      // Step 1: 执行 SQL
      const sqlRes = await fetch('/api/v1/run_sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql.trim(), limit: 1000 }),
      });

      if (!sqlRes.ok) {
        const errData = await sqlRes.json();
        throw new Error(
          errData.message || errData.error || `SQL 执行失败 (${sqlRes.status})`,
        );
      }

      const sqlData: SqlResult = await sqlRes.json();
      setSqlResult(sqlData);
      setDuration(Date.now() - startTime);

      // Step 2: Chart 模式 → 调 chart-engine
      if (chartMode && sqlData.records.length > 0) {
        const chartRes = await fetch('/api/v1/chart_engine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: question.trim(),
            sql: sql.trim(),
            data: sqlData.records,
            mock: !useLLM,
          }),
        });

        if (!chartRes.ok) {
          const errData = await chartRes.json();
          message.warning(
            `图表生成失败: ${errData.error || errData.hint || '未知错误'}`,
          );
        } else {
          const chartData: ChartResult = await chartRes.json();
          setChartResult(chartData);
          setActiveTab('chart');

          if (chartData.warnings?.length > 0) {
            message.info(chartData.warnings.join('; '));
          }
        }
      }

      setDuration(Date.now() - startTime);
      if (!chartMode) {
        setActiveTab('table');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSql('');
    setQuestion('');
    setSqlResult(null);
    setChartResult(null);
    setError(null);
    setDuration(0);
    if (echartsRef.current) {
      echartsRef.current.dispose();
      echartsRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  // Table 列定义
  const tableColumns =
    sqlResult?.columns?.map((col) => ({
      title: col.name,
      dataIndex: col.name,
      key: col.name,
      ellipsis: true,
      width: 150,
      render: (value: unknown) => {
        if (value === null || value === undefined) {
          return (
            <Text type="secondary" italic>
              NULL
            </Text>
          );
        }
        return String(value);
      },
    })) || [];

  // Chart tab 内容
  const renderChartContent = () => {
    if (!chartResult) {
      return (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          开启 Chart 模式并执行 SQL 后，图表将在这里显示
        </div>
      );
    }

    // KPI 卡片
    if (chartResult.echarts_option?.kpi_card) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 56, fontWeight: 'bold', color: '#5470c6' }}>
            {String(chartResult.echarts_option.value ?? 0)}
          </div>
          <div style={{ fontSize: 16, color: '#666', marginTop: 8 }}>
            {String(chartResult.echarts_option.title ?? '')}{' '}
            {String(chartResult.echarts_option.unit ?? '')}
          </div>
        </div>
      );
    }

    // 降级到表格
    if (chartResult.echarts_option?.table || chartResult.fallback) {
      return (
        <Alert
          type="info"
          message="数据不适合图表展示，已切换到表格视图"
          description={chartResult.reasoning}
          showIcon
          style={{ marginBottom: 16 }}
        />
      );
    }

    return <ChartContainer ref={chartRef} />;
  };

  // Debug/Pipeline tab 内容
  const renderDebugContent = () => {
    if (!chartResult?.pipeline || chartResult.pipeline.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          执行 Chart 模式后，pipeline 详情将在这里显示
        </div>
      );
    }

    const codeBlockStyle: React.CSSProperties = {
      background: '#1e1e1e',
      color: '#d4d4d4',
      padding: '12px 16px',
      borderRadius: 6,
      fontSize: 12,
      fontFamily: "'Menlo', 'Monaco', monospace",
      overflow: 'auto',
      maxHeight: 300,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    };

    const stepCardStyle: React.CSSProperties = {
      border: '1px solid #e8e8e8',
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
      background: '#fafafa',
    };

    const labelStyle: React.CSSProperties = {
      fontSize: 11,
      color: '#999',
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
      marginBottom: 4,
    };

    return (
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
        {/* Pipeline Steps */}
        <div style={{ marginBottom: 24 }}>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            Pipeline Steps
          </Typography.Title>

          {chartResult.pipeline.map((step, i) => (
            <div key={i} style={stepCardStyle}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Space>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#5470c6',
                      color: '#fff',
                      textAlign: 'center',
                      lineHeight: '24px',
                      fontSize: 12,
                      fontWeight: 'bold',
                    }}
                  >
                    {i + 1}
                  </span>
                  <Text strong>{step.name}</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {step.duration_ms}ms
                </Text>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <div>
                  <div style={labelStyle}>Input</div>
                  <pre style={codeBlockStyle}>
                    {JSON.stringify(step.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <div style={labelStyle}>Output</div>
                  <pre style={codeBlockStyle}>
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ECharts Option (最终给 ECharts 的输入) */}
        <div style={{ marginBottom: 24 }}>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            ECharts Option (图表输入)
          </Typography.Title>
          <pre style={codeBlockStyle}>
            {JSON.stringify(chartResult.echarts_option, null, 2)}
          </pre>
        </div>

        {/* LLM Trace */}
        {chartResult.llm_trace && (
          <div style={{ marginBottom: 24 }}>
            <Typography.Title level={5} style={{ marginBottom: 12 }}>
              LLM Trace ({chartResult.llm_trace.model},{' '}
              {chartResult.llm_trace.duration_ms}ms)
            </Typography.Title>

            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>System Prompt</div>
              <pre style={{ ...codeBlockStyle, maxHeight: 200 }}>
                {chartResult.llm_trace.system_prompt}
              </pre>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>User Prompt</div>
              <pre style={codeBlockStyle}>
                {chartResult.llm_trace.user_prompt}
              </pre>
            </div>

            <div>
              <div style={labelStyle}>Response</div>
              <pre style={codeBlockStyle}>{chartResult.llm_trace.response}</pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <SiderLayout loading={false}>
      <Container>
        <EditorSection>
          <ToolbarRow>
            <Space size={12} style={{ flex: 1 }}>
              <Switch
                checked={chartMode}
                onChange={setChartMode}
                checkedChildren="Chart"
                unCheckedChildren="SQL"
              />
              {chartMode && (
                <Switch
                  checked={useLLM}
                  onChange={setUseLLM}
                  checkedChildren="LLM"
                  unCheckedChildren="Mock"
                  size="small"
                />
              )}
              {chartMode && (
                <Input
                  placeholder="输入问题（如：各厂商设备数量对比）"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  style={{ width: 400 }}
                  onKeyDown={handleKeyDown}
                />
              )}
            </Space>
            <Space>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleExecute}
                loading={loading}
              >
                {chartMode ? '执行 + 画图' : '执行'}
              </Button>
              <Button icon={<ClearOutlined />} onClick={handleClear}>
                清空
              </Button>
            </Space>
          </ToolbarRow>

          <StyledTextArea
            rows={6}
            placeholder="输入 SQL 语句... (Ctrl+Enter 执行)"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {(sqlResult || error) && (
            <StatusBar>
              {sqlResult && (
                <>
                  <span>rows: {sqlResult.totalRows}</span>
                  <span>time: {duration}ms</span>
                  {chartResult && <span>chart: {chartResult.chart_type}</span>}
                </>
              )}
              {error && <span style={{ color: '#cf1322' }}>error</span>}
            </StatusBar>
          )}
        </EditorSection>

        <ResultSection>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin
                size="large"
                tip={chartMode ? '执行 SQL + 生成图表...' : '执行 SQL...'}
              />
            </div>
          ) : error ? (
            <Alert
              type="error"
              message="执行错误"
              description={error}
              showIcon
              style={{ margin: '20px 0' }}
            />
          ) : (
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <Tabs.TabPane
                tab={`Table${sqlResult ? ` (${sqlResult.totalRows})` : ''}`}
                key="table"
              >
                {sqlResult ? (
                  <Table
                    columns={tableColumns}
                    dataSource={sqlResult.records.map((r, i) => ({
                      ...r,
                      key: i,
                    }))}
                    size="small"
                    pagination={{ pageSize: 50, showSizeChanger: true }}
                    scroll={{ x: 'max-content' }}
                    bordered
                  />
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: 60,
                      color: '#999',
                    }}
                  >
                    输入 SQL 并点击执行
                  </div>
                )}
              </Tabs.TabPane>
              <Tabs.TabPane
                tab={`Chart${chartResult ? ` (${chartResult.chart_type})` : ''}`}
                key="chart"
              >
                {renderChartContent()}
              </Tabs.TabPane>
              <Tabs.TabPane
                tab={`Pipeline${chartResult?.pipeline ? ` (${chartResult.pipeline.length} steps)` : ''}`}
                key="debug"
              >
                {renderDebugContent()}
              </Tabs.TabPane>
            </Tabs>
          )}
        </ResultSection>
      </Container>
    </SiderLayout>
  );
}
