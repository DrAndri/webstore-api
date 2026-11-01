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
  const baseText = config?.text ?? '';
  const [form] = Form.useForm<ConfigFormValues>();
  const [mode, setMode] = useState<'Form' | 'JSONC'>('Form');
  const [draftText, setDraftText] = useState(baseText);
  // Form changes are applied to this text, so comments added in the JSONC
  // editor are kept when switching back to the form
  const [formBase, setFormBase] = useState<FormBase>(() => ({
    text: baseText,
    value: parseConfigText(baseText).value as WebshopCrawlerOptions | undefined
  }));
  const [formKey, setFormKey] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const check = useMemo(
    () => checkConfigText(draftText, storeId),
    [draftText, storeId]
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
      const { value, errors } = parseConfigText(draftText);
      if (errors.length > 0) {
        message.error('Fix the syntax errors before switching to the form');
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
      value: parseConfigText(baseText).value as
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
      message.success('Committed, the scraper uses it from the next scan');
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
              options={['Form', 'JSONC']}
            />
            <Typography.Link href={fileUrl} target="_blank">
              Open on GitHub
            </Typography.Link>
          </Flex>
          {!config && (
            <Alert
              type="warning"
              showIcon
              title="This store has no config file yet, saving creates it."
            />
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
          <Card size="small" title="Changes">
            <Flex vertical gap={12}>
              {check.errors.length > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  title="The config is not valid"
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
                    <Tag color="processing">Unsaved changes</Tag>
                  ) : (
                    <Tag>No changes</Tag>
                  )}
                </Typography.Text>
              )}
              <Flex gap={8} justify="end">
                <Button
                  icon={<UndoOutlined />}
                  disabled={!dirty}
                  onClick={discard}
                >
                  Discard
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
                  Review and commit
                </Button>
              </Flex>
            </Flex>
          </Card>
          <ConfigTester
            storeId={storeId}
            startUrl={check.value?.startUrl}
            getConfig={() => {
              if (check.errors.length > 0 || !check.value) {
                message.error('Fix the config errors before testing');
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
        title="Review changes"
        okText="Commit"
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
            <Typography.Text strong>Commit message</Typography.Text>
            <Input.TextArea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              autoSize={{ minRows: 2 }}
              maxLength={500}
              placeholder="What changed and why"
            />
          </div>
        </Flex>
      </Modal>
    </Row>
  );
}
