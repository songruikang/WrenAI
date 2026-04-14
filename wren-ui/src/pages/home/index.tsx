import { ComponentRef, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Select, Typography } from 'antd';
import BulbOutlined from '@ant-design/icons/BulbOutlined';
import { Logo } from '@/components/Logo';
import { Path } from '@/utils/enum';
import SiderLayout from '@/components/layouts/SiderLayout';
import Prompt from '@/components/pages/home/prompt';
import DemoPrompt from '@/components/pages/home/prompt/DemoPrompt';
import useHomeSidebar from '@/hooks/useHomeSidebar';
import useAskPrompt from '@/hooks/useAskPrompt';
import useRecommendedQuestionsInstruction from '@/hooks/useRecommendedQuestionsInstruction';
import RecommendedQuestionsPrompt from '@/components/pages/home/prompt/RecommendedQuestionsPrompt';
import {
  useSuggestedQuestionsQuery,
  useCreateThreadMutation,
  useThreadLazyQuery,
} from '@/apollo/client/graphql/home.generated';
import { useGetSettingsQuery } from '@/apollo/client/graphql/settings.generated';
import { CreateThreadInput } from '@/apollo/client/graphql/__types__';

const { Text } = Typography;

const Wrapper = ({ children }) => {
  return (
    <div
      className="d-flex align-center justify-center flex-column"
      style={{ height: '100%' }}
    >
      <Logo size={48} color="var(--gray-8)" />
      <div className="text-md text-medium gray-8 mt-3">
        Know more about your data
      </div>
      {children}
    </div>
  );
};

const SampleQuestionsInstruction = (props) => {
  const { sampleQuestions, onSelect } = props;

  return (
    <Wrapper>
      <DemoPrompt demo={sampleQuestions} onSelect={onSelect} />
    </Wrapper>
  );
};

const CATEGORY_OPTIONS = [
  { value: 'Descriptive Questions', label: '描述统计' },
  { value: 'Segmentation Questions', label: '数据细分' },
  { value: 'Comparative Questions', label: '对比分析' },
  { value: 'Data Quality Questions', label: '数据质量' },
];

function RecommendQuestionControls(props: {
  generating: boolean;
  onGenerate: (maxCategories: number, maxQuestions: number) => void;
  label?: string;
}) {
  const { generating, onGenerate, label = '生成推荐' } = props;
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Descriptive Questions',
    'Comparative Questions',
  ]);
  const [questionsPerCategory, setQuestionsPerCategory] = useState(1);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <BulbOutlined className="gray-6" />
      <Select
        size="small"
        mode="multiple"
        value={selectedCategories}
        onChange={setSelectedCategories}
        style={{ minWidth: 200 }}
        maxTagCount={2}
        options={CATEGORY_OPTIONS}
        placeholder="选择分类"
      />
      <Select
        size="small"
        value={questionsPerCategory}
        onChange={setQuestionsPerCategory}
        style={{ width: 60 }}
        options={[
          { value: 1, label: '1' },
          { value: 2, label: '2' },
          { value: 3, label: '3' },
        ]}
      />
      <span className="gray-7 text-sm">题/类</span>
      <Button
        size="small"
        loading={generating}
        disabled={selectedCategories.length === 0}
        onClick={() =>
          onGenerate(selectedCategories.length, questionsPerCategory)
        }
      >
        {label}
      </Button>
    </div>
  );
}

function RecommendedQuestionsInstruction(props) {
  const { onSelect, loading } = props;

  const {
    buttonProps,
    generating,
    recommendedQuestions,
    showRetry,
    showRecommendedQuestionsPromptMode,
    onGetRecommendationQuestions,
  } = useRecommendedQuestionsInstruction();

  return showRecommendedQuestionsPromptMode ? (
    <div
      className="d-flex align-center flex-column pt-10"
      style={{ margin: 'auto' }}
    >
      <RecommendedQuestionsPrompt
        recommendedQuestions={recommendedQuestions}
        onSelect={onSelect}
        loading={loading}
      />
      <div className="mt-4">
        <RecommendQuestionControls
          generating={generating}
          onGenerate={onGetRecommendationQuestions}
          label="重新生成"
        />
      </div>
      <div className="py-12" />
    </div>
  ) : (
    <Wrapper>
      <div className="mt-6">
        <RecommendQuestionControls
          generating={generating}
          onGenerate={onGetRecommendationQuestions}
          label={buttonProps.children === 'Retry' ? '重试' : '生成推荐问题'}
        />
      </div>
      {generating && (
        <Text className="mt-3 text-sm gray-6">
          Thinking of good questions for you... (about 1 minute)
        </Text>
      )}
      {!generating && showRetry && (
        <Text className="mt-3 text-sm gray-6 text-center">
          We couldn't think of questions right now.
          <br />
          Let's try again later.
        </Text>
      )}
    </Wrapper>
  );
}

export default function Home() {
  const $prompt = useRef<ComponentRef<typeof Prompt>>(null);
  const router = useRouter();
  const homeSidebar = useHomeSidebar();
  const askPrompt = useAskPrompt();

  const { data: suggestedQuestionsData } = useSuggestedQuestionsQuery({
    fetchPolicy: 'cache-and-network',
  });
  const [createThread, { loading: threadCreating }] = useCreateThreadMutation({
    onError: (error) => console.error(error),
    onCompleted: () => homeSidebar.refetch(),
  });
  const [preloadThread] = useThreadLazyQuery({
    fetchPolicy: 'cache-and-network',
  });

  const { data: settingsResult } = useGetSettingsQuery();
  const settings = settingsResult?.settings;
  const isSampleDataset = useMemo(
    () => Boolean(settings?.dataSource?.sampleDataset),
    [settings],
  );

  const sampleQuestions = useMemo(
    () => suggestedQuestionsData?.suggestedQuestions.questions || [],
    [suggestedQuestionsData],
  );

  const onSelectQuestion = async ({ question }) => {
    $prompt.current.submit(question);
  };

  const onCreateResponse = async (payload: CreateThreadInput) => {
    try {
      askPrompt.onStopPolling();
      const response = await createThread({ variables: { data: payload } });
      const threadId = response.data.createThread.id;
      await preloadThread({ variables: { threadId } });
      router.push(Path.Home + `/${threadId}`);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <SiderLayout loading={false} sidebar={homeSidebar}>
      {isSampleDataset && (
        <SampleQuestionsInstruction
          sampleQuestions={sampleQuestions}
          onSelect={onSelectQuestion}
        />
      )}

      {!isSampleDataset && (
        <RecommendedQuestionsInstruction
          onSelect={onCreateResponse}
          loading={threadCreating}
        />
      )}
      <Prompt
        ref={$prompt}
        {...askPrompt}
        onCreateResponse={onCreateResponse}
      />
    </SiderLayout>
  );
}
