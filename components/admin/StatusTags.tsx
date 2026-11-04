'use client';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  QuestionCircleOutlined,
  StopOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { Health, Job, JobStatus } from '../../utils/admin/types';

// Status colors always come with an icon and a label, the labels are
// healthLevels.<level> and status.<status> in the admin namespace
const HEALTH = {
  ok: { color: 'success', icon: <CheckCircleOutlined /> },
  warning: { color: 'warning', icon: <ExclamationCircleOutlined /> },
  error: { color: 'error', icon: <CloseCircleOutlined /> },
  disabled: { color: 'default', icon: <MinusCircleOutlined /> },
  unknown: { color: 'default', icon: <QuestionCircleOutlined /> }
} as const;

export function HealthTag({ health }: { health: Health }) {
  const { t } = useTranslation('admin');
  const { color, icon } = HEALTH[health.level];
  const tag = (
    <Tag color={color} icon={icon}>
      {t(`healthLevels.${health.level}`)}
    </Tag>
  );
  if (health.reasons.length === 0) return tag;
  return (
    <Tooltip
      title={
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {health.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      }
    >
      {tag}
    </Tooltip>
  );
}

const JOB_STATUS: Record<JobStatus, { color: string; icon: React.ReactNode }> =
  {
    queued: { color: 'default', icon: <ClockCircleOutlined /> },
    running: { color: 'processing', icon: <SyncOutlined spin /> },
    succeeded: { color: 'success', icon: <CheckCircleOutlined /> },
    failed: { color: 'error', icon: <CloseCircleOutlined /> },
    cancelled: { color: 'default', icon: <StopOutlined /> }
  };

export function JobStatusTag({
  job
}: {
  job: Pick<Job, 'status' | 'cancelRequested' | 'errorMessage'>;
}) {
  const { t } = useTranslation('admin');
  const { color, icon } = JOB_STATUS[job.status];
  const cancelling =
    job.cancelRequested &&
    (job.status === 'queued' || job.status === 'running');
  const tag = (
    <Tag color={color} icon={icon}>
      {t(cancelling ? 'status.cancelling' : `status.${job.status}`)}
    </Tag>
  );
  return job.errorMessage ? (
    <Tooltip title={job.errorMessage}>{tag}</Tooltip>
  ) : (
    tag
  );
}
