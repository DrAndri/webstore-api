import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  RechartFormat,
  PricesResponse,
  AutocompleteResponse,
  SelectValue,
  StoreConfig,
  PricesApiRequestBody,
  AutocompleteApiRequestBody
} from '../types';
import { DatePicker, Flex, Layout, Select, Tooltip } from 'antd';
import SkuSelector from '../components/SkuSelector/SkuSelector';
import getMongoDb from '../utils/mongodb';
import { InferGetServerSidePropsType } from 'next/types';
import dayjs, { Dayjs } from 'dayjs';
import callApi from '../utils/api';
import { sendGAEvent } from '@next/third-parties/google';

const { Header, Content } = Layout;
const { RangePicker } = DatePicker;
const PriceChart = dynamic(() => import('../components/PriceChart/PriceChart'));

export async function getServerSideProps() {
  const stores = await getMongoDb()
    .collection<StoreConfig>('stores')
    .find({ apiEnabled: true }, { projection: { _id: 1, name: 1 } })
    .toArray();
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
  const [selectedSkus, setSelectedSkus] = useState<SelectValue[]>([]);
  const [selectedRange, setSelectedRange] = useState<
    [start: Dayjs | null, end: Dayjs | null] | null
  >(null);
  const [selectedStores, setSelectedStores] = useState<string[]>(
    stores.map((store) => store._id.toString())
  );

  useEffect(() => {
    const skuValues = selectedSkus.map((sku) => sku.value);
    if (skuValues.length === 0 || selectedStores.length === 0) {
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
      res.stores?.forEach((store) => {
        store.skus.forEach((sku) => {
          const storeName = stores.find(
            (cachedStore) => cachedStore._id.toString() === store.id
          )?.name;
          if (!storeName) return;
          const key = storeName + ' - ' + sku.sku + ' - price';
          for (const price of sku.prices) {
            const startDay = dayjs.unix(price.start).startOf('day');
            addToArray(
              {
                [key]: price.price,
                timestamp: startDay.unix()
              },
              prices
            );
            const endDay = dayjs.unix(price.end).endOf('day');
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
          const saleKey = storeName + ' - ' + sku.sku + ' - salePrice';
          if (sku.salePrices) {
            for (const price of sku.salePrices) {
              const startDay = dayjs.unix(price.start).startOf('day');
              addToArray(
                {
                  [saleKey]: price.price,
                  timestamp: startDay.unix()
                },
                prices
              );
              const endDay = dayjs.unix(price.end).endOf('day');
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
      });
      return prices;
    };

    const body: PricesApiRequestBody = {
      skus: skuValues,
      stores: selectedStores
    };

    if (selectedRange !== null) {
      body.start = selectedRange[0]?.unix();
      body.end = selectedRange[1]?.unix();
    }

    setLoadingPrices(true);
    sendGAEvent('event', 'prices', {
      skus: body.skus,
      stores: body.stores,
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
  }, [selectedSkus, selectedStores, selectedRange, stores]);

  async function searchForSkusBeginningWith(
    term: string
  ): Promise<SelectValue[]> {
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
        return res.terms.map((term: string) => ({
          key: term,
          label: term,
          value: term
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
              mode="multiple"
              allowClear
              value={selectedSkus}
              placeholder="Leitaðu að vörunúmeri..."
              fetchOptions={searchForSkusBeginningWith}
              onChange={(newValue) => {
                setSelectedSkus(newValue as SelectValue[]);
              }}
              style={{ minWidth: 300, flex: 1 }}
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
              defaultValue={selectedStores}
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
                return { label: store.name, value: store._id };
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
