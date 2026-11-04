'use client';
import { App, Checkbox, Form, Modal, Radio, Select } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScheduledMode, StoreStatus } from '../../utils/admin/types';
import { sendJson } from './api';

interface Values {
  all: boolean;
  storeIds: number[];
  mode: ScheduledMode;
}

export default function RunScanModal({
  open,
  stores,
  initialStoreIds = [],
  onClose
}: {
  open: boolean;
  stores: StoreStatus[];
  initialStoreIds?: number[];
  onClose: (queued: boolean) => void;
}) {
  const { message } = App.useApp();
  const { t } = useTranslation('admin');
  const [form] = Form.useForm<Values>();
  const all = Form.useWatch('all', form);
  const [saving, setSaving] = useState(false);

  const submit = async (values: Values) => {
    setSaving(true);
    try {
      const { queued } = await sendJson<{ queued: number }>(
        '/api/admin/jobs',
        'POST',
        { storeIds: values.all ? 'all' : values.storeIds, mode: values.mode }
      );
      if (queued > 0) message.success(t('runScan.queued', { count: queued }));
      else message.info(t('runScan.alreadyQueued'));
      onClose(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('runScan.title')}
      open={open}
      okText={t('runScan.ok')}
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={() => onClose(false)}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          all: initialStoreIds.length === 0,
          storeIds: initialStoreIds,
          mode: 'crawler'
        }}
        onFinish={submit}
      >
        <Form.Item name="mode" label={t('runScan.mode')}>
          <Radio.Group
            options={[
              {
                value: 'crawler',
                label: t('runScan.crawler')
              },
              {
                value: 'list',
                label: t('runScan.list')
              }
            ]}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          />
        </Form.Item>
        <Form.Item name="all" valuePropName="checked">
          <Checkbox>{t('runScan.all')}</Checkbox>
        </Form.Item>
        {!all && (
          <Form.Item
            name="storeIds"
            label={t('runScan.stores')}
            rules={[{ required: true, message: t('runScan.storesRequired') }]}
          >
            <Select
              mode="multiple"
              optionFilterProp="label"
              placeholder={t('runScan.storesPlaceholder')}
              options={stores.map((store) => ({
                value: store.id,
                label: store.scraperEnabled
                  ? store.name
                  : t('runScan.scrapingDisabled', { name: store.name })
              }))}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
