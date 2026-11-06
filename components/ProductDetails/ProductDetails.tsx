'use client';
import { ExportOutlined, LineChartOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Flex,
  Image,
  Skeleton,
  Tag,
  Typography
} from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import type { ProductDetails as Product } from '../../utils/product';
import { useFormat } from '../I18n/I18nProvider';
import Description from './Description';
import PriceHistory from './PriceHistory';

// messages are shown when the api gives no error of its own
const fetchProduct = async (
  url: string,
  messages: { tooMany: string; failed: string }
): Promise<Product> => {
  const response = await fetch(url);
  if (response.status === 429) throw new Error(messages.tooMany);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? messages.failed);
  return json as Product;
};

// Attributes under the name of their group, the ones without a group first
const byGroup = (attributes: Product['attributes']) => {
  const groups = new Map<string, Product['attributes']>();
  for (const attribute of attributes) {
    const group = attribute.group ?? '';
    groups.set(group, [...(groups.get(group) ?? []), attribute]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'is')
  );
};

function CurrentPrice({ product }: { product: Product }) {
  const { t } = useTranslation('site');
  const format = useFormat();
  if (product.price === null && product.salePrice === null)
    return (
      <Typography.Text type="secondary">
        {product.prices.length
          ? t('productDetails.notInLastScan')
          : t('productDetails.noPrice')}
      </Typography.Text>
    );
  return (
    <Flex gap={8} align="baseline" wrap>
      <Typography.Text strong style={{ fontSize: 24 }}>
        {format.price(product.salePrice ?? product.price)}
      </Typography.Text>
      {product.salePrice !== null && product.price !== null && (
        <>
          <Typography.Text delete type="secondary">
            {format.price(product.price)}
          </Typography.Text>
          <Tag color="volcano">{t('productDetails.sale')}</Tag>
        </>
      )}
    </Flex>
  );
}

// Everything known about a product of a store, with its price history.
// actions are more buttons for the product.
export default function ProductDetails({
  id,
  actions
}: {
  id: string;
  actions?: (product: Product) => React.ReactNode;
}) {
  const { t } = useTranslation('site');
  const format = useFormat();
  const formatDay = (day: string | null) =>
    day ? dayjs(day).locale(format.language).format(t('dates.day')) : '–';
  const { data: product, error } = useSWR(`/api/products/${id}`, (url) =>
    fetchProduct(url, {
      tooMany: t('requests.tooMany'),
      failed: t('requests.productFailed')
    })
  );
  // Images of products that are gone from the store often are too
  const [brokenImage, setBrokenImage] = useState<string>();

  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (!product) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Flex vertical gap={16}>
      <Flex gap={16} wrap>
        {product.image && product.image !== brokenImage && (
          <Image
            src={product.image}
            alt=""
            width={160}
            height={160}
            style={{ objectFit: 'contain' }}
            onError={() => setBrokenImage(product.image!)}
          />
        )}
        <Flex vertical gap={8} style={{ flex: 1, minWidth: 220 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {product.name ?? product.sku}
          </Typography.Title>
          <Flex gap={4} wrap>
            <Tag>{product.storeName}</Tag>
            {product.inStock !== null && (
              <Tag color={product.inStock ? 'success' : 'default'}>
                {product.inStock
                  ? t('productDetails.inStock')
                  : t('productDetails.outOfStock')}
              </Tag>
            )}
          </Flex>
          <CurrentPrice product={product} />
          <Flex gap={8} wrap>
            {product.url && (
              <a href={product.url} target="_blank" rel="noreferrer">
                <Button icon={<ExportOutlined />}>
                  {t('productDetails.viewInStore')}
                </Button>
              </a>
            )}
            <Link href={`/?selectedProductIds=${product.id}`}>
              <Button icon={<LineChartOutlined />}>
                {t('productDetails.openPriceHistory')}
              </Button>
            </Link>
            {actions?.(product)}
          </Flex>
        </Flex>
      </Flex>

      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, sm: 2 }}
        items={[
          {
            key: 'lowest',
            label: t('productDetails.lowestPrice'),
            children:
              product.lowestPrice !== null
                ? `${format.price(product.lowestPrice)} (${formatDay(product.lowestPriceDate)})`
                : '–'
          },
          {
            key: 'highest',
            label: t('productDetails.highestPrice'),
            children: format.price(product.highestPrice)
          },
          { key: 'sku', label: t('productDetails.sku'), children: product.sku },
          {
            key: 'ean',
            label: t('productDetails.ean'),
            children: product.ean ?? '–'
          },
          {
            key: 'manufacturer',
            label: t('productDetails.manufacturer'),
            children: product.manufacturer ?? '–'
          },
          {
            key: 'category',
            label: t('productDetails.category'),
            children: product.category ?? '–'
          },
          {
            key: 'firstSeen',
            label: t('productDetails.firstSeen'),
            children: formatDay(product.firstSeenDate)
          },
          {
            key: 'lastSeen',
            label: t('productDetails.lastSeen'),
            children: formatDay(product.lastSeenDate)
          },
          {
            key: 'lastChange',
            label: t('productDetails.lastChange'),
            children: formatDay(product.lastChangeDate)
          }
        ]}
      />

      <Card size="small" title={t('productDetails.priceHistory')}>
        <PriceHistory prices={product.prices} salePrices={product.salePrices} />
      </Card>

      {product.description && (
        <Card size="small" title={t('productDetails.description')}>
          <Description html={product.description} />
        </Card>
      )}

      {product.attributes.length > 0 && (
        <Card size="small" title={t('productDetails.attributes')}>
          <Flex vertical gap={12}>
            {byGroup(product.attributes).map(([group, attributes]) => (
              <Descriptions
                key={group}
                size="small"
                bordered
                column={1}
                title={group || undefined}
                items={attributes.map((attribute, index) => ({
                  key: `${attribute.name}${index}`,
                  label: attribute.name,
                  children: attribute.value
                }))}
              />
            ))}
          </Flex>
        </Card>
      )}
    </Flex>
  );
}
