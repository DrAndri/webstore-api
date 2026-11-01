'use client';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Flex,
  Input,
  Row,
  Spin,
  Switch,
  Tag,
  Typography
} from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  CronDescription,
  MODE_LABELS,
  Schedule
} from '../../utils/admin/types';
import { fetchJson, formatTime, fromNow, sendJson } from './api';

const DESCRIPTIONS = {
  crawler:
    'Crawls every enabled store from its start page and sitemaps. Finds new products, slow.',
  list: 'Re-scrapes the product pages found in the last scan of each store. Keeps prices fresh, faster.'
};

const PRESETS = [
  { label: 'Every night at 04:00', cron: '0 4 * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Mondays at 01:00', cron: '0 1 * * 1' },
  { label: 'Twice a week', cron: '0 1 * * 1,4' }
];

function ScheduleCard({
  schedule,
  onSaved
}: {
  schedule: Schedule;
  onSaved: (schedules: Schedule[]) => void;
}) {
  const { message } = App.useApp();
  const [cron, setCron] = useState(schedule.cron);
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [saving, setSaving] = useState(false);
  const [debounced, setDebounced] = useState(cron);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(cron), 300);
    return () => clearTimeout(timeout);
  }, [cron]);
  const { data: preview } = useSWR<CronDescription>(
    `/api/admin/schedules/preview?cron=${encodeURIComponent(debounced)}`,
    fetchJson,
    { keepPreviousData: true }
  );
  const changed = cron.trim() !== schedule.cron || enabled !== schedule.enabled;

  const save = async () => {
    setSaving(true);
    try {
      onSaved(
        await sendJson<Schedule[]>('/api/admin/schedules', 'PUT', {
          mode: schedule.mode,
          cron,
          enabled
        })
      );
      message.success('Saved, the scraper applies it within 30 seconds');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={MODE_LABELS[schedule.mode]}
      extra={
        <Switch
          checked={enabled}
          onChange={setEnabled}
          checkedChildren="On"
          unCheckedChildren="Off"
        />
      }
    >
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">
          {DESCRIPTIONS[schedule.mode]}
        </Typography.Text>
        <div>
          <Typography.Text strong>Cron expression (UTC)</Typography.Text>
          <Input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            status={preview && !preview.valid ? 'error' : undefined}
            style={{ fontFamily: 'monospace', marginTop: 4 }}
            placeholder="minute hour day-of-month month day-of-week"
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            minute hour day-of-month month day-of-week, an optional sixth field
            in front is seconds
          </Typography.Text>
        </div>
        <Flex gap={4} wrap>
          {PRESETS.map((preset) => (
            <Tag.CheckableTag
              key={preset.cron}
              checked={cron === preset.cron}
              onChange={() => setCron(preset.cron)}
            >
              {preset.label}
            </Tag.CheckableTag>
          ))}
        </Flex>
        {preview && !preview.valid && (
          <Alert type="error" showIcon title={preview.errors.join(', ')} />
        )}
        {preview?.valid && (
          <div>
            <Typography.Text strong>
              {enabled ? 'Next runs' : 'Would run'}
            </Typography.Text>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {preview.nextRuns.map((run) => (
                <li key={run}>
                  {formatTime(run)}{' '}
                  <Typography.Text type="secondary">
                    ({fromNow(run)})
                  </Typography.Text>
                </li>
              ))}
            </ul>
          </div>
        )}
        {schedule.lastError && (
          <Alert
            type="error"
            showIcon
            title={`The scraper rejected the schedule: ${schedule.lastError}`}
          />
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Last ran {fromNow(schedule.lastRunAt)}. Changed{' '}
          {fromNow(schedule.updatedAt)}
          {schedule.updatedBy && ` by ${schedule.updatedBy}`}.
        </Typography.Text>
        <Flex justify="end" gap={8}>
          <Button
            disabled={!changed}
            onClick={() => {
              setCron(schedule.cron);
              setEnabled(schedule.enabled);
            }}
          >
            Reset
          </Button>
          <Button
            type="primary"
            disabled={!changed || preview?.valid === false}
            loading={saving}
            onClick={save}
          >
            Save
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

export default function Schedules() {
  const { data, error, mutate } = useSWR<Schedule[]>(
    '/api/admin/schedules',
    fetchJson
  );
  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!data) return <Spin style={{ display: 'block', marginTop: 64 }} />;
  if (data.length === 0)
    return (
      <Alert
        type="info"
        showIcon
        title="The schedules are created the first time the scraper starts with the job runner."
      />
    );
  return (
    <Row gutter={[16, 16]}>
      {data.map((schedule) => (
        <Col xs={24} lg={12} key={schedule.mode}>
          <ScheduleCard
            key={`${schedule.cron}-${schedule.enabled}`}
            schedule={schedule}
            onSaved={(schedules) => void mutate(schedules, false)}
          />
        </Col>
      ))}
    </Row>
  );
}
