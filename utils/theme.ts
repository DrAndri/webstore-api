import { theme, ThemeConfig } from 'antd';

export type ThemeMode = 'light' | 'dark';

// Remembers the chosen mode, so the server renders the page in it
export const THEME_COOKIE = 'theme';

export const parseThemeMode = (value: string | undefined): ThemeMode =>
  value === 'dark' ? 'dark' : 'light';

// The antd theme of the whole app, see https://ant.design/docs/react/customize-theme.
// Tokens in token apply to both modes, those in MODE_TOKENS to one mode only.
// Component tokens go in components, e.g. { Layout: { headerBg: '#001529' } }.
const THEME: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif"
  },
  components: {}
};

const MODE_TOKENS: Record<ThemeMode, ThemeConfig['token']> = {
  light: {},
  dark: {}
};

export const getThemeConfig = (mode: ThemeMode): ThemeConfig => ({
  ...THEME,
  algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: { ...THEME.token, ...MODE_TOKENS[mode] }
});
