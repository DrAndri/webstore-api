'use client';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  PlayCircleOutlined,
  SyncOutlined
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
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  theme,
  Typography
} from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import {
  Overview,
  ScheduledMode,
  StoreStatus,
  TrendRow
} from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import ActiveJobs from './ActiveJobs';
import { fetchJson, sendJson } from './api';
import { FieldErrorsChart, Sparkline } from './charts';
import RunScanModal from './RunScanModal';
import { HealthTag, JobStatusTag } from './StatusTags';

const HEALTH_ORDER = { error: 0, warning: 1, unknown: 2, ok: 3, disabled: 4 };

function ScraperCard({ overview }: { overview: Overview }) {
  const { scraper, schedules } = overview;
  const { t } = useTranslation('admin');
  const format = useFormat();
  return (
    <Card
      title={t('dashboard.scraper')}
      size="small"
      style={{ height: '100%' }}
    >
      {!scraper ? (
        <Alert type="warning" showIcon title={t('dashboard.notReported')} />
      ) : (
        <Flex vertical gap={8}>
          <div>
            {scraper.online ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                {t('dashboard.online')}
              </Tag>
            ) : (
              <Tag color="error" icon={<CloseCircleOutlined />}>
                {t('dashboard.offlineSince', {
                  time: format.fromNow(scraper.lastSeenAt)
                })}
              </Tag>
            )}
            <Typography.Text type="secondary">
              {scraper.hostname
                ? t('dashboard.upSinceOn', {
                    time: format.time(scraper.startedAt),
                    host: scraper.hostname
                  })
                : t('dashboard.upSince', {
                    time: format.time(scraper.startedAt)
                  })}
              {scraper.concurrency !== null &&
                `, ${t('dashboard.concurrency', { count: scraper.concurrency })}`}
            </Typography.Text>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {scraper.configCommit
              ? t('dashboard.configsFromAt', {
                  source: scraper.configSource ?? t('dashboard.unknownSource'),
                  commit: scraper.configCommit.slice(0, 7)
                })
              : t('dashboard.configsFrom', {
                  source: scraper.configSource ?? t('dashboard.unknownSource')
                })}
          </Typography.Text>
          {schedules.map((schedule) => (
            <Typography.Text key={schedule.mode}>
              {t(`modes.${schedule.mode}`)}:{' '}
              {schedule.enabled ? (
                <>
                  <code>{schedule.cron}</code>,{' '}
                  {t('dashboard.nextRun', {
                    time: format.time(schedule.nextRuns[0])
                  })}
                </>
              ) : (
                <Typography.Text type="secondary">
                  {t('dashboard.scheduleDisabled')}
                </Typography.Text>
              )}
            </Typography.Text>
          ))}
          {scraper.configErrors.length > 0 && (
            <Alert
              type="error"
              showIcon
              title={t('dashboard.configErrors')}
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
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { t } = useTranslation('admin');
  const format = useFormat();
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
      if (queued) message.success(t('dashboard.scanQueued'));
      else message.info(t('dashboard.storeAlreadyQueued'));
      void mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const reindexing = data.activeJobs.some((job) => job.mode === 'index');
  const reindex = async () => {
    try {
      const { queued } = await sendJson<{ queued: number }>(
        '/api/admin/jobs/reindex',
        'POST'
      );
      if (queued) message.success(t('dashboard.reindexQueued'));
      else message.info(t('dashboard.reindexAlreadyQueued'));
      void mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('dashboard.title')}
        </Typography.Title>
        <Space wrap>
          <Popconfirm
            title={t('dashboard.reindexConfirm')}
            description={t('dashboard.reindexDescription')}
            okText={t('dashboard.reindexOk')}
            disabled={reindexing}
            onConfirm={reindex}
          >
            <Button
              icon={<SyncOutlined spin={reindexing} />}
              disabled={reindexing}
            >
              {reindexing ? t('dashboard.reindexing') : t('dashboard.reindex')}
            </Button>
          </Popconfirm>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => setRunFor([])}
          >
            {t('dashboard.runScan')}
          </Button>
        </Space>
      </Flex>

      {!data.configsAvailable && (
        <Alert
          type="warning"
          showIcon
          title={t('dashboard.configsUnavailable')}
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
                  title={t('dashboard.running')}
                  value={running}
                  suffix={
                    queued
                      ? t('dashboard.queuedSuffix', { count: queued })
                      : undefined
                  }
                />
              </Col>
              <Col xs={12} sm={8}>
                <Statistic
                  title={t('dashboard.healthy')}
                  value={count('ok')}
                  prefix={
                    <CheckCircleOutlined
                      style={{ color: token.colorSuccess }}
                    />
                  }
                />
              </Col>
              <Col xs={12} sm={8}>
                <Statistic
                  title={t('dashboard.needAttention')}
                  value={count('warning') + count('error')}
                  prefix={
                    <CloseCircleOutlined style={{ color: token.colorError }} />
                  }
                  suffix={t('dashboard.failing', { count: count('error') })}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card title={t('dashboard.activeScans')} size="small">
        <ActiveJobs jobs={data.activeJobs} onChange={() => void mutate()} />
      </Card>

      <Card title={t('dashboard.stores')} size="small">
        <Table<StoreStatus>
          rowKey="id"
          size="small"
          dataSource={stores}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            {
              title: t('columns.store'),
              render: (_, store) => (
                <Link href={`/admin/stores/${store.id}`}>{store.name}</Link>
              )
            },
            {
              title: t('dashboard.health'),
              render: (_, store) => (
                <Flex gap={4} wrap>
                  <HealthTag health={store.health} />
                  {store.activeJob && <JobStatusTag job={store.activeJob} />}
                </Flex>
              )
            },
            {
              title: t('dashboard.issues'),
              render: (_, store) => (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {store.health.reasons[0]}
                  {store.health.reasons.length > 1 &&
                    ` ${t('dashboard.moreIssues', {
                      count: store.health.reasons.length - 1
                    })}`}
                </Typography.Text>
              )
            },
            {
              title: t('dashboard.lastScan'),
              render: (_, store) =>
                store.lastJob ? (
                  <span title={format.time(store.lastJob.finishedAt)}>
                    {format.fromNow(store.lastJob.finishedAt)} ·{' '}
                    {t(`modes.${store.lastJob.mode}`).toLocaleLowerCase(
                      format.locale
                    )}
                  </span>
                ) : (
                  t('dashboard.never')
                )
            },
            {
              title: t('dashboard.productsLastCrawl'),
              align: 'right',
              render: (_, store) =>
                format.number(store.lastCrawl?.totalProcessed)
            },
            {
              title: t('dashboard.trend'),
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
                    {t('dashboard.crawl')}
                  </Button>
                  <Dropdown
                    disabled={!store.hasConfig}
                    menu={{
                      items: [{ key: 'list', label: t('dashboard.rescrape') }],
                      onClick: () => runNow(store.id, 'list')
                    }}
                  >
                    <Button
                      icon={<DownOutlined />}
                      aria-label={t('dashboard.moreScans')}
                    />
                  </Dropdown>
                </Space.Compact>
              )
            }
          ]}
        />
      </Card>

      <Card
        title={t('dashboard.errorsPerDay')}
        size="small"
        extra={
          <Flex gap={8} wrap>
            <Segmented
              size="small"
              value={trendMode}
              onChange={(value) => setTrendMode(value as ScheduledMode | 'all')}
              options={[
                { value: 'all', label: t('dashboard.allScans') },
                { value: 'crawler', label: t('dashboard.fullCrawls') },
                { value: 'list', label: t('modes.list') }
              ]}
            />
            <Segmented
              size="small"
              value={trendDays}
              onChange={(value) => setTrendDays(value as number)}
              options={[7, 30, 90].map((days) => ({
                value: days,
                label: t('dashboard.days', { days })
              }))}
            />
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          {t('dashboard.errorsHelp')}
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
