import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { createI18n } from './createI18n';
import { createFormat } from './format';
import { Namespace } from './resources';
import { Language, LANGUAGE_COOKIE, pickLanguage } from './settings';

// The language of the request, from the cookie or Accept-Language. Works in
// server components, server actions and route handlers.
export const getLanguage = async (): Promise<Language> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return pickLanguage(
    cookieStore.get(LANGUAGE_COOKIE)?.value,
    headerList.get('accept-language')
  );
};

// One instance for each language, they only read the bundled resources
const instances = new Map<Language, ReturnType<typeof createI18n>>();
const getI18n = (language: Language) => {
  let instance = instances.get(language);
  if (!instance) {
    instance = createI18n(language);
    instances.set(language, instance);
  }
  return instance;
};

// t of a namespace and the formatters in a language, the language of the
// request when none is given, e.g. const { t } = await getTranslation('site')
export const getTranslation = cache(
  async <N extends Namespace>(ns: N, language?: Language) => {
    const lang = language ?? (await getLanguage());
    const i18n = getI18n(lang);
    return {
      t: i18n.getFixedT(lang, ns),
      language: lang,
      format: createFormat(lang, i18n.getFixedT(lang, 'common'))
    };
  }
);
