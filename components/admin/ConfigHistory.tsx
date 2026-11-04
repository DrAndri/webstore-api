'use client';
import { GithubOutlined, RollbackOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Avatar,
  Button,
  Flex,
  List,
  Modal,
  Popconfirm,
  Spin,
  Typography
} from 'antd';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { patchLines } from '../../utils/admin/storeConfig';
import { ConfigCommit } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import { fetchJson, sendJson } from './api';
import DiffView from './DiffView';

interface CommitDetails {
  patch: string | null;
  fileStatus: string | null;
  text: string | null;
}

function CommitModal({
  storeId,
  commit,
  currentSha,
  onClose,
  onRestored
}: {
  storeId: number;
  commit: ConfigCommit;
  currentSha: string | undefined;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { message } = App.useApp();
  const { t } = useTranslation('stores');
  const format = useFormat();
  const { data, error } = useSWR<CommitDetails>(
    `/api/admin/stores/${storeId}/history/${commit.sha}`,
    fetchJson
  );
  const [restoring, setRestoring] = useState(false);

  const restore = async () => {
    if (!data?.text) return;
    setRestoring(true);
    try {
      await sendJson(`/api/admin/stores/${storeId}/config`, 'PUT', {
        text: data.text,
        sha: currentSha,
        message: `Restore config to ${commit.sha.slice(0, 7)} (${commit.message.split('\n')[0]})`
      });
      message.success(t('history.restored'));
      onRestored();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      open
      width={900}
      title={commit.message.split('\n')[0]}
      onCancel={onClose}
      footer={
        <Flex justify="space-between">
          <Button href={commit.url} target="_blank" icon={<GithubOutlined />}>
            {t('history.viewOnGithub')}
          </Button>
          <Popconfirm
            title={t('history.restoreConfirm')}
            onConfirm={restore}
            disabled={!data?.text}
          >
            <Button
              icon={<RollbackOutlined />}
              loading={restoring}
              disabled={!data?.text}
            >
              {t('history.restore')}
            </Button>
          </Popconfirm>
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary">
        {commit.authorName} · {format.time(commit.date)} ·{' '}
        {commit.sha.slice(0, 7)}
      </Typography.Paragraph>
      {commit.message.includes('\n') && (
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
          {commit.message}
        </Typography.Paragraph>
      )}
      {error && <Alert type="error" showIcon title={error.message} />}
      {!data && !error && <Spin />}
      {data &&
        (data.patch ? (
          <DiffView lines={patchLines(data.patch)} />
        ) : (
          <Alert type="info" showIcon title={t('history.noDiff')} />
        ))}
    </Modal>
  );
}

// Commits that changed the config file of the store
export default function ConfigHistory({
  storeId,
  currentSha,
  legacyHistoryUrl,
  onRestored
}: {
  storeId: number;
  currentSha: string | undefined;
  legacyHistoryUrl: string;
  onRestored: () => void;
}) {
  const { t } = useTranslation('stores');
  const format = useFormat();
  const { data, error, mutate } = useSWR<ConfigCommit[]>(
    `/api/admin/stores/${storeId}/history`,
    fetchJson
  );
  const [selected, setSelected] = useState<ConfigCommit>();

  if (error) return <Alert type="error" showIcon title={error.message} />;
  return (
    <>
      <List<ConfigCommit>
        loading={!data}
        dataSource={data}
        locale={{ emptyText: t('history.empty') }}
        renderItem={(commit) => (
          <List.Item
            actions={[
              <Button
                key="view"
                size="small"
                onClick={() => setSelected(commit)}
              >
                {t('history.view')}
              </Button>
            ]}
          >
            <List.Item.Meta
              avatar={
                <Avatar src={commit.avatarUrl}>{commit.authorName[0]}</Avatar>
              }
              title={commit.message.split('\n')[0]}
              description={
                <span title={format.time(commit.date)}>
                  {commit.authorLogin ?? commit.authorName} ·{' '}
                  {format.fromNow(commit.date)} ·{' '}
                  <code>{commit.sha.slice(0, 7)}</code>
                </span>
              }
            />
          </List.Item>
        )}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        <Trans
          t={t}
          i18nKey="history.legacy"
          components={{
            link: <Typography.Link href={legacyHistoryUrl} target="_blank" />
          }}
        />
      </Typography.Paragraph>
      {selected && (
        <CommitModal
          storeId={storeId}
          commit={selected}
          currentSha={currentSha}
          onClose={() => setSelected(undefined)}
          onRestored={() => {
            setSelected(undefined);
            void mutate();
            onRestored();
          }}
        />
      )}
    </>
  );
}
