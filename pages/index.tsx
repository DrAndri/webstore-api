import { useState, useEffect } from 'react';
// import dynamic from 'next/dynamic';
import {
  RechartFormat,
  PricesResponse,
  AutocompleteResponse,
  SelectValue,
  StoreConfig,
  PricesApiRequestBody,
  AutocompleteApiRequestBody,
  SolrProduct
} from '../types';
import { DatePicker, Flex, Layout, Select, Tooltip } from 'antd';
import SkuSelector from '../components/SkuSelector/SkuSelector';
import { InferGetServerSidePropsType } from 'next/types';
import dayjs, { Dayjs } from 'dayjs';
import callApi from '../utils/api';
import { sendGAEvent } from '@next/third-parties/google';
import { queryPool } from '../utils/mariadb';
import PriceChart from '../components/PriceChart/PriceChart';

const { Header, Content } = Layout;
const { RangePicker } = DatePicker;
// const PriceChart = dynamic(() => import('../components/PriceChart/PriceChart'));

export async function getServerSideProps() {
  const stores = await queryPool<StoreConfig[]>(
    'SELECT id, name FROM stores WHERE apiEnabled = true'
  );
  // const stores = await getMongoDb()
  //   .collection<StoreConfig>('stores')
  //   .find({ apiEnabled: true }, { projection: { _id: 1, name: 1 } })
  //   .toArray();
  return {
    props: {
      stores
    }
  };
}

export default function Home({
  stores
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [prices, setPrices] = useState<RechartFormat[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [searchedProducts, setSearchedProducts] = useState<SolrProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SolrProduct[]>([]);
  const [selectedRange, setSelectedRange] = useState<
    [start: Dayjs | null, end: Dayjs | null] | null
  >(null);
  const [selectedStores, setSelectedStores] = useState<string[]>(
    stores.map((store) => store.id.toString())
  );

  useEffect(() => {
    if (selectedProducts.length === 0 || selectedStores.length === 0) {
      setPrices([]);
      return;
    }
    const addToArray = (price: RechartFormat, prices: RechartFormat[]) => {
      const index = prices.findIndex(
        (onePrice) => onePrice.timestamp === price.timestamp
      );
      if (index < 0) {
        prices.push(price);
      } else {
        prices[index] = {
          ...price,
          ...prices[index]
        };
      }
    };
    const formatPricesForRechart = (res: PricesResponse) => {
      const prices: RechartFormat[] = [];
      res.forEach((productPrice) => {
        const product = selectedProducts.find(
          (product) => product.id === productPrice.id
        );
        if (!product) return;
        const storeName = stores.find(
          (store) => store.id === product.storeId
        )?.name;
        const key = storeName + ' - ' + product.sku + ' - price';
        for (const price of productPrice.prices) {
          const startDay = dayjs(price.start).startOf('day');
          addToArray(
            {
              [key]: price.price,
              timestamp: startDay.unix()
            },
            prices
          );
          const endDay = dayjs(price.end).endOf('day');
          let nextDay = startDay.add(1, 'day');
          while (nextDay.isBefore(endDay)) {
            addToArray(
              {
                [key]: price.price,
                timestamp: nextDay.unix()
              },
              prices
            );
            nextDay = nextDay.add(1, 'day');
          }
        }
        const saleKey = storeName + ' - ' + product.sku + ' - salePrice';
        if (productPrice.salePrices) {
          for (const price of productPrice.salePrices) {
            const startDay = dayjs(price.start).startOf('day');
            addToArray(
              {
                [saleKey]: price.price,
                timestamp: startDay.unix()
              },
              prices
            );
            const endDay = dayjs(price.end).endOf('day');
            let nextDay = startDay.add(1, 'day');
            while (nextDay.isBefore(endDay)) {
              addToArray(
                {
                  [saleKey]: price.price,
                  timestamp: nextDay.unix()
                },
                prices
              );
              nextDay = nextDay.add(1, 'day');
            }
          }
        }
      });
      return prices;
    };
    const body: PricesApiRequestBody = {
      productIds: selectedProducts.map((product) => product.id)
    };

    if (selectedRange !== null) {
      body.start = selectedRange[0]?.toISOString().split('T')[0];
      body.end = selectedRange[1]?.toISOString().split('T')[0];
    }

    setLoadingPrices(true);
    sendGAEvent('event', 'prices', {
      productIds: body.productIds,
      start: body.start,
      end: body.end
    });
    callApi('prices', body)
      .then((res) => res.json())
      .then((res: PricesResponse) => {
        setPrices(formatPricesForRechart(res));
        setLoadingPrices(false);
      })
      .catch((error) => console.log(error));
  }, [selectedProducts, selectedStores, selectedRange, stores]);

  async function searchForProducts(term: string): Promise<SelectValue[]> {
    sendGAEvent('event', 'autocomplete', {
      term: term,
      stores: selectedStores
    });
    const body: AutocompleteApiRequestBody = {
      term: term,
      stores: selectedStores
    };
    return callApi('autocomplete', body)
      .then((res) => res.json())
      .then((res: AutocompleteResponse) => {
        setSearchedProducts(res.products);
        return res.products.map((product: SolrProduct) => ({
          key: product.id,
          label: product.name,
          value: product.id
        }));
      });
  }
  return (
    <div>
      <Layout style={{ height: '100vh' }}>
        <Header
          style={{ minHeight: 64, height: 'unset', padding: '20px 50px' }}
        >
          <Flex
            justify="space-between"
            align="center"
            gap={10}
            style={{ height: '100%', width: '100%' }}
            wrap="wrap"
          >
            <SkuSelector
              value={selectedProducts.map((product) => ({
                key: product.id.toString(),
                label: product.name,
                value: product.id
              }))}
              fetchOptions={searchForProducts}
              onChange={(newValue) => {
                const products: SolrProduct[] = [];
                for (const newProduct of newValue as SelectValue[]) {
                  const populatedProduct =
                    selectedProducts.find((p) => p.id === newProduct.value) ??
                    searchedProducts.find((p) => p.id === newProduct.value);
                  if (populatedProduct) products.push(populatedProduct);
                }
                setSelectedProducts(products);
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
          </Flex>
        </Header>
        <Layout style={{ height: '100vh' }}>
          <Content>
            <Flex
              justify="space-between"
              align="center"
              style={{ height: '100%' }}
            >
              <PriceChart prices={prices} />
            </Flex>
          </Content>
        </Layout>
      </Layout>
    </div>
  );
}
