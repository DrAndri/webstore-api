'use client';
import { useEffect, useState } from 'react';
import { Select, Spin, Typography } from 'antd';
import type { SelectProps } from 'antd';
import useSWR from 'swr';
import { DefaultOptionType } from 'antd/es/select';

export interface SkuOptions {
  options: DefaultOptionType[];
  // How many matched, options has the first few of them
  total: number;
}

const countFormat = new Intl.NumberFormat('is-IS');
// Numbers ending in 1, except 11, take the singular in Icelandic
const isSingular = (n: number) => n % 10 === 1 && n % 100 !== 11;

const countText = (shown: number, total: number) => {
  const singular = isSingular(total);
  const totalText = countFormat.format(total);
  return shown < total
    ? `${shown} af ${totalText} ${singular ? 'niðurstöðu' : 'niðurstöðum'}`
    : `${totalText} ${singular ? 'niðurstaða' : 'niðurstöður'}`;
};

export interface DebounceSelectProps<ValueType> extends Omit<
  SelectProps<ValueType>,
  'options' | 'children'
> {
  fetchOptions: (term: string) => Promise<SkuOptions>;
  debounceTimeout?: number;
}

export default function SkuSelector({
  fetchOptions,
  debounceTimeout = 500,
  ...props
}: DebounceSelectProps<DefaultOptionType | DefaultOptionType[]>) {
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedTerm(term), debounceTimeout);
    return () => clearTimeout(timeout);
  }, [term, debounceTimeout]);

  // Keyed by the term, so a slow response to an earlier term is never shown
  const { data, isLoading } = useSWR(
    debouncedTerm ? ['sku-options', debouncedTerm] : null,
    ([, searchTerm]) => fetchOptions(searchTerm),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false
    }
  );
  const fetching = isLoading || term !== debouncedTerm;

  return (
    <Select
      labelInValue
      showSearch={{ filterOption: false, onSearch: setTerm }}
      notFoundContent={
        fetching && term ? (
          <Spin size="small" />
        ) : debouncedTerm && data ? (
          'Engar niðurstöður'
        ) : null
      }
      popupRender={(menu) => (
        <>
          {data && data.total > 0 && !fetching && (
            <Typography.Text
              type="secondary"
              style={{ display: 'block', padding: '4px 12px', fontSize: 12 }}
            >
              {countText(data.options.length, data.total)}
            </Typography.Text>
          )}
          {menu}
        </>
      )}
      mode="multiple"
      allowClear
      placeholder="Leitaðu að vörunúmeri..."
      style={{ minWidth: 300, flex: 1 }}
      {...props}
      options={data?.options ?? []}
    />
  );
}
