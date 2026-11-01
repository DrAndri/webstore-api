'use client';
import { Segmented, Table } from 'antd';
import { useState } from 'react';
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
import { formatNumber } from './api';

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
const SURFACE = '#ffffff';
const GRID = '#e8e8e6';
const AXIS_TEXT = '#52514e';

export const FIELD_LABELS: Record<FieldError, string> = {
  nameError: 'Name',
  brandError: 'Brand',
  imageError: 'Image',
  descriptionError: 'Description',
  inStockError: 'Stock',
  categoriesError: 'Categories',
  attributeError: 'Attributes'
};

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS_TEXT, fontSize: 12 },
  tickLine: false
};

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
  const [view, setView] = useState<'Chart' | 'Table'>('Chart');
  const data = totalsByDay(rows);

  return (
    <div>
      <Segmented
        size="small"
        options={['Chart', 'Table']}
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
            { title: 'Day', dataIndex: 'day' },
            {
              title: 'Products',
              dataIndex: 'totalProcessed',
              render: formatNumber
            },
            {
              title: 'Failed pages',
              dataIndex: 'totalErrored',
              render: formatNumber
            },
            ...FIELD_ERRORS.map((field) => ({
              title: FIELD_LABELS[field],
              dataIndex: field,
              render: formatNumber
            }))
          ]}
        />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="day" {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} axisLine={false} width={48} />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              formatter={(value, name) => [formatNumber(Number(value)), name]}
            />
            <Legend iconType="circle" iconSize={8} />
            {FIELD_ERRORS.map((field, index) => (
              <Bar
                key={field}
                dataKey={field}
                name={FIELD_LABELS[field]}
                stackId="errors"
                fill={SERIES_COLORS[index]}
                stroke={SURFACE}
                strokeWidth={1}
                maxBarSize={28}
                radius={index === FIELD_ERRORS.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
            {markers.map((marker) => (
              <ReferenceLine
                key={marker.day + marker.label}
                x={marker.day}
                stroke={AXIS_TEXT}
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="day" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} axisLine={false} width={48} unit={unit} />
        <Tooltip
          formatter={(value) => [`${formatNumber(Number(value))}${unit}`, name]}
        />
        {markers.map((marker) => (
          <ReferenceLine
            key={marker.day + marker.label}
            x={marker.day}
            stroke={AXIS_TEXT}
            strokeDasharray="3 3"
            label={{
              value: '⚙',
              position: 'top',
              fill: AXIS_TEXT,
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
            stroke: SURFACE,
            strokeWidth: 2
          }}
          activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}
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
            cursor={false}
            wrapperStyle={{ zIndex: 10 }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.day}
            formatter={(value) => [formatNumber(Number(value)), 'Products']}
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
