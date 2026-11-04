'use client';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Flex,
  Popconfirm,
  Select,
  Table
} from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import {
  FIELD_ERRORS,
  Job,
  MODE_LABELS,
  Overview
} from '../../utils/admin/types';
import { cancelJob, JobStore } from './ActiveJobs';
import {
  fetchJson,
  formatDuration,
  formatNumber,
  formatTime,
  sendJson
} from './api';
import { FIELD_LABELS } from './charts';
import { JobStatusTag } from './StatusTags';

const percentOf = (value: number, total: number) =>
  total > 0 ? ` (${Math.round((value / total) * 100)}%)` : '';

// What a scan of a store found
const scanCounters = (job: Job) => [
  {
    label: 'Config commit',
    children: job.configCommit?.slice(0, 7) ?? '–'
  },
  { label: 'Pages', children: formatNumber(job.totalRequests) },
  { label: 'Products', children: formatNumber(job.totalProcessed) },
  {
    label: 'Failed pages',
    children:
      formatNumber(job.totalErrored) +
      percentOf(job.totalErrored, job.totalRequests)
  },
  ...FIELD_ERRORS.map((field) => ({
    label: `${FIELD_LABELS[field]} errors`,
    children:
      formatNumber(job[field]) + percentOf(job[field], job.totalProcessed)
  }))
];

export function JobDetails({ job }: { job: Job }) {
  return (
    <Flex vertical gap={12}>
      {job.errorMessage && (
        <Alert
          type={job.status === 'failed' ? 'error' : 'info'}
          showIcon
          title={job.errorMessage}
        />
      )}
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2, lg: 4 }}
        items={[
          { label: 'Queued', children: formatTime(job.queuedAt) },
          { label: 'Started', children: formatTime(job.startedAt) },
          { label: 'Finished', children: formatTime(job.finishedAt) },
          ...(job.mode === 'index'
            ? [
                {
                  label: 'Documents',
                  children: formatNumber(job.totalRequests)
                },
                {
                  label: 'Indexed',
                  children:
                    formatNumber(job.totalProcessed) +
                    percentOf(job.totalProcessed, job.totalRequests)
                }
              ]
            : scanCounters(job))
        ]}
      />
      {job.updateResult && (
        <Descriptions
          title={
            job.mode === 'index' ? 'Indexed documents' : 'Database changes'
          }
          size="small"
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={Object.entries(job.updateResult).map(([key, value]) => ({
            label: key.replace(/([A-Z])/g, ' $1').toLowerCase(),
            children: formatNumber(value)
          }))}
        />
      )}
    </Flex>
  );
}

