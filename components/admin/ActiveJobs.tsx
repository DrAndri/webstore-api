'use client';
import { App, Button, Empty, Popconfirm, Table, Tag, Typography } from 'antd';
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
          render: (_, job) => (
            <Link href={`/admin/stores/${job.storeId}`}>{job.storeName}</Link>
          )
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
            job.status === 'running' ? (
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
          render: (_, job) =>
            !job.cancelRequested && (
              <Popconfirm
                title={
                  job.status === 'running'
                    ? 'Stop this scan? Pages in progress finish first.'
                    : 'Remove this scan from the queue?'
                }
                onConfirm={() => cancelJob(job.id, message, onChange)}
              >
                <Button size="small" danger>
                  Cancel
                </Button>
              </Popconfirm>
            )
        }
      ]}
    />
  );
}
