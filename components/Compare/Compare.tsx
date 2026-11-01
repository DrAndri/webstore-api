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
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { StoreConfig } from '../../types';
import type { ComparedProduct } from '../../utils/compare';
import { MAX_COMPARED } from '../../utils/compareLimits';
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

const formatPrice = (price: number | null) =>
  price === null ? null : `${price.toLocaleString('is-IS')} kr.`;

const fetchCompare = async (ids: string): Promise<ComparedProduct[]> => {
  const response = await fetch('/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds: ids.split(',') })
  });
  if (response.status === 429)
    throw new Error('Of margar fyrirspurnir, reyndu aftur eftir smá stund.');
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? 'Samanburðurinn mistókst');
  return json as ComparedProduct[];
};

const effectivePrice = (product: ComparedProduct) =>
  product.salePrice ?? product.price;

const buildRows = (products: ComparedProduct[]): Row[] => {
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
    simple('storeName', 'Verslun', (p) => p.storeName),
    {
      key: 'price',
      label: 'Verð',
      values: products.map((p) =>
        p.price === null ? null : (
          <Flex vertical key={p.id}>
            {p.salePrice !== null ? (
              <>
                <Typography.Text strong>
                  {formatPrice(p.salePrice)}
                </Typography.Text>
                <Typography.Text delete type="secondary">
                  {formatPrice(p.price)}
                </Typography.Text>
              </>
            ) : (
              <Typography.Text strong>{formatPrice(p.price)}</Typography.Text>
            )}
            {effectivePrice(p) === lowest && products.length > 1 && (
              <Tag color="success" style={{ alignSelf: 'start' }}>
                Lægst
              </Tag>
            )}
          </Flex>
        )
      ),
      compare: prices.map((p) => (p === null ? null : String(p)))
    },
    {
      key: 'lowestPrice',
      label: 'Lægsta verð frá upphafi',
      values: products.map((p) =>
        p.lowestPrice === null
          ? null
          : `${formatPrice(p.lowestPrice)} (${p.lowestPriceDate})`
      ),
      compare: products.map((p) =>
        p.lowestPrice === null ? null : String(p.lowestPrice)
      )
    },
    simple('inStock', 'Á lager', (p) =>
      p.inStock === null ? null : p.inStock ? 'Já' : 'Nei'
    ),
    simple('sku', 'Vörunúmer', (p) => p.sku),
    simple('ean', 'Strikamerki', (p) => p.ean),
    simple('manufacturer', 'Framleiðandi', (p) => p.manufacturer),
    simple('category', 'Flokkur', (p) => p.category),
    simple('firstSeenDate', 'Fyrst skráð', (p) => p.firstSeenDate),
    simple('lastChangeDate', 'Síðast breytt', (p) => p.lastChangeDate)
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
  const params = useSearchParams();
  const ids = (params.get('selectedProductIds') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, MAX_COMPARED);
  const { data, error, isLoading } = useSWR(
    ids.length ? ids.join(',') : null,
    fetchCompare
  );
  const [onlyDifferences, setOnlyDifferences] = useState(false);

  if (ids.length === 0)
    return (
      <Alert
        type="info"
        showIcon
        title="Veldu vörur í ítarlegu leitinni til að bera þær saman."
      />
    );
  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (isLoading || !data)
    return <Spin style={{ display: 'block', marginTop: 64 }} />;

  const rows = buildRows(data);
  const visibleRows = onlyDifferences ? rows.filter(differs) : rows;

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Flex gap={8} align="center">
          <Switch checked={onlyDifferences} onChange={setOnlyDifferences} />
          Sýna aðeins það sem er ólíkt
        </Flex>
        <Link href={`/?selectedProductIds=${ids.join(',')}`}>
          <Button icon={<LineChartOutlined />}>Opna í verðsögu</Button>
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
      <Card size="small" title="Verðsaga">
        <div style={{ height: 420 }}>
          <PriceChart stores={stores} />
        </div>
      </Card>
    </Flex>
  );
}
