'use client';
import { PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Spin, Table, Tag, Typography } from 'antd';
import Link from 'next/link';
import useSWR from 'swr';
import { Overview, StoreStatus } from '../../utils/admin/types';
import { fetchJson, formatNumber, fromNow } from './api';
import { HealthTag } from './StatusTags';

export default function StoreList() {
  const { data, error } = useSWR<Overview>('/api/admin/overview', fetchJson);
  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Stores
        </Typography.Title>
        <Link href="/admin/stores/new">
          <Button type="primary" icon={<PlusOutlined />}>
            Add store
          </Button>
        </Link>
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
            { title: 'Id', dataIndex: 'id', width: 60 },
            {
              title: 'Store',
              sorter: (a, b) => a.name.localeCompare(b.name),
              render: (_, store) => (
                <Link href={`/admin/stores/${store.id}`}>{store.name}</Link>
              )
            },
            {
              title: 'Health',
              render: (_, store) => <HealthTag health={store.health} />
            },
            {
              title: 'Config',
              render: (_, store) =>
                store.hasConfig ? (
                  <Tag>stores/{store.id}.jsonc</Tag>
                ) : (
                  <Tag color="error">Missing</Tag>
                )
            },
            {
              title: 'Scheduled scans',
              render: (_, store) =>
                store.scraperEnabled ? (
                  'On'
                ) : (
                  <Typography.Text type="secondary">Off</Typography.Text>
                )
            },
            {
              title: 'Public search',
              render: (_, store) =>
                store.apiEnabled ? (
                  'On'
                ) : (
                  <Typography.Text type="secondary">Off</Typography.Text>
                )
            },
            {
              title: 'Products',
              align: 'right',
              render: (_, store) =>
                formatNumber(store.lastCrawl?.totalProcessed)
            },
            {
              title: 'Last scan',
              render: (_, store) => fromNow(store.lastJob?.finishedAt)
            },
            { title: 'Added', dataIndex: 'createdDate' }
          ]}
        />
      )}
    </Flex>
  );
}
