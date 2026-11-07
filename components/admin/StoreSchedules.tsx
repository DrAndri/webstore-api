'use client';
import { EditOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Flex,
  Input,
  Modal,
  Switch,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import {
  CronDescription,
  Schedule,
  ScheduledMode,
  StoreStatus
} from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';

// The labels are schedules.presets.<label> in the admin namespace
const PRESETS = [
  { label: 'nightly', cron: '0 4 * * *' },
  { label: 'every6Hours', cron: '0 */6 * * *' },
  { label: 'mondays', cron: '0 1 * * 1' },
  { label: 'twiceAWeek', cron: '0 1 * * 1,4' }
] as const;

// What the scraper gives a store that has no schedules yet
const DEFAULT_CRON: Record<ScheduledMode, string> = {
  crawler: '0 1 * * 1',
  list: '0 4 * * *'
};

export interface ScheduleTarget {
  store: StoreStatus;
  mode: ScheduledMode;
}

// A schedule in the stores table, opens the editor
export function ScheduleCell({
  store,
  mode,
  onEdit
}: ScheduleTarget & { onEdit: () => void }) {
  const { t } = useTranslation('admin');
  const format = useFormat();
  const schedule = store.schedules.find((s) => s.mode === mode);
  const runs = schedule?.enabled && store.scraperEnabled && schedule.valid;
  return (
    <Flex vertical align="start">
      <Button
        type="link"
        size="small"
        style={{ padding: 0, height: 'auto' }}
        onClick={onEdit}
        aria-label={t('schedules.edit', {
          mode: t(`modes.${mode}`),
          store: store.name
        })}
      >
        {schedule ? (
          <Typography.Text
            code
            type={runs ? undefined : 'secondary'}
            style={{ whiteSpace: 'nowrap' }}
          >
            {schedule.cron}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">
            {t('schedules.notCreated')}
          </Typography.Text>
        )}
        <EditOutlined />
      </Button>
      {schedule?.lastError ? (
        <Tooltip title={t('schedules.rejected', { error: schedule.lastError })}>
          <Tag color="error">{t('schedules.rejectedShort')}</Tag>
        </Tooltip>
      ) : schedule && !schedule.enabled ? (
        <Tag>{t('schedules.off')}</Tag>
      ) : schedule && !store.scraperEnabled ? (
        <Tooltip title={t('schedules.storeScansOff')}>
          <Tag>{t('schedules.storeOff')}</Tag>
        </Tooltip>
      ) : (
        runs && (
          <Tooltip title={format.time(schedule.nextRuns[0])}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('schedules.next', {
                time: format.fromNow(schedule.nextRuns[0])
              })}
            </Typography.Text>
          </Tooltip>
        )
      )}
    </Flex>
  );
}

function ScheduleForm({
  store,
  mode,
  onClose,
  onSaved
}: ScheduleTarget & {
  onClose: () => void;
  onSaved: (schedules: Schedule[]) => void;
}) {
  const { message } = App.useApp();
  const { t } = useTranslation('admin');
  const format = useFormat();
  const schedule = store.schedules.find((s) => s.mode === mode);
  const initialCron = schedule?.cron ?? DEFAULT_CRON[mode];
  const initialEnabled = schedule?.enabled ?? true;
  const [cron, setCron] = useState(initialCron);
  const [enabled, setEnabled] = useState(initialEnabled);
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
  // A schedule the scraper has not created yet is saved as it is shown
  const changed =
    !schedule || cron.trim() !== initialCron || enabled !== initialEnabled;

  const save = async () => {
    setSaving(true);
    try {
      onSaved(
        await sendJson<Schedule[]>(
          `/api/admin/stores/${store.id}/schedules`,
          'PUT',
          { mode, cron, enabled }
        )
      );
      message.success(t('schedules.saved'));
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex vertical gap={12}>
      <Typography.Text type="secondary">
        {t(`schedules.descriptions.${mode}`)}
      </Typography.Text>
      {!store.scraperEnabled && (
        <Alert type="warning" showIcon title={t('schedules.storeScansOff')} />
      )}
      <Flex gap={8} align="center">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          checkedChildren={t('schedules.on')}
          unCheckedChildren={t('schedules.off')}
        />
        <Typography.Text>{t('schedules.enabledLabel')}</Typography.Text>
      </Flex>
      <div>
        <Typography.Text strong>{t('schedules.cronLabel')}</Typography.Text>
        <Input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          onPressEnter={() =>
            void (changed && preview?.valid !== false && save())
          }
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
            {enabled && store.scraperEnabled
              ? t('schedules.nextRuns')
              : t('schedules.wouldRun')}
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
      {schedule?.lastError && (
        <Alert
          type="error"
          showIcon
          title={t('schedules.rejected', { error: schedule.lastError })}
        />
      )}
      {schedule ? (
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
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('schedules.notCreatedHelp')}
        </Typography.Text>
      )}
      <Flex justify="end" gap={8}>
        <Button onClick={onClose}>{t('schedules.cancel')}</Button>
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
  );
}

// Edits the full crawl or active products schedule of a store. The target is
// kept while the modal closes, so its content stays during the animation.
export function ScheduleModal({
  target,
  open,
  onClose,
  onSaved
}: {
  target: ScheduleTarget | null;
  open: boolean;
  onClose: () => void;
  onSaved: (schedules: Schedule[]) => void;
}) {
  const { t } = useTranslation('admin');
  return (
    <Modal
      title={
        target &&
        t('schedules.modalTitle', {
          mode: t(`modes.${target.mode}`),
          store: target.store.name
        })
      }
      open={open && target !== null}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      {target && (
        <ScheduleForm
          key={`${target.store.id}-${target.mode}`}
          store={target.store}
          mode={target.mode}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}
