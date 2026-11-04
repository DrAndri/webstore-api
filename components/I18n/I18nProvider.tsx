'use client';
import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import isIS from 'antd/locale/is_IS';
import type { Locale } from 'antd/es/locale';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { createI18n } from '../../i18n/createI18n';
import { createFormat } from '../../i18n/format';
import { Language, LANGUAGE_COOKIE } from '../../i18n/settings';

const ANTD_LOCALES: Record<Language, Locale> = { is: isIS, en: enUS };

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: 'is', setLanguage: () => {} });

export const useLanguage = () => useContext(LanguageContext);

// Numbers, prices, times and durations in the current language
export const useFormat = () => {
  const { language } = useLanguage();
  const { t } = useTranslation('common');
  return useMemo(() => createFormat(language, t), [language, t]);
};

// Translations for the client components and the locale of antd. The server
// picks the language, so the first render matches the server's.
export default function I18nProvider({
  initialLanguage,
  children
}: {
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [i18n] = useState(() => createI18n(initialLanguage));
  const [language, setLanguageState] = useState(initialLanguage);
  const context = useMemo(
    () => ({
      language,
      setLanguage: (next: Language) => {
        document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = next;
        void i18n.changeLanguage(next);
        setLanguageState(next);
        // Server components render again in the new language
        router.refresh();
      }
    }),
    [language, i18n, router]
  );
  return (
    <LanguageContext.Provider value={context}>
      <I18nextProvider i18n={i18n}>
        <ConfigProvider locale={ANTD_LOCALES[language]}>
          {children}
        </ConfigProvider>
      </I18nextProvider>
    </LanguageContext.Provider>
  );
}
