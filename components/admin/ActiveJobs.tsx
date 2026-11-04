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
import { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Job } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { sendJson } from './api';
import { JobStatusTag } from './StatusTags';

// A running job whose heartbeat is this old has probably died with the scraper
const STALLED_AFTER_SECONDS = 60;

export const cancelJob = async (
  id: number,
  message: ReturnType<typeof App.useApp>['message'],
  t: TFunction<'admin'>,
  onDone: () => void
) => {
  try {
    await sendJson(`/api/admin/jobs/${id}/cancel`, 'POST');
    message.success(t('activeJobs.cancelled'));
    onDone();
  } catch (e) {
    message.error((e as Error).message);
  }
};

// The store of a job, a reindex covers all of them, a schema sync none and a
// test can be of a store that has not been created yet
export function JobStore({ job }: { job: Job }) {
  const { t } = useTranslation('admin');
  if (job.mode === 'schema')
    return (
      <Typography.Text type="secondary">{t('activeJobs.solr')}</Typography.Text>
    );
  if (job.mode === 'index')
    return (
      <Typography.Text type="secondary">
        {t('activeJobs.allStores')}
      </Typography.Text>
    );
  if (!job.storeId)
    return (
      <Typography.Text type="secondary">
        {t('activeJobs.newStore')}
      </Typography.Text>
    );
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
  const { t } = useTranslation('admin');
  const format = useFormat();
  const visible = jobs.filter((job) => job.mode !== 'test');
  if (visible.length === 0)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('activeJobs.empty')}
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
          title: t('columns.store'),
          render: (_, job) => <JobStore job={job} />
        },
        {
          title: t('columns.scan'),
          render: (_, job) => t(`modes.${job.mode}`)
        },
        {
          title: t('columns.status'),
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
                    {t('activeJobs.noHeartbeat', {
                      time: format.fromNow(job.heartbeatAt)
                    })}
                  </Tag>
                )}
              </>
            );
          }
        },
        {
          title: t('columns.progress'),
          render: (_, job) =>
            job.status === 'running' && job.mode === 'index' ? (
              <Typography.Text>
                {t('activeJobs.indexProgress', {
                  processed: format.number(job.totalProcessed),
                  total: format.number(job.totalRequests)
                })}
              </Typography.Text>
            ) : job.status === 'running' && job.mode === 'schema' ? (
              <Typography.Text>
                {t('activeJobs.schemaProgress')}
              </Typography.Text>
            ) : job.status === 'running' ? (
              <Typography.Text>
                {t(
                  job.totalErrored > 0
                    ? 'activeJobs.scanProgressFailed'
                    : 'activeJobs.scanProgress',
                  {
                    products: format.number(job.totalProcessed),
                    pages: format.number(job.totalRequests),
                    failed: format.number(job.totalErrored)
                  }
                )}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">
                {t('activeJobs.queuedAgo', {
                  time: format.fromNow(job.queuedAt)
                })}
              </Typography.Text>
            )
        },
        {
          title: t('columns.runningFor'),
          render: (_, job) => format.duration(job.startedAt)
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
              {job.status === 'running' && (
                <Link href={`/admin/jobs/${job.id}`}>
                  <Button size="small">{t('log')}</Button>
                </Link>
              )}
              {/* A running schema sync is quick and doesn't stop */}
              {!job.cancelRequested &&
                !(job.status === 'running' && job.mode === 'schema') && (
                  <Popconfirm
                    title={
                      job.status !== 'running'
                        ? t('activeJobs.confirmRemove')
                        : job.mode === 'index'
                          ? t('activeJobs.confirmStopIndex')
                          : t('activeJobs.confirmStopScan')
                    }
                    onConfirm={() => cancelJob(job.id, message, t, onChange)}
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
  );
}
