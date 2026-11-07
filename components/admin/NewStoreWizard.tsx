'use client';
import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Flex,
  Form,
  Input,
  Row,
  Steps,
  Switch,
  Typography
} from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import {
  pruneConfig,
  validateStoreConfig
} from '../../utils/admin/storeConfig';
import { NextStore, WebshopCrawlerOptions } from '../../utils/admin/types';
import { fetchJson, sendJson } from './api';
import ConfigTester from './ConfigTester';
import StoreConfigForm, {
  ConfigFormValues,
  ConfigSection,
  fromFormValues,
  toFormValues
} from './StoreConfigForm';

type WizardValues = ConfigFormValues & {
  name: string;
  scraperEnabled: boolean;
  apiEnabled: boolean;
};

// The texts are wizard.steps.<key> and wizard.steps.<key>Content
const STEPS: {
  key: 'store' | 'productPages' | 'crawling' | 'test';
  sections: ConfigSection[];
  fields: (string | string[])[];
}[] = [
  {
    key: 'store',
    sections: ['basics'],
    fields: ['name', 'startUrl', 'productPageIdentifier']
  },
  {
    key: 'productPages',
    sections: ['structured', 'selectors', 'attributes', 'sanitizers'],
    fields: [
      ['selectors'],
      ['skuUrl'],
      ['skuAttribute'],
      ['skuJson'],
      ['skuSanitizers']
    ]
  },
  {
    key: 'crawling',
    sections: ['crawling'],
    fields: []
  },
  {
    key: 'test',
    sections: [],
    fields: []
  }
];

type ExistingConfig = NextStore & {
  config: NonNullable<NextStore['config']> & { value: WebshopCrawlerOptions };
};

// With a committed config only the name is entered before testing
const EXISTING_STEPS: typeof STEPS = [
  { key: 'store', sections: [], fields: ['name'] },
  STEPS[STEPS.length - 1]
];

// Most stores have JSON-LD, so a new config starts from that
const INITIAL_CONFIG: Partial<WebshopCrawlerOptions> = {
  type: 'httpcrawler',
  productPageIdentifier: '"@type":"Product"',
  selectors: { productPage: 'body', structuredData: { source: 'jsonld' } }
};

