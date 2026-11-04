'use client';
import { ExperimentOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Image,
  Input,
  Spin,
  Table,
  Tag,
  Typography
} from 'antd';
import { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { Job, WebshopCrawlerOptions } from '../../utils/admin/types';
import { fetchJson, sendJson } from './api';

type TestedField =
  | 'sku'
  | 'title'
  | 'brand'
  | 'price'
  | 'salePrice'
  | 'gtin'
  | 'inStock'
  | 'image'
  | 'categories'
  | 'description'
  | 'attributes';

// The labels are tester.fields.<key>
const FIELDS: { key: TestedField; error?: string }[] = [
  { key: 'sku' },
  { key: 'title', error: 'name' },
  { key: 'brand', error: 'brand' },
  { key: 'price' },
  { key: 'salePrice' },
  { key: 'gtin' },
  { key: 'inStock', error: 'inStock' },
  { key: 'image', error: 'image' },
  { key: 'categories', error: 'categories' },
  { key: 'description', error: 'description' },
  { key: 'attributes', error: 'attributes' }
];

const renderValue = (key: string, value: unknown, t: TFunction<'stores'>) => {
  if (value === undefined || value === null || value === '')
    return <Typography.Text type="secondary">–</Typography.Text>;
  if (key === 'image' && typeof value === 'string')
    return (
      <Flex gap={8} align="center">
        <Image
          src={value}
          alt=""
          width={48}
          height={48}
          style={{ objectFit: 'contain' }}
        />
        <Typography.Text style={{ fontSize: 12 }} ellipsis>
          {value}
        </Typography.Text>
      </Flex>
    );
  if (key === 'categories' && Array.isArray(value))
    return value.map((category) => (
      <Tag key={String(category)}>{String(category)}</Tag>
    ));
  if (key === 'attributes' && Array.isArray(value)) {
    const groups = value as {
      name?: string;
      attributes: { name: string; value: unknown }[];
    }[];
    const count = groups.reduce(
      (sum, group) => sum + group.attributes.length,
      0
    );
    return (
      <details>
        <summary>
          {t('tester.attributeGroups', {
            attributes: count,
            count: groups.length
          })}
        </summary>
        {groups.map((group, i) => (
          <div key={i} style={{ marginTop: 4 }}>
            {group.name && (
              <Typography.Text strong>{group.name}</Typography.Text>
            )}
            {group.attributes.map((attribute) => (
              <div key={attribute.name} style={{ fontSize: 12 }}>
                {attribute.name}: {String(attribute.value)}
              </div>
            ))}
          </div>
        ))}
      </details>
    );
  }
  if (key === 'description' && typeof value === 'string')
    return (
      <Typography.Paragraph
        ellipsis={{ rows: 3, expandable: true }}
        style={{ margin: 0, fontSize: 12 }}
      >
        {value.replace(/<[^>]+>/g, ' ')}
      </Typography.Paragraph>
    );
  if (typeof value === 'boolean')
    return value ? t('tester.yes') : t('tester.no');
  return String(value);
};

function TestResultView({ job }: { job: Job }) {
  const { t } = useTranslation('stores');
  const result = job.testResult;
  if (job.status === 'failed' || !result)
    return (
      <Alert
        type="error"
        showIcon
        title={job.errorMessage ?? t('tester.failed')}
      />
    );
  if (result.isProductPage === false)
    return (
      <Alert
        type="warning"
        showIcon
        title={t('tester.notProductPage')}
        description={t('tester.notProductPageHelp')}
      />
    );
  if (!result.product)
    return (
      <Alert
        type="error"
        showIcon
        title={result.error ?? t('tester.nothingScraped')}
      />
    );
  const product = result.product;
  const errors = result.fieldErrors ?? {};
  return (
    <Flex vertical gap={8}>
      {result.error && <Alert type="error" showIcon title={result.error} />}
      <Table
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={FIELDS}
        columns={[
          {
            title: t('tester.field'),
            width: 130,
            render: (_, field) => t(`tester.fields.${field.key}`)
          },
          {
            title: t('tester.scraped'),
            render: (_, field) => (
              <Flex vertical gap={2}>
                {renderValue(field.key, product[field.key], t)}
                {field.error && errors[field.error] && (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {errors[field.error]}
                  </Typography.Text>
                )}
              </Flex>
            )
          }
        ]}
      />
    </Flex>
  );
}

// Scrapes one page with the config as it is in the editor, without saving
export default function ConfigTester({
  storeId,
  getConfig,
  startUrl
}: {
  storeId: number | null;
  getConfig: () => WebshopCrawlerOptions | undefined;
  startUrl?: string;
}) {
  const { message } = App.useApp();
  const { t } = useTranslation('stores');
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<number>();
  const [starting, setStarting] = useState(false);
  const { data: job } = useSWR<Job>(
    jobId ? `/api/admin/jobs/${jobId}` : null,
    fetchJson,
    {
      refreshInterval: (latest) =>
        latest && !['queued', 'running'].includes(latest.status) ? 0 : 2000
    }
  );
  // When the test was started, and a clock that ticks while it is queued, to
  // warn when the scraper does not pick it up
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const queued = job?.status === 'queued';
  useEffect(() => {
    if (!queued) return;
    const interval = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(interval);
  }, [queued]);
  const notPickedUp = queued && now - startedAt > 20000;

  const run = async () => {
    const config = getConfig();
    if (!config) return;
    setStartedAt(Date.now());
    setNow(Date.now());
    setStarting(true);
    try {
      const { jobId } = await sendJson<{ jobId: number }>(
        '/api/admin/stores/test',
        'POST',
        { storeId, url, config }
      );
      setJobId(jobId);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const busy = job && ['queued', 'running'].includes(job.status);
  return (
    <Card size="small" title={t('tester.title')}>
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">{t('tester.help')}</Typography.Text>
        <Flex gap={8}>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={
              startUrl ? `${startUrl.replace(/\/$/, '')}/...` : 'https://...'
            }
            onPressEnter={run}
          />
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            loading={starting || busy}
            disabled={!url}
            onClick={run}
          >
            {t('tester.test')}
          </Button>
        </Flex>
        {busy && (
          <Flex gap={8} align="center">
            <Spin size="small" />
            <Typography.Text type="secondary">
              {job.status === 'queued'
                ? t('tester.waiting')
                : t('tester.scraping')}
            </Typography.Text>
          </Flex>
        )}
        {notPickedUp && (
          <Alert type="warning" showIcon title={t('tester.notPickedUp')} />
        )}
        {job && !busy && <TestResultView job={job} />}
      </Flex>
    </Card>
  );
}
