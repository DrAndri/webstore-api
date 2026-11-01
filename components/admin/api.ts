'use client';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

dayjs.extend(relativeTime);
dayjs.extend(utc);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const handle = async <T>(response: Response): Promise<T> => {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401) {
    // A full page load on purpose, so nothing of the expired session stays in
    // memory. This runs outside components, where there is no router.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/admin/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error ?? `Request failed (${response.status})`
    );
  return body as T;
};

// SWR fetcher for the admin api
export const fetchJson = <T>(url: string): Promise<T> =>
  fetch(url, { cache: 'no-store' }).then((response) => handle<T>(response));

export const sendJson = <T>(url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then((response) => handle<T>(response));

export const formatTime = (value: string | null | undefined) =>
  value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '–';

export const fromNow = (value: string | null | undefined) =>
  value ? dayjs(value).fromNow() : 'never';

export const formatDuration = (
  start: string | null | undefined,
  end?: string | null
) => {
  if (!start) return '–';
  const minutes = dayjs(end ?? undefined).diff(dayjs(start), 'minute');
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

export const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '–' : value.toLocaleString('is-IS');
