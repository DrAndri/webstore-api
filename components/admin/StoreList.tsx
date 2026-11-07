'use client';
import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Flex,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { Overview, StoreStatus } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson } from './api';
import ReloadConfigButton from './ReloadConfigButton';
import { HealthTag } from './StatusTags';
import { ScheduleCell, ScheduleModal, ScheduleTarget } from './StoreSchedules';

export default function StoreList() {
  const { t } = useTranslation('stores');
  const format = useFormat();
  const { data, error, mutate } = useSWR<Overview>(
    '/api/admin/overview',
    fetchJson
  );
  const [editing, setEditing] = useState<ScheduleTarget | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const edit = (target: ScheduleTarget) => {
    setEditing(target);
    setEditorOpen(true);
  };
  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('list.title')}
        </Typography.Title>
        <Flex gap={8} wrap>
          <ReloadConfigButton onReloaded={() => void mutate()} />
          <Link href="/admin/stores/new">
            <Button type="primary" icon={<PlusOutlined />}>
              {t('list.add')}
            </Button>
          </Link>
        </Flex>
      </Flex>
      {error && <Alert type="error" showIcon title={error.message} />}
      {!data && !error && <Spin />}
      {data && (
        <Table<StoreStatus>
          rowKey="id"
          size="small"
          dataSource={data.stores}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            {
              title: t('list.columns.id'),
              sorter: (a, b) => a.id - b.id,
              dataIndex: 'id',
              width: 60
            },
            {
              title: t('list.columns.store'),
              sorter: (a, b) => a.name.localeCompare(b.name),
              render: (_, store) => (
                <Link href={`/admin/stores/${store.id}`}>{store.name}</Link>
              )
            },
            {
              title: t('list.columns.health'),
              render: (_, store) => <HealthTag health={store.health} />
            },
            {
              title: t('list.columns.config'),
              render: (_, store) =>
                store.hasConfig ? (
                  <Flex gap={4} wrap>
                    <Tag>stores/{store.id}.jsonc</Tag>
                    {store.configReloadNeeded && (
                      <Tooltip title={t('list.reloadNeededHelp')}>
                        <Tag color="warning">{t('list.reloadNeeded')}</Tag>
                      </Tooltip>
                    )}
                  </Flex>
                ) : (
                  <Tag color="error">{t('list.missing')}</Tag>
                )
            },
            {
              title: t('list.columns.fullCrawl'),
              render: (_, store) => (
                <ScheduleCell
                  store={store}
                  mode="crawler"
                  onEdit={() => edit({ store, mode: 'crawler' })}
                />
              )
            },
            {
              title: t('list.columns.activeProducts'),
              render: (_, store) => (
                <ScheduleCell
                  store={store}
                  mode="list"
                  onEdit={() => edit({ store, mode: 'list' })}
                />
              )
            },
            {
              title: t('list.columns.publicSearch'),
              render: (_, store) =>
                store.apiEnabled ? (
                  t('list.on')
                ) : (
                  <Typography.Text type="secondary">
                    {t('list.off')}
                  </Typography.Text>
                )
            },
            {
              title: t('list.columns.products'),
              sorter: (a, b) =>
                (a.lastCrawl?.totalProcessed ?? 0) -
                (b.lastCrawl?.totalProcessed ?? 0),
              align: 'right',
              render: (_, store) =>
                format.number(store.lastCrawl?.totalProcessed)
            },
            {
              title: t('list.columns.lastScan'),
              sorter: (a, b) =>
                (a.lastJob?.finishedAt ?? '').localeCompare(
                  b.lastJob?.finishedAt ?? ''
                ),
              render: (_, store) => format.fromNow(store.lastJob?.finishedAt)
            },
            {
              title: t('list.columns.added'),
              sorter: (a, b) =>
                (a.createdDate ?? '').localeCompare(b.createdDate ?? ''),
              dataIndex: 'createdDate'
            }
          ]}
        />
      )}
      <ScheduleModal
        target={editing}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void mutate()}
      />
    </Flex>
  );
}
