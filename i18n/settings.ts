// The languages of the app. Icelandic is the default, the language a visitor
// picks is kept in a cookie so the server renders the page in it.
export const LANGUAGES = ['is', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'is';
export const LANGUAGE_COOKIE = 'lang';

// Each language in itself, for the language switch
export const LANGUAGE_NAMES: Record<Language, string> = {
  is: 'Íslenska',
  en: 'English'
};

// Numbers and dates are formatted for these locales
export const LOCALES: Record<Language, string> = {
  is: 'is-IS',
  en: 'en-GB'
};

export const parseLanguage = (
  value: string | null | undefined
): Language | undefined => LANGUAGES.find((language) => language === value);

// The cookie, or the first supported language of Accept-Language
export const pickLanguage = (
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined
): Language => {
  const chosen = parseLanguage(cookie);
  if (chosen) return chosen;
  const preferred = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), q: q === undefined ? 1 : Number(q) };
    })
    .filter(({ q }) => q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of preferred) {
    const language = parseLanguage(tag.split('-')[0]);
    if (language) return language;
  }
  return DEFAULT_LANGUAGE;
};
