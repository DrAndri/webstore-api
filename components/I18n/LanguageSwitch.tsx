'use client';
import { Button, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES, LANGUAGES } from '../../i18n/settings';
import { useLanguage } from './I18nProvider';

// Switches to the other language, shows the code of the one it switches to.
// dark is for the dark page header.
export default function LanguageSwitch({ type }: { type?: 'text' }) {
  const { t } = useTranslation('common');
  const { language, setLanguage } = useLanguage();
  const next = LANGUAGES.find((other) => other !== language) ?? language;
  const label = t('language.switchTo', { language: LANGUAGE_NAMES[next] });
  return (
    <Tooltip title={label}>
      <Button
        aria-label={label}
        lang={next}
        type={type}
        onClick={() => setLanguage(next)}
      >
        {next.toUpperCase()}
      </Button>
    </Tooltip>
  );
}
