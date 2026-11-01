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
import useSWR from 'swr';
import { Overview, ScheduledMode, StoreDetails } from '../../utils/admin/types';
import { fetchJson, formatNumber, fromNow, sendJson } from './api';
import ConfigHistory from './ConfigHistory';
import JobHistory from './JobHistory';
import { HealthTag, JobStatusTag } from './StatusTags';
import StoreConfigEditor from './StoreConfigEditor';
import StoreTrends from './StoreTrends';

export default function StorePage({ storeId }: { storeId: number }) {
  const { message } = App.useApp();
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
      if (queued) message.success('Scan queued');
      else message.info('A scan of this store is already queued or running');
      void mutateOverview();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Link href="/admin/stores">
        <ArrowLeftOutlined /> Stores
      </Link>
      <Flex justify="space-between" align="start" wrap gap={12}>
        <Flex vertical gap={4}>
          <Typography.Title
            level={3}
            style={{ margin: 0 }}
            editable={{
              onChange: (name) => name !== store.name && void update({ name }),
              tooltip: 'Rename'
            }}
          >
            {store.name}
          </Typography.Title>
          <Flex gap={8} align="center" wrap>
            {status && <HealthTag health={status.health} />}
            {status?.activeJob && <JobStatusTag job={status.activeJob} />}
            <Typography.Text type="secondary">
              Last scan {fromNow(status?.lastJob?.finishedAt)} ·{' '}
              {formatNumber(status?.lastCrawl?.totalProcessed)} products in the
              last full crawl
            </Typography.Text>
          </Flex>
        </Flex>
        <Flex gap={16} align="center" wrap>
          <Space>
            <Switch
              checked={store.scraperEnabled}
              onChange={(scraperEnabled) => update({ scraperEnabled })}
            />
            Scheduled scans
          </Space>
          <Space>
            <Switch
              checked={store.apiEnabled}
              onChange={(apiEnabled) => update({ apiEnabled })}
            />
            Public search
          </Space>
          <Space.Compact>
            <Button
              type="primary"
              disabled={!data.config}
              onClick={() => run('crawler')}
            >
              Run full crawl
            </Button>
            <Dropdown
              disabled={!data.config}
              menu={{
                items: [{ key: 'list', label: 'Re-scrape active products' }],
                onClick: () => run('list')
              }}
            >
              <Button
                type="primary"
                icon={<DownOutlined />}
                aria-label="More scans"
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
            label: 'Trends',
            children: <StoreTrends storeId={storeId} />
          },
          {
            key: 'config',
            label: 'Config',
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
            label: 'Change history',
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
            label: 'Scans',
            children: <JobHistory storeId={storeId} />
          }
        ]}
      />
    </Flex>
  );
}
