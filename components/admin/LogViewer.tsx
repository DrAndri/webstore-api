'use client';
import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Flex,
  Input,
  Segmented,
  Select,
  Spin,
  Switch,
  Tag,
  theme,
  Typography
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { LOG_LEVELS, LogEntry, LogsResponse } from '../../utils/admin/types';
import { fetchJson } from './api';

const POLL_INTERVAL_MS = 3000;
const PAGE_SIZE = 300;
// Following the log live drops the oldest lines past this
const MAX_LIVE_ENTRIES = 5000;

const PRESETS = {
  '15m': 15 * 60 * 1000,
  '1h': 3600 * 1000,
  '6h': 6 * 3600 * 1000,
  '24h': 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000
} as const;
type Preset = keyof typeof PRESETS;
type Range = { preset: Preset } | { start: number; end: number };

const LEVEL_COLORS: Record<string, string> = {
  error: 'error',
  warn: 'warning',
  info: 'blue',
  http: 'cyan'
};

const byNewest = (a: LogEntry, b: LogEntry) =>
  a.ts === b.ts ? 0 : BigInt(a.ts) > BigInt(b.ts) ? -1 : 1;

// Newest first, each line once
const merge = (...lists: LogEntry[][]) => {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((entry) => !seen.has(entry.key) && !!seen.add(entry.key))
    .sort(byNewest);
};

// Loki timestamps are milliseconds here, many lines share one. The next page
// starts at the timestamp of the last line, including it, and asks for the
// lines already loaded at it on top, so every page has new lines.
const pageAt = (entries: LogEntry[], ts: string, name: 'before' | 'after') => ({
  [name]: ts,
  limit: String(PAGE_SIZE + entries.filter((entry) => entry.ts === ts).length)
});

// The path of a page url is enough to tell the pages of a store apart
const shortPage = (page: string) => {
  try {
    const url = new URL(page);
    return decodeURI(url.pathname + url.search);
  } catch {
    return page;
  }
};

export type LogViewerProps =
  | {
      source: 'app';
      initialLabels?: string[];
      initialRange?: { start: number; end: number };
    }
  | { source: 'scan'; jobId: number; running: boolean };

interface View {
  // The filters the entries were loaded with
  key: string;
  entries: LogEntry[];
  hasMore: boolean;
  query: string;
  note?: string;
  error?: string;
  // The time range of the app log the entries were loaded for, in ms
  range?: { start: number; end?: number };
}

