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

const STEPS: {
  title: string;
  content: string;
  sections: ConfigSection[];
  fields: (string | string[])[];
}[] = [
  {
    title: 'Store',
    content: 'Name and website',
    sections: ['basics'],
    fields: ['name', 'startUrl', 'productPageIdentifier']
  },
  {
    title: 'Product pages',
    content: 'What to scrape',
    sections: ['structured', 'selectors', 'attributes', 'sanitizers'],
    fields: [['selectors'], ['skuUrl'], ['skuAttribute'], ['skuSanitizers']]
  },
  {
    title: 'Crawling',
    content: 'Which pages to visit',
    sections: ['crawling'],
    fields: []
  },
  {
    title: 'Test and create',
    content: 'Try it on a product',
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
    step === STEPS.length - 1 ? validateStoreConfig(draftConfig()) : [];

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
      if (result.warning) message.warning(result.warning, 10);
      else message.success(`${values.name} was added`);
      router.push(`/admin/stores/${result.id}`);
    } catch (e) {
      message.error((e as Error).message);
      setCreating(false);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Link href="/admin/stores">
        <ArrowLeftOutlined /> Stores
      </Link>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Add a store
      </Typography.Title>
      <Steps
        current={step}
        items={STEPS.map(({ title, content }) => ({ title, content }))}
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
                  label="Store name"
                  extra="Shown in search results and on the price chart"
                  rules={[
                    {
                      required: true,
                      min: 2,
                      message: 'Enter the name of the store'
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
                title="With structured data on, many stores only need the product container. Test on the last step and add CSS selectors for the fields that are missing."
              />
            )}
            {/* Kept mounted so values survive moving between steps */}
            <StoreConfigForm form={form} sections={STEPS[step].sections} />
            {step === STEPS.length - 1 && (
              <Card size="small" title="Create">
                <Flex vertical gap={12}>
                  {errors.length > 0 ? (
                    <Alert
                      type="error"
                      showIcon
                      title="Fix these before creating the store"
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
                      The config is committed to the scraper repository as your
                      change, and can be edited later.
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
                    Include in scheduled scans
                  </Flex>
                  <Flex gap={8} align="center">
                    <Form.Item
                      name="apiEnabled"
                      valuePropName="checked"
                      noStyle
                    >
                      <Switch />
                    </Form.Item>
                    Show in the public search
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
                    message.error('Fix the config errors before testing');
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
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="primary" onClick={next}>
            Next
          </Button>
        ) : (
          <Button
            type="primary"
            loading={creating}
            disabled={errors.length > 0}
            onClick={create}
          >
            Create store
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
