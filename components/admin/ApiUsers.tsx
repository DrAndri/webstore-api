'use client';
import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Switch,
  Table,
  Tag,
  Typography
} from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ApiUser } from '../../utils/admin/types';
import { fetchJson, formatNumber, fromNow, sendJson } from './api';

// Shows a new token, it can not be shown again
export function TokenModal({
  token,
  onClose
}: {
  token?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!token}
      title="New API token"
      onOk={onClose}
      onCancel={onClose}
      cancelButtonProps={{ style: { display: 'none' } }}
      okText="I have copied it"
    >
      <Flex vertical gap={12}>
        <Alert
          type="warning"
          showIcon
          title="Copy the token now, it is only shown once."
        />
        <Typography.Paragraph copyable code style={{ wordBreak: 'break-all' }}>
          {token}
        </Typography.Paragraph>
        <Typography.Text type="secondary">
          Send it in the <code>Authorization: Bearer &lt;token&gt;</code>{' '}
          header, or in <code>X-API-Key</code>.
        </Typography.Text>
      </Flex>
    </Modal>
  );
}

export const UsageCell = ({ used, limit }: { used: number; limit: number }) => (
  <Typography.Text type={used >= limit ? 'danger' : undefined}>
    {formatNumber(used)}{' '}
    <Typography.Text type="secondary">/ {formatNumber(limit)}</Typography.Text>
  </Typography.Text>
);

export default function ApiUsers() {
  const { message } = App.useApp();
  const { data, error, mutate } = useSWR<ApiUser[]>(
    '/api/admin/api-users',
    fetchJson,
    {
      refreshInterval: 10000
    }
  );
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string>();
  const [form] = Form.useForm();

  const create = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const result = await sendJson<{ id: number; token: string }>(
        '/api/admin/api-users',
        'POST',
        values
      );
      setCreating(false);
      setToken(result.token);
      void mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          API users
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreating(true)}
        >
          Add user
        </Button>
      </Flex>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Every request to the public api needs a token. Limits apply to each
        token of a user. Website visitors get a token automatically, with the
        limits of the Website visitors row.
      </Typography.Paragraph>
      {error && <Alert type="error" showIcon title={error.message} />}
      <Table<ApiUser>
        rowKey="id"
        size="small"
        loading={!data && !error}
        dataSource={data}
        pagination={false}
        scroll={{ x: true }}
        columns={[
          {
            title: 'User',
            render: (_, user) => (
              <Flex vertical>
                <Link href={`/admin/api-users/${user.id}`}>{user.name}</Link>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {user.anonymous ? 'Automatic token per visitor' : user.email}
                </Typography.Text>
              </Flex>
            )
          },
          {
            title: 'Status',
            render: (_, user) => (
              <Flex gap={4} wrap>
                {user.enabled ? (
                  <Tag color="success">Active</Tag>
                ) : (
                  <Tag>Disabled</Tag>
                )}
                {user.admin && <Tag color="purple">Admin</Tag>}
              </Flex>
            )
          },
          {
            title: 'This minute',
            render: (_, user) =>
              user.anonymous ? (
                formatNumber(user.requestsThisMinute)
              ) : (
                <UsageCell
                  used={user.requestsThisMinute}
                  limit={
                    user.requestsPerMinute * Math.max(user.activeTokens, 1)
                  }
                />
              )
          },
          {
            title: 'Today',
            render: (_, user) => (
              <Flex vertical>
                {user.anonymous ? (
                  formatNumber(user.requestsToday)
                ) : (
                  <UsageCell
                    used={user.requestsToday}
                    limit={user.requestsPerDay * Math.max(user.activeTokens, 1)}
                  />
                )}
                {user.rejectedToday > 0 && (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {formatNumber(user.rejectedToday)} rejected
                  </Typography.Text>
                )}
              </Flex>
            )
          },
          {
            title: 'Last 30 days',
            align: 'right',
            render: (_, user) => formatNumber(user.requests30Days)
          },
          {
            title: 'Limits per token',
            render: (_, user) =>
              `${formatNumber(user.requestsPerMinute)}/min, ${formatNumber(user.requestsPerDay)}/day`
          },
          {
            title: 'Tokens',
            render: (_, user) => (user.anonymous ? '–' : user.activeTokens)
          },
          {
            title: 'Last used',
            render: (_, user) =>
              user.anonymous ? '–' : fromNow(user.lastUsedAt)
          }
        ]}
      />
      <Modal
        open={creating}
        title="Add API user"
        okText="Create and show token"
        confirmLoading={saving}
        onOk={() => form.submit()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{ requestsPerMinute: 60, requestsPerDay: 10000 }}
          onFinish={create}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, min: 2 }]}
          >
            <Input placeholder="Company or app" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: 'email' }]}
            extra="Signing in on the website with this Google address gives these limits"
          >
            <Input />
          </Form.Item>
          <Flex gap={16}>
            <Form.Item
              name="requestsPerMinute"
              label="Requests per minute"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item
              name="requestsPerDay"
              label="Requests per day"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} />
            </Form.Item>
          </Flex>
          <Form.Item
            name="admin"
            label="Admin"
            valuePropName="checked"
            extra="Can sign in to the admin interface with the email address"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea autoSize={{ minRows: 2 }} />
          </Form.Item>
        </Form>
      </Modal>
      <TokenModal token={token} onClose={() => setToken(undefined)} />
    </Flex>
  );
}
