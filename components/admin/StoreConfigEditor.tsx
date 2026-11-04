'use client';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Flex,
  Form,
  Input,
  Modal,
  Row,
  Segmented,
  Tag,
  Typography
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyConfigChanges,
  checkConfigText,
  diffLines,
  newConfigText,
  parseConfigText,
  pruneConfig
} from '../../utils/admin/storeConfig';
import { WebshopCrawlerOptions } from '../../utils/admin/types';
import { sendJson } from './api';
import ConfigTester from './ConfigTester';
import DiffView from './DiffView';
import StoreConfigForm, {
  ConfigFormValues,
  fromFormValues,
  toFormValues
} from './StoreConfigForm';

interface FormBase {
  text: string;
  value: WebshopCrawlerOptions | undefined;
}

export default function StoreConfigEditor({
  storeId,
  storeName,
  config,
  fileUrl,
  onSaved
}: {
  storeId: number;
  storeName: string;
  config: { text: string; sha: string } | null;
  fileUrl: string;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const { t } = useTranslation('stores');
  const baseText = config?.text ?? '';
  const [form] = Form.useForm<ConfigFormValues>();
  const [mode, setMode] = useState<'Form' | 'JSONC'>('Form');
  const [draftText, setDraftText] = useState(baseText);
  // Form changes are applied to this text, so comments added in the JSONC
  // editor are kept when switching back to the form
  const [formBase, setFormBase] = useState<FormBase>(() => ({
    text: baseText,
    value: parseConfigText(baseText, t).value as
      WebshopCrawlerOptions | undefined
  }));
  const [formKey, setFormKey] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const check = useMemo(
    () => checkConfigText(draftText, t, storeId),
    [draftText, t, storeId]
  );
  const dirty = draftText !== baseText;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const formToText = () => {
    const values = form.getFieldsValue(true) as ConfigFormValues;
    const next = pruneConfig(fromFormValues(values, storeId), formBase.value);
    return formBase.value
      ? applyConfigChanges(formBase.text, formBase.value, next)
      : newConfigText(next as WebshopCrawlerOptions);
  };

  const switchMode = (next: 'Form' | 'JSONC') => {
    if (next === 'Form') {
      const { value, errors } = parseConfigText(draftText, t);
      if (errors.length > 0) {
        message.error(t('editor.fixSyntax'));
        return;
      }
      setFormBase({ text: draftText, value: value as WebshopCrawlerOptions });
      setFormKey((key) => key + 1);
    }
    setMode(next);
  };

  const discard = () => {
    setDraftText(baseText);
    setFormBase({
      text: baseText,
      value: parseConfigText(baseText, t).value as
        WebshopCrawlerOptions | undefined
    });
    setFormKey((key) => key + 1);
  };

  const save = async () => {
    setSaving(true);
    try {
      await sendJson(`/api/admin/stores/${storeId}/config`, 'PUT', {
        text: draftText,
        sha: config?.sha ?? null,
        message: commitMessage
      });
      message.success(t('editor.committed'));
      setReviewing(false);
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={15}>
        <Flex vertical gap={12}>
          <Flex justify="space-between" align="center" wrap gap={8}>
            <Segmented
              value={mode}
              onChange={(value) => switchMode(value as 'Form' | 'JSONC')}
              options={[
                { value: 'Form', label: t('editor.form') },
                { value: 'JSONC', label: 'JSONC' }
              ]}
            />
            <Typography.Link href={fileUrl} target="_blank">
              {t('editor.openOnGithub')}
            </Typography.Link>
          </Flex>
          {!config && (
            <Alert type="warning" showIcon title={t('editor.noConfigFile')} />
          )}
          {mode === 'Form' ? (
            <Form<ConfigFormValues>
              key={formKey}
              form={form}
              layout="vertical"
              initialValues={toFormValues(formBase.value ?? {})}
              onValuesChange={() => setDraftText(formToText())}
            >
              <StoreConfigForm form={form} />
            </Form>
          ) : (
            <Input.TextArea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              autoSize={{ minRows: 20, maxRows: 60 }}
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          )}
        </Flex>
      </Col>
      <Col xs={24} xl={9}>
        <Flex vertical gap={16} style={{ position: 'sticky', top: 16 }}>
          <Card size="small" title={t('editor.changes')}>
            <Flex vertical gap={12}>
              {check.errors.length > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  title={t('editor.invalid')}
                  description={
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {check.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  }
                />
              ) : (
                <Typography.Text>
                  {dirty ? (
                    <Tag color="processing">{t('editor.unsaved')}</Tag>
                  ) : (
                    <Tag>{t('editor.noChanges')}</Tag>
                  )}
                </Typography.Text>
              )}
              <Flex gap={8} justify="end">
                <Button
                  icon={<UndoOutlined />}
                  disabled={!dirty}
                  onClick={discard}
                >
                  {t('editor.discard')}
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  disabled={!dirty || check.errors.length > 0}
                  onClick={() => {
                    setCommitMessage(`Update ${storeName} config`);
                    setReviewing(true);
                  }}
                >
                  {t('editor.review')}
                </Button>
              </Flex>
            </Flex>
          </Card>
          <ConfigTester
            storeId={storeId}
            startUrl={check.value?.startUrl}
            getConfig={() => {
              if (check.errors.length > 0 || !check.value) {
                message.error(t('tester.fixConfigFirst'));
                return undefined;
              }
              return check.value;
            }}
          />
        </Flex>
      </Col>
      <Modal
        open={reviewing}
        width={900}
        title={t('editor.reviewTitle')}
        okText={t('editor.commit')}
        okButtonProps={{
          disabled: commitMessage.trim().length < 3,
          loading: saving
        }}
        onOk={save}
        onCancel={() => setReviewing(false)}
        destroyOnHidden
      >
        <Flex vertical gap={12}>
          <DiffView lines={diffLines(baseText, draftText)} />
          <div>
            <Typography.Text strong>
              {t('editor.commitMessage')}
            </Typography.Text>
            <Input.TextArea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              autoSize={{ minRows: 2 }}
              maxLength={500}
              placeholder={t('editor.commitPlaceholder')}
            />
          </div>
        </Flex>
      </Modal>
    </Row>
  );
}
