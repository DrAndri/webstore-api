'use client';
import { ConfigProvider, theme } from 'antd';
import { createContext, useContext, useMemo, useState } from 'react';
import { getThemeConfig, THEME_COOKIE, ThemeMode } from '../../utils/theme';

const ThemeModeContext = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}>({ mode: 'light', setMode: () => {} });

export const useThemeMode = () => useContext(ThemeModeContext);

// Styles outside of antd components, from the tokens of the current theme
function GlobalStyle({ mode }: { mode: ThemeMode }) {
  const { token } = theme.useToken();
  return (
    <style>{`
      :root {
        color-scheme: ${mode};
        --app-highlight-bg: ${token.colorWarningBg};
      }
      body {
        background: ${token.colorBgLayout};
        color: ${token.colorText};
        font-family: ${token.fontFamily};
      }
    `}</style>
  );
}

export default function ThemeProvider({
  initialMode,
  children
}: {
  initialMode: ThemeMode;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState(initialMode);
  const context = useMemo(
    () => ({
      mode,
      setMode: (mode: ThemeMode) => {
        document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
        setModeState(mode);
      }
    }),
    [mode]
  );
  return (
    <ThemeModeContext.Provider value={context}>
      <ConfigProvider theme={getThemeConfig(mode)}>
        <GlobalStyle mode={mode} />
        {children}
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
