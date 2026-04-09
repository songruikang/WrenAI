import { Collapse, Tag, Typography, Space, Tooltip } from 'antd';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import CloseCircleOutlined from '@ant-design/icons/CloseCircleOutlined';
import styled from 'styled-components';
import type { TraceStep } from '@/pages/logs';

const { Text } = Typography;

const StepHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`;

const PromptBlock = styled.div`
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 12px;
  margin: 8px 0;
  font-family: 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
`;

const ResponseBlock = styled(PromptBlock)`
  background: #f0f9ff;
  border-color: #bae0ff;
`;

const ErrorBlock = styled(PromptBlock)`
  background: #fff2f0;
  border-color: #ffccc7;
  color: #cf1322;
`;

const Label = styled(Text)`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
`;

const PIPELINE_LABELS: Record<string, string> = {
  // 粗粒度（ask.py 编排层）
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
  // 细粒度（pipeline 内部）
  schema_embedding: '表结构向量检索（embedding）',
  column_pruning: '列裁剪（LLM）',
  sql_generation_llm: 'SQL生成（LLM）',
  sql_correction_llm: 'SQL纠错（LLM）',
};

const PIPELINE_COLORS: Record<string, string> = {
  db_schema_retrieval_and_column_pruning: 'purple',
  sql_generation: 'blue',
  sql_correction: 'orange',
  intent_classification: 'cyan',
  sql_generation_reasoning: 'geekblue',
  question_recommendation: 'default',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface Props {
  steps: (TraceStep & { question?: string })[];
}

export default function TraceDetail({ steps }: Props) {
  return (
    <Collapse>
      {steps.map((step, idx) => {
        const pipelineName = step.pipeline || 'unknown';
        const label = PIPELINE_LABELS[pipelineName] || pipelineName;
        const color = PIPELINE_COLORS[pipelineName] || 'default';
        const isError = step.type === 'llm_error';
        const tokens = step.tokens || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        };

        return (
          <Collapse.Panel
            key={idx}
            header={
              <StepHeader>
                <Space size={8}>
                  {isError ? (
                    <CloseCircleOutlined
                      style={{ color: '#ff4d4f', fontSize: 13 }}
                    />
                  ) : (
                    <CheckCircleOutlined
                      style={{ color: '#52c41a', fontSize: 13 }}
                    />
                  )}
                  <Tag color={isError ? 'red' : color}>{label}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {step.model}
                  </Text>
                  {step.duration_ms > 0 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatDuration(step.duration_ms)}
                    </Text>
                  )}
                  {(step as any).question && (
                    <Text
                      type="secondary"
                      style={{ fontSize: 11, maxWidth: 200 }}
                      ellipsis
                    >
                      {(step as any).question}
                    </Text>
                  )}
                </Space>
                <Space size={4}>
                  {tokens.prompt_tokens > 0 && (
                    <Tooltip title="Prompt tokens">
                      <Tag
                        style={{ fontSize: 11, fontFamily: 'Menlo, monospace' }}
                      >
                        P:{tokens.prompt_tokens.toLocaleString()}
                      </Tag>
                    </Tooltip>
                  )}
                  {tokens.completion_tokens > 0 && (
                    <Tooltip title="Completion tokens">
                      <Tag
                        style={{ fontSize: 11, fontFamily: 'Menlo, monospace' }}
                      >
                        C:{tokens.completion_tokens.toLocaleString()}
                      </Tag>
                    </Tooltip>
                  )}
                </Space>
              </StepHeader>
            }
          >
            {step.system_prompt && (
              <>
                <Label type="secondary">SYSTEM PROMPT</Label>
                <PromptBlock>{step.system_prompt}</PromptBlock>
              </>
            )}
            {step.user_prompt && (
              <>
                <Label type="secondary">USER PROMPT</Label>
                <PromptBlock>{step.user_prompt}</PromptBlock>
              </>
            )}
            {step.response && (
              <>
                <Label type="secondary">RESPONSE</Label>
                <ResponseBlock>{step.response}</ResponseBlock>
              </>
            )}
            {step.error && (
              <>
                <Label type="secondary">ERROR</Label>
                <ErrorBlock>{step.error}</ErrorBlock>
              </>
            )}
          </Collapse.Panel>
        );
      })}
    </Collapse>
  );
}
