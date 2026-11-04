'use client';
import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { isSolrJob, Job, SolrJobMode } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson } from './api';
import { JobDetails } from './JobHistory';
import LogViewer from './LogViewer';
import { JobStatusTag } from './StatusTags';

const isActive = (job?: Job) =>
  job?.status === 'queued' || job?.status === 'running';

// The modules of the scraper that log a reindex or a schema sync
const SOLR_LOG_LABELS: Record<SolrJobMode, string[]> = {
  index: ['JobRunner', 'SQLStoreUpdater', 'Solr'],
  schema: ['JobRunner', 'SolrSchema']
};
const TITLES = {
  index: 'jobLog.titleIndex',
  schema: 'jobLog.titleSchema'
} as const;

// A scan with its log
export default function JobLogPage({ jobId }: { jobId: number }) {
  const { t } = useTranslation('admin');
  const format = useFormat();
  const { data: job, error } = useSWR<Job>(
    `/api/admin/jobs/${jobId}`,
    fetchJson,
    { refreshInterval: (latest) => (isActive(latest) ? 5000 : 0) }
  );

  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!job) return <Spin style={{ display: 'block', marginTop: 64 }} />;

  const solrMode = isSolrJob(job.mode) ? job.mode : undefined;
  const storeName = job.mode === 'test' ? `test-${job.id}` : job.storeName;
  // The time the job ran, in ms, with a margin for lines logged around it
  const logRange = job.startedAt
    ? {
        start: dayjs(job.startedAt).subtract(1, 'minute').valueOf(),
        end: dayjs(job.finishedAt ?? undefined)
          .add(2, 'minute')
          .valueOf()
      }
    : undefined;
  // The scraper's own lines about the store and its jobs while the scan ran
  const appLogUrl =
    logRange &&
    !solrMode &&
    `/admin/logs?${new URLSearchParams([
      ...(storeName ? [['label', storeName]] : []),
      ['label', 'JobRunner'],
      ['label', 'crawlee'],
      ['start', String(logRange.start)],
      ['end', String(logRange.end)]
    ])}`;

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="center" wrap>
        <Link
          href={job.storeId ? `/admin/stores/${job.storeId}` : '/admin/jobs'}
        >
          <Button type="text" icon={<ArrowLeftOutlined />} />
        </Link>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t(solrMode ? TITLES[solrMode] : 'jobLog.titleScan', {
            id: job.id
          })}
          {job.storeName ? ` · ${job.storeName}` : ''}
        </Typography.Title>
        <JobStatusTag job={job} />
        <Typography.Text type="secondary">
          {t(`modes.${job.mode}`)} ·{' '}
          {t('jobLog.started', { time: format.time(job.startedAt) })} ·{' '}
          {job.status === 'queued'
            ? t('jobLog.queued')
            : format.duration(job.startedAt, job.finishedAt)}
        </Typography.Text>
        {appLogUrl && (
          <Link href={appLogUrl} style={{ marginInlineStart: 'auto' }}>
            <Button icon={<FileTextOutlined />}>{t('jobLog.appLog')}</Button>
          </Link>
        )}
      </Flex>
      {job.mode === 'test' ? (
        job.testUrl && (
          <Typography.Text>
            {t('jobLog.tested')}{' '}
            <Typography.Text code>{job.testUrl}</Typography.Text>
          </Typography.Text>
        )
      ) : (
        <JobDetails job={job} />
      )}
      <Typography.Title level={4} style={{ margin: 0 }}>
        {solrMode ? t('jobLog.log') : t('jobLog.scanLog')}
      </Typography.Title>
      {solrMode ? (
        // A Solr job has no log of its own, it is in the scraper's log
        <LogViewer
          key={String(isActive(job))}
          source="app"
          initialLabels={SOLR_LOG_LABELS[solrMode]}
          // Live while it runs, the time it ran when it is done
          initialRange={isActive(job) ? undefined : logRange}
        />
      ) : (
        <LogViewer
          // Following stops when the scan is done
          key={String(isActive(job))}
          source="scan"
          jobId={job.id}
          running={isActive(job)}
        />
      )}
    </Flex>
  );
}
