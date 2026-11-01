'use client';
import { Card, Col, Row, Segmented, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import { ConfigCommit, FIELD_ERRORS, TrendRow } from '../../utils/admin/types';
import { fetchJson } from './api';
import { FieldErrorsChart, TrendLineChart } from './charts';

// Every day in the range, so gaps between scans and config markers line up
const allDays = (days: number) =>
  Array.from({ length: days + 1 }, (_, i) =>
    dayjs
      .utc()
      .subtract(days - i, 'day')
      .format('YYYY-MM-DD')
  );

export default function StoreTrends({ storeId }: { storeId: number }) {
  const [days, setDays] = useState(90);
  const { data: rows } = useSWR<TrendRow[]>(
    `/api/admin/trends?days=${days}&storeId=${storeId}`,
    fetchJson
  );
  const { data: crawls } = useSWR<TrendRow[]>(
    `/api/admin/trends?days=${days}&storeId=${storeId}&mode=crawler`,
    fetchJson
  );
  const { data: history } = useSWR<ConfigCommit[]>(
    `/api/admin/stores/${storeId}/history`,
    fetchJson
  );

  const range = allDays(days);
  const markers = (history ?? [])
    .map((commit) => ({
      day: dayjs.utc(commit.date).format('YYYY-MM-DD'),
      label: commit.message.split('\n')[0]
    }))
    .filter((marker) => marker.day >= range[0]);

  const products = range.map((day) => {
    const row = crawls?.find((r) => r.day === day);
    return {
      day,
      products: row
        ? Number(row.totalProcessed) / Number(row.jobs)
        : (null as unknown as number)
    };
  });
  const errorRate = range.map((day) => {
    const row = rows?.find((r) => r.day === day);
    const fieldErrors = row
      ? FIELD_ERRORS.reduce((sum, field) => sum + Number(row[field]), 0)
      : 0;
    return {
      day,
      rate:
        row && Number(row.totalProcessed) > 0
          ? Math.round((fieldErrors / Number(row.totalProcessed)) * 1000) / 10
          : (null as unknown as number)
    };
  });
  const filledRows = range.map(
    (day) =>
      rows?.find((r) => r.day === day) ??
      ({
        day,
        storeId,
        jobs: 0,
        failedJobs: 0,
        totalRequests: 0,
        totalProcessed: 0,
        totalErrored: 0,
        ...Object.fromEntries(FIELD_ERRORS.map((f) => [f, 0]))
      } as TrendRow)
  );

  if (!rows || !crawls) return <Spin />;
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24}>
        <Typography.Text type="secondary">
          Dashed lines mark config changes.{' '}
        </Typography.Text>
        <Segmented
          size="small"
          value={days}
          onChange={(value) => setDays(value as number)}
          options={[
            { value: 30, label: '30 d' },
            { value: 90, label: '90 d' },
            { value: 365, label: '1 y' }
          ]}
        />
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title="Products found per full crawl">
          <TrendLineChart
            data={products}
            dataKey="products"
            name="Products"
            markers={markers}
          />
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title="Field errors per 100 products">
          <TrendLineChart
            data={errorRate}
            dataKey="rate"
            name="Errors per 100 products"
            markers={markers}
          />
        </Card>
      </Col>
      <Col xs={24}>
        <Card size="small" title="Field errors per day">
          <FieldErrorsChart rows={filledRows} markers={markers} />
        </Card>
      </Col>
    </Row>
  );
}
