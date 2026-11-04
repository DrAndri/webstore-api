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
import useSWR from 'swr';
import type { ProductDetails as Product } from '../../utils/product';
import PriceHistory from './PriceHistory';

const formatPrice = (price: number | null) =>
  price === null ? '–' : `${price.toLocaleString('is-IS')} kr.`;
const formatDay = (day: string | null) =>
  day ? dayjs(day).format('D. MMM YYYY') : '–';

const fetchProduct = async (url: string): Promise<Product> => {
  const response = await fetch(url);
  if (response.status === 429)
    throw new Error('Of margar fyrirspurnir, reyndu aftur eftir smá stund.');
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? 'Ekki tókst að sækja vöruna');
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
  if (product.price === null && product.salePrice === null)
    return (
      <Typography.Text type="secondary">
        {product.prices.length
          ? 'Ekki í síðustu skönnun verslunarinnar'
          : 'Ekkert verð skráð'}
      </Typography.Text>
    );
  return (
    <Flex gap={8} align="baseline" wrap>
      <Typography.Text strong style={{ fontSize: 24 }}>
        {formatPrice(product.salePrice ?? product.price)}
      </Typography.Text>
      {product.salePrice !== null && product.price !== null && (
        <>
          <Typography.Text delete type="secondary">
            {formatPrice(product.price)}
          </Typography.Text>
          <Tag color="volcano">Tilboð</Tag>
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
  const { data: product, error } = useSWR(`/api/products/${id}`, fetchProduct);
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
                {product.inStock ? 'Á lager' : 'Ekki á lager'}
              </Tag>
            )}
          </Flex>
          <CurrentPrice product={product} />
          <Flex gap={8} wrap>
            {product.url && (
              <a href={product.url} target="_blank" rel="noreferrer">
                <Button icon={<ExportOutlined />}>Skoða í verslun</Button>
              </a>
            )}
            <Link href={`/?selectedProductIds=${product.id}`}>
              <Button icon={<LineChartOutlined />}>Opna í verðsögu</Button>
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
            label: 'Lægsta verð',
            children:
              product.lowestPrice !== null
                ? `${formatPrice(product.lowestPrice)} (${formatDay(product.lowestPriceDate)})`
                : '–'
          },
          {
            key: 'highest',
            label: 'Hæsta verð',
            children: formatPrice(product.highestPrice)
          },
          { key: 'sku', label: 'Vörunúmer', children: product.sku },
          { key: 'ean', label: 'Strikamerki', children: product.ean ?? '–' },
          {
            key: 'manufacturer',
            label: 'Framleiðandi',
            children: product.manufacturer ?? '–'
          },
          {
            key: 'category',
            label: 'Flokkur',
            children: product.category ?? '–'
          },
          {
            key: 'firstSeen',
            label: 'Fyrst skráð',
            children: formatDay(product.firstSeenDate)
          },
          {
            key: 'lastSeen',
            label: 'Síðast séð',
            children: formatDay(product.lastSeenDate)
          },
          {
            key: 'lastChange',
            label: 'Síðast breytt',
            children: formatDay(product.lastChangeDate)
          }
        ]}
      />

      <Card size="small" title="Verðsaga">
        <PriceHistory prices={product.prices} salePrices={product.salePrices} />
      </Card>

      {product.description && (
        <Card size="small" title="Lýsing">
          <Typography.Paragraph
            ellipsis={{ rows: 6, expandable: 'collapsible' }}
            style={{ whiteSpace: 'pre-line', margin: 0 }}
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        </Card>
      )}

      {product.attributes.length > 0 && (
        <Card size="small" title="Eiginleikar">
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
