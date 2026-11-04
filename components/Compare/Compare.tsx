'use client';
import { LineChartOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Flex,
  Image,
  Spin,
  Switch,
  Table,
  Tag,
  Typography
} from 'antd';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import type { Format } from '../../i18n/format';
import { StoreConfig } from '../../types';
import type { ComparedProduct } from '../../utils/compare';
import { MAX_COMPARED } from '../../utils/compareLimits';
import { useFormat } from '../I18n/I18nProvider';
import PriceChart from '../PriceChart/PriceChart';

interface Row {
  key: string;
  label: string;
  group?: string;
  values: (React.ReactNode | null)[];
  // Plain values for finding the rows that differ
  compare: (string | null)[];
  best?: number;
}

// messages are shown when the api gives no error of its own
const fetchCompare = async (
  ids: string,
  messages: { tooMany: string; failed: string }
): Promise<ComparedProduct[]> => {
  const response = await fetch('/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds: ids.split(',') })
  });
  if (response.status === 429) throw new Error(messages.tooMany);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? messages.failed);
  return json as ComparedProduct[];
};

const effectivePrice = (product: ComparedProduct) =>
  product.salePrice ?? product.price;

const buildRows = (
  products: ComparedProduct[],
  t: TFunction<'site'>,
  format: Format
): Row[] => {
  const prices = products.map(effectivePrice);
  const lowest = Math.min(...prices.filter((p): p is number => p !== null));
  const simple = (
    key: string,
    label: string,
    value: (product: ComparedProduct) => string | null
  ): Row => {
    const values = products.map(value);
    return { key, label, values, compare: values };
  };

  const rows: Row[] = [
    simple('storeName', t('compare.rows.storeName'), (p) => p.storeName),
    {
      key: 'price',
      label: t('compare.rows.price'),
      values: products.map((p) =>
        p.price === null ? null : (
          <Flex vertical key={p.id}>
            {p.salePrice !== null ? (
              <>
                <Typography.Text strong>
                  {format.price(p.salePrice)}
                </Typography.Text>
                <Typography.Text delete type="secondary">
                  {format.price(p.price)}
                </Typography.Text>
              </>
            ) : (
              <Typography.Text strong>{format.price(p.price)}</Typography.Text>
            )}
            {effectivePrice(p) === lowest && products.length > 1 && (
              <Tag color="success" style={{ alignSelf: 'start' }}>
                {t('compare.lowest')}
              </Tag>
            )}
          </Flex>
        )
      ),
      compare: prices.map((p) => (p === null ? null : String(p)))
    },
    {
      key: 'lowestPrice',
      label: t('compare.rows.lowestPrice'),
      values: products.map((p) =>
        p.lowestPrice === null
          ? null
          : `${format.price(p.lowestPrice)} (${p.lowestPriceDate})`
      ),
      compare: products.map((p) =>
        p.lowestPrice === null ? null : String(p.lowestPrice)
      )
    },
    simple('inStock', t('compare.rows.inStock'), (p) =>
      p.inStock === null ? null : p.inStock ? t('yes') : t('no')
    ),
    simple('sku', t('compare.rows.sku'), (p) => p.sku),
    simple('ean', t('compare.rows.ean'), (p) => p.ean),
    simple(
      'manufacturer',
      t('compare.rows.manufacturer'),
      (p) => p.manufacturer
    ),
    simple('category', t('compare.rows.category'), (p) => p.category),
    simple(
      'firstSeenDate',
      t('compare.rows.firstSeenDate'),
      (p) => p.firstSeenDate
    ),
    simple(
      'lastChangeDate',
      t('compare.rows.lastChangeDate'),
      (p) => p.lastChangeDate
    )
  ];

  // Stores name the same attribute differently, so they are matched by name
  const attributeKeys = new Map<string, { label: string; group?: string }>();
  for (const product of products)
    for (const attribute of product.attributes) {
      const key = attribute.name.trim().toLocaleLowerCase('is');
      if (!attributeKeys.has(key))
        attributeKeys.set(key, {
          label: attribute.name,
          group: attribute.group ?? undefined
        });
    }
  for (const [key, { label, group }] of attributeKeys) {
    const values = products.map(
      (product) =>
        product.attributes
          .filter((a) => a.name.trim().toLocaleLowerCase('is') === key)
          .map((a) => a.value)
          .join(', ') || null
    );
    rows.push({ key: `attr:${key}`, label, group, values, compare: values });
  }
  return rows;
};

const differs = (row: Row) =>
  new Set(row.compare.map((value) => value?.toLocaleLowerCase('is') ?? ''))
    .size > 1;

export default function Compare({ stores }: { stores: StoreConfig[] }) {
  const { t } = useTranslation('site');
  const format = useFormat();
  const params = useSearchParams();
  const ids = (params.get('selectedProductIds') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, MAX_COMPARED);
  const { data, error, isLoading } = useSWR(
    ids.length ? ids.join(',') : null,
    (key: string) =>
      fetchCompare(key, {
        tooMany: t('requests.tooMany'),
        failed: t('requests.compareFailed')
      })
  );
  const [onlyDifferences, setOnlyDifferences] = useState(false);

  if (ids.length === 0)
    return <Alert type="info" showIcon title={t('compare.empty')} />;
  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (isLoading || !data)
    return <Spin style={{ display: 'block', marginTop: 64 }} />;

  const rows = buildRows(data, t, format);
  const visibleRows = onlyDifferences ? rows.filter(differs) : rows;

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Flex gap={8} align="center">
          <Switch checked={onlyDifferences} onChange={setOnlyDifferences} />
          {t('compare.onlyDifferences')}
        </Flex>
        <Link href={`/?selectedProductIds=${ids.join(',')}`}>
          <Button icon={<LineChartOutlined />}>
            {t('compare.openPriceHistory')}
          </Button>
        </Link>
      </Flex>
      <Table<Row>
        rowKey="key"
        size="small"
        pagination={false}
        bordered
        scroll={{ x: 'max-content' }}
        dataSource={visibleRows}
        rowClassName={(row) => (differs(row) ? 'compare-differs' : '')}
        columns={[
          {
            title: '',
            fixed: 'left',
            width: 180,
            render: (_, row) => (
              <Flex vertical>
                <Typography.Text strong>{row.label}</Typography.Text>
                {row.group && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {row.group}
                  </Typography.Text>
                )}
              </Flex>
            )
          },
          ...data.map((product, index) => ({
            key: product.id,
            width: 220,
            title: (
              <Flex vertical gap={8}>
                {product.image && (
                  <Image
                    src={product.image}
                    alt=""
                    height={96}
                    style={{ objectFit: 'contain' }}
                  />
                )}
                <Typography.Text strong>
                  {product.name ?? product.sku}
                </Typography.Text>
              </Flex>
            ),
            render: (_: unknown, row: Row) =>
              row.values[index] ?? (
                <Typography.Text type="secondary">–</Typography.Text>
              )
          }))
        ]}
      />
      <Card size="small" title={t('compare.priceHistory')}>
        <div style={{ height: 420 }}>
          <PriceChart stores={stores} />
        </div>
      </Card>
    </Flex>
  );
}
