'use client';
import { Flex, Segmented, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Price } from '../../types';
import { useFormat } from '../I18n/I18nProvider';
import useChartTheme from '../Theme/useChartTheme';

// The first two categorical slots, validated for color vision deficiency.
// The sale price is also dashed so it is not told apart by color alone.
const PRICE_COLOR = '#2a78d6';
const SALE_COLOR = '#eb6834';

// The labels are in the site namespace, priceHistory.ranges.<key>
const RANGES = {
  '3m': { months: 3 },
  '1y': { months: 12 },
  all: { months: undefined }
} as const;
type RangeKey = keyof typeof RANGES;

interface DayRow {
  day: string;
  price?: number;
  salePrice?: number;
}

// A row for every day from the first price to the last. The days the product
// was not seen have no value, so the lines break there.
const toDays = (prices: Price[], salePrices: Price[], from?: string) => {
  const days = new Map<string, DayRow>();
  const fill = (periods: Price[], key: 'price' | 'salePrice') => {
    for (const period of periods) {
      const end = dayjs(period.end);
      for (let day = dayjs(period.start); !day.isAfter(end);) {
        const value = day.format('YYYY-MM-DD');
        days.set(value, {
          day: value,
          ...days.get(value),
          [key]: period.price
        });
        day = day.add(1, 'day');
      }
    }
  };
  fill(prices, 'price');
  fill(salePrices, 'salePrice');
  const sorted = [...days.keys()].sort();
  if (sorted.length === 0) return [];
  const rows: DayRow[] = [];
  const last = dayjs(sorted[sorted.length - 1]);
  for (
    let day = dayjs(sorted[0]);
    !day.isAfter(last);
    day = day.add(1, 'day')
  ) {
    const value = day.format('YYYY-MM-DD');
    if (!from || value >= from) rows.push(days.get(value) ?? { day: value });
  }
  return rows;
};

// A day with no value on either side is not part of a line, it gets a dot
const isolatedDot = (
  days: DayRow[],
  key: 'price' | 'salePrice',
  color: string,
  surface: string
) =>
  function Dot({
    cx,
    cy,
    index
  }: {
    cx?: number;
    cy?: number;
    index?: number;
  }) {
    const i = index ?? 0;
    const isolated =
      days[i]?.[key] !== undefined &&
      days[i - 1]?.[key] === undefined &&
      days[i + 1]?.[key] === undefined;
    return isolated && cx !== undefined && cy !== undefined ? (
      <circle
        key={`${key}${i}`}
        cx={cx}
        cy={cy}
        r={4}
        fill={color}
        stroke={surface}
        strokeWidth={2}
      />
    ) : (
      <g key={`${key}${i}`} />
    );
  };

interface PeriodRow {
  key: string;
  type: 'price' | 'sale';
  price: number;
  start: string;
  end: string;
  // The change from the price before, for regular prices
  change?: number;
}

const toPeriods = (prices: Price[], salePrices: Price[]): PeriodRow[] =>
  [
    ...prices.map((period, index): PeriodRow => ({
      key: `p${period.start}`,
      type: 'price',
      ...period,
      change: index > 0 ? period.price - prices[index - 1].price : undefined
    })),
    ...salePrices.map((period): PeriodRow => ({
      key: `s${period.start}`,
      type: 'sale',
      ...period
    }))
  ].sort(
    (a, b) => b.start.localeCompare(a.start) || a.key.localeCompare(b.key)
  );

