'use client';
import { Segmented, Table } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { FIELD_ERRORS, FieldError, TrendRow } from '../../utils/admin/types';
import { useFormat } from '../I18n/I18nProvider';
import useChartTheme from '../Theme/useChartTheme';

// Categorical slots in fixed order, validated for color vision deficiency
export const SERIES_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6'
];

const axisProps = (chart: ReturnType<typeof useChartTheme>) => ({
  stroke: chart.grid,
  tick: { fill: chart.axisText, fontSize: 12 },
  tickLine: false
});

type DayTotals = Record<FieldError, number> & {
  day: string;
  totalProcessed: number;
  totalErrored: number;
  totalRequests: number;
  failedJobs: number;
  jobs: number;
};

// Sums the rows of all stores per day
export const totalsByDay = (rows: TrendRow[]): DayTotals[] => {
  const days = new Map<string, DayTotals>();
  for (const row of rows) {
    const day =
      days.get(row.day) ??
      ({
        day: row.day,
        totalProcessed: 0,
        totalErrored: 0,
        totalRequests: 0,
        failedJobs: 0,
        jobs: 0,
        ...Object.fromEntries(FIELD_ERRORS.map((f) => [f, 0]))
      } as DayTotals);
    for (const key of [
      'totalProcessed',
      'totalErrored',
      'totalRequests',
      'failedJobs',
      'jobs',
      ...FIELD_ERRORS
    ] as const) {
      day[key] += Number(row[key]);
    }
    days.set(row.day, day);
  }
  return [...days.values()];
};

// Field errors per day stacked by field, with a table view since some of the
// colors are light against the surface
export function FieldErrorsChart({
  rows,
  markers = []
}: {
  rows: TrendRow[];
  markers?: { day: string; label: string }[];
}) {
  const { t } = useTranslation('admin');
  const format = useFormat();
  const [view, setView] = useState<'Chart' | 'Table'>('Chart');
  const chart = useChartTheme();
  const data = totalsByDay(rows);

  return (
    <div>
      <Segmented
        size="small"
        options={[
          { value: 'Chart', label: t('charts.chart') },
          { value: 'Table', label: t('charts.table') }
        ]}
        value={view}
        onChange={(value) => setView(value as 'Chart' | 'Table')}
        style={{ marginBottom: 8 }}
      />
      {view === 'Table' ? (
        <Table
          size="small"
          rowKey="day"
          dataSource={[...data].reverse()}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: true }}
          columns={[
            { title: t('charts.day'), dataIndex: 'day' },
            {
              title: t('charts.products'),
              dataIndex: 'totalProcessed',
              render: format.number
            },
            {
              title: t('charts.failedPages'),
              dataIndex: 'totalErrored',
              render: format.number
            },
            ...FIELD_ERRORS.map((field) => ({
              title: t(`fields.${field}`),
              dataIndex: field,
              render: format.number
            }))
          ]}
        />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis dataKey="day" {...axisProps(chart)} minTickGap={24} />
            <YAxis {...axisProps(chart)} axisLine={false} width={48} />
            <Tooltip
              {...chart.tooltip}
              cursor={{ fill: chart.cursor }}
              formatter={(value, name) => [format.number(Number(value)), name]}
            />
            <Legend iconType="circle" iconSize={8} />
            {FIELD_ERRORS.map((field, index) => (
              <Bar
                key={field}
                dataKey={field}
                name={t(`fields.${field}`)}
                stackId="errors"
                fill={SERIES_COLORS[index]}
                stroke={chart.surface}
                strokeWidth={1}
                maxBarSize={28}
                radius={index === FIELD_ERRORS.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
            {markers.map((marker) => (
              <ReferenceLine
                key={marker.day + marker.label}
                x={marker.day}
                stroke={chart.axisText}
                strokeDasharray="3 3"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// One measure over time with optional markers, e.g. config changes
export function TrendLineChart({
  data,
  dataKey,
  name,
  unit = '',
  markers = [],
  height = 220
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  name: string;
  unit?: string;
  markers?: { day: string; label: string }[];
  height?: number;
}) {
  const chart = useChartTheme();
  const format = useFormat();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={chart.grid} />
        <XAxis dataKey="day" {...axisProps(chart)} minTickGap={24} />
        <YAxis {...axisProps(chart)} axisLine={false} width={48} unit={unit} />
        <Tooltip
          {...chart.tooltip}
          formatter={(value) => [
            `${format.number(Number(value))}${unit}`,
            name
          ]}
        />
        {markers.map((marker) => (
          <ReferenceLine
            key={marker.day + marker.label}
            x={marker.day}
            stroke={chart.axisText}
            strokeDasharray="3 3"
            label={{
              value: '⚙',
              position: 'top',
              fill: chart.axisText,
              fontSize: 12
            }}
          />
        ))}
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={SERIES_COLORS[0]}
          strokeWidth={2}
          dot={{
            r: 3,
            fill: SERIES_COLORS[0],
            stroke: chart.surface,
            strokeWidth: 2
          }}
          activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Products found per full crawl, small enough for a table cell
export function Sparkline({
  values
}: {
  values: { day: string; value: number }[];
}) {
  const { t } = useTranslation('admin');
  const chart = useChartTheme();
  const format = useFormat();
  if (values.length < 2) return null;
  return (
    <div style={{ width: 96, height: 28 }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={values}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
        >
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            {...chart.tooltip}
            cursor={false}
            wrapperStyle={{ zIndex: 10 }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.day}
            formatter={(value) => [
              format.number(Number(value)),
              t('charts.products')
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={SERIES_COLORS[0]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
