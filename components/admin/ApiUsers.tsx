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
import { Trans, useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ApiUser } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';

// Shows a new token, it can not be shown again
export function TokenModal({
  token,
  onClose
}: {
  token?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('apiUsers');
  return (
    <Modal
      open={!!token}
      title={t('tokenModal.title')}
      onOk={onClose}
      onCancel={onClose}
      cancelButtonProps={{ style: { display: 'none' } }}
      okText={t('tokenModal.copied')}
    >
      <Flex vertical gap={12}>
        <Alert type="warning" showIcon title={t('tokenModal.copyNow')} />
        <Typography.Paragraph copyable code style={{ wordBreak: 'break-all' }}>
          {token}
        </Typography.Paragraph>
        <Typography.Text type="secondary">
          <Trans
            t={t}
            i18nKey="tokenModal.howToSend"
            components={{ code: <code /> }}
          />
        </Typography.Text>
      </Flex>
    </Modal>
  );
}

export const UsageCell = ({ used, limit }: { used: number; limit: number }) => {
  const format = useFormat();
  return (
    <Typography.Text type={used >= limit ? 'danger' : undefined}>
      {format.number(used)}{' '}
      <Typography.Text type="secondary">
        / {format.number(limit)}
      </Typography.Text>
    </Typography.Text>
  );
};

export default function ApiUsers() {
  const { t } = useTranslation('apiUsers');
  const format = useFormat();
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
          {t('title')}
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreating(true)}
        >
          {t('addUser')}
        </Button>
      </Flex>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        {t('intro')}
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
            title: t('columns.user'),
            render: (_, user) => (
              <Flex vertical>
                <Link href={`/admin/api-users/${user.id}`}>{user.name}</Link>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {user.anonymous ? t('automaticToken') : user.email}
                </Typography.Text>
              </Flex>
            )
          },
          {
            title: t('columns.status'),
            render: (_, user) => (
              <Flex gap={4} wrap>
                {user.enabled ? (
                  <Tag color="success">{t('active')}</Tag>
                ) : (
                  <Tag>{t('disabled')}</Tag>
                )}
                {user.admin && <Tag color="purple">{t('admin')}</Tag>}
              </Flex>
            )
          },
          {
            title: t('columns.thisMinute'),
            render: (_, user) =>
              user.anonymous ? (
                format.number(user.requestsThisMinute)
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
            title: t('columns.today'),
            render: (_, user) => (
              <Flex vertical>
                {user.anonymous ? (
                  format.number(user.requestsToday)
                ) : (
                  <UsageCell
                    used={user.requestsToday}
                    limit={user.requestsPerDay * Math.max(user.activeTokens, 1)}
                  />
                )}
                {user.rejectedToday > 0 && (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {t('rejectedCount', {
                      number: format.number(user.rejectedToday)
                    })}
                  </Typography.Text>
                )}
              </Flex>
            )
          },
          {
            title: t('columns.last30Days'),
            align: 'right',
            render: (_, user) => format.number(user.requests30Days)
          },
          {
            title: t('columns.limitsPerToken'),
            render: (_, user) =>
              t('limits', {
                perMinute: format.number(user.requestsPerMinute),
                perDay: format.number(user.requestsPerDay)
              })
          },
          {
            title: t('columns.tokens'),
            render: (_, user) => (user.anonymous ? '–' : user.activeTokens)
          },
          {
            title: t('columns.lastUsed'),
            render: (_, user) =>
              user.anonymous ? '–' : format.fromNow(user.lastUsedAt)
          }
        ]}
      />
      <Modal
        open={creating}
        title={t('form.addTitle')}
        okText={t('form.create')}
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
            label={t('form.name')}
            rules={[{ required: true, min: 2 }]}
          >
            <Input placeholder={t('form.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="email"
            label={t('form.email')}
            rules={[{ type: 'email' }]}
            extra={t('form.emailHelp')}
          >
            <Input />
          </Form.Item>
          <Flex gap={16}>
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
            name="admin"
            label={t('form.admin')}
            valuePropName="checked"
            extra={t('form.adminHelp')}
          >
            <Switch />
          </Form.Item>
          <Form.Item name="note" label={t('form.note')}>
            <Input.TextArea autoSize={{ minRows: 2 }} />
          </Form.Item>
        </Form>
      </Modal>
      <TokenModal token={token} onClose={() => setToken(undefined)} />
    </Flex>
  );
}
