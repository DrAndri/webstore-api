'use client';
import { Button, Checkbox, Collapse, Flex, Input, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../I18n/I18nProvider';
import { Facet } from '../../utils/searchFields';

const COLLAPSED_COUNT = 8;
// Facets shown before "show more", facets with a selection are always shown
const COLLAPSED_FACETS = 6;
// The height of an expanded value list, longer lists scroll
const EXPANDED_HEIGHT = 320;

function FacetValues({
  facet,
  selected,
  onChange
}: {
  facet: Facet;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const { t } = useTranslation('site');
  const format = useFormat();
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const needle = filter.toLocaleLowerCase('is');
  const values = facet.values.filter(
    (value) => !needle || value.label.toLocaleLowerCase('is').includes(needle)
  );
  // Selected values stay visible when the list is collapsed
  const visible = expanded
    ? values
    : values.filter(
        (value, index) =>
          index < COLLAPSED_COUNT || selected.includes(value.value)
      );

  return (
    <Flex vertical gap={4}>
      {facet.values.length > 15 && (
        <Input
          size="small"
          placeholder={t('facetList.filter')}
          allowClear
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <Flex
        vertical
        gap={4}
        style={
          expanded ? { maxHeight: EXPANDED_HEIGHT, overflowY: 'auto' } : {}
        }
      >
        {visible.map((value) => (
          <Checkbox
            key={value.value}
            checked={selected.includes(value.value)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, value.value]
                  : selected.filter((v) => v !== value.value)
              )
            }
          >
            <Flex justify="space-between" gap={8} style={{ width: '100%' }}>
              <span>{value.label}</span>
              <Typography.Text type="secondary">
                {format.number(value.count)}
              </Typography.Text>
            </Flex>
          </Checkbox>
        ))}
      </Flex>
      {values.length > COLLAPSED_COUNT && (
        <Typography.Link onClick={() => setExpanded(!expanded)}>
          {expanded
            ? t('facetList.showFewer')
            : t('facetList.showMore', {
                hidden: values.length - COLLAPSED_COUNT
              })}
        </Typography.Link>
      )}
    </Flex>
  );
}

// Filters with the number of products each value would give. "Show more
// filters" first shows the facets that are already loaded, then asks for more
// with onLoadMore while moreFacets says Solr has more.
export default function FacetList({
  facets,
  filters,
  onChange,
  moreFacets,
  loadingMore,
  onLoadMore
}: {
  facets: Facet[];
  filters: Record<string, string[]>;
  onChange: (key: string, values: string[]) => void;
  moreFacets: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation('site');
  // Facets the user opened or closed, the rest follow the default: open unless
  // it is an attribute without a selection
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const visible = showAll
    ? facets
    : facets.filter(
        (facet, index) =>
          index < COLLAPSED_FACETS || !!filters[facet.key]?.length
      );
  const hidden = facets.length - visible.length;
  const isOpenByDefault = (facet: Facet) =>
    !facet.key.startsWith('attr_') || !!filters[facet.key]?.length;
  const activeKeys = facets
    .filter((facet) => isOpenByDefault(facet) !== toggled.has(facet.key))
    .map((facet) => facet.key);
  return (
    <Flex vertical gap={8}>
      <Collapse
        size="small"
        activeKey={activeKeys}
        onChange={(keys) => {
          const open = new Set(([] as string[]).concat(keys));
          // Facets behind "show more" are not in keys and keep their state
          setToggled(
            new Set(
              facets
                .filter((facet) =>
                  visible.includes(facet)
                    ? open.has(facet.key) !== isOpenByDefault(facet)
                    : toggled.has(facet.key)
                )
                .map((facet) => facet.key)
            )
          );
        }}
        items={visible.map((facet) => ({
          key: facet.key,
          label: (
            <span>
              {facet.label}
              {facet.group && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {' '}
                  · {facet.group}
                </Typography.Text>
              )}
              {filters[facet.key]?.length
                ? ` (${filters[facet.key].length})`
                : ''}
            </span>
          ),
          children: (
            <FacetValues
              facet={facet}
              selected={filters[facet.key] ?? []}
              onChange={(values) => onChange(facet.key, values)}
            />
          )
        }))}
      />
      <Flex gap={8}>
        {(hidden > 0 || moreFacets) && (
          <Button
            style={{ flex: 1 }}
            loading={hidden === 0 && loadingMore}
            onClick={() => {
              setShowAll(true);
              if (hidden === 0) onLoadMore();
            }}
          >
            {hidden > 0
              ? t('facetList.moreFacets', { hidden })
              : t('facetList.loadMoreFacets')}
          </Button>
        )}
        {showAll && facets.length > COLLAPSED_FACETS && (
          <Button style={{ flex: 1 }} onClick={() => setShowAll(false)}>
            {t('facetList.fewerFacets')}
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
