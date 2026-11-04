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
import { useTranslation } from 'react-i18next';
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
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';
import { TokenModal, UsageCell } from './ApiUsers';
import useChartTheme from '../Theme/useChartTheme';
import { SERIES_COLORS } from './charts';

function UsageChart({ usage }: { usage: ApiUserDetails['usage'] }) {
  const { t } = useTranslation('apiUsers');
  const format = useFormat();
  const chart = useChartTheme();
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
        <CartesianGrid vertical={false} stroke={chart.grid} />
        <XAxis
          dataKey="day"
          stroke={chart.grid}
          tick={{ fill: chart.axisText, fontSize: 12 }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          stroke={chart.grid}
          tick={{ fill: chart.axisText, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          {...chart.tooltip}
          cursor={{ fill: chart.cursor }}
          formatter={(value, name) => [format.number(Number(value)), name]}
        />
        <Legend iconType="circle" iconSize={8} />
        <Bar
          dataKey="requests"
          name={t('user.served')}
          stackId="usage"
          fill={SERIES_COLORS[0]}
          stroke={chart.surface}
          maxBarSize={24}
        />
        <Bar
          dataKey="rejected"
          name={t('user.rejected')}
          stackId="usage"
          fill={SERIES_COLORS[1]}
          stroke={chart.surface}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ApiUserPage({ userId }: { userId: number }) {
  const { t } = useTranslation('apiUsers');
  const format = useFormat();
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
      message.success(t('form.saved'));
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
      message.success(t('user.revoked'));
      void mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Link href="/admin/api-users">
        <ArrowLeftOutlined /> {t('title')}
      </Link>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {user.name}
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('columns.thisMinute')}
              value={user.requestsThisMinute}
              formatter={(value) => format.number(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('columns.today')}
              value={user.requestsToday}
              formatter={(value) => format.number(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('user.rejectedToday')}
              value={user.rejectedToday}
              formatter={(value) => format.number(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('columns.last30Days')}
              value={user.requests30Days}
              formatter={(value) => format.number(Number(value))}
            />
          </Card>
        </Col>
      </Row>
      <Card size="small" title={t('user.requestsPerDay')}>
        <UsageChart usage={data.usage} />
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            title={
              user.anonymous
                ? t('user.visitorLimits')
                : t('user.detailsAndLimits')
            }
          >
            <Form
              key={`${user.requestsPerMinute}-${user.requestsPerDay}-${user.enabled}-${user.admin}`}
              form={form}
              layout="vertical"
              initialValues={user}
              onFinish={save}
            >
              {!user.anonymous && (
                <>
                  <Form.Item
                    name="name"
                    label={t('form.name')}
                    rules={[{ required: true, min: 2 }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label={t('form.email')}
                    rules={[{ type: 'email' }]}
                    extra={t('form.emailHelp')}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="admin"
                    label={t('form.admin')}
                    valuePropName="checked"
                    extra={t('form.adminHelp')}
                  >
                    <Switch />
                  </Form.Item>
                </>
              )}
              <Flex gap={16} wrap>
                <Form.Item
                  name="requestsPerMinute"
                  label={t('form.requestsPerMinute')}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} />
                </Form.Item>
                <Form.Item
                  name="requestsPerDay"
                  label={t('form.requestsPerDay')}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} />
                </Form.Item>
              </Flex>
              <Form.Item
                name="enabled"
                label={
                  user.anonymous
                    ? t('form.allowWithoutToken')
                    : t('form.active')
                }
                valuePropName="checked"
                extra={
                  user.anonymous
                    ? t('form.visitorsOffHelp')
                    : t('form.userOffHelp')
                }
              >
                <Switch />
              </Form.Item>
              <Form.Item name="note" label={t('form.note')}>
                <Input.TextArea autoSize={{ minRows: 2 }} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                {t('form.save')}
              </Button>
            </Form>
          </Card>
        </Col>
        {!user.anonymous && (
          <Col xs={24} lg={14}>
            <Card
              size="small"
              title={t('columns.tokens')}
              extra={
                <Flex gap={8}>
                  <Input
                    size="small"
                    placeholder={t('user.tokenNamePlaceholder')}
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                  />
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={newToken}
                  >
                    {t('user.newToken')}
                  </Button>
                </Flex>
              }
            >
              {user.email && (
                <Typography.Paragraph type="secondary">
                  {t('user.websiteUsage', {
                    email: user.email,
                    minute: format.number(data.websiteRequestsThisMinute),
                    today: format.number(data.websiteRequestsToday)
                  })}
                </Typography.Paragraph>
              )}
              <Table<ApiToken>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={tokens}
                scroll={{ x: true }}
                columns={[
                  {
                    title: t('columns.token'),
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
                    title: t('columns.status'),
                    render: (_, token) =>
                      token.revokedAt ? (
                        <Tag>
                          {t('user.revokedAt', {
                            time: format.time(token.revokedAt)
                          })}
                        </Tag>
                      ) : (
                        <Tag color="success">{t('active')}</Tag>
                      )
                  },
                  {
                    title: t('columns.thisMinute'),
                    render: (_, token) => (
                      <UsageCell
                        used={token.requestsThisMinute}
                        limit={user.requestsPerMinute}
                      />
                    )
                  },
                  {
                    title: t('columns.today'),
                    render: (_, token) => (
                      <UsageCell
                        used={token.requestsToday}
                        limit={user.requestsPerDay}
                      />
                    )
                  },
                  {
                    title: t('columns.lastUsed'),
                    render: (_, token) => format.fromNow(token.lastUsedAt)
                  },
                  {
                    title: t('columns.created'),
                    render: (_, token) =>
                      t('user.createdBy', {
                        time: format.time(token.createdAt),
                        name: token.createdBy ?? '–'
                      })
                  },
                  {
                    title: '',
                    render: (_, token) =>
                      !token.revokedAt && (
                        <Popconfirm
                          title={t('user.revokeConfirm')}
                          onConfirm={() => revoke(token.id)}
                        >
                          <Button size="small" danger>
                            {t('user.revoke')}
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
