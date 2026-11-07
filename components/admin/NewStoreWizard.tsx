'use client';
import { ArrowLeftOutlined } from '@ant-design/icons';
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
import {
  pruneConfig,
  validateStoreConfig
} from '../../utils/admin/storeConfig';
import { WebshopCrawlerOptions } from '../../utils/admin/types';
import { sendJson } from './api';
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

  const draftConfig = () => {
    const values = form.getFieldsValue(true) as WizardValues;
    return pruneConfig(fromFormValues(values, 0)) as WebshopCrawlerOptions;
  };
  const errors =
    step === STEPS.length - 1 ? validateStoreConfig(draftConfig(), t) : [];

  const next = async () => {
    try {
      await form.validateFields(STEPS[step].fields, { recursive: true });
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
          config
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
        items={STEPS.map(({ key }) => ({
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
          <Col xs={24} xl={step === STEPS.length - 1 ? 12 : 24}>
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
            {step === 1 && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                title={t('wizard.structuredTip')}
              />
            )}
            {/* Kept mounted so values survive moving between steps */}
            <StoreConfigForm form={form} sections={STEPS[step].sections} />
            {step === STEPS.length - 1 && (
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
                      {t('wizard.commitInfo')}
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
          {step === STEPS.length - 1 && (
            <Col xs={24} xl={12}>
              <ConfigTester
                storeId={null}
                startUrl={form.getFieldValue('startUrl')}
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
        {step < STEPS.length - 1 ? (
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
