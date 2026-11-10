'use client';
import { Alert, App, Button, Flex, Popconfirm, Select, Table } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import {
  FIELD_ERRORS,
  Job,
  JobMode,
  isSolrJob,
  JobStatus,
  Overview
} from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { cancelJob, JobStore } from './ActiveJobs';
import { fetchJson, sendJson } from './api';
import JobDetails from './JobDetails';
import { JobStatusTag } from './StatusTags';

const MODES: JobMode[] = ['crawler', 'list', 'test', 'index', 'schema'];
const STATUSES: JobStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled'
];

// Scan history, filtered to one store when storeId is given
export default function JobHistory({ storeId }: { storeId?: number }) {
  const { message } = App.useApp();
  const { t } = useTranslation('admin');
  const format = useFormat();
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
          ? t('activeJobs.cancelled')
          : t('jobs.cancelledAll', { count: cancelled })
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
            placeholder={t('jobs.allStores')}
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
          placeholder={t('jobs.allScans')}
          style={{ minWidth: 160 }}
          value={filters.mode}
          onChange={(value) => setFilter('mode', value)}
          options={MODES.map((mode) => ({
            value: mode,
            label: t(`modes.${mode}`)
          }))}
        />
        <Select
          allowClear
          placeholder={t('jobs.allStatuses')}
          style={{ minWidth: 160 }}
          value={filters.status}
          onChange={(value) => setFilter('status', value)}
          options={STATUSES.map((status) => ({
            value: status,
            label: t(`status.${status}`)
          }))}
        />
        {storeId === undefined && (
          <Popconfirm
            title={t('jobs.confirmCancelAll', { count: cancellable })}
            disabled={cancellable === 0}
            onConfirm={cancelAll}
          >
            <Button danger disabled={cancellable === 0}>
              {t('jobs.cancelAll')}
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
                  title: t('columns.store'),
                  render: (_: unknown, job: Job) => <JobStore job={job} />
                }
              ]
            : []),
          {
            title: t('columns.scan'),
            render: (_, job) => t(`modes.${job.mode}`)
          },
          {
            title: t('columns.status'),
            render: (_, job) => <JobStatusTag job={job} />
          },
          {
            title: t('columns.started'),
            render: (_, job) => format.time(job.startedAt ?? job.queuedAt)
          },
          {
            title: t('columns.duration'),
            render: (_, job) =>
              job.status === 'queued'
                ? '–'
                : format.duration(job.startedAt, job.finishedAt)
          },
          {
            title: t('columns.products'),
            align: 'right',
            render: (_, job) =>
              job.mode === 'schema' ? '–' : format.number(job.totalProcessed)
          },
          {
            title: t('columns.fieldErrors'),
            align: 'right',
            render: (_, job) =>
              isSolrJob(job.mode)
                ? '–'
                : format.number(
                    FIELD_ERRORS.reduce((sum, field) => sum + job[field], 0)
                  )
          },
          {
            title: t('columns.failedPages'),
            align: 'right',
            render: (_, job) =>
              isSolrJob(job.mode) ? '–' : format.number(job.totalErrored)
          },
          {
            title: t('columns.by'),
            render: (_, job) => job.requestedBy ?? t(`sources.${job.source}`)
          },
          {
            title: '',
            align: 'right',
            render: (_, job) => (
              <Flex gap={8} justify="end">
                {job.status !== 'queued' && (
                  <Link href={`/admin/jobs/${job.id}`}>
                    <Button size="small">{t('log')}</Button>
                  </Link>
                )}
                {/* A running schema sync is quick and doesn't stop */}
                {(job.status === 'queued' ||
                  (job.status === 'running' && job.mode !== 'schema')) &&
                  !job.cancelRequested && (
                    <Popconfirm
                      title={t('jobs.confirmCancel')}
                      onConfirm={() =>
                        cancelJob(job.id, message, t, () => void mutate())
                      }
                    >
                      <Button size="small" danger>
                        {t('cancel')}
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
