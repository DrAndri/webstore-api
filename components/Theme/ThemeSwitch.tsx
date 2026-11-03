'use client';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useThemeMode } from './ThemeProvider';

// Switches between light and dark mode. dark is for the dark page header.
export default function ThemeSwitch({
  dark = false,
  type
}: {
  dark?: boolean;
  type?: 'text';
}) {
  const { mode, setMode } = useThemeMode();
  const label = mode === 'dark' ? 'Ljóst útlit' : 'Dökkt útlit';
  return (
    <Tooltip title={label}>
      <Button
        aria-label={label}
        ghost={dark}
        type={type}
        icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
      />
    </Tooltip>
  );
}
