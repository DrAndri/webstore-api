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
  return (
    <Form.Item
      name={name}
      label={label}
      extra={help}
      rules={
        required
          ? [{ required: true, message: `${label} is required` }]
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
  const type = Form.useWatch('type', form);
  const skuSource = Form.useWatch('skuSource', form);
  const useStructuredData = Form.useWatch('useStructuredData', form);
  const useAttributes = Form.useWatch('useAttributes', form);
  const browser = type === 'crawler';
  const show = (section: ConfigSection) =>
    !sections || sections.includes(section);

  return (
    <Flex vertical gap={16}>
      <Card
        size="small"
        title="Store website"
        style={{ display: show('basics') ? undefined : 'none' }}
      >
        <Form.Item
          name="startUrl"
          label="Start url"
          extra="The crawl starts here and only follows links on this site."
          rules={[
            { required: true, message: 'Enter the url of the store' },
            {
              type: 'url',
              message: 'Enter a full url, e.g. https://example.is'
            }
          ]}
        >
          <Input placeholder="https://example.is" />
        </Form.Item>
        <Form.Item name="type" label="How pages are loaded">
          <Radio.Group
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            options={[
              {
                value: 'httpcrawler',
                label: (
                  <span>
                    Plain HTML{' '}
                    <Typography.Text type="secondary">
                      fast, use this when the product data is in the page source
                    </Typography.Text>
                  </span>
                )
              },
              {
                value: 'crawler',
                label: (
                  <span>
                    Browser{' '}
                    <Typography.Text type="secondary">
                      slow, for stores that render products with JavaScript
                    </Typography.Text>
                  </span>
                )
              }
            ]}
          />
        </Form.Item>
        <Form.Item
          name="productPageIdentifier"
          label="Product page identifier"
          extra={
            <>
              Text that is only in the source of product pages. Most stores have
              JSON-LD, try{' '}
              <Typography.Link
                onClick={() =>
                  form.setFieldValue(
                    'productPageIdentifier',
                    '"@type":"Product"'
                  )
                }
              >
                <code>&quot;@type&quot;:&quot;Product&quot;</code>
              </Typography.Link>{' '}
              or{' '}
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
              .
            </>
          }
          rules={[
            {
              required: true,
              message: 'Enter text that identifies product pages'
            }
          ]}
        >
          <Input style={mono} />
        </Form.Item>
      </Card>

      <Card
        size="small"
        title="Which pages are crawled"
        style={{ display: show('crawling') ? undefined : 'none' }}
      >
        <Form.Item
          name="urlWhitelist"
          label="Only follow paths starting with"
          extra="Leave empty to follow every link on the site. Type a path and press enter, e.g. /vorur"
        >
          {tags('/vorur')}
        </Form.Item>
        <Form.Item
          name="urlBlacklist"
          label="Never follow paths starting with"
          extra="Pages that are not products, e.g. /blogg, /um-okkur, /karfa"
        >
          {tags('/blogg')}
        </Form.Item>
        {!browser && (
          <Form.Item
            name="sitemapUrls"
            label="Sitemaps"
            extra="Product urls in these sitemaps are crawled too. Useful when category pages do not link to every product."
          >
            {tags('https://example.is/sitemap.xml')}
          </Form.Item>
        )}
        {browser && (
          <>
            <Form.Item
              name="scrollPagesToBottom"
              label="Scroll to the bottom of pages"
              valuePropName="checked"
              extra="For stores that load more products while scrolling."
            >
              <Switch />
            </Form.Item>
            <SelectorItem
              name={['menuClicker']}
              label="Menu button"
              help="Clicked on the start page to open a menu that holds the category links."
            />
          </>
        )}
      </Card>

      {!browser && (
        <Card
          size="small"
          title="Structured data"
          extra={
            <Form.Item name="useStructuredData" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          }
          style={{ display: show('structured') ? undefined : 'none' }}
        >
          <Typography.Paragraph type="secondary">
            Reads the product from data embedded in the page, which changes less
            often than the page layout. CSS selectors below fill in what is
            missing.
          </Typography.Paragraph>
          {useStructuredData && (
            <>
              <Form.Item
                name={['structuredData', 'source']}
                label="Source"
                initialValue="jsonld"
              >
                <Radio.Group
                  options={[
                    { value: 'jsonld', label: 'JSON-LD (schema.org Product)' },
                    {
                      value: 'nextdata',
                      label: 'Next.js page data (__NEXT_DATA__)'
                    }
                  ]}
                />
              </Form.Item>
              <Typography.Text strong>Field overrides</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                Read a field from other dot paths (relative to the Product for
                JSON-LD, to the root for Next.js data), or skip it to use the
                CSS selector instead.
              </Typography.Paragraph>
              <Form.List name={['structuredData', 'fields']}>
                {(fields, { add, remove }) => (
                  <Flex vertical gap={8}>
                    {fields.map((field) => (
                      <Flex key={field.key} gap={8} align="start" wrap>
                        <Form.Item name={[field.name, 'field']} noStyle>
                          <Select
                            style={{ width: 140 }}
                            placeholder="Field"
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
                              { value: 'skip', label: 'Skip, use CSS' },
                              { value: 'paths', label: 'Read from' }
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
                          aria-label="Remove override"
                        />
                      </Flex>
                    ))}
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => add({ mode: 'skip' })}
                      style={{ alignSelf: 'start' }}
                    >
                      Add override
                    </Button>
                  </Flex>
                )}
              </Form.List>
              <Form.Item
                name={['structuredData', 'categorySplitter']}
                label="Category separator"
                extra='When categories are one string, e.g. "|" for Snyrtivara|Förðun|Varir'
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
        title="Product page selectors"
        style={{ display: show('selectors') ? undefined : 'none' }}
      >
        <Typography.Paragraph type="secondary">
          CSS selectors relative to the product container.
          {browser
            ? ' Playwright selectors such as :has-text("kr.") work too.'
            : ' Cheerio selectors such as :contains("kr.") work too.'}{' '}
          Leave a field empty to skip it.
        </Typography.Paragraph>
        <SelectorItem
          name={['selectors', 'productPage']}
          label="Product container"
          help="The element holding the product, e.g. main or #product"
          required
        />
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <SelectorItem name={['selectors', 'name']} label="Name" />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem name={['selectors', 'brand']} label="Brand" />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'listPrice']}
              label="Price"
              help={
                useStructuredData && !browser
                  ? 'Optional when structured data has the price'
                  : 'The current price'
              }
            />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'oldPrice']}
              label="Price before sale"
              help="Only shown when the product is on sale"
            />
          </Col>
        </Row>
        <Form.Item name="skuSource" label="SKU" initialValue="css">
          <Radio.Group
            options={[
              { value: 'css', label: 'CSS selector' },
              { value: 'url', label: 'Part of the url' },
              { value: 'attribute', label: 'Element attribute' }
            ]}
          />
        </Form.Item>
        {skuSource === 'url' ? (
          <Flex gap={8} wrap>
            <Form.Item
              name={['skuUrl', 'delimiter']}
              label="Split the url at"
              rules={[{ required: true }]}
            >
              <Input style={{ ...mono, width: 120 }} placeholder="/" />
            </Form.Item>
            <Form.Item
              name={['skuUrl', 'index']}
              label="Take part"
              initialValue="last"
              extra="first, last or a number"
            >
              <Input style={{ ...mono, width: 120 }} />
            </Form.Item>
          </Flex>
        ) : skuSource === 'attribute' ? (
          <Flex gap={8} wrap>
            <Form.Item
              name={['skuAttribute', 'selector']}
              label="Element"
              rules={[{ required: true }]}
            >
              <Input
                style={{ ...mono, width: 260 }}
                placeholder='span[id^="sku-"]'
              />
            </Form.Item>
            <Form.Item
              name={['skuAttribute', 'attribute']}
              label="Attribute"
              rules={[{ required: true }]}
            >
              <Input style={{ ...mono, width: 160 }} placeholder="data-sku" />
            </Form.Item>
          </Flex>
        ) : (
          <Form.Item
            name="skuCss"
            extra={
              useStructuredData && !browser
                ? 'Optional when structured data has the sku'
                : undefined
            }
          >
            <Input style={mono} allowClear />
          </Form.Item>
        )}
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <SelectorItem name={['selectors', 'image']} label="Image" />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'imageAttribute']}
              label="Image url attribute"
              help="Defaults to src, e.g. data-src for lazy loaded images"
            />
          </Col>
          <Col xs={24}>
            <SelectorItem
              name={['selectors', 'description']}
              label="Description"
            />
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'inStock']}
              label="Stock status"
            />
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['selectors', 'inStockText']}
              label="In stock when it contains"
              extra="Text of the stock status that means the product is in stock"
            >
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <SelectorItem
              name={['selectors', 'categories']}
              label="Categories"
              help="Usually the breadcrumb"
            />
          </Col>
          <Col xs={24} md={6}>
            <SelectorItem
              name={['selectors', 'categoryItemLocator']}
              label="Category item"
              help="Each item in it, e.g. li"
            />
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name={['selectors', 'categorySplitter']}
              label="Category separator"
            >
              <Input style={mono} allowClear />
            </Form.Item>
          </Col>
        </Row>
        {browser && (
          <Form.Item
            name={['selectors', 'clickers']}
            label="Click before scraping"
            extra="Selectors of tabs or buttons that reveal the description or specifications"
          >
            {tags('button:has-text("Tæknilýsing")')}
          </Form.Item>
        )}
      </Card>

      <Card
        size="small"
        title="Specifications"
        extra={
          <Form.Item name="useAttributes" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        }
        style={{ display: show('attributes') ? undefined : 'none' }}
      >
        <Typography.Paragraph type="secondary">
          The table of product attributes, e.g. size, weight and color.
        </Typography.Paragraph>
        {useAttributes && (
          <Row gutter={16}>
            <Col xs={24}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributesTable']}
                label="Table"
                required
              />
            </Col>
            <Col xs={24} md={12}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributeGroup']}
                label="Group"
                help="Optional, when the table has sections"
              />
            </Col>
            <Col xs={24} md={12}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributeGroupName']}
                label="Group name"
              />
            </Col>
            <Col xs={24} md={8}>
              <SelectorItem
                name={['selectors', 'attributes', 'attribute']}
                label="Row"
                help="e.g. tr"
                required
              />
            </Col>
            <Col xs={24} md={8}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributeLabel']}
                label="Name in row"
                help="e.g. td:nth-child(1)"
                required
              />
            </Col>
            <Col xs={24} md={8}>
              <SelectorItem
                name={['selectors', 'attributes', 'attributeValue']}
                label="Value in row"
                help="e.g. td:nth-child(2)"
                required
              />
            </Col>
          </Row>
        )}
      </Card>

      <Card
        size="small"
        title="Clean up the SKU"
        style={{ display: show('sanitizers') ? undefined : 'none' }}
      >
        <Typography.Paragraph type="secondary">
          Replacements applied to the SKU in order, e.g. remove a
          &quot;Vörunúmer:&quot; prefix.
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
                    <Input style={{ ...mono, width: 220 }} placeholder="Find" />
                  </Form.Item>
                  →
                  <Form.Item
                    name={[field.name, 'replace']}
                    noStyle
                    initialValue=""
                  >
                    <Input
                      style={{ ...mono, width: 220 }}
                      placeholder="Replace with (empty removes)"
                    />
                  </Form.Item>
                  <Button
                    icon={<DeleteOutlined />}
                    onClick={() => remove(field.name)}
                    aria-label="Remove replacement"
                  />
                </Flex>
              ))}
              <Button
                icon={<PlusOutlined />}
                onClick={() => add({ match: '', replace: '' })}
                style={{ alignSelf: 'start' }}
              >
                Add replacement
              </Button>
            </Flex>
          )}
        </Form.List>
      </Card>
    </Flex>
  );
}
