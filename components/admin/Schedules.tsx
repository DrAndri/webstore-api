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
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { CronDescription, Schedule } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';

// The labels are schedules.presets.<label> in the admin namespace
const PRESETS = [
  { label: 'nightly', cron: '0 4 * * *' },
  { label: 'every6Hours', cron: '0 */6 * * *' },
  { label: 'mondays', cron: '0 1 * * 1' },
  { label: 'twiceAWeek', cron: '0 1 * * 1,4' }
] as const;

function ScheduleCard({
  schedule,
  onSaved
}: {
  schedule: Schedule;
  onSaved: (schedules: Schedule[]) => void;
}) {
  const { message } = App.useApp();
  const { t } = useTranslation('admin');
  const format = useFormat();
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
      message.success(t('schedules.saved'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={t(`modes.${schedule.mode}`)}
      extra={
        <Switch
          checked={enabled}
          onChange={setEnabled}
          checkedChildren={t('schedules.on')}
          unCheckedChildren={t('schedules.off')}
        />
      }
    >
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">
          {t(`schedules.descriptions.${schedule.mode}`)}
        </Typography.Text>
        <div>
          <Typography.Text strong>{t('schedules.cronLabel')}</Typography.Text>
          <Input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            status={preview && !preview.valid ? 'error' : undefined}
            style={{ fontFamily: 'monospace', marginTop: 4 }}
            placeholder={t('schedules.cronPlaceholder')}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('schedules.cronHelp')}
          </Typography.Text>
        </div>
        <Flex gap={4} wrap>
          {PRESETS.map((preset) => (
            <Tag.CheckableTag
              key={preset.cron}
              checked={cron === preset.cron}
              onChange={() => setCron(preset.cron)}
            >
              {t(`schedules.presets.${preset.label}`)}
            </Tag.CheckableTag>
          ))}
        </Flex>
        {preview && !preview.valid && (
          <Alert type="error" showIcon title={preview.errors.join(', ')} />
        )}
        {preview?.valid && (
          <div>
            <Typography.Text strong>
              {enabled ? t('schedules.nextRuns') : t('schedules.wouldRun')}
            </Typography.Text>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {preview.nextRuns.map((run) => (
                <li key={run}>
                  {format.time(run)}{' '}
                  <Typography.Text type="secondary">
                    ({format.fromNow(run)})
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
            title={t('schedules.rejected', { error: schedule.lastError })}
          />
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {schedule.updatedBy
            ? t('schedules.changedBy', {
                lastRun: format.fromNow(schedule.lastRunAt),
                changed: format.fromNow(schedule.updatedAt),
                user: schedule.updatedBy
              })
            : t('schedules.changed', {
                lastRun: format.fromNow(schedule.lastRunAt),
                changed: format.fromNow(schedule.updatedAt)
              })}
        </Typography.Text>
        <Flex justify="end" gap={8}>
          <Button
            disabled={!changed}
            onClick={() => {
              setCron(schedule.cron);
              setEnabled(schedule.enabled);
            }}
          >
            {t('schedules.reset')}
          </Button>
          <Button
            type="primary"
            disabled={!changed || preview?.valid === false}
            loading={saving}
            onClick={save}
          >
            {t('schedules.save')}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

export default function Schedules() {
  const { t } = useTranslation('admin');
  const { data, error, mutate } = useSWR<Schedule[]>(
    '/api/admin/schedules',
    fetchJson
  );
  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!data) return <Spin style={{ display: 'block', marginTop: 64 }} />;
  if (data.length === 0)
    return <Alert type="info" showIcon title={t('schedules.empty')} />;
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
