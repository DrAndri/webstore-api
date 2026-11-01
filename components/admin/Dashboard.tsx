'use client';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  PlayCircleOutlined
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Dropdown,
  Flex,
  Row,
  App,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography
} from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  MODE_LABELS,
  Overview,
  ScheduledMode,
  StoreStatus,
  TrendRow
} from '../../utils/admin/types';
import ActiveJobs from './ActiveJobs';
import { fetchJson, formatNumber, formatTime, fromNow, sendJson } from './api';
import { FieldErrorsChart, Sparkline } from './charts';
import RunScanModal from './RunScanModal';
import { HealthTag, JobStatusTag } from './StatusTags';

const HEALTH_ORDER = { error: 0, warning: 1, unknown: 2, ok: 3, disabled: 4 };

function ScraperCard({ overview }: { overview: Overview }) {
  const { scraper, schedules } = overview;
  return (
    <Card title="Scraper" size="small" style={{ height: '100%' }}>
      {!scraper ? (
        <Alert
          type="warning"
          showIcon
          title="The scraper has not reported in yet. Is the job runner deployed?"
        />
      ) : (
        <Flex vertical gap={8}>
          <div>
            {scraper.online ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                Online
              </Tag>
            ) : (
              <Tag color="error" icon={<CloseCircleOutlined />}>
                Offline since {fromNow(scraper.lastSeenAt)}
              </Tag>
            )}
            <Typography.Text type="secondary">
              Up since {formatTime(scraper.startedAt)}
              {scraper.hostname && ` on ${scraper.hostname}`},{' '}
              {scraper.concurrency} stores at a time
            </Typography.Text>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Configs from {scraper.configSource ?? 'unknown'}
            {scraper.configCommit && ` at ${scraper.configCommit.slice(0, 7)}`}
          </Typography.Text>
          {schedules.map((schedule) => (
            <Typography.Text key={schedule.mode}>
              {MODE_LABELS[schedule.mode]}:{' '}
              {schedule.enabled ? (
                <>
                  <code>{schedule.cron}</code>, next{' '}
                  {formatTime(schedule.nextRuns[0])} UTC
                </>
              ) : (
                <Typography.Text type="secondary">disabled</Typography.Text>
              )}
            </Typography.Text>
          ))}
          {scraper.configErrors.length > 0 && (
            <Alert
              type="error"
              showIcon
              title="Some store configs do not load"
              description={scraper.configErrors.map((e) => (
                <div key={e.file}>
                  {e.file}: {e.message}
                </div>
              ))}
            />
          )}
        </Flex>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { message } = App.useApp();
  const { data, error, mutate } = useSWR<Overview>(
    '/api/admin/overview',
    fetchJson,
    { refreshInterval: 5000 }
  );
  const [trendDays, setTrendDays] = useState(30);
  const [trendMode, setTrendMode] = useState<ScheduledMode | 'all'>('all');
  const { data: trends } = useSWR<TrendRow[]>(
    `/api/admin/trends?days=${trendDays}&mode=${trendMode}`,
    fetchJson,
    { refreshInterval: 60000 }
  );
  // Products per full crawl for the sparklines
  const { data: crawlTrends } = useSWR<TrendRow[]>(
    '/api/admin/trends?days=90&mode=crawler',
    fetchJson,
    { refreshInterval: 60000 }
  );
  const [runFor, setRunFor] = useState<number[] | undefined>();

  const sparklines = useMemo(() => {
    const byStore = new Map<number, { day: string; value: number }[]>();
    for (const row of crawlTrends ?? []) {
      const values = byStore.get(row.storeId) ?? [];
      values.push({
        day: row.day,
        value: Number(row.totalProcessed) / Number(row.jobs)
      });
      byStore.set(row.storeId, values);
    }
    return byStore;
  }, [crawlTrends]);

  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!data) return <Spin style={{ display: 'block', marginTop: 64 }} />;

  const stores = [...data.stores].sort(
    (a, b) =>
      HEALTH_ORDER[a.health.level] - HEALTH_ORDER[b.health.level] ||
      a.name.localeCompare(b.name)
  );
  const count = (level: string) =>
    data.stores.filter((store) => store.health.level === level).length;
  const running = data.activeJobs.filter(
    (job) => job.status === 'running' && job.mode !== 'test'
  ).length;
  const queued = data.activeJobs.filter(
    (job) => job.status === 'queued' && job.mode !== 'test'
  ).length;

  const runNow = async (storeId: number, mode: ScheduledMode) => {
    try {
      const { queued } = await sendJson<{ queued: number }>(
        '/api/admin/jobs',
        'POST',
        { storeIds: [storeId], mode }
      );
      if (queued) message.success('Scan queued');
      else message.info('A scan of this store is already queued or running');
      void mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={() => setRunFor([])}
        >
          Run scan
        </Button>
      </Flex>

      {!data.configsAvailable && (
        <Alert
          type="warning"
          showIcon
          title="The store configs could not be listed from GitHub. Check GITHUB_CONFIG_REPO and GITHUB_TOKEN."
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <ScraperCard overview={data} />
        </Col>
        <Col xs={24} lg={14}>
          <Card size="small" style={{ height: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={8}>
                <Statistic
                  title="Running"
                  value={running}
                  suffix={queued ? `+ ${queued} queued` : undefined}
                />
              </Col>
              <Col xs={12} sm={8}>
                <Statistic
                  title="Healthy"
                  value={count('ok')}
                  prefix={<CheckCircleOutlined style={{ color: '#0ca30c' }} />}
                />
              </Col>
              <Col xs={12} sm={8}>
                <Statistic
                  title="Need attention"
                  value={count('warning') + count('error')}
                  prefix={<CloseCircleOutlined style={{ color: '#d03b3b' }} />}
                  suffix={`${count('error')} failing`}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card title="Running and queued scans" size="small">
        <ActiveJobs jobs={data.activeJobs} onChange={() => void mutate()} />
      </Card>

      <Card title="Stores" size="small">
        <Table<StoreStatus>
          rowKey="id"
          size="small"
          dataSource={stores}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            {
              title: 'Store',
              render: (_, store) => (
                <Link href={`/admin/stores/${store.id}`}>{store.name}</Link>
              )
            },
            {
              title: 'Health',
              render: (_, store) => (
                <Flex gap={4} wrap>
                  <HealthTag health={store.health} />
                  {store.activeJob && <JobStatusTag job={store.activeJob} />}
                </Flex>
              )
            },
            {
              title: 'Issues',
              render: (_, store) => (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {store.health.reasons[0]}
                  {store.health.reasons.length > 1 &&
                    ` (+${store.health.reasons.length - 1} more)`}
                </Typography.Text>
              )
            },
            {
              title: 'Last scan',
              render: (_, store) =>
                store.lastJob ? (
                  <span title={formatTime(store.lastJob.finishedAt)}>
                    {fromNow(store.lastJob.finishedAt)} ·{' '}
                    {MODE_LABELS[store.lastJob.mode].toLowerCase()}
                  </span>
                ) : (
                  'never'
                )
            },
            {
              title: 'Products (last crawl)',
              align: 'right',
              render: (_, store) =>
                formatNumber(store.lastCrawl?.totalProcessed)
            },
            {
              title: 'Trend',
              render: (_, store) => (
                <Sparkline values={sparklines.get(store.id) ?? []} />
              )
            },
            {
              title: '',
              align: 'right',
              render: (_, store) => (
                <Space.Compact size="small">
                  <Button
                    disabled={!store.hasConfig}
                    onClick={() => runNow(store.id, 'crawler')}
                  >
                    Crawl
                  </Button>
                  <Dropdown
                    disabled={!store.hasConfig}
                    menu={{
                      items: [
                        { key: 'list', label: 'Re-scrape active products' }
                      ],
                      onClick: () => runNow(store.id, 'list')
                    }}
                  >
                    <Button icon={<DownOutlined />} aria-label="More scans" />
                  </Dropdown>
                </Space.Compact>
              )
            }
          ]}
        />
      </Card>

      <Card
        title="Scrape errors per day"
        size="small"
        extra={
          <Flex gap={8} wrap>
            <Segmented
              size="small"
              value={trendMode}
              onChange={(value) => setTrendMode(value as ScheduledMode | 'all')}
              options={[
                { value: 'all', label: 'All scans' },
                { value: 'crawler', label: 'Full crawls' },
                { value: 'list', label: 'Active products' }
              ]}
            />
            <Segmented
              size="small"
              value={trendDays}
              onChange={(value) => setTrendDays(value as number)}
              options={[
                { value: 7, label: '7 d' },
                { value: 30, label: '30 d' },
                { value: 90, label: '90 d' }
              ]}
            />
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Products where a field could not be scraped, by field. A jump usually
          means a store changed its pages.
        </Typography.Paragraph>
        {trends ? <FieldErrorsChart rows={trends} /> : <Spin />}
      </Card>

      <RunScanModal
        open={runFor !== undefined}
        stores={data.stores}
        initialStoreIds={runFor}
        onClose={(queued) => {
          setRunFor(undefined);
          if (queued) void mutate();
        }}
      />
    </Flex>
  );
}
