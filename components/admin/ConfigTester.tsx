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
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Job, WebshopCrawlerOptions } from '../../utils/admin/types';
import { fetchJson, sendJson } from './api';

const FIELDS: { key: string; label: string; error?: string }[] = [
  { key: 'sku', label: 'SKU' },
  { key: 'title', label: 'Name', error: 'name' },
  { key: 'brand', label: 'Brand', error: 'brand' },
  { key: 'price', label: 'Price' },
  { key: 'salePrice', label: 'Sale price' },
  { key: 'gtin', label: 'GTIN' },
  { key: 'inStock', label: 'In stock', error: 'inStock' },
  { key: 'image', label: 'Image', error: 'image' },
  { key: 'categories', label: 'Categories', error: 'categories' },
  { key: 'description', label: 'Description', error: 'description' },
  { key: 'attributes', label: 'Specifications', error: 'attributes' }
];

const renderValue = (key: string, value: unknown) => {
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
          {count} in {groups.length} group{groups.length === 1 ? '' : 's'}
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
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

function TestResultView({ job }: { job: Job }) {
  const result = job.testResult;
  if (job.status === 'failed' || !result)
    return (
      <Alert
        type="error"
        showIcon
        title={job.errorMessage ?? 'The test failed'}
      />
    );
  if (result.isProductPage === false)
    return (
      <Alert
        type="warning"
        showIcon
        title="Not recognised as a product page"
        description="The product container was not found or the product page identifier is not in the page source."
      />
    );
  if (!result.product)
    return (
      <Alert
        type="error"
        showIcon
        title={result.error ?? 'Nothing was scraped'}
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
          { title: 'Field', dataIndex: 'label', width: 130 },
          {
            title: 'Scraped',
            render: (_, field) => (
              <Flex vertical gap={2}>
                {renderValue(field.key, product[field.key])}
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
    <Card size="small" title="Test on a product page">
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">
          The scraper loads the page with the config as it is now, saved or not,
          and shows what it finds. Nothing is written to the database.
        </Typography.Text>
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
            Test
          </Button>
        </Flex>
        {busy && (
          <Flex gap={8} align="center">
            <Spin size="small" />
            <Typography.Text type="secondary">
              {job.status === 'queued'
                ? 'Waiting for the scraper…'
                : 'Scraping the page, the browser type can take up to a minute…'}
            </Typography.Text>
          </Flex>
        )}
        {notPickedUp && (
          <Alert
            type="warning"
            showIcon
            title="The scraper has not picked up the test. Check that it is online on the dashboard."
          />
        )}
        {job && !busy && <TestResultView job={job} />}
      </Flex>
    </Card>
  );
}
