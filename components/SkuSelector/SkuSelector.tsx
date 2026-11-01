'use client';
import { useEffect, useState } from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import useSWR from 'swr';
import { DefaultOptionType } from 'antd/es/select';

export interface DebounceSelectProps<ValueType> extends Omit<
  SelectProps<ValueType>,
  'options' | 'children'
> {
  fetchOptions: (term: string) => Promise<DefaultOptionType[]>;
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
  const { data: options, isLoading } = useSWR(
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
      notFoundContent={fetching && term ? <Spin size="small" /> : null}
      mode="multiple"
      allowClear
      placeholder="Leitaðu að vörunúmeri..."
      style={{ minWidth: 300, flex: 1 }}
      {...props}
      options={options ?? []}
    />
  );
}
