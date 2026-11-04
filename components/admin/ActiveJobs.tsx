'use client';
import {
  App,
  Button,
  Empty,
  Flex,
  Popconfirm,
  Table,
  Tag,
  Typography
} from 'antd';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Job, MODE_LABELS } from '../../utils/admin/types';
import { formatDuration, formatNumber, fromNow, sendJson } from './api';
import { JobStatusTag } from './StatusTags';

// A running job whose heartbeat is this old has probably died with the scraper
const STALLED_AFTER_SECONDS = 60;

export const cancelJob = async (
  id: number,
  message: ReturnType<typeof App.useApp>['message'],
  onDone: () => void
) => {
  try {
    await sendJson(`/api/admin/jobs/${id}/cancel`, 'POST');
    message.success('The scan will stop within a few seconds');
    onDone();
  } catch (e) {
    message.error((e as Error).message);
  }
};

// The store of a job, a reindex covers all of them and a test can be of a
// store that has not been created yet
export function JobStore({ job }: { job: Job }) {
  if (job.mode === 'index')
    return <Typography.Text type="secondary">All stores</Typography.Text>;
  if (!job.storeId)
    return <Typography.Text type="secondary">New store</Typography.Text>;
  return <Link href={`/admin/stores/${job.storeId}`}>{job.storeName}</Link>;
}

export default function ActiveJobs({
  jobs,
  onChange
}: {
  jobs: Job[];
  onChange: () => void;
}) {
  const { message } = App.useApp();
  const visible = jobs.filter((job) => job.mode !== 'test');
  if (visible.length === 0)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No scans running"
      />
    );

  return (
    <Table<Job>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={visible}
      scroll={{ x: true }}
      columns={[
        {
          title: 'Store',
          render: (_, job) => <JobStore job={job} />
        },
        { title: 'Scan', render: (_, job) => MODE_LABELS[job.mode] },
        {
          title: 'Status',
          render: (_, job) => {
            const stalled =
              job.status === 'running' &&
              dayjs().diff(dayjs(job.heartbeatAt), 'second') >
                STALLED_AFTER_SECONDS;
            return (
              <>
                <JobStatusTag job={job} />
                {stalled && (
                  <Tag color="warning">
                    No heartbeat {fromNow(job.heartbeatAt)}
                  </Tag>
                )}
              </>
            );
          }
        },
        {
          title: 'Progress',
          render: (_, job) =>
            job.status === 'running' && job.mode === 'index' ? (
              <Typography.Text>
                {formatNumber(job.totalProcessed)} of{' '}
                {formatNumber(job.totalRequests)} documents indexed
              </Typography.Text>
            ) : job.status === 'running' ? (
              <Typography.Text>
                {formatNumber(job.totalProcessed)} products from{' '}
                {formatNumber(job.totalRequests)} pages
                {job.totalErrored > 0 &&
                  `, ${formatNumber(job.totalErrored)} failed`}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">
                Queued {fromNow(job.queuedAt)}
              </Typography.Text>
            )
        },
        {
          title: 'Running for',
          render: (_, job) => formatDuration(job.startedAt)
        },
        {
          title: 'By',
          render: (_, job) => job.requestedBy ?? job.source
        },
        {
          title: '',
          align: 'right',
          render: (_, job) => (
            <Flex gap={8} justify="end">
              {job.status === 'running' && (
                <Link href={`/admin/jobs/${job.id}`}>
                  <Button size="small">Log</Button>
                </Link>
              )}
              {!job.cancelRequested && (
                <Popconfirm
                  title={
                    job.status !== 'running'
                      ? 'Remove this scan from the queue?'
                      : job.mode === 'index'
                        ? 'Stop the reindex? What is indexed so far stays in Solr.'
                        : 'Stop this scan? Pages in progress finish first.'
                  }
                  onConfirm={() => cancelJob(job.id, message, onChange)}
                >
                  <Button size="small" danger>
                    Cancel
                  </Button>
                </Popconfirm>
              )}
            </Flex>
          )
        }
      ]}
    />
  );
}
