'use client';
import { Alert, Descriptions, Flex } from 'antd';
import { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Format } from '../../i18n/format';
import { FIELD_ERRORS, Job } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';

const percentOf = (value: number, total: number) =>
  total > 0 ? ` (${Math.round((value / total) * 100)}%)` : '';

// What a scan of a store found
const scanCounters = (job: Job, t: TFunction<'admin'>, format: Format) => [
  {
    label: t('jobs.configCommit'),
    children: job.configCommit?.slice(0, 7) ?? '–'
  },
  { label: t('jobs.pages'), children: format.number(job.totalRequests) },
  {
    label: t('jobs.requestQueue'),
    children:
      job.pendingRequests === null ? '–' : format.number(job.pendingRequests)
  },
  { label: t('jobs.products'), children: format.number(job.totalProcessed) },
  {
    label: t('jobs.failedPages'),
    children:
      format.number(job.totalErrored) +
      percentOf(job.totalErrored, job.totalRequests)
  },
  ...FIELD_ERRORS.map((field) => ({
    label: t(`fieldErrors.${field}`),
    children:
      format.number(job[field]) + percentOf(job[field], job.totalProcessed)
  }))
];

export default function JobDetails({ job }: { job: Job }) {
  const { t } = useTranslation('admin');
  const format = useFormat();
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
          { label: t('jobs.queued'), children: format.time(job.queuedAt) },
          { label: t('jobs.started'), children: format.time(job.startedAt) },
          { label: t('jobs.finished'), children: format.time(job.finishedAt) },
          ...(job.mode === 'index'
            ? [
                {
                  label: t('jobs.documents'),
                  children: format.number(job.totalRequests)
                },
                {
                  label: t('jobs.indexed'),
                  children:
                    format.number(job.totalProcessed) +
                    percentOf(job.totalProcessed, job.totalRequests)
                }
              ]
            : job.mode === 'schema'
              ? []
              : scanCounters(job, t, format))
        ]}
      />
      {job.updateResult && (
        <Descriptions
          title={
            job.mode === 'index'
              ? t('jobs.indexedDocuments')
              : job.mode === 'schema'
                ? t('jobs.schemaChanges')
                : t('jobs.databaseChanges')
          }
          size="small"
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={Object.entries(job.updateResult).map(([key, value]) => ({
            label: key.replace(/([A-Z])/g, ' $1').toLowerCase(),
            children: format.number(value)
          }))}
        />
      )}
    </Flex>
  );
}
