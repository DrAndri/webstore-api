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
import { Health, Job, JobStatus } from '../../utils/admin/types';

// Status colors always come with an icon and a label
const HEALTH = {
  ok: { color: 'success', icon: <CheckCircleOutlined />, label: 'Healthy' },
  warning: {
    color: 'warning',
    icon: <ExclamationCircleOutlined />,
    label: 'Degraded'
  },
  error: { color: 'error', icon: <CloseCircleOutlined />, label: 'Failing' },
  disabled: {
    color: 'default',
    icon: <MinusCircleOutlined />,
    label: 'Disabled'
  },
  unknown: {
    color: 'default',
    icon: <QuestionCircleOutlined />,
    label: 'Unknown'
  }
} as const;

export function HealthTag({ health }: { health: Health }) {
  const { color, icon, label } = HEALTH[health.level];
  const tag = (
    <Tag color={color} icon={icon}>
      {label}
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

const JOB_STATUS: Record<
  JobStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  queued: { color: 'default', icon: <ClockCircleOutlined />, label: 'Queued' },
  running: {
    color: 'processing',
    icon: <SyncOutlined spin />,
    label: 'Running'
  },
  succeeded: {
    color: 'success',
    icon: <CheckCircleOutlined />,
    label: 'Succeeded'
  },
  failed: { color: 'error', icon: <CloseCircleOutlined />, label: 'Failed' },
  cancelled: { color: 'default', icon: <StopOutlined />, label: 'Cancelled' }
};

export function JobStatusTag({
  job
}: {
  job: Pick<Job, 'status' | 'cancelRequested' | 'errorMessage'>;
}) {
  const { color, icon, label } = JOB_STATUS[job.status];
  const cancelling =
    job.cancelRequested &&
    (job.status === 'queued' || job.status === 'running');
  const tag = (
    <Tag color={color} icon={icon}>
      {cancelling ? 'Cancelling' : label}
    </Tag>
  );
  return job.errorMessage ? (
    <Tooltip title={job.errorMessage}>{tag}</Tooltip>
  ) : (
    tag
  );
}
