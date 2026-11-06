'use client';
import {
  CheckOutlined,
  ColumnHeightOutlined,
  FilterOutlined,
  PlusOutlined,
  LineChartOutlined,
  TableOutlined
} from '@ant-design/icons';
import {
  Affix,
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Flex,
  Grid,
  Image,
  Input,
  Row,
  Select,
  Table,
  Tag,
  Typography
} from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { MAX_COMPARED } from '../../utils/compareLimits';
import {
  SearchCondition,
  SearchProduct,
  SearchRequest,
  SearchResponse,
  SortKey,
  SORTS
} from '../../utils/searchFields';
import { useFormat } from '../I18n/I18nProvider';
import ProductDetails from '../ProductDetails/ProductDetails';
import ConditionEditor from './ConditionEditor';
import FacetList from './FacetList';

const PAGE_SIZE = 24;

// messages are shown when the api gives no error of its own
const postJson = async <T,>(
  url: string,
  body: string,
  messages: { tooMany: string; failed: string }
): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (response.status === 429) throw new Error(messages.tooMany);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? messages.failed);
  return json as T;
};

const parseJsonParam = <T,>(value: string | null, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

interface Selected {
  id: string;
  label: string;
}

// Conditions that are not filled in yet are not sent
const isComplete = (condition: SearchCondition) =>
  condition.field !== 'attribute' &&
  (condition.op === 'between' ||
    condition.op === 'is' ||
    !!condition.value?.trim());

export default function AdvancedSearch({
  userMenu
}: {
  // Rendered by the page, it reads the session on the server
  userMenu?: React.ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const { t } = useTranslation('site');
  const format = useFormat();
  const messages = {
    tooMany: t('requests.tooMany'),
    failed: t('requests.searchFailed')
  };

  const [q, setQ] = useState(params.get('q') ?? '');
  const [conditions, setConditions] = useState<SearchCondition[]>(
    parseJsonParam(params.get('c'), [])
  );
  const [attributeLabels, setAttributeLabels] = useState<
    Record<string, string>
  >(parseJsonParam(params.get('al'), {}));
  const [filters, setFilters] = useState<Record<string, string[]>>(
    parseJsonParam(params.get('f'), {})
  );
  const [sort, setSort] = useState<SortKey>(
    (params.get('sort') as SortKey) ?? 'relevance'
  );
  const [page, setPage] = useState(Number(params.get('page')) || 1);
  const [selected, setSelected] = useState<Selected[]>(
    (params.get('selectedProductIds') ?? '')
      .split(',')
      .filter(Boolean)
      .map((id) => ({ id, label: id }))
  );
  const [facetsOpen, setFacetsOpen] = useState(false);
  // The product shown in the drawer
  const [productId, setProductId] = useState(params.get('product'));

  // Labels for products that were selected in the url
  useEffect(() => {
    const unlabeled = selected.filter((s) => s.id === s.label).map((s) => s.id);
    if (unlabeled.length === 0) return;
    void postJson<
      { id: string; name: string | null; sku: string; storeName: string }[]
    >('/api/compare', JSON.stringify({ productIds: unlabeled }), messages).then(
      (products) =>
        setSelected((current) =>
          current.map((s) => {
            const product = products.find((p) => p.id === s.id);
            return product
              ? {
                  id: s.id,
                  label: `${product.name ?? product.sku} · ${product.storeName}`
                }
              : s;
          })
        )
    );
    // Only for the selection in the initial url
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const request: SearchRequest = useMemo(
    () => ({
      q,
      conditions: conditions.filter(isComplete),
      filters,
      sort,
      page,
      pageSize: PAGE_SIZE
    }),
    [q, conditions, filters, sort, page]
  );
  const [debouncedRequest, setDebouncedRequest] = useState(request);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedRequest(request), 350);
    return () => clearTimeout(timeout);
  }, [request]);

  // Keep the search in the url so it can be shared and survives a reload
  useEffect(() => {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (conditions.length) next.set('c', JSON.stringify(conditions));
    const usedLabels = Object.fromEntries(
      Object.entries(attributeLabels).filter(([key]) =>
        conditions.some((c) => c.field === key)
      )
    );
    if (Object.keys(usedLabels).length)
      next.set('al', JSON.stringify(usedLabels));
    if (Object.keys(filters).length) next.set('f', JSON.stringify(filters));
    if (sort !== 'relevance') next.set('sort', sort);
    if (page > 1) next.set('page', String(page));
    if (selected.length)
      next.set('selectedProductIds', selected.map((s) => s.id).join(','));
    if (productId) next.set('product', productId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    // The search is written when the debounced request changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedRequest,
    selected,
    attributeLabels,
    productId,
    router,
    pathname
  ]);

  // The facet labels are in the language of the request, so a new language
  // searches again
  const { data, error, isLoading } = useSWR<SearchResponse>(
    ['/api/search', JSON.stringify(debouncedRequest), format.language],
    ([url, body]: [string, string, string]) =>
      postJson<SearchResponse>(url, body, messages),
    { keepPreviousData: true }
  );

  const changeFilter = (key: string, values: string[]) => {
    const next = { ...filters };
    if (values.length) next[key] = values;
    else delete next[key];
    setFilters(next);
    setPage(1);
  };

  const facetLabels = new Map(
    (data?.facets ?? []).flatMap((facet) =>
      facet.values.map((value) => [
        `${facet.key}:${value.value}`,
        `${facet.label}: ${value.label}`
      ])
    )
  );
  const activeFilters = Object.entries(filters).flatMap(([key, values]) =>
    values.map((value) => ({
      key,
      value,
      label: facetLabels.get(`${key}:${value}`) ?? value
    }))
  );

  const selectedIds = selected.map((s) => s.id);
  const toggleSelected = (
    product: {
      id: string;
      name?: string | null;
      sku: string;
      storeName: string;
    },
    checked: boolean
  ) =>
    setSelected((current) =>
      checked
        ? [
            ...current.filter((s) => s.id !== product.id),
            {
              id: product.id,
              label: `${product.name ?? product.sku} · ${product.storeName}`
            }
          ]
        : current.filter((s) => s.id !== product.id)
    );

  const facets = data && (
    <FacetList facets={data.facets} filters={filters} onChange={changeFilter} />
  );

  return (
    <Flex
      vertical
      gap={16}
      style={{ padding: screens.md ? 24 : 12, paddingBottom: 96 }}
    >
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('advancedSearch.title')}
        </Typography.Title>
        <Flex gap={16} align="center" wrap>
          <Link href="/">{t('advancedSearch.backToPriceHistory')}</Link>
          {userMenu}
        </Flex>
      </Flex>

      <Card size="small">
        <Flex vertical gap={12}>
          <Input.Search
            size="large"
            allowClear
            placeholder={t('advancedSearch.placeholder')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <ConditionEditor
            conditions={conditions}
            attributeLabels={attributeLabels}
            onChange={(next, labels) => {
              setConditions(next);
              if (labels) setAttributeLabels(labels);
              setPage(1);
            }}
          />
        </Flex>
      </Card>

      {data && !data.exactMatching && conditions.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={t('advancedSearch.inexactMatching')}
        />
      )}
      {error && <Alert type="error" showIcon title={error.message} />}

      <Row gutter={[16, 16]}>
        {screens.lg && (
          <Col lg={7} xl={6}>
            {facets}
          </Col>
        )}
        <Col xs={24} lg={17} xl={18}>
          <Flex vertical gap={12}>
            <Flex justify="space-between" align="center" wrap gap={8}>
              <Typography.Text strong>
                {data
                  ? t('advancedSearch.found', {
                      count: data.total,
                      total: format.number(data.total)
                    })
                  : t('searching')}
              </Typography.Text>
              <Flex gap={8} align="center">
                {!screens.lg && (
                  <Button
                    icon={<FilterOutlined />}
                    onClick={() => setFacetsOpen(true)}
                  >
                    {activeFilters.length
                      ? t('advancedSearch.filtersCount', {
                          active: activeFilters.length
                        })
                      : t('advancedSearch.filters')}
                  </Button>
                )}
                <Select
                  value={sort}
                  onChange={(value) => {
                    setSort(value);
                    setPage(1);
                  }}
                  prefix={<ColumnHeightOutlined />}
                  options={(Object.keys(SORTS) as SortKey[]).map((value) => ({
                    value,
                    label: t(`searchFields.sorts.${value}`)
                  }))}
                  style={{ width: 180 }}
                />
              </Flex>
            </Flex>
            {activeFilters.length > 0 && (
              <Flex gap={4} wrap align="center">
                {activeFilters.map((filter) => (
                  <Tag
                    key={`${filter.key}:${filter.value}`}
                    closable
                    onClose={() =>
                      changeFilter(
                        filter.key,
                        filters[filter.key].filter((v) => v !== filter.value)
                      )
                    }
                  >
                    {filter.label}
                  </Tag>
                ))}
                <Typography.Link
                  onClick={() => {
                    setFilters({});
                    setPage(1);
                  }}
                >
                  {t('advancedSearch.clearFilters')}
                </Typography.Link>
              </Flex>
            )}
            <Table<SearchProduct>
              rowKey="id"
              size="small"
              loading={isLoading}
              dataSource={data?.products}
              scroll={{ x: true }}
              locale={{ emptyText: t('advancedSearch.empty') }}
              onRow={(product) => ({
                style: { cursor: 'pointer' },
                // The checkbox and the image preview do their own thing
                onClick: (event) => {
                  if (
                    !(event.target as HTMLElement).closest(
                      '.ant-table-selection-column, .ant-image'
                    )
                  )
                    setProductId(product.id);
                }
              })}
              rowSelection={{
                selectedRowKeys: selectedIds,
                preserveSelectedRowKeys: true,
                onSelect: (product, checked) =>
                  toggleSelected(product, checked),
                onSelectAll: (checked, _, changed) =>
                  changed.forEach((product) => toggleSelected(product, checked))
              }}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total: Math.min(data?.total ?? 0, PAGE_SIZE * 200),
                showSizeChanger: false,
                onChange: setPage
              }}
              columns={[
                {
                  title: '',
                  width: 56,
                  render: (_, product) =>
                    product.image ? (
                      <Image
                        src={product.image}
                        alt=""
                        width={40}
                        height={40}
                        style={{ objectFit: 'contain' }}
                        preview={{ mask: null }}
                      />
                    ) : null
                },
                {
                  title: t('advancedSearch.columns.product'),
                  render: (_, product) => (
                    <Flex vertical>
                      <Typography.Link>
                        {product.name ?? product.sku}
                      </Typography.Link>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        {[product.manufacturer, product.category]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography.Text>
                    </Flex>
                  )
                },
                {
                  title: t('advancedSearch.columns.store'),
                  dataIndex: 'storeName'
                },
                { title: t('advancedSearch.columns.sku'), dataIndex: 'sku' },
                {
                  title: t('advancedSearch.columns.price'),
                  align: 'right',
                  render: (_, product) => format.price(product.price)
                },
                {
                  title: t('advancedSearch.columns.inStock'),
                  render: (_, product) =>
                    product.inStock === undefined
                      ? '–'
                      : product.inStock
                        ? t('yes')
                        : t('no')
                },
                {
                  title: t('advancedSearch.columns.lastChange'),
                  render: (_, product) =>
                    product.lastChangeDate
                      ? dayjs(product.lastChangeDate)
                          .locale(format.language)
                          .format(t('dates.day'))
                      : '–'
                }
              ]}
            />
          </Flex>
        </Col>
      </Row>

      {!screens.lg && (
        <Drawer
          title={t('advancedSearch.filters')}
          open={facetsOpen}
          onClose={() => setFacetsOpen(false)}
          placement="left"
        >
          {facets}
        </Drawer>
      )}

      <Drawer
        title={t('advancedSearch.product')}
        open={productId !== null}
        onClose={() => setProductId(null)}
        size={screens.md ? 760 : '100%'}
        destroyOnHidden
      >
        {productId && (
          <ProductDetails
            id={productId}
            onOpenProduct={setProductId}
            actions={(product) => {
              const isSelected = selectedIds.includes(product.id);
              return (
                <Button
                  type={isSelected ? 'default' : 'primary'}
                  icon={isSelected ? <CheckOutlined /> : <PlusOutlined />}
                  onClick={() => toggleSelected(product, !isSelected)}
                >
                  {isSelected
                    ? t('advancedSearch.selected')
                    : t('advancedSearch.select')}
                </Button>
              );
            }}
          />
        )}
      </Drawer>

      {selected.length > 0 && (
        <Affix offsetBottom={0}>
          <Card
            size="small"
            style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}
          >
            <Flex justify="space-between" align="center" wrap gap={8}>
              <Flex
                gap={4}
                wrap
                align="center"
                style={{ flex: 1, minWidth: 0 }}
              >
                <Typography.Text strong>
                  {t('advancedSearch.selectedProducts')}
                </Typography.Text>
                {selected.map((s) => (
                  <Tag
                    key={s.id}
                    closable
                    onClose={() =>
                      setSelected(selected.filter((other) => other.id !== s.id))
                    }
                    style={{
                      maxWidth: 260,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {s.label}
                  </Tag>
                ))}
              </Flex>
              <Flex gap={8} wrap>
                <Button onClick={() => setSelected([])}>
                  {t('advancedSearch.clearSelection')}
                </Button>
                <Link
                  href={`/compare?selectedProductIds=${selectedIds.slice(0, MAX_COMPARED).join(',')}`}
                >
                  <Button
                    icon={<TableOutlined />}
                    disabled={selected.length < 2}
                  >
                    {selected.length > MAX_COMPARED
                      ? t('advancedSearch.compareFirst', { max: MAX_COMPARED })
                      : t('advancedSearch.compare')}
                  </Button>
                </Link>
                <Link href={`/?selectedProductIds=${selectedIds.join(',')}`}>
                  <Button type="primary" icon={<LineChartOutlined />}>
                    {t('advancedSearch.showPriceHistory')}
                  </Button>
                </Link>
              </Flex>
            </Flex>
          </Card>
        </Affix>
      )}
    </Flex>
  );
}