function LogLine({
  entry,
  onLabel
}: {
  entry: LogEntry;
  onLabel: (label: string) => void;
}) {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const { stack, ...fields } = entry.fields;
  const hasDetails = stack !== undefined || Object.keys(fields).length > 0;
  return (
    <div
      style={{
        padding: '3px 8px',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        cursor: hasDetails ? 'pointer' : undefined
      }}
      onClick={() => hasDetails && setOpen(!open)}
    >
      <Flex gap={8} align="baseline">
        <Typography.Text
          type="secondary"
          style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}
          title={entry.time}
        >
          {dayjs(entry.time).format('MMM D HH:mm:ss.SSS')}
        </Typography.Text>
        <Tag
          color={LEVEL_COLORS[entry.level]}
          style={{ marginInlineEnd: 0, minWidth: 52, textAlign: 'center' }}
        >
          {entry.level}
        </Tag>
        {(entry.label ?? entry.page) && (
          <Tag
            style={{
              marginInlineEnd: 0,
              cursor: 'pointer',
              maxWidth: 280,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flexShrink: 0
            }}
            title={`Filter by ${entry.label ?? entry.page}`}
            onClick={(event) => {
              event.stopPropagation();
              onLabel((entry.label ?? entry.page)!);
            }}
          >
            {entry.label ?? shortPage(entry.page!)}
          </Tag>
        )}
        <span
          style={{
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            minWidth: 0
          }}
        >
          {entry.message}
        </span>
      </Flex>
      {open && (
        <div onClick={(event) => event.stopPropagation()}>
          {typeof stack === 'string' && (
            <pre
              style={{ margin: '4px 0', fontSize: 12, whiteSpace: 'pre-wrap' }}
            >
              {stack}
            </pre>
          )}
          {Object.keys(fields).length > 0 && (
            <pre
              style={{ margin: '4px 0', fontSize: 12, whiteSpace: 'pre-wrap' }}
            >
              {JSON.stringify(fields, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// The scraper's log in Loki, filtered by level, label and text, following new
// lines live
export default function LogViewer(props: LogViewerProps) {
  const isApp = props.source === 'app';
  const [levels, setLevels] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>(
    props.source === 'app' ? (props.initialLabels ?? []) : []
  );
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<Range>(
    props.source === 'app' && props.initialRange
      ? props.initialRange
      : { preset: '1h' }
  );
  const [live, setLive] = useState(
    props.source === 'app' ? !props.initialRange : props.running
  );
  const [pageSearch, setPageSearch] = useState('');
  const [reloads, setReloads] = useState(0);
  const [view, setView] = useState<View>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string>();

  const filters = new URLSearchParams(
    props.source === 'app'
      ? { source: 'app' }
      : { source: 'scan', job: String(props.jobId) }
  );
  if (levels.length > 0) filters.set('levels', levels.join(','));
  for (const label of labels) filters.append('label', label);
  if (search) filters.set('search', search);
  const filtersString = filters.toString();
  const key = `${filtersString}#${JSON.stringify(range)}#${reloads}`;
  const loading = view?.key !== key;
  const canFollow = !isApp || 'preset' in range;
  const following = live && canFollow && !loading && !view?.note;

  // The url of a page of the log, with the time range it was loaded for
  const logsUrl = (
    loadedRange: View['range'],
    extra: Record<string, string>
  ) => {
    const params = new URLSearchParams(filtersString);
    if (loadedRange) {
      params.set('start', String(loadedRange.start));
      if (loadedRange.end) params.set('end', String(loadedRange.end));
    }
    for (const [name, value] of Object.entries(extra)) params.set(name, value);
    return `/api/admin/logs?${params}`;
  };

  // Loads the newest lines when the filters change
  useEffect(() => {
    const controller = new AbortController();
    const loadedRange = isApp
      ? 'preset' in range
        ? { start: Date.now() - PRESETS[range.preset] }
        : range
      : undefined;
    const params = new URLSearchParams(filtersString);
    if (loadedRange) {
      params.set('start', String(loadedRange.start));
      if ('end' in loadedRange) params.set('end', String(loadedRange.end));
    }
    params.set('limit', String(PAGE_SIZE));
    fetch(`/api/admin/logs?${params}`, {
      cache: 'no-store',
      signal: controller.signal
    })
      .then(async (response) => {
        const body = (await response.json()) as LogsResponse & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error ?? 'Loading the log failed');
        setView({ key, ...body, range: loadedRange });
        setOlderError(undefined);
      })
      .catch((e: Error) => {
        if (controller.signal.aborted) return;
        setView({
          key,
          entries: [],
          hasMore: false,
          query: '',
          error: e.message,
          range: loadedRange
        });
      });
    return () => controller.abort();
    // key changes with everything the request depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The poll reads the latest entries without restarting the timer
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Follows the log: asks for the lines from the newest one on
  useEffect(() => {
    if (!following) return;
    let inFlight = false;
    const poll = async () => {
      const current = viewRef.current;
      if (inFlight || !current) return;
      inFlight = true;
      try {
        const newest = current.entries[0]?.ts;
        const response = await fetchJson<LogsResponse>(
          logsUrl(
            current.range && { start: current.range.start },
            newest
              ? pageAt(current.entries, newest, 'after')
              : { limit: String(PAGE_SIZE) }
          )
        );
        setView((previous) => {
          if (!previous || previous.key !== current.key) return previous;
          const entries = merge(response.entries, previous.entries);
          return {
            ...previous,
            error: undefined,
            entries: entries.slice(0, MAX_LIVE_ENTRIES),
            hasMore: previous.hasMore || entries.length > MAX_LIVE_ENTRIES
          };
        });
      } catch (e) {
        setView((previous) =>
          previous && previous.key === current.key
            ? { ...previous, error: (e as Error).message }
            : previous
        );
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // Restarts only when following starts or the filters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, key]);

  const loadOlder = async () => {
    if (!view) return;
    const oldest = view.entries[view.entries.length - 1];
    if (!oldest) return;
    setLoadingOlder(true);
    setOlderError(undefined);
    try {
      const response = await fetchJson<LogsResponse>(
        logsUrl(view.range, pageAt(view.entries, oldest.ts, 'before'))
      );
      setView((previous) =>
        previous && previous.key === view.key
          ? {
              ...previous,
              entries: merge(previous.entries, response.entries),
              hasMore: response.hasMore
            }
          : previous
      );
    } catch (e) {
      setOlderError((e as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const labelsUrl = (() => {
    if (isApp) {
      if (!view?.range) return null;
      const params = new URLSearchParams({
        source: 'app',
        start: String(view.range.start)
      });
      if (view.range.end) params.set('end', String(view.range.end));
      return `/api/admin/logs/labels?${params}`;
    }
    return `/api/admin/logs/labels?${new URLSearchParams({
      source: 'scan',
      job: String(props.jobId),
      q: pageSearch
    })}`;
  })();
  const { data: labelOptions, isLoading: labelsLoading } = useSWR<
    { value: string; count?: number }[]
  >(labelsUrl, fetchJson, {
    keepPreviousData: true,
    refreshInterval: following ? 15000 : 0
  });

  const addLabel = (label: string) => {
    if (!labels.includes(label)) setLabels([...labels, label]);
  };

  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap align="center">
        <Select
          mode="multiple"
          allowClear
          placeholder="All levels"
          style={{ minWidth: 160 }}
          value={levels}
          onChange={setLevels}
          options={LOG_LEVELS.map((level) => ({ value: level, label: level }))}
        />
        <Select
          mode="multiple"
          allowClear
          showSearch={
            isApp
              ? { optionFilterProp: 'value' }
              : { filterOption: false, onSearch: setPageSearch }
          }
          placeholder={isApp ? 'All labels' : 'All pages'}
          style={{ minWidth: 220, maxWidth: 480 }}
          value={labels}
          onChange={(value) => {
            setLabels(value);
            setPageSearch('');
          }}
          loading={labelsLoading}
          notFoundContent={labelsLoading ? <Spin size="small" /> : undefined}
          options={[
            // Labels from the url or a clicked line may not be in the list
            ...labels
              .filter(
                (label) =>
                  !labelOptions?.some((option) => option.value === label)
              )
              .map((value) => ({ value })),
            ...(labelOptions ?? [])
          ].map((option: { value: string; count?: number }) => ({
            value: option.value,
            label:
              option.count !== undefined
                ? `${option.value} (${option.count.toLocaleString('is-IS')})`
                : isApp
                  ? option.value
                  : shortPage(option.value),
            title: option.value
          }))}
        />
        <Input.Search
          allowClear
          placeholder="Search the lines"
          style={{ width: 240 }}
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            if (!event.target.value) setSearch('');
          }}
          onSearch={(value) => setSearch(value.trim())}
        />
        {isApp && (
          <>
            <Segmented<Preset | 'custom'>
              value={'preset' in range ? range.preset : 'custom'}
              onChange={(value) => {
                if (value !== 'custom') setRange({ preset: value });
              }}
              options={[
                ...(Object.keys(PRESETS) as Preset[]),
                ...('preset' in range ? [] : ['custom' as const])
              ]}
            />
            <DatePicker.RangePicker
              showTime
              allowClear={false}
              value={
                'preset' in range
                  ? null
                  : [dayjs(range.start), dayjs(range.end)]
              }
              onChange={(dates: [Dayjs | null, Dayjs | null] | null) => {
                if (dates?.[0] && dates[1])
                  setRange({
                    start: dates[0].valueOf(),
                    end: dates[1].valueOf()
                  });
              }}
            />
          </>
        )}
        <Flex gap={6} align="center">
          <Switch
            size="small"
            checked={live && canFollow}
            disabled={!canFollow}
            onChange={setLive}
          />
          <Typography.Text type={canFollow ? undefined : 'secondary'}>
            Live
          </Typography.Text>
        </Flex>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => setReloads(reloads + 1)}
          title="Reload"
        />
      </Flex>

      {view?.error && <Alert type="error" showIcon title={view.error} />}
      {view && !loading && view.query && (
        <Flex gap={8} wrap align="baseline">
          <Typography.Text type="secondary">
            {view.entries.length.toLocaleString('is-IS')} lines
            {view.hasMore ? ', older lines not loaded' : ''}
            {following ? ' · following new lines' : ''}
          </Typography.Text>
          <Typography.Text
            type="secondary"
            code
            copyable
            style={{ fontSize: 12 }}
          >
            {view.query}
          </Typography.Text>
        </Flex>
      )}

      <Spin spinning={loading}>
        {view?.note ? (
          <Empty description={view.note} />
        ) : view && view.entries.length === 0 ? (
          <Empty
            description={
              props.source === 'scan'
                ? 'No lines. Scans log pages only with ENABLE_SCRAPER_LOGGING=true.'
                : 'No lines'
            }
          />
        ) : (
          <div style={{ fontSize: 13, minHeight: 120 }}>
            {view?.entries.map((entry) => (
              <LogLine key={entry.key} entry={entry} onLabel={addLabel} />
            ))}
          </div>
        )}
      </Spin>
      {olderError && <Alert type="error" showIcon title={olderError} />}
      {view?.hasMore && !loading && (
        <Button loading={loadingOlder} onClick={() => void loadOlder()}>
          Load older lines
        </Button>
      )}
    </Flex>
  );
}
