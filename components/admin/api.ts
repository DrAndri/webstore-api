'use client';
import { resources } from '../../i18n/resources';
import { DEFAULT_LANGUAGE, parseLanguage } from '../../i18n/settings';

// For responses without a message. There is no t outside components, the lang
// attribute of the page follows the language switch.
const requestFailed = (status: number) =>
  resources[
    parseLanguage(document.documentElement.lang) ?? DEFAULT_LANGUAGE
  ].errors.requestFailed.replace('{{status}}', String(status));

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
      body.error ?? requestFailed(response.status)
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

// Times, durations and numbers are formatted with useFormat() from
// components/I18n/I18nProvider, in the language of the page
