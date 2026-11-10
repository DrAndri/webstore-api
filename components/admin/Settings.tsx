'use client';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Flex,
  InputNumber,
  Row,
  Spin,
  Switch,
  Typography
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import {
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  ScraperSettings
} from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';

const SETTINGS_URL = '/api/admin/settings';

// The scraper settings, shared by every component that shows them so a change
// shows everywhere at once
export const useScraperSettings = () =>
  useSWR<ScraperSettings>(SETTINGS_URL, fetchJson);

// Saves the settings in changes and shows what the api returns
function useSaveSettings() {
  const { mutate } = useScraperSettings();
  return async (changes: Partial<ScraperSettings>) =>
    mutate(await sendJson<ScraperSettings>(SETTINGS_URL, 'PUT', changes), {
      revalidate: false
    });
}

// Turns the full crawl and active products schedules of every store on or off
function SchedulerCard({ settings }: { settings: ScraperSettings }) {
  const { message } = App.useApp();
  const { t } = useTranslation('admin');
  const save = useSaveSettings();
  const [saving, setSaving] = useState(false);

  const toggle = async (schedulesEnabled: boolean) => {
    setSaving(true);
    try {
      await save({ schedulesEnabled });
      message.success(
        t(schedulesEnabled ? 'scheduler.savedOn' : 'scheduler.savedOff')
      );
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('scheduler.title')}>
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">
          {t('scheduler.description')}
        </Typography.Text>
        <Flex gap={8} align="center">
          <Switch
            checked={settings.schedulesEnabled}
            loading={saving}
            onChange={(checked) => void toggle(checked)}
            checkedChildren={t('scheduler.on')}
            unCheckedChildren={t('scheduler.off')}
            aria-label={t('scheduler.label')}
          />
          <Typography.Text strong>{t('scheduler.label')}</Typography.Text>
        </Flex>
      </Flex>
    </Card>
  );
}

// How many stores the scraper scans at a time
function ConcurrencyCard({ settings }: { settings: ScraperSettings }) {
  const { message } = App.useApp();
  const { t } = useTranslation('admin');
  const save = useSaveSettings();
  const [value, setValue] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const concurrency = value ?? settings.concurrency;
  const changed = concurrency !== settings.concurrency;

  const submit = async () => {
    setSaving(true);
    try {
      await save({ concurrency });
      setValue(null);
      message.success(t('concurrency.saved'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('concurrency.title')}>
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">
          {t('concurrency.description')}
        </Typography.Text>
        <Flex gap={8} align="center" wrap>
          <Typography.Text strong>{t('concurrency.label')}</Typography.Text>
          <InputNumber
            aria-label={t('concurrency.label')}
            min={MIN_CONCURRENCY}
            max={MAX_CONCURRENCY}
            precision={0}
            value={concurrency}
            onChange={(next) => setValue(next)}
            onPressEnter={() => void (changed && submit())}
          />
          <Button disabled={!changed} onClick={() => setValue(null)}>
            {t('concurrency.reset')}
          </Button>
          <Button
            type="primary"
            disabled={!changed}
            loading={saving}
            onClick={submit}
          >
            {t('concurrency.save')}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

export default function Settings() {
  const { t } = useTranslation('admin');
  const format = useFormat();
  const { data, error } = useScraperSettings();
  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!data) return <Spin />;
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24}>
        <SchedulerCard settings={data} />
      </Col>
      <Col xs={24}>
        <ConcurrencyCard settings={data} />
      </Col>
      {data.updatedAt && (
        <Col xs={24}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {data.updatedBy
              ? t('settings.changedBy', {
                  changed: format.fromNow(data.updatedAt),
                  user: data.updatedBy
                })
              : t('settings.changed', {
                  changed: format.fromNow(data.updatedAt)
                })}
          </Typography.Text>
        </Col>
      )}
    </Row>
  );
}
