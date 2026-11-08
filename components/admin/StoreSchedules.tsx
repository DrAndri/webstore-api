'use client';
import { EditOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Flex,
  Input,
  InputNumber,
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
  DEFAULT_SCHEDULES,
  Schedule,
  ScheduledMode,
  StoreStatus
} from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';

// A schedule the preset controls can show and edit. The labels are
// schedules.presets.<kind> in the admin namespace.
type Preset =
  | { kind: 'days'; every: number }
  | { kind: 'weekly'; weekdays: number[] }
  | { kind: 'monthly'; day: number };

const PRESET_DEFAULTS: Preset[] = [
  { kind: 'days', every: 1 },
  { kind: 'weekly', weekdays: [1] },
  { kind: 'monthly', day: 1 }
];

// Monday first, cron counts Sunday as 0
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

// Splits a cron expression into its time of day fields (the optional seconds,
// minute and hour) and the preset its day fields match, if any. The time is
// null when it is not a fixed time of day, like every 6 hours.
function parseCron(cron: string): {
  time: string[] | null;
  preset: Preset | null;
} {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) {
    return { time: null, preset: null };
  }
  const time = fields.slice(0, -3);
  const [dayOfMonth, month, dayOfWeek] = fields.slice(-3);
  const fixedTime = time.every((field) => /^\d+$/.test(field));
  if (!fixedTime || month !== '*') {
    return { time: fixedTime ? time : null, preset: null };
  }
  let preset: Preset | null = null;
  if (dayOfWeek === '*') {
    const step = /^\*(?:\/(\d+))?$/.exec(dayOfMonth);
    if (step) preset = { kind: 'days', every: Number(step[1] ?? 1) };
    else if (/^\d+$/.test(dayOfMonth)) {
      preset = { kind: 'monthly', day: Number(dayOfMonth) };
    }
  } else if (dayOfMonth === '*' && /^[0-7](,[0-7])*$/.test(dayOfWeek)) {
    const weekdays = dayOfWeek.split(',').map((day) => Number(day) % 7);
    preset = { kind: 'weekly', weekdays: [...new Set(weekdays)] };
  }
  return { time, preset };
}

function presetCron(time: string[], preset: Preset): string {
  const days =
    preset.kind === 'days'
      ? [preset.every === 1 ? '*' : `*/${preset.every}`, '*', '*']
      : preset.kind === 'weekly'
        ? [
            '*',
            '*',
            WEEKDAYS.filter((day) => preset.weekdays.includes(day)).join(',')
          ]
        : [String(preset.day), '*', '*'];
  return [...time, ...days].join(' ');
}

// Picks how often a schedule runs, at the time of day of its cron expression
function PresetPicker({
  cron,
  defaultCron,
  onChange
}: {
  cron: string;
  defaultCron: string;
  onChange: (cron: string) => void;
}) {
  const { t } = useTranslation('admin');
  const format = useFormat();
  const { time, preset } = parseCron(cron);
  const set = (next: Preset) =>
    onChange(presetCron(time ?? parseCron(defaultCron).time!, next));
  const weekdayName = (day: number) =>
    new Intl.DateTimeFormat(format.locale, {
      weekday: 'short',
      timeZone: 'UTC'
    }).format(new Date(Date.UTC(2025, 0, 5 + day))); // 5 January 2025 was a Sunday

  return (
    <Flex vertical gap={8}>
      <Flex gap={4} wrap>
        {PRESET_DEFAULTS.map((defaults) => (
          <Tag.CheckableTag
            key={defaults.kind}
            checked={preset?.kind === defaults.kind}
            onChange={() => preset?.kind !== defaults.kind && set(defaults)}
          >
            {t(`schedules.presets.${defaults.kind}`)}
          </Tag.CheckableTag>
        ))}
      </Flex>
      {preset?.kind === 'days' && (
        <>
          <Flex gap={8} align="center">
            <Typography.Text>
              {t('schedules.presets.everyBefore')}
            </Typography.Text>
            <InputNumber
              min={1}
              max={31}
              precision={0}
              value={preset.every}
              onChange={(every) => every && set({ kind: 'days', every })}
              style={{ width: 72 }}
            />
            <Typography.Text>
              {t('schedules.presets.everyAfter')}
            </Typography.Text>
          </Flex>
          {preset.every > 1 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('schedules.presets.everyHelp')}
            </Typography.Text>
          )}
        </>
      )}
      {preset?.kind === 'weekly' && (
        <Checkbox.Group
          value={preset.weekdays}
          options={WEEKDAYS.map((day) => ({
            value: day,
            label: weekdayName(day)
          }))}
          onChange={(weekdays) =>
            weekdays.length > 0 && set({ kind: 'weekly', weekdays })
          }
        />
      )}
      {preset?.kind === 'monthly' && (
        <>
          <Flex gap={8} align="center">
            <Typography.Text>
              {t('schedules.presets.dayBefore')}
            </Typography.Text>
            <InputNumber
              min={1}
              max={31}
              precision={0}
              value={preset.day}
              onChange={(day) => day && set({ kind: 'monthly', day })}
              style={{ width: 72 }}
            />
            {/* Empty in languages that only need the label in front */}
            {t('schedules.presets.dayAfter') && (
              <Typography.Text>
                {t('schedules.presets.dayAfter')}
              </Typography.Text>
            )}
          </Flex>
          {preset.day > 28 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('schedules.presets.dayHelp')}
            </Typography.Text>
          )}
        </>
      )}
    </Flex>
  );
}

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
  const initialCron = schedule?.cron ?? DEFAULT_SCHEDULES[mode];
  const initialEnabled = schedule?.enabled ?? false;
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
  // A schedule that does not exist yet is saved as it is shown
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
      <PresetPicker
        cron={cron}
        defaultCron={DEFAULT_SCHEDULES[mode]}
        onChange={setCron}
      />
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
