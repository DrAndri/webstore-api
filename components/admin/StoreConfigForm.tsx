'use client';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Flex,
  Form,
  FormInstance,
  Input,
  Radio,
  Row,
  Select,
  Switch,
  Typography
} from 'antd';
import { Trans, useTranslation } from 'react-i18next';
import { STRUCTURED_DATA_FIELDS } from '../../utils/admin/types';
import { ConfigSection } from './configFormValues';

export type { ConfigFormValues, ConfigSection } from './configFormValues';
export { fromFormValues, toFormValues } from './configFormValues';

const mono = { fontFamily: 'monospace' };
const tags = (placeholder: string) => (
  <Select
    mode="tags"
    tokenSeparators={[',', ' ']}
    placeholder={placeholder}
    open={false}
    suffixIcon={null}
  />
);

function SelectorItem({
  name,
  label,
  help,
  required
}: {
  name: (string | number)[];
  label: string;
  help?: React.ReactNode;
  required?: boolean;
}) {
  const { t } = useTranslation('stores');
  return (
    <Form.Item
      name={name}
      label={label}
      extra={help}
      rules={
        required
          ? [{ required: true, message: t('configForm.required', { label }) }]
          : undefined
      }
    >
      <Input style={mono} allowClear />
    </Form.Item>
  );
}

