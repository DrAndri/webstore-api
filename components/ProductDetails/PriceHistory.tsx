'use client';
import { Flex, Segmented, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
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
import useChartTheme from '../Theme/useChartTheme';

// The first two categorical slots, validated for color vision deficiency.
// The sale price is also dashed so it is not told apart by color alone.
const PRICE_COLOR = '#2a78d6';
const SALE_COLOR = '#eb6834';

const RANGES = {
  '3m': { label: '3 mán.', months: 3 },
  '1y': { label: '1 ár', months: 12 },
  all: { label: 'Allt', months: undefined }
} as const;
type RangeKey = keyof typeof RANGES;

const formatPrice = (price: number) => `${price.toLocaleString('is-IS')} kr.`;
const formatDay = (day: string) => dayjs(day).format('D. MMM YYYY');

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
  type: 'Verð' | 'Tilboð';
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
      type: 'Verð',
      ...period,
      change: index > 0 ? period.price - prices[index - 1].price : undefined
    })),
    ...salePrices.map((period): PeriodRow => ({
      key: `s${period.start}`,
      type: 'Tilboð',
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

  if (prices.length === 0 && salePrices.length === 0)
    return <Typography.Text type="secondary">Engin verð skráð</Typography.Text>;

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
            { value: 'chart', label: 'Graf' },
            { value: 'table', label: 'Tafla' }
          ]}
        />
        {view === 'chart' && (
          <Segmented
            size="small"
            value={range}
            onChange={setRange}
            options={Object.entries(RANGES).map(([value, { label }]) => ({
              value: value as RangeKey,
              label
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
            { title: 'Frá', dataIndex: 'start', render: formatDay },
            { title: 'Til', dataIndex: 'end', render: formatDay },
            { title: 'Tegund', dataIndex: 'type' },
            {
              title: 'Verð',
              dataIndex: 'price',
              align: 'right',
              render: formatPrice
            },
            {
              title: 'Breyting',
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
          Engin verð á þessu tímabili
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
                dayjs(day).format(days.length > 120 ? 'MMM YYYY' : 'D. MMM')
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
              tickFormatter={(value: number) => value.toLocaleString('is-IS')}
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
              name="Verð"
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
                name="Tilboðsverð"
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
