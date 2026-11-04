'use client';
import { ArrowLeftOutlined, DownOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Dropdown,
  Flex,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography
} from 'antd';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { Overview, ScheduledMode, StoreDetails } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';
import ConfigHistory from './ConfigHistory';
import JobHistory from './JobHistory';
import { HealthTag, JobStatusTag } from './StatusTags';
import StoreConfigEditor from './StoreConfigEditor';
import StoreTrends from './StoreTrends';

export default function StorePage({ storeId }: { storeId: number }) {
  const { message } = App.useApp();
  const { t } = useTranslation('stores');
  const format = useFormat();
  const { data, error, mutate } = useSWR<StoreDetails>(
    `/api/admin/stores/${storeId}`,
    fetchJson,
    { revalidateOnFocus: false }
  );
  const { data: overview, mutate: mutateOverview } = useSWR<Overview>(
    '/api/admin/overview',
    fetchJson,
    { refreshInterval: 5000 }
  );
  const status = overview?.stores.find((store) => store.id === storeId);

  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!data) return <Spin style={{ display: 'block', marginTop: 64 }} />;
  const { store } = data;

  const update = async (changes: Partial<StoreDetails['store']>) => {
    try {
      const updated = await sendJson<StoreDetails['store']>(
        `/api/admin/stores/${storeId}`,
        'PATCH',
        changes
      );
      void mutate({ ...data, store: updated }, false);
      void mutateOverview();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const run = async (mode: ScheduledMode) => {
    try {
      const { queued } = await sendJson<{ queued: number }>(
        '/api/admin/jobs',
        'POST',
        {
          storeIds: [storeId],
          mode
        }
      );
      if (queued) message.success(t('page.scanQueued'));
      else message.info(t('page.alreadyQueued'));
      void mutateOverview();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Link href="/admin/stores">
        <ArrowLeftOutlined /> {t('page.back')}
      </Link>
      <Flex justify="space-between" align="start" wrap gap={12}>
        <Flex vertical gap={4}>
          <Typography.Title
            level={3}
            style={{ margin: 0 }}
            editable={{
              onChange: (name) => name !== store.name && void update({ name }),
              tooltip: t('page.rename')
            }}
          >
            {store.name}
          </Typography.Title>
          <Flex gap={8} align="center" wrap>
            {status && <HealthTag health={status.health} />}
            {status?.activeJob && <JobStatusTag job={status.activeJob} />}
            <Typography.Text type="secondary">
              {t('page.summary', {
                lastScan: format.fromNow(status?.lastJob?.finishedAt),
                products: format.number(status?.lastCrawl?.totalProcessed),
                count: status?.lastCrawl?.totalProcessed ?? 0
              })}
            </Typography.Text>
          </Flex>
        </Flex>
        <Flex gap={16} align="center" wrap>
          <Space>
            <Switch
              checked={store.scraperEnabled}
              onChange={(scraperEnabled) => update({ scraperEnabled })}
            />
            {t('page.scheduledScans')}
          </Space>
          <Space>
            <Switch
              checked={store.apiEnabled}
              onChange={(apiEnabled) => update({ apiEnabled })}
            />
            {t('page.publicSearch')}
          </Space>
          <Space.Compact>
            <Button
              type="primary"
              disabled={!data.config}
              onClick={() => run('crawler')}
            >
              {t('page.runFullCrawl')}
            </Button>
            <Dropdown
              disabled={!data.config}
              menu={{
                items: [{ key: 'list', label: t('page.rescrapeActive') }],
                onClick: () => run('list')
              }}
            >
              <Button
                type="primary"
                icon={<DownOutlined />}
                aria-label={t('page.moreScans')}
              />
            </Dropdown>
          </Space.Compact>
        </Flex>
      </Flex>
      {status && status.health.reasons.length > 0 && (
        <Alert
          type={status.health.level === 'error' ? 'error' : 'warning'}
          showIcon
          title={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {status.health.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          }
        />
      )}
      <Tabs
        destroyOnHidden
        items={[
          {
            key: 'trends',
            label: t('page.tabs.trends'),
            children: <StoreTrends storeId={storeId} />
          },
          {
            key: 'config',
            label: t('page.tabs.config'),
            children: (
              <StoreConfigEditor
                key={data.config?.sha ?? 'new'}
                storeId={storeId}
                storeName={store.name}
                config={data.config}
                fileUrl={data.fileUrl}
                onSaved={() => void mutate()}
              />
            )
          },
          {
            key: 'history',
            label: t('page.tabs.history'),
            children: (
              <ConfigHistory
                storeId={storeId}
                currentSha={data.config?.sha}
                legacyHistoryUrl={data.legacyHistoryUrl}
                onRestored={() => void mutate()}
              />
            )
          },
          {
            key: 'scans',
            label: t('page.tabs.scans'),
            children: <JobHistory storeId={storeId} />
          }
        ]}
      />
    </Flex>
  );
}