export default function PriceHistory({
  prices,
  salePrices
}: {
  prices: Price[];
  salePrices: Price[];
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [range, setRange] = useState<RangeKey>('all');
  const chart = useChartTheme();
  const { t } = useTranslation('site');
  const format = useFormat();
  const formatPrice = (price: number) => format.price(price);
  const formatDay = (day: string) =>
    dayjs(day).locale(format.language).format(t('dates.day'));

  if (prices.length === 0 && salePrices.length === 0)
    return (
      <Typography.Text type="secondary">
        {t('priceHistory.noPrices')}
      </Typography.Text>
    );

  const months = RANGES[range].months;
  const days = toDays(
    prices,
    salePrices,
    months ? dayjs().subtract(months, 'month').format('YYYY-MM-DD') : undefined
  );
  const hasSales = salePrices.length > 0;

  return (
    <Flex vertical gap={8}>
      <Flex justify="space-between" wrap gap={8}>
        <Segmented
          size="small"
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: t('priceHistory.chart') },
            { value: 'table', label: t('priceHistory.table') }
          ]}
        />
        {view === 'chart' && (
          <Segmented
            size="small"
            value={range}
            onChange={setRange}
            options={(Object.keys(RANGES) as RangeKey[]).map((value) => ({
              value,
              label: t(`priceHistory.ranges.${value}`)
            }))}
          />
        )}
      </Flex>
      {view === 'table' ? (
        <Table<PeriodRow>
          size="small"
          dataSource={toPeriods(prices, salePrices)}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: true }}
          columns={[
            {
              title: t('priceHistory.columns.from'),
              dataIndex: 'start',
              render: formatDay
            },
            {
              title: t('priceHistory.columns.to'),
              dataIndex: 'end',
              render: formatDay
            },
            {
              title: t('priceHistory.columns.type'),
              dataIndex: 'type',
              render: (type: PeriodRow['type']) =>
                t(`priceHistory.types.${type}`)
            },
            {
              title: t('priceHistory.columns.price'),
              dataIndex: 'price',
              align: 'right',
              render: formatPrice
            },
            {
              title: t('priceHistory.columns.change'),
              dataIndex: 'change',
              align: 'right',
              render: (change?: number) =>
                change === undefined || change === 0 ? (
                  '–'
                ) : (
                  <Typography.Text type={change < 0 ? 'success' : 'danger'}>
                    {change > 0 ? '+' : '−'}
                    {formatPrice(Math.abs(change))}
                  </Typography.Text>
                )
            }
          ]}
        />
      ) : days.length === 0 ? (
        <Typography.Text type="secondary">
          {t('priceHistory.noPricesInRange')}
        </Typography.Text>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={days}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis
              dataKey="day"
              stroke={chart.grid}
              tick={{ fill: chart.axisText, fontSize: 12 }}
              tickLine={false}
              minTickGap={32}
              tickFormatter={(day: string) =>
                dayjs(day)
                  .locale(format.language)
                  .format(
                    days.length > 120 ? t('dates.month') : t('dates.dayMonth')
                  )
              }
            />
            <YAxis
              stroke={chart.grid}
              tick={{ fill: chart.axisText, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={80}
              // Room below the lowest price so a sale does not sit on the axis
              domain={[
                (min: number) => Math.floor((min * 0.95) / 1000) * 1000,
                (max: number) => Math.ceil((max * 1.02) / 1000) * 1000
              ]}
              tickCount={5}
              allowDecimals={false}
              tickFormatter={(value: number) => format.number(value)}
            />
            <Tooltip
              {...chart.tooltip}
              labelFormatter={(day) => formatDay(String(day))}
              formatter={(value, name) => [formatPrice(Number(value)), name]}
            />
            {hasSales && <Legend iconType="plainline" verticalAlign="top" />}
            <Line
              type="stepAfter"
              dataKey="price"
              name={t('priceHistory.types.price')}
              stroke={PRICE_COLOR}
              strokeWidth={2}
              dot={isolatedDot(days, 'price', PRICE_COLOR, chart.surface)}
              activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {hasSales && (
              <Line
                type="stepAfter"
                dataKey="salePrice"
                name={t('priceHistory.salePrice')}
                stroke={SALE_COLOR}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={isolatedDot(days, 'salePrice', SALE_COLOR, chart.surface)}
                activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Flex>
  );
}
