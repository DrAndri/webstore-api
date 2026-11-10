'use client';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Flex,
  Input,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { Overview, StoreDetails, StoreStatus } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';
import ReloadConfigButton from './ReloadConfigButton';
import { HealthTag } from './StatusTags';
import { ScheduleCell, ScheduleModal, ScheduleTarget } from './StoreSchedules';

type StoreFlag = 'scraperEnabled' | 'apiEnabled';

type ScheduleFilter = 'active' | 'none' | null;

// A store has an active schedule when at least one of its schedules is on and
// valid. The store's scheduled scans switch and the scheduler switch in
// Settings are left out.
const hasActiveSchedule = (store: StoreStatus) =>
  store.schedules.some((s) => s.enabled && s.valid);

// Turns scheduled scans or the public search of a store on or off
function StoreFlagSwitch({
  store,
  flag,
  label,
  onSaved
}: {
  store: StoreStatus;
  flag: StoreFlag;
  label: string;
  onSaved: (changes: Pick<StoreStatus, StoreFlag>) => void;
}) {
  const { message } = App.useApp();
  const { t } = useTranslation('stores');
  const [saving, setSaving] = useState(false);
  const toggle = async (value: boolean) => {
    setSaving(true);
    try {
      const updated = await sendJson<StoreDetails['store']>(
        `/api/admin/stores/${store.id}`,
        'PATCH',
        { [flag]: value }
      );
      onSaved({
        scraperEnabled: updated.scraperEnabled,
        apiEnabled: updated.apiEnabled
      });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Switch
      size="small"
      checked={store[flag]}
      loading={saving}
      onChange={(value) => void toggle(value)}
      aria-label={t('list.toggle', { setting: label, store: store.name })}
    />
  );
}

export default function StoreList() {
  const { t } = useTranslation('stores');
  const format = useFormat();
  const { data, error, mutate } = useSWR<Overview>(
    '/api/admin/overview',
    fetchJson
  );
  const [search, setSearch] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>(null);
  const stores = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (data?.stores ?? []).filter(
      (store) =>
        (!query || store.name.toLocaleLowerCase().includes(query)) &&
        (scheduleFilter === null ||
          hasActiveSchedule(store) === (scheduleFilter === 'active'))
    );
  }, [data, search, scheduleFilter]);
  // The two filters exclude each other, turning one on turns the other off
  const toggleScheduleFilter = (filter: 'active' | 'none', on: boolean) =>
    setScheduleFilter(on ? filter : null);
  const [editing, setEditing] = useState<ScheduleTarget | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const edit = (target: ScheduleTarget) => {
    setEditing(target);
    setEditorOpen(true);
  };
  // Shows a saved change right away, then reloads the overview for the health
  // and next runs that follow from it
  const updateStore = (id: number, changes: Partial<StoreStatus>) =>
    void mutate((current) =>
      current
        ? {
            ...current,
            stores: current.stores.map((store) =>
              store.id === id ? { ...store, ...changes } : store
            )
          }
        : current
    );
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
        <Flex gap={16} wrap align="center">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('list.filters.name')}
            aria-label={t('list.filters.name')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260, maxWidth: '100%' }}
          />
          <Flex gap={8} align="center" component="label">
            <Switch
              size="small"
              checked={scheduleFilter === 'active'}
              onChange={(on) => toggleScheduleFilter('active', on)}
            />
            {t('list.filters.activeSchedules')}
          </Flex>
          <Flex gap={8} align="center" component="label">
            <Switch
              size="small"
              checked={scheduleFilter === 'none'}
              onChange={(on) => toggleScheduleFilter('none', on)}
            />
            {t('list.filters.noSchedules')}
          </Flex>
        </Flex>
      )}
      {data && (
        <Table<StoreStatus>
          rowKey="id"
          size="small"
          dataSource={stores}
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
              title: t('list.columns.scheduledScans'),
              render: (_, store) => (
                <StoreFlagSwitch
                  store={store}
                  flag="scraperEnabled"
                  label={t('list.columns.scheduledScans')}
                  onSaved={(changes) => updateStore(store.id, changes)}
                />
              )
            },
            {
              title: t('list.columns.fullCrawl'),
              render: (_, store) => (
                <ScheduleCell
                  store={store}
                  mode="crawler"
                  onEdit={() => edit({ store, mode: 'crawler' })}
                  onSaved={(schedules) => updateStore(store.id, { schedules })}
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
                  onSaved={(schedules) => updateStore(store.id, { schedules })}
                />
              )
            },
            {
              title: t('list.columns.publicSearch'),
              render: (_, store) => (
                <StoreFlagSwitch
                  store={store}
                  flag="apiEnabled"
                  label={t('list.columns.publicSearch')}
                  onSaved={(changes) => updateStore(store.id, changes)}
                />
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
        onSaved={(schedules) =>
          editing && updateStore(editing.store.id, { schedules })
        }
      />
    </Flex>
  );
}
