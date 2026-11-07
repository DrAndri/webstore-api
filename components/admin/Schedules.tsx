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
  Typography
} from 'antd';
import Link from 'next/link';
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

// How many stores the scraper scans at a time
function ConcurrencyCard() {
  const { message } = App.useApp();
  const { t } = useTranslation('admin');
  const format = useFormat();
  const { data, error, mutate } = useSWR<ScraperSettings>(
    '/api/admin/settings',
    fetchJson
  );
  const [value, setValue] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const concurrency = value ?? data?.concurrency ?? null;
  const changed = data !== undefined && concurrency !== data.concurrency;

  const save = async () => {
    if (concurrency === null) return;
    setSaving(true);
    try {
      await mutate(
        await sendJson<ScraperSettings>('/api/admin/settings', 'PUT', {
          concurrency
        }),
        false
      );
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
      {error ? (
        <Alert type="error" showIcon title={error.message} />
      ) : !data ? (
        <Spin />
      ) : (
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
              onPressEnter={() => void (changed && save())}
            />
            <Button disabled={!changed} onClick={() => setValue(null)}>
              {t('concurrency.reset')}
            </Button>
            <Button
              type="primary"
              disabled={!changed || concurrency === null}
              loading={saving}
              onClick={save}
            >
              {t('concurrency.save')}
            </Button>
          </Flex>
          {data.updatedAt && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {data.updatedBy
                ? t('concurrency.changedBy', {
                    changed: format.fromNow(data.updatedAt),
                    user: data.updatedBy
                  })
                : t('concurrency.changed', {
                    changed: format.fromNow(data.updatedAt)
                  })}
            </Typography.Text>
          )}
        </Flex>
      )}
    </Card>
  );
}

export default function Schedules() {
  const { t } = useTranslation('admin');
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24}>
        <ConcurrencyCard />
      </Col>
      <Col xs={24}>
        <Alert
          type="info"
          showIcon
          title={t('schedules.perStore')}
          action={
            <Link href="/admin/stores">
              <Button size="small">{t('schedules.toStores')}</Button>
            </Link>
          }
        />
      </Col>
    </Row>
  );
}
