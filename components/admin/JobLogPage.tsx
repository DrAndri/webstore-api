'use client';
import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import useSWR from 'swr';
import { Job, MODE_LABELS } from '../../utils/admin/types';
import { fetchJson, formatDuration, formatTime } from './api';
import { JobDetails } from './JobHistory';
import LogViewer from './LogViewer';
import { JobStatusTag } from './StatusTags';

const isActive = (job?: Job) =>
  job?.status === 'queued' || job?.status === 'running';

// A scan with its log
export default function JobLogPage({ jobId }: { jobId: number }) {
  const { data: job, error } = useSWR<Job>(
    `/api/admin/jobs/${jobId}`,
    fetchJson,
    { refreshInterval: (latest) => (isActive(latest) ? 5000 : 0) }
  );

  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!job) return <Spin style={{ display: 'block', marginTop: 64 }} />;

  const storeName = job.mode === 'test' ? `test-${job.id}` : job.storeName;
  // The scraper's own lines about the store and its jobs while the scan ran
  const appLogUrl =
    job.startedAt &&
    `/admin/logs?${new URLSearchParams([
      ...(storeName ? [['label', storeName]] : []),
      ['label', 'JobRunner'],
      ['label', 'crawlee'],
      ['start', String(dayjs(job.startedAt).subtract(1, 'minute').valueOf())],
      [
        'end',
        String(
          dayjs(job.finishedAt ?? undefined)
            .add(2, 'minute')
            .valueOf()
        )
      ]
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
          Scan #{job.id}
          {job.storeName ? ` · ${job.storeName}` : ''}
        </Typography.Title>
        <JobStatusTag job={job} />
        <Typography.Text type="secondary">
          {MODE_LABELS[job.mode]} · started {formatTime(job.startedAt)} ·{' '}
          {job.status === 'queued'
            ? 'queued'
            : formatDuration(job.startedAt, job.finishedAt)}
        </Typography.Text>
        {appLogUrl && (
          <Link href={appLogUrl} style={{ marginInlineStart: 'auto' }}>
            <Button icon={<FileTextOutlined />}>App log during the scan</Button>
          </Link>
        )}
      </Flex>
      {job.mode === 'test' ? (
        job.testUrl && (
          <Typography.Text>
            Tested <Typography.Text code>{job.testUrl}</Typography.Text>
          </Typography.Text>
        )
      ) : (
        <JobDetails job={job} />
      )}
      <Typography.Title level={4} style={{ margin: 0 }}>
        Scan log
      </Typography.Title>
      <LogViewer
        // Following stops when the scan is done
        key={String(isActive(job))}
        source="scan"
        jobId={job.id}
        running={isActive(job)}
      />
    </Flex>
  );
}
