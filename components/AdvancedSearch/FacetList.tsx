'use client';
import { Checkbox, Collapse, Flex, Input, Typography } from 'antd';
import { useState } from 'react';
import { Facet } from '../../utils/searchFields';

const COLLAPSED_COUNT = 8;

function FacetValues({
  facet,
  selected,
  onChange
}: {
  facet: Facet;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
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
          placeholder="Sía"
          allowClear
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
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
              {value.count.toLocaleString('is-IS')}
            </Typography.Text>
          </Flex>
        </Checkbox>
      ))}
      {values.length > COLLAPSED_COUNT && (
        <Typography.Link onClick={() => setExpanded(!expanded)}>
          {expanded
            ? 'Sýna færri'
            : `Sýna fleiri (${values.length - COLLAPSED_COUNT})`}
        </Typography.Link>
      )}
    </Flex>
  );
}

// Filters with the number of products each value would give
export default function FacetList({
  facets,
  filters,
  onChange
}: {
  facets: Facet[];
  filters: Record<string, string[]>;
  onChange: (key: string, values: string[]) => void;
}) {
  // Facets the user opened or closed, the rest follow the default: open unless
  // it is an attribute without a selection
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const isOpenByDefault = (facet: Facet) =>
    !facet.key.startsWith('attr_') || !!filters[facet.key]?.length;
  const activeKeys = facets
    .filter((facet) => isOpenByDefault(facet) !== toggled.has(facet.key))
    .map((facet) => facet.key);
  return (
    <Collapse
      size="small"
      activeKey={activeKeys}
      onChange={(keys) => {
        const open = new Set(([] as string[]).concat(keys));
        setToggled(
          new Set(
            facets
              .filter((facet) => open.has(facet.key) !== isOpenByDefault(facet))
              .map((facet) => facet.key)
          )
        );
      }}
      items={facets.map((facet) => ({
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
  );
}
