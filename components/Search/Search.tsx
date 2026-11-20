'use client';
import {
  AutocompleteApiRequestBody,
  AutocompleteResponse,
  AutocompleteResult,
  StoreConfig
} from '../../types';
import SkuSelector, { SkuOptions } from '../SkuSelector/SkuSelector';
import AutocompleteOption from './AutocompleteOption';
import callApi from '../../utils/api';
import { sendGAEvent } from '@next/third-parties/google';
import { DefaultOptionType } from 'antd/es/select';
import { productLabel, useSelection } from '../Selection/SelectionProvider';

// Picks products for the price history by name or SKU, the picked products
// are the selection that is shared with the advanced search
export default function Search({ stores }: { stores: StoreConfig[] }) {
  const { selected, setSelected } = useSelection();
  const storeName = (storeId: number) =>
    stores.find((store) => store.id === storeId)?.name;

  async function searchForProducts(term: string): Promise<SkuOptions> {
    sendGAEvent('event', 'autocomplete', {
      term: term
    });
    const body: AutocompleteApiRequestBody = {
      term: term
    };
    return callApi<AutocompleteResponse>('autocomplete', body).then((res) => ({
      total: res.total,
      options: res.results.map((result: AutocompleteResult) => ({
        label: productLabel({
          name: result.name,
          sku: result.sku,
          storeName: storeName(result.storeId)
        }),
        value: result.id,
        result
      }))
    }));
  }
  return (
    <SkuSelector
      value={selected.map((s) => ({ value: s.id, label: s.label }))}
      fetchOptions={searchForProducts}
      optionRender={(option) => (
        <AutocompleteOption
          result={option.data.result}
          storeName={storeName(option.data.result.storeId)}
        />
      )}
      onChange={(newValue) =>
        setSelected(
          ([] as DefaultOptionType[]).concat(newValue ?? []).map((option) => ({
            id: String(option.value),
            label:
              typeof option.label === 'string'
                ? option.label
                : String(option.value)
          }))
        )
      }
    />
  );
}