export default function NewStoreWizard() {
  const { message } = App.useApp();
  const { t } = useTranslation('stores');
  const router = useRouter();
  const [form] = Form.useForm<WizardValues>();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [, setVersion] = useState(0);
  // The config committed for the id the store will get, checked again when
  // the window gets focus so a config committed meanwhile shows up
  const {
    data: nextStore,
    mutate: checkNextStore,
    isValidating: checkingNextStore
  } = useSWR<NextStore>('/api/admin/stores/next', fetchJson);
  // Kept as it was when chosen, the api checks it again on create
  const [existing, setExisting] = useState<ExistingConfig>();
  const steps = existing ? EXISTING_STEPS : STEPS;
  const lastStep = step === steps.length - 1;

  const draftConfig = () => {
    if (existing) return existing.config.value;
    const values = form.getFieldsValue(true) as WizardValues;
    return pruneConfig(fromFormValues(values, 0)) as WebshopCrawlerOptions;
  };
  // A committed config is only offered when it is valid
  const errors =
    lastStep && !existing ? validateStoreConfig(draftConfig(), t) : [];

  const next = async () => {
    try {
      await form.validateFields(steps[step].fields, { recursive: true });
      setStep(step + 1);
    } catch {
      // The form shows the errors
    }
  };

  const create = async () => {
    const values = form.getFieldsValue(true) as WizardValues;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { storeId, ...config } = draftConfig();
    setCreating(true);
    try {
      const result = await sendJson<{ id: number; warning?: string }>(
        '/api/admin/stores',
        'POST',
        {
          name: values.name,
          scraperEnabled: values.scraperEnabled,
          apiEnabled: values.apiEnabled,
          ...(existing
            ? { existingConfig: { storeId: existing.storeId } }
            : { config })
        }
      );
      // The warning of the api is always that saving the config failed
      if (result.warning) message.warning(t('wizard.configSaveFailed'), 10);
      else message.success(t('wizard.added', { name: values.name }));
      router.push(`/admin/stores/${result.id}`);
    } catch (e) {
      message.error((e as Error).message);
      setCreating(false);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Link href="/admin/stores">
        <ArrowLeftOutlined /> {t('wizard.back')}
      </Link>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {t('wizard.title')}
      </Typography.Title>
      <Steps
        current={step}
        items={steps.map(({ key }) => ({
          title: t(`wizard.steps.${key}`),
          content: t(`wizard.steps.${key}Content`)
        }))}
      />
      <Form<WizardValues>
        form={form}
        layout="vertical"
        initialValues={{
          ...toFormValues(INITIAL_CONFIG),
          scraperEnabled: false,
          apiEnabled: false
        }}
        onValuesChange={() => setVersion((v) => v + 1)}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={lastStep ? 12 : 24}>
            {step === 0 && (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Form.Item
                  name="name"
                  label={t('wizard.name')}
                  extra={t('wizard.nameHelp')}
                  rules={[
                    {
                      required: true,
                      min: 2,
                      message: t('wizard.nameRequired')
                    }
                  ]}
                >
                  <Input placeholder="Tölvutek" />
                </Form.Item>
              </Card>
            )}
            {step === 0 && (
              <CommittedConfig
                nextStore={nextStore}
                existing={existing}
                checking={checkingNextStore}
                onCheck={() => checkNextStore()}
                onUse={setExisting}
              />
            )}
            {step === 1 && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                title={t('wizard.structuredTip')}
              />
            )}
            {/* Kept mounted so values survive moving between steps */}
            <StoreConfigForm form={form} sections={steps[step].sections} />
            {lastStep && existing && (
              <Card
                size="small"
                style={{ marginBottom: 16 }}
                title={
                  <Typography.Link href={existing.fileUrl} target="_blank">
                    <FileTextOutlined /> {existing.configPath}
                  </Typography.Link>
                }
              >
                <pre
                  style={{
                    margin: 0,
                    maxHeight: 400,
                    overflow: 'auto',
                    fontSize: 12
                  }}
                >
                  {existing.config.text}
                </pre>
              </Card>
            )}
            {lastStep && (
              <Card size="small" title={t('wizard.create')}>
                <Flex vertical gap={12}>
                  {errors.length > 0 ? (
                    <Alert
                      type="error"
                      showIcon
                      title={t('wizard.fixErrors')}
                      description={
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {errors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      }
                    />
                  ) : (
                    <Typography.Text type="secondary">
                      {existing
                        ? t('wizard.existingCommitInfo')
                        : t('wizard.commitInfo')}
                    </Typography.Text>
                  )}
                  <Flex gap={8} align="center">
                    <Form.Item
                      name="scraperEnabled"
                      valuePropName="checked"
                      noStyle
                    >
                      <Switch />
                    </Form.Item>
                    {t('wizard.scheduledScans')}
                  </Flex>
                  <Flex gap={8} align="center">
                    <Form.Item
                      name="apiEnabled"
                      valuePropName="checked"
                      noStyle
                    >
                      <Switch />
                    </Form.Item>
                    {t('wizard.publicSearch')}
                  </Flex>
                </Flex>
              </Card>
            )}
          </Col>
          {lastStep && (
            <Col xs={24} xl={12}>
              <ConfigTester
                storeId={null}
                startUrl={
                  existing
                    ? existing.config.value.startUrl
                    : form.getFieldValue('startUrl')
                }
                getConfig={() => {
                  if (errors.length > 0) {
                    message.error(t('tester.fixConfigFirst'));
                    return undefined;
                  }
                  return draftConfig();
                }}
              />
            </Col>
          )}
        </Row>
      </Form>
      <Flex justify="space-between">
        <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
          {t('wizard.previous')}
        </Button>
        {!lastStep ? (
          <Button type="primary" onClick={next}>
            {t('wizard.next')}
          </Button>
        ) : (
          <Button
            type="primary"
            loading={creating}
            disabled={errors.length > 0}
            onClick={create}
          >
            {t('wizard.createStore')}
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

// Offers the config that is already committed for the id the store will get
function CommittedConfig({
  nextStore,
  existing,
  checking,
  onCheck,
  onUse
}: {
  nextStore?: NextStore;
  existing?: ExistingConfig;
  checking: boolean;
  onCheck: () => void;
  onUse: (existing?: ExistingConfig) => void;
}) {
  const { t } = useTranslation('stores');
  if (existing)
    return (
      <Alert
        type="success"
        showIcon
        style={{ marginBottom: 16 }}
        title={t('wizard.usingExisting', { storeId: existing.storeId })}
        description={
          <Typography.Link href={existing.fileUrl} target="_blank">
            {existing.configPath}
          </Typography.Link>
        }
        action={
          <Button size="small" onClick={() => onUse(undefined)}>
            {t('wizard.dontUseExisting')}
          </Button>
        }
      />
    );
  const config = nextStore?.config;
  if (!nextStore || !config) return null;
  const valid = config.value !== undefined && config.errors.length === 0;
  return (
    <Alert
      type={valid ? 'info' : 'warning'}
      showIcon
      style={{ marginBottom: 16 }}
      title={t('wizard.existingFound', { storeId: nextStore.storeId })}
      description={
        <Flex vertical gap={4}>
          <span>
            <Typography.Link href={nextStore.fileUrl} target="_blank">
              {nextStore.configPath}
            </Typography.Link>
            {config.value?.startUrl && ` · ${config.value.startUrl}`}
          </span>
          {!valid && (
            <>
              {t('wizard.existingInvalid')}
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {config.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </>
          )}
        </Flex>
      }
      action={
        valid ? (
          <Button
            size="small"
            type="primary"
            onClick={() => onUse(nextStore as ExistingConfig)}
          >
            {t('wizard.useExisting')}
          </Button>
        ) : (
          <Button size="small" loading={checking} onClick={onCheck}>
            {t('wizard.checkAgain')}
          </Button>
        )
      }
    />
  );
}