// Scan history, filtered to one store when storeId is given
export default function JobHistory({ storeId }: { storeId?: number }) {
  const { message } = App.useApp();
  const [filters, setFilters] = useState<{
    storeId?: number;
    mode?: string;
    status?: string;
  }>({ storeId });
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...Object.fromEntries(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    )
  });
  const { data, error, isLoading, mutate } = useSWR<{
    jobs: Job[];
    total: number;
  }>(`/api/admin/jobs?${query}`, fetchJson, {
    refreshInterval: 10000,
    keepPreviousData: true
  });
  const { data: overview, mutate: mutateOverview } = useSWR<Overview>(
    storeId === undefined ? '/api/admin/overview' : null,
    fetchJson,
    { refreshInterval: 10000 }
  );
  const cancellable =
    overview?.activeJobs.filter(
      (job) => job.mode !== 'test' && !job.cancelRequested
    ).length ?? 0;

  const cancelAll = async () => {
    try {
      const { cancelled } = await sendJson<{ cancelled: number }>(
        '/api/admin/jobs/cancel',
        'POST'
      );
      message.success(
        cancelled === 1
          ? 'The scan will stop within a few seconds'
          : `${cancelled} scans will stop within a few seconds`
      );
    } catch (e) {
      message.error((e as Error).message);
    }
    void mutate();
    void mutateOverview();
  };

  const setFilter = (
    key: keyof typeof filters,
    value: string | number | undefined
  ) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };

  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap>
        {storeId === undefined && (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All stores"
            style={{ minWidth: 180 }}
            value={filters.storeId}
            onChange={(value) => setFilter('storeId', value)}
            options={overview?.stores.map((store) => ({
              value: store.id,
              label: store.name
            }))}
          />
        )}
        <Select
          allowClear
          placeholder="All scans"
          style={{ minWidth: 160 }}
          value={filters.mode}
          onChange={(value) => setFilter('mode', value)}
          options={(['crawler', 'list', 'test', 'index'] as const).map(
            (mode) => ({
              value: mode,
              label: MODE_LABELS[mode]
            })
          )}
        />
        <Select
          allowClear
          placeholder="All statuses"
          style={{ minWidth: 160 }}
          value={filters.status}
          onChange={(value) => setFilter('status', value)}
          options={[
            'queued',
            'running',
            'succeeded',
            'failed',
            'cancelled'
          ].map((status) => ({
            value: status,
            label: status[0].toUpperCase() + status.slice(1)
          }))}
        />
        {storeId === undefined && (
          <Popconfirm
            title={`Cancel all ${cancellable} queued and running scans?`}
            disabled={cancellable === 0}
            onConfirm={cancelAll}
          >
            <Button danger disabled={cancellable === 0}>
              Cancel all scans
            </Button>
          </Popconfirm>
        )}
      </Flex>
      {error && <Alert type="error" showIcon title={error.message} />}
      <Table<Job>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.jobs}
        scroll={{ x: true }}
        expandable={{
          expandedRowRender: (job) => <JobDetails job={job} />,
          rowExpandable: (job) => job.mode !== 'test'
        }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total,
          showSizeChanger: false,
          onChange: setPage
        }}
        columns={[
          {
            title: '#',
            width: 70,
            render: (_, job) => (
              <Link href={`/admin/jobs/${job.id}`}>{job.id}</Link>
            )
          },
          ...(storeId === undefined
            ? [
                {
                  title: 'Store',
                  render: (_: unknown, job: Job) => <JobStore job={job} />
                }
              ]
            : []),
          { title: 'Scan', render: (_, job) => MODE_LABELS[job.mode] },
          { title: 'Status', render: (_, job) => <JobStatusTag job={job} /> },
          {
            title: 'Started',
            render: (_, job) => formatTime(job.startedAt ?? job.queuedAt)
          },
          {
            title: 'Duration',
            render: (_, job) =>
              job.status === 'queued'
                ? '–'
                : formatDuration(job.startedAt, job.finishedAt)
          },
          {
            title: 'Products',
            align: 'right',
            render: (_, job) => formatNumber(job.totalProcessed)
          },
          {
            title: 'Field errors',
            align: 'right',
            render: (_, job) =>
              job.mode === 'index'
                ? '–'
                : formatNumber(
                    FIELD_ERRORS.reduce((sum, field) => sum + job[field], 0)
                  )
          },
          {
            title: 'Failed pages',
            align: 'right',
            render: (_, job) =>
              job.mode === 'index' ? '–' : formatNumber(job.totalErrored)
          },
          { title: 'By', render: (_, job) => job.requestedBy ?? job.source },
          {
            title: '',
            align: 'right',
            render: (_, job) => (
              <Flex gap={8} justify="end">
                {job.status !== 'queued' && (
                  <Link href={`/admin/jobs/${job.id}`}>
                    <Button size="small">Log</Button>
                  </Link>
                )}
                {(job.status === 'queued' || job.status === 'running') &&
                  !job.cancelRequested && (
                    <Popconfirm
                      title="Cancel this scan?"
                      onConfirm={() =>
                        cancelJob(job.id, message, () => void mutate())
                      }
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
    </Flex>
  );
}
