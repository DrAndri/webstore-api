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
import SkuSelector, { SkuOptions } from '../SkuSelector/SkuSelector';
import AutocompleteOption from './AutocompleteOption';
import { Dayjs } from 'dayjs';
import { DatePicker, Select, Tooltip } from 'antd';
import callApi, { getCached } from '../../utils/api';
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
  const [selectedRange, setSelectedRange] = useState<
    [start: Dayjs | null, end: Dayjs | null] | null
  >(null);
  const [selectedStores, setSelectedStores] = useState<string[]>(
    stores.map((store) => store.id.toString())
  );

  useEffect(() => {
    if (selectedProductIds.length !== 0) {
      setTimeout(async () => {
        const selectedProducts = await getCached<ProductPricesResponse>(
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
    // Only replaces the ids from the url with labels once, on the first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Writes the selection to the url when it changes, depending on the url
    // itself would run it again after every replace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductIds, selectedRange, selectedStores]);

  async function searchForProducts(term: string): Promise<SkuOptions> {
    sendGAEvent('event', 'autocomplete', {
      term: term,
      stores: selectedStores
    });
    const body: AutocompleteApiRequestBody = {
      term: term,
      stores: selectedStores
    };
    return callApi<AutocompleteResponse>('autocomplete', body).then((res) => ({
      total: res.total,
      options: res.results.map((result: AutocompleteResult) => ({
        label: result.name,
        value: result.id,
        result
      }))
    }));
  }
  return (
    <>
      <SkuSelector
        value={selectedProductIds}
        fetchOptions={searchForProducts}
        optionRender={(option) => (
          <AutocompleteOption
            result={option.data.result}
            storeName={
              stores.find((store) => store.id === option.data.result.storeId)
                ?.name
            }
          />
        )}
        onChange={(newValue) => {
          if (Array.isArray(newValue)) {
            setSelectedProductIds(newValue);
          } else {
            setSelectedProductIds([newValue]);
          }
        }}
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
      />
    </>
  );
}
