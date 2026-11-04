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
import { useTranslation } from 'react-i18next';
import { sendGAEvent } from '@next/third-parties/google';
import { getCached } from '../../utils/api';
import useChartTheme from '../Theme/useChartTheme';
import { useFormat } from '../I18n/I18nProvider';

export default function PriceChart({ stores }: { stores: StoreConfig[] }) {
  const { cache, mutate } = useSWRConfig();
  const chart = useChartTheme();
  const { t } = useTranslation('site');
  const format = useFormat();
  const [loadedPrices, setPrices] = useState<RechartFormat[]>([]);
  const searchParams = useSearchParams();
  const selectedProductIdsString = searchParams.get('selectedProductIds');
  const productIdsFromParams = selectedProductIdsString?.split(',') || [];
  const selectedRangeFromParams = searchParams.get('selectedRange');
  const selectedRange = selectedRangeFromParams
    ? selectedRangeFromParams.split(',').map((date) => dayjs(date))
    : null;
  useEffect(() => {
    if (productIdsFromParams.length === 0) return;
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

    sendGAEvent('event', 'prices', {
      productIds: productIdsFromParams,
      start: body.start,
      end: body.end
    });
    getCached<ProductPricesResponse>(
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
      })
      .catch((error) => console.log(error));
    // The other values are derived from the selected products in the url
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductIdsString]);
  const prices = productIdsFromParams.length === 0 ? [] : loadedPrices;

  const colors = [
    '#c10000',
    '#c15b00',
    '#c1ae00',
    '#5dc100',
    '#00c184',
    '#003ac1',
    '#7800c1',
    '#c100ab',
    chart.text,
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
      // The key ends in price or salePrice, the name in the legend and tooltip
      // in the language of the page
      const series = key.substring(0, key.lastIndexOf(' - '));
      return (
        <Line
          key={key}
          name={`${series} - ${isSalePrice ? t('priceChart.salePrice') : t('priceChart.price')}`}
          type="stepAfter"
          dot={false}
          stroke={nameToColor(series)}
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
            tickFormatter={(value: number) =>
              dayjs.unix(value).locale(format.language).format(t('dates.month'))
            }
          />
          <YAxis
            width={90}
            tickFormatter={(value: number) => format.number(value)}
            domain={[
              (dataMin: number) => Math.floor(dataMin / 10000) * 10000,
              (dataMax: number) => Math.ceil(dataMax / 10000) * 10000
            ]}
          />
          <Tooltip
            {...chart.tooltip}
            labelFormatter={(label) =>
              dayjs
                .unix(Number(label))
                .locale(format.language)
                .format(t('dates.day'))
            }
            labelStyle={{ ...chart.tooltip.labelStyle, fontWeight: 'bold' }}
            formatter={(value) => (value ? format.price(Number(value)) : '')}
          />
          <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
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
