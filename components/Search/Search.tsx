'use client';
import { useSWRConfig } from 'swr';
import { useEffect, useState } from 'react';
import {
  AutocompleteApiRequestBody,
  AutocompleteResponse,
  AutocompleteResult,
  ProductPricesResponse,
  StoreConfig
} from '../../types';
import SkuSelector from '../SkuSelector/SkuSelector';
import { Dayjs } from 'dayjs';
import { DatePicker, Select, Tooltip } from 'antd';
import callApi, { useCache } from '../../utils/api';
import { sendGAEvent } from '@next/third-parties/google';
import { DefaultOptionType } from 'antd/es/select';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

export default function Search({ stores }: { stores: StoreConfig[] }) {
  const { replace } = useRouter();
  const { cache, mutate } = useSWRConfig();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { RangePicker } = DatePicker;
  const [selectedProductIds, setSelectedProductIds] = useState<
    DefaultOptionType[]
  >(
    searchParams.get('selectedProductIds')
      ? searchParams
          .get('selectedProductIds')!
          .split(',')
          .map((id) => ({ value: id, label: id }))
      : []
  );
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [selectedRange, setSelectedRange] = useState<
    [start: Dayjs | null, end: Dayjs | null] | null
  >(null);
  const [selectedStores, setSelectedStores] = useState<string[]>(
    stores.map((store) => store.id.toString())
  );

  useEffect(() => {
    if (selectedProductIds.length !== 0) {
      setTimeout(async () => {
        const selectedProducts = await useCache<ProductPricesResponse>(
          'prices',
          cache,
          mutate,
          selectedProductIds.flatMap((option) =>
            option?.value ? [option.value?.toString()] : []
          )
        );
        if (selectedProducts) {
          setSelectedProductIds(
            selectedProducts.map((product) => ({
              value: product.id,
              label: product.sku
            }))
          );
        }
      }, 1000);
    }
  }, []);

  useEffect(() => {
    // 1. Create a new URLSearchParams instance from current params
    const params = new URLSearchParams(searchParams);
    // 2. Set or delete parameters
    if (selectedProductIds && selectedProductIds.length > 0) {
      params.set(
        'selectedProductIds',
        selectedProductIds.map((id) => id.value).join(',')
      );
    } else {
      params.delete('selectedProductIds');
    }

    // 3. Update the URL with the new query string
    replace(`${pathname}?${params.toString()}`);
  }, [selectedProductIds, selectedRange, selectedStores]);

  async function searchForProducts(term: string): Promise<DefaultOptionType[]> {
    sendGAEvent('event', 'autocomplete', {
      term: term,
      stores: selectedStores
    });
    const body: AutocompleteApiRequestBody = {
      term: term,
      stores: selectedStores
    };
    return callApi('autocomplete', body).then((res: AutocompleteResponse) => {
      return res.results.map((result: AutocompleteResult) => ({
        label: result.name,
        value: result.id
      }));
    });
  }
  return (
    <>
      <SkuSelector
        value={selectedProductIds}
        fetchOptions={searchForProducts}
        onChange={(newValue) => {
          if (Array.isArray(newValue)) {
            setSelectedProductIds(newValue);
          } else {
            setSelectedProductIds([newValue]);
          }
        }}
        loading={loadingPrices}
      />
      <RangePicker
        style={{ width: 250 }}
        format={'DD-MMM-YYYY'}
        placeholder={['Byrjun', 'Endir']}
        onChange={(dates) => {
          setSelectedRange(dates);
        }}
        allowEmpty={[true, true]}
      />
      <Select
        mode="multiple"
        maxTagCount="responsive"
        allowClear
        style={{ width: 200 }}
        placeholder="Veldu búð"
        value={selectedStores}
        maxTagPlaceholder={(omittedValues) => (
          <Tooltip
            styles={{ root: { pointerEvents: 'none' } }}
            title={omittedValues.map(({ label }) => label).join(', ')}
          >
            <span>+ {omittedValues.length} ...</span>
          </Tooltip>
        )}
        onChange={(newValue) => {
          setSelectedStores(newValue);
        }}
        options={stores.map((store) => {
          return { label: store.name, value: store.id.toString() };
        })}
        loading={loadingPrices}
      />
    </>
  );
}
