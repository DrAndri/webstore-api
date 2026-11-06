'use client';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from './ThemeProvider';

// Switches between light and dark mode. dark is for the dark page header.
export default function ThemeSwitch({ type }: { type?: 'text' }) {
  const { t } = useTranslation('common');
  const { mode, setMode } = useThemeMode();
  const label = mode === 'dark' ? t('theme.light') : t('theme.dark');
  return (
    <Tooltip title={label}>
      <Button
        aria-label={label}
        type={type}
        icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
      />
    </Tooltip>
  );
}
