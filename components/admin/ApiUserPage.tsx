'use client';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography
} from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import useSWR from 'swr';
import { ApiToken, ApiUserDetails } from '../../utils/admin/types';
import { fetchJson, formatNumber, formatTime, fromNow, sendJson } from './api';
import { TokenModal, UsageCell } from './ApiUsers';
import { SERIES_COLORS } from './charts';

function UsageChart({ usage }: { usage: ApiUserDetails['usage'] }) {
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = dayjs
      .utc()
      .subtract(29 - i, 'day')
      .format('YYYY-MM-DD');
    const row = usage.find((u) => u.day === day);
    return {
      day,
      requests: Number(row?.requests ?? 0),
      rejected: Number(row?.rejected ?? 0)
    };
  });
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#e8e8e6" />
        <XAxis
          dataKey="day"
          stroke="#e8e8e6"
          tick={{ fill: '#52514e', fontSize: 12 }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          stroke="#e8e8e6"
          tick={{ fill: '#52514e', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          formatter={(value, name) => [formatNumber(Number(value)), name]}
        />
        <Legend iconType="circle" iconSize={8} />
        <Bar
          dataKey="requests"
          name="Served"
          stackId="usage"
          fill={SERIES_COLORS[0]}
          stroke="#ffffff"
          maxBarSize={24}
        />
        <Bar
          dataKey="rejected"
          name="Rejected"
          stackId="usage"
          fill={SERIES_COLORS[1]}
          stroke="#ffffff"
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ApiUserPage({ userId }: { userId: number }) {
  const { message } = App.useApp();
  const { data, error, mutate } = useSWR<ApiUserDetails>(
    `/api/admin/api-users/${userId}`,
    fetchJson,
    {
      refreshInterval: 10000
    }
  );
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string>();
  const [tokenName, setTokenName] = useState('');

  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!data) return <Spin style={{ display: 'block', marginTop: 64 }} />;
  const { user, tokens } = data;

  const save = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      void mutate(
        await sendJson<ApiUserDetails>(
          `/api/admin/api-users/${userId}`,
          'PATCH',
          values
        ),
        false
      );
      message.success('Saved, the limits apply within seconds');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const newToken = async () => {
    try {
      const result = await sendJson<{ token: string }>(
        `/api/admin/api-users/${userId}/tokens`,
        'POST',
        {
          name: tokenName
        }
      );
      setToken(result.token);
      setTokenName('');
      void mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const revoke = async (tokenId: number) => {
    try {
      await sendJson(
        `/api/admin/api-users/${userId}/tokens/${tokenId}/revoke`,
        'POST'
      );
      message.success('Token revoked');
      void mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Link href="/admin/api-users">
        <ArrowLeftOutlined /> API users
      </Link>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {user.name}
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="This minute" value={user.requestsThisMinute} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Today" value={user.requestsToday} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Rejected today" value={user.rejectedToday} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Last 30 days" value={user.requests30Days} />
          </Card>
        </Col>
      </Row>
      <Card size="small" title="Requests per day">
        <UsageChart usage={data.usage} />
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            title={
              user.anonymous ? 'Limits of each visitor' : 'Details and limits'
            }
          >
            <Form
              key={`${user.requestsPerMinute}-${user.requestsPerDay}-${user.enabled}`}
              form={form}
              layout="vertical"
              initialValues={user}
              onFinish={save}
            >
              {!user.anonymous && (
                <>
                  <Form.Item
                    name="name"
                    label="Name"
                    rules={[{ required: true, min: 2 }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label="Contact email"
                    rules={[{ type: 'email' }]}
                  >
                    <Input />
                  </Form.Item>
                </>
              )}
              <Flex gap={16} wrap>
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
                name="enabled"
                label={
                  user.anonymous ? 'Allow requests without a token' : 'Active'
                }
                valuePropName="checked"
                extra={
                  user.anonymous
                    ? 'When off, the website search stops working and every request needs a token.'
                    : 'When off, all tokens of the user are refused.'
                }
              >
                <Switch />
              </Form.Item>
              <Form.Item name="note" label="Note">
                <Input.TextArea autoSize={{ minRows: 2 }} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save
              </Button>
            </Form>
          </Card>
        </Col>
        {!user.anonymous && (
          <Col xs={24} lg={14}>
            <Card
              size="small"
              title="Tokens"
              extra={
                <Flex gap={8}>
                  <Input
                    size="small"
                    placeholder="Name, e.g. production"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                  />
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={newToken}
                  >
                    New token
                  </Button>
                </Flex>
              }
            >
              <Table<ApiToken>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={tokens}
                scroll={{ x: true }}
                columns={[
                  {
                    title: 'Token',
                    render: (_, token) => (
                      <Flex vertical>
                        <code>{token.prefix}…</code>
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                        >
                          {token.name}
                        </Typography.Text>
                      </Flex>
                    )
                  },
                  {
                    title: 'Status',
                    render: (_, token) =>
                      token.revokedAt ? (
                        <Tag>Revoked {formatTime(token.revokedAt)}</Tag>
                      ) : (
                        <Tag color="success">Active</Tag>
                      )
                  },
                  {
                    title: 'This minute',
                    render: (_, token) => (
                      <UsageCell
                        used={token.requestsThisMinute}
                        limit={user.requestsPerMinute}
                      />
                    )
                  },
                  {
                    title: 'Today',
                    render: (_, token) => (
                      <UsageCell
                        used={token.requestsToday}
                        limit={user.requestsPerDay}
                      />
                    )
                  },
                  {
                    title: 'Last used',
                    render: (_, token) => fromNow(token.lastUsedAt)
                  },
                  {
                    title: 'Created',
                    render: (_, token) =>
                      `${formatTime(token.createdAt)} by ${token.createdBy ?? '–'}`
                  },
                  {
                    title: '',
                    render: (_, token) =>
                      !token.revokedAt && (
                        <Popconfirm
                          title="Revoke this token? Requests with it are refused right away."
                          onConfirm={() => revoke(token.id)}
                        >
                          <Button size="small" danger>
                            Revoke
                          </Button>
                        </Popconfirm>
                      )
                  }
                ]}
              />
            </Card>
          </Col>
        )}
      </Row>
      <TokenModal token={token} onClose={() => setToken(undefined)} />
    </Flex>
  );
}