// The fields of the store config, rendered inside a Form owned by the parent
export default function StoreConfigForm({
  form,
  sections
}: {
  // The parent form may hold other fields too
  form: FormInstance;
  sections?: ConfigSection[];
}) {
  const { t } = useTranslation('stores');
  const type = Form.useWatch('type', form);
  const skuSource = Form.useWatch('skuSource', form);
  const useStructuredData = Form.useWatch('useStructuredData', form);
  const useAttributes = Form.useWatch('useAttributes', form);
  const queryParams = Form.useWatch('queryParams', form);
  const browser = type === 'crawler';
  const show = (section: ConfigSection) =>
    !sections || sections.includes(section);

  return (
    <Flex vertical gap={16}>
      <Card
        size="small"
        title={t('configForm.website')}
        style={{ display: show('basics') ? undefined : 'none' }}
      >
        <Form.Item
          name="startUrl"
          label={t('configForm.startUrl')}
          extra={t('configForm.startUrlHelp')}
          rules={[
            { required: true, message: t('configForm.startUrlRequired') },
            {
              type: 'url',
              message: t('configForm.startUrlInvalid')
            }
          ]}
        >
          <Input placeholder="https://example.is" />
        </Form.Item>
        <Form.Item name="type" label={t('configForm.type')}>
          <Radio.Group
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            options={[
              {
                value: 'httpcrawler',
                label: (
                  <span>
                    {t('configForm.plainHtml')}{' '}
                    <Typography.Text type="secondary">
                      {t('configForm.plainHtmlHelp')}
                    </Typography.Text>
                  </span>
                )
              },
              {
                value: 'crawler',
                label: (
                  <span>
                    {t('configForm.browser')}{' '}
                    <Typography.Text type="secondary">
                      {t('configForm.browserHelp')}
                    </Typography.Text>
                  </span>
                )
              }
            ]}
          />
        </Form.Item>
        <Form.Item
          name="productPageIdentifier"
          label={t('configForm.identifier')}
          extra={
            <Trans
              t={t}
              i18nKey="configForm.identifierHelp"
              components={{
                compact: (
                  <Typography.Link
                    onClick={() =>
                      form.setFieldValue(
                        'productPageIdentifier',
                        '"@type":"Product"'
                      )
                    }
                  >
                    <code>&quot;@type&quot;:&quot;Product&quot;</code>
                  </Typography.Link>
                ),
                spaced: (
                  <Typography.Link
                    onClick={() =>
                      form.setFieldValue(
                        'productPageIdentifier',
                        '"@type": "Product"'
                      )
                    }
                  >
                    <code>&quot;@type&quot;: &quot;Product&quot;</code>
                  </Typography.Link>
                )
              }}
            />
          }
          rules={[
            {
              required: true,
              message: t('configForm.identifierRequired')
            }
          ]}
        >
          <Input style={mono} />
        </Form.Item>
      </Card>

      <Card
        size="small"
        title={t('configForm.crawling')}
        style={{ display: show('crawling') ? undefined : 'none' }}
      >
        <Form.Item
          name="urlWhitelist"
          label={t('configForm.whitelist')}
          extra={t('configForm.whitelistHelp')}
        >
          {tags('/vorur')}
        </Form.Item>
        <Form.Item
          name="urlBlacklist"
          label={t('configForm.blacklist')}
          extra={t('configForm.blacklistHelp')}
        >
          {tags('/blogg')}
        </Form.Item>
        <Form.Item
          name="queryParams"
          label={t('configForm.queryParams')}
          extra={t('configForm.queryParamsHelp')}
        >
          <Radio.Group
            options={[
              { value: 'all', label: t('configForm.queryParamsAll') },
              { value: 'none', label: t('configForm.queryParamsNone') },
              { value: 'some', label: t('configForm.queryParamsSome') }
            ]}
          />
        </Form.Item>
        {queryParams === 'some' && (
          <Form.Item
            name="keepQueryParams"
            label={t('configForm.keepQueryParams')}
            extra={t('configForm.keepQueryParamsHelp')}
            rules={[
              {
                required: true,
                message: t('configForm.keepQueryParamsRequired')
              }
            ]}
          >
            {tags('page')}
          </Form.Item>
        )}
        <Form.Item
          name="startUrls"
          label={t('configForm.startUrls')}
          extra={t('configForm.startUrlsHelp')}
        >
          {tags('https://example.is/vorur?PageSize=100')}
        </Form.Item>
        <Form.Item
          name="sitemapUrls"
          label={t('configForm.sitemaps')}
          extra={t('configForm.sitemapsHelp')}
        >
          {tags('https://example.is/sitemap.xml')}
        </Form.Item>
        <Typography.Text strong>{t('configForm.productFeed')}</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          {t('configForm.productFeedHelp')}
        </Typography.Paragraph>
        <Form.Item
          name={['productFeed', 'url']}
          label={t('configForm.feedUrl')}
          extra={t('configForm.feedUrlHelp')}
        >
          <Input style={mono} allowClear />
        </Form.Item>
        <Form.Item
          name={['productFeed', 'items']}
          label={t('configForm.feedItems')}
          extra={t('configForm.feedItemsHelp')}
        >
          <Input style={mono} allowClear />
        </Form.Item>
        <Form.Item
          name={['productFeed', 'productUrl']}
          label={t('configForm.feedProductUrl')}
          extra={t('configForm.feedProductUrlHelp')}
        >
          <Input style={mono} allowClear />
        </Form.Item>
        <Form.Item
          name={['productFeed', 'pageCount']}
          label={t('configForm.feedPageCount')}
          extra={t('configForm.feedPageCountHelp')}
        >
          <Input style={mono} allowClear />
        </Form.Item>
        <Form.Item
          name={['productFeed', 'feedList', 'url']}
          label={t('configForm.feedListUrl')}
          extra={t('configForm.feedListUrlHelp')}
        >
          <Input style={mono} allowClear />
        </Form.Item>
        <Form.Item
          name={['productFeed', 'feedList', 'items']}
          label={t('configForm.feedListItems')}
          extra={t('configForm.feedListItemsHelp')}
        >
          <Input style={mono} allowClear />
        </Form.Item>
        {browser && (
          <>
            <Form.Item
              name="scrollPagesToBottom"
              label={t('configForm.scroll')}
              valuePropName="checked"
              extra={t('configForm.scrollHelp')}
            >
              <Switch />
            </Form.Item>
            <SelectorItem
              name={['menuClicker']}
              label={t('configForm.menuButton')}
              help={t('configForm.menuButtonHelp')}
            />
          </>
        )}
      </Card>

      {!browser && (
        <Card
          size="small"
          title={t('configForm.structuredData')}
          extra={
            <Form.Item name="useStructuredData" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          }
          style={{ display: show('structured') ? undefined : 'none' }}
        >
          <Typography.Paragraph type="secondary">
            {t('configForm.structuredDataHelp')}
          </Typography.Paragraph>
          {useStructuredData && (
            <>
              <Form.Item
                name={['structuredData', 'source']}
                label={t('configForm.source')}
                initialValue="jsonld"
              >
                <Radio.Group
                  options={[
                    { value: 'jsonld', label: t('configForm.jsonLd') },
                    {
                      value: 'nextdata',
                      label: t('configForm.nextData')
                    }
                  ]}
                />
              </Form.Item>
              <Typography.Text strong>
                {t('configForm.fieldOverrides')}
              </Typography.Text>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                {t('configForm.fieldOverridesHelp')}
              </Typography.Paragraph>
              <Form.List name={['structuredData', 'fields']}>
                {(fields, { add, remove }) => (
                  <Flex vertical gap={8}>
                    {fields.map((field) => (
                      <Flex key={field.key} gap={8} align="start" wrap>
                        <Form.Item name={[field.name, 'field']} noStyle>
                          <Select
                            style={{ width: 140 }}
                            placeholder={t('configForm.field')}
                            options={STRUCTURED_DATA_FIELDS.map((f) => ({
                              value: f,
                              label: f
                            }))}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'mode']}
                          noStyle
                          initialValue="skip"
                        >
                          <Select
                            style={{ width: 150 }}
                            options={[
                              {
                                value: 'skip',
                                label: t('configForm.skipUseCss')
                              },
                              {
                                value: 'paths',
                                label: t('configForm.readFrom')
                              }
                            ]}
                          />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate>
                          {() =>
                            form.getFieldValue([
                              'structuredData',
                              'fields',
                              field.name,
                              'mode'
                            ]) === 'paths' && (
                              <Form.Item name={[field.name, 'paths']} noStyle>
                                <Select
                                  mode="tags"
                                  open={false}
                                  suffixIcon={null}
                                  style={{ minWidth: 220, flex: 1 }}
                                  placeholder="offers.price"
                                />
                              </Form.Item>
                            )
                          }
                        </Form.Item>
                        <Button
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                          aria-label={t('configForm.removeOverride')}
                        />
                      </Flex>
                    ))}
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => add({ mode: 'skip' })}
                      style={{ alignSelf: 'start' }}
                    >
                      {t('configForm.addOverride')}
                    </Button>
                  </Flex>
                )}
              </Form.List>
              <Form.Item
                name={['structuredData', 'categorySplitter']}
                label={t('configForm.categorySeparator')}
                extra={t('configForm.categorySeparatorHelp')}
                style={{ marginTop: 16 }}
              >
                <Input style={{ ...mono, width: 120 }} />
              </Form.Item>
            </>
          )}
        </Card>
      )}

      <Card
        size="small"
        title={t('configForm.selectors')}
        style={{ display: show('selectors') ? undefined : 'none' }}
      >
        <Typography.Paragraph type="secondary">
          {t('configForm.selectorsHelp')}{' '}
          {browser
            ? t('configForm.selectorsHelpBrowser')
            : t('configForm.selectorsHelpHtml')}{' '}
          {t('configForm.selectorsHelpSkip')}
        </Typography.Paragraph>
        <SelectorItem
          name={['selectors', 'productPage']}
          label={t('configForm.productContainer')}
          help={t('configForm.productContainerHelp')}
          required
        />
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'name']}
              label={t('configForm.name')}
            />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'brand']}
              label={t('configForm.brand')}
            />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'listPrice']}
              label={t('configForm.price')}
              help={
                useStructuredData && !browser
                  ? t('configForm.priceOptional')
                  : t('configForm.priceHelp')
              }
            />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'oldPrice']}
              label={t('configForm.oldPrice')}
              help={t('configForm.oldPriceHelp')}
            />
          </Col>
        </Row>
        <Form.Item
          name="skuSource"
          label={t('configForm.sku')}
          initialValue="css"
        >
          <Radio.Group
            options={[
              { value: 'css', label: t('configForm.skuCss') },
              { value: 'url', label: t('configForm.skuUrl') },
              { value: 'attribute', label: t('configForm.skuAttribute') },
              { value: 'json', label: t('configForm.skuJson') }
            ]}
          />
        </Form.Item>
        {skuSource === 'url' ? (
          <Flex gap={8} wrap>
            <Form.Item
              name={['skuUrl', 'delimiter']}
              label={t('configForm.splitUrlAt')}
              rules={[{ required: true }]}
            >
              <Input style={{ ...mono, width: 120 }} placeholder="/" />
            </Form.Item>
            <Form.Item
              name={['skuUrl', 'index']}
              label={t('configForm.takePart')}
              initialValue="last"
              extra={t('configForm.takePartHelp')}
            >
              <Input style={{ ...mono, width: 120 }} />
            </Form.Item>
          </Flex>
        ) : skuSource === 'attribute' ? (
          <Flex gap={8} wrap>
            <Form.Item
              name={['skuAttribute', 'selector']}
              label={t('configForm.element')}
              rules={[{ required: true }]}
            >
              <Input
                style={{ ...mono, width: 260 }}
                placeholder='span[id^="sku-"]'
              />
            </Form.Item>
            <Form.Item
              name={['skuAttribute', 'attribute']}
              label={t('configForm.attribute')}
              rules={[{ required: true }]}
            >
              <Input style={{ ...mono, width: 160 }} placeholder="data-sku" />
            </Form.Item>
          </Flex>
        ) : skuSource === 'json' ? (
          <Flex gap={8} wrap>
            <Form.Item
              name={['skuJson', 'selector']}
              label={t('configForm.element')}
              rules={[{ required: true }]}
              extra={t('configForm.skuJsonHelp')}
            >
              <Input
                style={{ ...mono, width: 260 }}
                placeholder="#ProductJson-product-template"
              />
            </Form.Item>
            <Form.Item
              name={['skuJson', 'path']}
              label={t('configForm.jsonPath')}
              rules={[{ required: true }]}
              extra={t('configForm.jsonPathHelp')}
            >
              <Input style={{ ...mono, width: 160 }} placeholder="id" />
            </Form.Item>
          </Flex>
        ) : (
          <Form.Item
            name="skuCss"
            extra={
              useStructuredData && !browser
                ? t('configForm.skuOptional')
                : undefined
            }
          >
            <Input style={mono} allowClear />
          </Form.Item>
        )}
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'image']}
              label={t('configForm.image')}
            />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'imageAttribute']}
              label={t('configForm.imageAttribute')}
              help={t('configForm.imageAttributeHelp')}
            />
          </Col>
          <Col xs={24}>
            <SelectorItem
              name={['selectors', 'description']}
              label={t('configForm.description')}
            />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'inStock']}
              label={t('configForm.inStock')}
            />
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['selectors', 'inStockText']}
              label={t('configForm.inStockText')}
              extra={t('configForm.inStockTextHelp')}
            >
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'categories']}
              label={t('configForm.categories')}
              help={t('configForm.categoriesHelp')}
            />
          </Col>
          <Col xs={24} md={6}>
            <SelectorItem
              name={['selectors', 'categoryItemLocator']}
              label={t('configForm.categoryItem')}
              help={t('configForm.categoryItemHelp')}
            />
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name={['selectors', 'categorySplitter']}
              label={t('configForm.categorySeparator')}
            >
              <Input style={mono} allowClear />
            </Form.Item>
          </Col>
        </Row>
        {browser && (
          <Form.Item
            name={['selectors', 'clickers']}
            label={t('configForm.clickers')}
            extra={t('configForm.clickersHelp')}
          >
            {tags('button:has-text("Tæknilýsing")')}
          </Form.Item>
        )}
      </Card>

      <Card
        size="small"
        title={t('configForm.specifications')}
        extra={
          <Form.Item name="useAttributes" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        }
        style={{ display: show('attributes') ? undefined : 'none' }}
      >
        <Typography.Paragraph type="secondary">
          {t('configForm.specificationsHelp')}
        </Typography.Paragraph>
        {useAttributes && (
          <Row gutter={16}>
            <Col xs={24}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributesTable']}
                label={t('configForm.table')}
                required
              />
            </Col>
            <Col xs={24} md={12}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributeGroup']}
                label={t('configForm.group')}
                help={t('configForm.groupHelp')}
              />
            </Col>
            <Col xs={24} md={12}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributeGroupName']}
                label={t('configForm.groupName')}
              />
            </Col>
            <Col xs={24} md={8}>
              <SelectorItem
                name={['selectors', 'attributes', 'attribute']}
                label={t('configForm.row')}
                help={t('configForm.rowHelp')}
                required
              />
            </Col>
            <Col xs={24} md={8}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributeLabel']}
                label={t('configForm.rowName')}
                help={t('configForm.rowNameHelp')}
                required
              />
            </Col>
            <Col xs={24} md={8}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributeValue']}
                label={t('configForm.rowValue')}
                help={t('configForm.rowValueHelp')}
                required
              />
            </Col>
          </Row>
        )}
      </Card>

      <Card
        size="small"
        title={t('configForm.sanitizers')}
        style={{ display: show('sanitizers') ? undefined : 'none' }}
      >
        <Typography.Paragraph type="secondary">
          {t('configForm.sanitizersHelp')}
        </Typography.Paragraph>
        <Form.List name="skuSanitizers">
          {(fields, { add, remove }) => (
            <Flex vertical gap={8}>
              {fields.map((field) => (
                <Flex key={field.key} gap={8} align="center" wrap>
                  <Form.Item
                    name={[field.name, 'match']}
                    noStyle
                    rules={[{ required: true }]}
                  >
                    <Input
                      style={{ ...mono, width: 220 }}
                      placeholder={t('configForm.find')}
                    />
                  </Form.Item>
                  →
                  <Form.Item
                    name={[field.name, 'replace']}
                    noStyle
                    initialValue=""
                  >
                    <Input
                      style={{ ...mono, width: 220 }}
                      placeholder={t('configForm.replaceWith')}
                    />
                  </Form.Item>
                  <Button
                    icon={<DeleteOutlined />}
                    onClick={() => remove(field.name)}
                    aria-label={t('configForm.removeReplacement')}
                  />
                </Flex>
              ))}
              <Button
                icon={<PlusOutlined />}
                onClick={() => add({ match: '', replace: '' })}
                style={{ alignSelf: 'start' }}
              >
                {t('configForm.addReplacement')}
              </Button>
            </Flex>
          )}
        </Form.List>
      </Card>
    </Flex>
  );
}
