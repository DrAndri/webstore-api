'use client';
import { ReloadOutlined } from '@ant-design/icons';
import { App, Button, ButtonProps } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigReload } from '../../utils/admin/types';
import { fetchJson, sendJson } from './api';

// The scraper picks reloads up every 5 seconds, a reload still queued after
// this is not waited for
const WAIT_MS = 20 * 1000;
const POLL_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reloads a store's config in the scraper, or every config without storeId,
// and tells how it went. The scraper only reloads the configs when asked.
export default function ReloadConfigButton({
  storeId,
  onReloaded,
  children,
  ...props
}: Omit<ButtonProps, 'onClick' | 'loading'> & {
  storeId?: number;
  onReloaded?: () => void;
}) {
  const { message } = App.useApp();
  const { t } = useTranslation('stores');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setBusy(true);
    try {
      const { id } = await sendJson<{ id: number }>(
        '/api/admin/config-reloads',
        'POST',
        { storeId: storeId ?? null }
      );
      const giveUpAt = Date.now() + WAIT_MS;
      let result: ConfigReload;
      do {
        await sleep(POLL_MS);
        result = await fetchJson<ConfigReload>(
          `/api/admin/config-reloads/${id}`
        );
      } while (result.status === 'queued' && Date.now() < giveUpAt);

      if (result.status === 'queued') message.warning(t('reload.notPickedUp'));
      else if (result.status === 'succeeded')
        message.success(
          storeId === undefined
            ? t('reload.allReloaded')
            : t('reload.storeReloaded')
        );
      else
        message.error(
          storeId === undefined
            ? t('reload.allFailed', { error: result.errorMessage })
            : t('reload.storeFailed', { error: result.errorMessage }),
          10
        );
      onReloaded?.();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      icon={<ReloadOutlined />}
      {...props}
      loading={busy}
      onClick={reload}
    >
      {children ??
        (storeId === undefined ? t('reload.all') : t('reload.store'))}
    </Button>
  );
}
