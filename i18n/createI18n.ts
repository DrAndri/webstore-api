import { createInstance, i18n } from 'i18next';
import { NAMESPACES, resources } from './resources';
import { Language, LANGUAGES } from './settings';

// An i18next instance for one language. The resources are bundled, so it is
// ready when this returns, on the server and in the first client render.
export const createI18n = (language: Language): i18n => {
  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGES],
    resources,
    ns: NAMESPACES,
    defaultNS: 'common',
    // React escapes the values
    interpolation: { escapeValue: false },
    initAsync: false
  });
  return instance;
};
