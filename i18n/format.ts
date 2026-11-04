import dayjs from 'dayjs';
import 'dayjs/locale/is';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import { TFunction } from 'i18next';
import { Language, LOCALES } from './settings';

dayjs.extend(relativeTime);
dayjs.extend(utc);

export type Format = ReturnType<typeof createFormat>;

// Numbers, prices, times and durations in a language. t is the common
// namespace of the same language. The language is passed to dayjs on each
// call, its global locale is never changed, since the server renders pages in
// both languages at the same time.
export const createFormat = (language: Language, t: TFunction<'common'>) => {
  const locale = LOCALES[language];
  const numberFormat = new Intl.NumberFormat(locale);
  const number = (value: number | null | undefined) =>
    value === null || value === undefined ? '–' : numberFormat.format(value);
  return {
    language,
    locale,
    number,
    // Prices are in Icelandic krónur
    price: (value: number | null | undefined) =>
      value === null || value === undefined ? '–' : `${number(value)} kr.`,
    // The same in every language, so times sort and compare at a glance
    time: (value: string | null | undefined) =>
      value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '–',
    date: (value: string | null | undefined) =>
      value ? dayjs(value).format('YYYY-MM-DD') : '–',
    fromNow: (value: string | null | undefined) =>
      value ? dayjs(value).locale(language).fromNow() : t('never'),
    duration: (start: string | null | undefined, end?: string | null) => {
      if (!start) return '–';
      const minutes = dayjs(end ?? undefined).diff(dayjs(start), 'minute');
      if (minutes < 1) return t('duration.lessThanMinute');
      if (minutes < 60) return t('duration.minutes', { minutes });
      return t('duration.hoursMinutes', {
        hours: Math.floor(minutes / 60),
        minutes: minutes % 60
      });
    }
  };
};
