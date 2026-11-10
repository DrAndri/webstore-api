'use client';
import { PictureOutlined } from '@ant-design/icons';
import {
  Card,
  Checkbox,
  Col,
  Empty,
  Flex,
  Image,
  Pagination,
  PaginationProps,
  Row,
  Spin,
  theme,
  Typography
} from 'antd';
import { useTranslation } from 'react-i18next';
import { SearchProduct } from '../../utils/searchFields';
import { useFormat } from '../I18n/I18nProvider';

const IMAGE_HEIGHT = 180;

// The search results as a grid of product cards, the alternative to the table
export default function ProductCards({
  products,
  loading,
  selectedIds,
  onToggleSelected,
  onOpen,
  pagination
}: {
  products?: SearchProduct[];
  loading: boolean;
  selectedIds: string[];
  onToggleSelected: (product: SearchProduct, checked: boolean) => void;
  onOpen: (id: string) => void;
  pagination: PaginationProps;
}) {
  const { t } = useTranslation('site');
  const format = useFormat();
  const { token } = theme.useToken();

  if (!loading && !products?.length)
    return <Empty description={t('advancedSearch.empty')} />;

  return (
    <Spin spinning={loading}>
      <Flex vertical gap={16}>
        <Row gutter={[12, 12]}>
          {(products ?? []).map((product) => {
            const isSelected = selectedIds.includes(product.id);
            return (
              <Col key={product.id} xs={12} sm={8} md={6} xxl={4}>
                <Card
                  hoverable
                  size="small"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(product.id)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      event.key === 'Enter'
                    )
                      onOpen(product.id);
                  }}
                  style={{
                    height: '100%',
                    borderColor: isSelected ? token.colorPrimary : undefined
                  }}
                  styles={{ body: { height: '100%' } }}
                  cover={
                    <Flex
                      align="center"
                      justify="center"
                      style={{ height: IMAGE_HEIGHT, padding: 12 }}
                    >
                      {product.image ? (
                        <Image
                          src={product.image}
                          alt=""
                          height={IMAGE_HEIGHT - 24}
                          style={{
                            maxWidth: '100%',
                            objectFit: 'contain'
                          }}
                          preview={false}
                        />
                      ) : (
                        <PictureOutlined
                          style={{
                            fontSize: 48,
                            color: token.colorTextQuaternary
                          }}
                        />
                      )}
                    </Flex>
                  }
                >
                  <Flex vertical gap={4} style={{ height: '100%' }}>
                    <Typography.Paragraph
                      strong
                      ellipsis={{
                        rows: 2,
                        tooltip: product.name ?? product.sku
                      }}
                      style={{ margin: 0 }}
                    >
                      {product.name ?? product.sku}
                    </Typography.Paragraph>
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 12 }}
                      ellipsis
                    >
                      {t('advancedSearch.columns.sku')}: {product.sku} ·{' '}
                      {product.storeName}
                    </Typography.Text>
                    <Flex
                      justify="space-between"
                      align="center"
                      wrap
                      gap={4}
                      style={{ marginTop: 'auto', paddingTop: 4 }}
                    >
                      <Typography.Text strong style={{ fontSize: 16 }}>
                        {format.price(product.price)}
                      </Typography.Text>
                      {/* Selecting does not open the product */}
                      <span onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={(event) =>
                            onToggleSelected(product, event.target.checked)
                          }
                        >
                          {t('advancedSearch.select')}
                        </Checkbox>
                      </span>
                    </Flex>
                  </Flex>
                </Card>
              </Col>
            );
          })}
        </Row>
        <Flex justify="flex-end">
          <Pagination {...pagination} />
        </Flex>
      </Flex>
    </Spin>
  );
}
