'use client';
import { App, Checkbox, Form, Modal, Radio, Select } from 'antd';
import { useState } from 'react';
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
      if (queued > 0)
        message.success(`Queued ${queued} scan${queued === 1 ? '' : 's'}`);
      else message.info('Those stores already have a scan queued or running');
      onClose(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Run scan"
      open={open}
      okText="Queue scan"
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
        <Form.Item name="mode" label="Scan">
          <Radio.Group
            options={[
              {
                value: 'crawler',
                label: 'Full crawl, finds new products'
              },
              {
                value: 'list',
                label: 'Active products, re-scrapes known product pages'
              }
            ]}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          />
        </Form.Item>
        <Form.Item name="all" valuePropName="checked">
          <Checkbox>All stores with scraping enabled</Checkbox>
        </Form.Item>
        {!all && (
          <Form.Item
            name="storeIds"
            label="Stores"
            rules={[{ required: true, message: 'Select at least one store' }]}
          >
            <Select
              mode="multiple"
              optionFilterProp="label"
              placeholder="Select stores"
              options={stores.map((store) => ({
                value: store.id,
                label: store.scraperEnabled
                  ? store.name
                  : `${store.name} (scraping disabled)`
              }))}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
