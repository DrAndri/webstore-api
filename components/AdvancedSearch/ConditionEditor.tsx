'use client';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  AutoComplete,
  Button,
  DatePicker,
  Flex,
  Input,
  InputNumber,
  Select
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  ATTRIBUTE_FIELD,
  fieldKind,
  fieldOps,
  OP_LABELS,
  SEARCH_FIELDS,
  SearchCondition
} from '../../utils/searchFields';

interface AttributeOption {
  id: number;
  name: string;
  group?: string;
}

const getJson = <T,>(url: string) =>
  fetch(url).then((response) => response.json() as Promise<T>);

const useDebounced = <T,>(value: T, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
};

function AttributePicker({
  value,
  label,
  onChange
}: {
  value?: string;
  label?: string;
  onChange: (field: string, label: string) => void;
}) {
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);
  const { data, isLoading } = useSWR<AttributeOption[]>(
    debounced.length >= 2
      ? `/api/search/attributes?q=${encodeURIComponent(debounced)}`
      : null,
    getJson
  );
  const options = (data ?? []).map((attribute) => ({
    value: `attr_${attribute.id}`,
    label: attribute.group
      ? `${attribute.name} (${attribute.group})`
      : attribute.name
  }));
  if (value && label && !options.some((option) => option.value === value))
    options.unshift({ value, label });
  return (
    <Select
      showSearch={{ filterOption: false, onSearch: setTerm }}
      value={value}
      placeholder="Leitaðu að eiginleika, t.d. Litur"
      notFoundContent={
        debounced.length < 2
          ? 'Skrifaðu að minnsta kosti tvo stafi'
          : isLoading
            ? 'Leita…'
            : 'Enginn eiginleiki fannst'
      }
      options={options}
      onChange={(field, option) =>
        onChange(field, (option as { label: string }).label)
      }
      style={{ minWidth: 220 }}
    />
  );
}

function AttributeValueInput({
  attributeId,
  value,
  onChange
}: {
  attributeId: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  const debounced = useDebounced(value ?? '');
  const { data } = useSWR<{ value: string; count: number }[]>(
    `/api/search/attribute-values?id=${attributeId}&q=${encodeURIComponent(debounced)}`,
    getJson
  );
  return (
    <AutoComplete
      value={value}
      onChange={onChange}
      options={(Array.isArray(data) ? data : []).map((option) => ({
        value: option.value,
        label: `${option.value} (${option.count})`
      }))}
      placeholder="Gildi"
      style={{ minWidth: 200, flex: 1 }}
    />
  );
}

function ValueInput({
  condition,
  onChange
}: {
  condition: SearchCondition;
  onChange: (condition: SearchCondition) => void;
}) {
  const kind = fieldKind(condition.field);
  const attributeId = ATTRIBUTE_FIELD.exec(condition.field)?.[1];
  if (kind === 'number')
    return (
      <Flex gap={4} align="center">
        <InputNumber
          placeholder="frá"
          min={0}
          value={condition.value ? Number(condition.value) : null}
          onChange={(value) =>
            onChange({
              ...condition,
              value: value === null ? '' : String(value)
            })
          }
        />
        –
        <InputNumber
          placeholder="til"
          min={0}
          value={condition.value2 ? Number(condition.value2) : null}
          onChange={(value) =>
            onChange({
              ...condition,
              value2: value === null ? '' : String(value)
            })
          }
        />
        kr.
      </Flex>
    );
  if (kind === 'date')
    return (
      <DatePicker.RangePicker
        allowEmpty={[true, true]}
        placeholder={['Frá', 'Til']}
        value={[
          condition.value ? dayjs(condition.value) : null,
          condition.value2 ? dayjs(condition.value2) : null
        ]}
        onChange={(dates) =>
          onChange({
            ...condition,
            value: dates?.[0]?.format('YYYY-MM-DD') ?? '',
            value2: dates?.[1]?.format('YYYY-MM-DD') ?? ''
          })
        }
      />
    );
  if (kind === 'boolean')
    return (
      <Select
        value={condition.value ?? 'true'}
        onChange={(value) => onChange({ ...condition, value })}
        options={[
          { value: 'true', label: 'Já' },
          { value: 'false', label: 'Nei' }
        ]}
        style={{ width: 100 }}
      />
    );
  if (attributeId)
    return (
      <AttributeValueInput
        attributeId={attributeId}
        value={condition.value}
        onChange={(value) => onChange({ ...condition, value })}
      />
    );
  return (
    <Input
      value={condition.value}
      onChange={(e) => onChange({ ...condition, value: e.target.value })}
      placeholder="Gildi"
      allowClear
      style={{ minWidth: 200, flex: 1 }}
    />
  );
}

export default function ConditionEditor({
  conditions,
  attributeLabels,
  onChange
}: {
  conditions: SearchCondition[];
  attributeLabels: Record<string, string>;
  onChange: (
    conditions: SearchCondition[],
    attributeLabels?: Record<string, string>
  ) => void;
}) {
  const update = (index: number, condition: SearchCondition) =>
    onChange(conditions.map((c, i) => (i === index ? condition : c)));

  return (
    <Flex vertical gap={8}>
      {conditions.map((condition, index) => {
        const isAttribute =
          ATTRIBUTE_FIELD.test(condition.field) ||
          condition.field === 'attribute';
        return (
          <Flex key={index} gap={8} wrap align="center">
            <Select
              value={isAttribute ? 'attribute' : condition.field}
              style={{ width: 150 }}
              onChange={(field) => {
                const op =
                  field === 'attribute' ? 'contains' : fieldOps(field)[0];
                update(index, { field, op });
              }}
              options={[
                ...Object.entries(SEARCH_FIELDS).map(([value, { label }]) => ({
                  value,
                  label
                })),
                { value: 'attribute', label: 'Eiginleiki…' }
              ]}
            />
            {isAttribute && (
              <AttributePicker
                value={
                  condition.field === 'attribute' ? undefined : condition.field
                }
                label={attributeLabels[condition.field]}
                onChange={(field, label) =>
                  onChange(
                    conditions.map((c, i) =>
                      i === index ? { ...c, field, value: '' } : c
                    ),
                    { ...attributeLabels, [field]: label }
                  )
                }
              />
            )}
            {condition.field !== 'attribute' &&
              fieldOps(condition.field).length > 1 && (
                <Select
                  value={condition.op}
                  style={{ width: 150 }}
                  onChange={(op) => update(index, { ...condition, op })}
                  options={fieldOps(condition.field).map((op) => ({
                    value: op,
                    label: OP_LABELS[op]
                  }))}
                />
              )}
            {condition.field !== 'attribute' && (
              <ValueInput
                condition={condition}
                onChange={(c) => update(index, c)}
              />
            )}
            <Button
              icon={<DeleteOutlined />}
              aria-label="Fjarlægja skilyrði"
              onClick={() => onChange(conditions.filter((_, i) => i !== index))}
            />
          </Flex>
        );
      })}
      <Button
        icon={<PlusOutlined />}
        onClick={() =>
          onChange([
            ...conditions,
            { field: 'name', op: 'contains', value: '' }
          ])
        }
        style={{ alignSelf: 'start' }}
      >
        Bæta við skilyrði
      </Button>
    </Flex>
  );
}
