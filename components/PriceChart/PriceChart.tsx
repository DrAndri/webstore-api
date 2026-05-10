'use client';
import { useSWRConfig } from 'swr';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import dayjs from 'dayjs';
import {
  PricesApiRequestBody,
  PricesResponse,
  ProductPricesResponse,
  RechartFormat,
  StoreConfig
} from '../../types';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { sendGAEvent } from '@next/third-parties/google';
import { useCache } from '../../utils/api';

export default function PriceChart({ stores }: { stores: StoreConfig[] }) {
  const { cache, mutate } = useSWRConfig();
  const [prices, setPrices] = useState<RechartFormat[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const searchParams = useSearchParams();
  const selectedProductIdsString = searchParams.get('selectedProductIds');
  const productIdsFromParams = selectedProductIdsString?.split(',') || [];
  const selectedRangeFromParams = searchParams.get('selectedRange');
  const selectedRange = selectedRangeFromParams
    ? selectedRangeFromParams.split(',').map((date) => dayjs(date))
    : null;
  useEffect(() => {
    if (productIdsFromParams.length === 0) {
      if (prices.length != 0) setPrices([]);
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
        const storeName = stores.find(
          (store) => store.id.toString() === productPrice.storeId
        )?.name;
        const key = storeName + ' - ' + productPrice.sku + ' - price';
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
        const saleKey = storeName + ' - ' + productPrice.sku + ' - salePrice';
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
      productIds: productIdsFromParams
    };

    if (selectedRange !== null) {
      body.start = selectedRange[0]?.toISOString().split('T')[0];
      body.end = selectedRange[1]?.toISOString().split('T')[0];
    }

    setLoadingPrices(true);
    sendGAEvent('event', 'prices', {
      productIds: productIdsFromParams,
      start: body.start,
      end: body.end
    });
    useCache<ProductPricesResponse>(
      'prices',
      cache,
      mutate,
      productIdsFromParams,
      (missingIds: string[]) => {
        const body: PricesApiRequestBody = {
          productIds: missingIds
        };

        if (selectedRange !== null) {
          body.start = selectedRange[0]?.toISOString().split('T')[0];
          body.end = selectedRange[1]?.toISOString().split('T')[0];
        }
        return body;
      }
    )
      .then((res: PricesResponse) => {
        setPrices(formatPricesForRechart(res));
        setLoadingPrices(false);
      })
      .catch((error) => console.log(error));
  }, [selectedProductIdsString]);

  const colors = [
    '#c10000',
    '#c15b00',
    '#c1ae00',
    '#5dc100',
    '#00c184',
    '#003ac1',
    '#7800c1',
    '#c100ab',
    '#000000',
    '#525252',
    '#003fff',
    '#ff0000',
    '#ff00fb',
    '#27ff00'
  ];

  const nameToColor = (name: string) => {
    const hash = hashStr(name);
    const index = hash % colors.length;
    return colors[index];
  };

  function hashStr(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      hash += charCode;
    }
    return hash;
  }

  const getRechartLines = () => {
    if (!prices) return null;
    const entries = prices.map((option) => {
      const keys = Object.keys(option);
      return keys;
    });
    const flattened = entries.reduce((prev, current) => {
      prev = prev.concat(current);
      return prev;
    }, []);
    const filtered = flattened.filter((key) => key !== 'timestamp');
    const uniqueKeys = [...new Set(filtered)];
    return uniqueKeys.map((key) => {
      const isSalePrice = key.includes('salePrice');
      return (
        <Line
          key={key}
          type="stepAfter"
          dot={false}
          stroke={nameToColor(key.substring(0, key.lastIndexOf(' - ')))}
          strokeWidth={2}
          strokeDasharray={isSalePrice ? '4 2' : '0'}
          dataKey={key}
        />
      );
    });
  };

  const everyMonthInRange = () => {
    let lowestTimestamp = prices[0].timestamp;
    let highestTimestamp = prices[prices.length - 1].timestamp;
    for (const price of prices) {
      if (price.timestamp < lowestTimestamp) lowestTimestamp = price.timestamp;
      if (price.timestamp > highestTimestamp)
        highestTimestamp = price.timestamp;
    }

    const timestamps = [];
    const lowest = dayjs.unix(lowestTimestamp);
    const highest = dayjs.unix(highestTimestamp);
    const firstOfLowest = lowest.startOf('month').unix();
    timestamps.push(firstOfLowest);
    let next = dayjs.unix(timestamps[timestamps.length - 1]).add(1, 'month');
    while (next.isBefore(highest)) {
      timestamps.push(next.unix());
      next = next.add(1, 'month');
    }
    return timestamps;
  };

  const formatPrice = (number: number) => formatPriceString(number.toString());
  const formatPriceString = (number: string) =>
    number.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (prices.length > 0) {
    return (
      <ResponsiveContainer height={'99%'} width={'100%'}>
        <LineChart
          data={prices}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin - 500000', 'dataMax']}
            ticks={everyMonthInRange()}
            tickFormatter={(value: number) => {
              const date = dayjs.unix(value);
              return date.format('MMM-YYYY');
            }}
          />
          <YAxis
            width={90}
            tickFormatter={(value: number) => formatPrice(value)}
            domain={[
              (dataMin: number) => Math.floor(dataMin / 10000) * 10000,
              (dataMax: number) => Math.ceil(dataMax / 10000) * 10000
            ]}
          />
          <Tooltip
            labelFormatter={(label: any) =>
              dayjs.unix(label).format('DD-MMM-YYYY')
            }
            labelStyle={{ fontWeight: 'bold' }}
            formatter={(value) =>
              value ? formatPriceString(value.toString()) + ' kr.' : ''
            }
          />
          <CartesianGrid stroke="#c2c2c2" strokeDasharray="3 3" />
          <Legend
            wrapperStyle={{ paddingBottom: 20 }}
            align="center"
            verticalAlign="top"
          />
          {getRechartLines()}
        </LineChart>
      </ResponsiveContainer>
    );
  } else return null;
}
