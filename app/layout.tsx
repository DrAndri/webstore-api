import { AntdRegistry } from '@ant-design/nextjs-registry';
import { GoogleAnalytics } from '@next/third-parties/google';
import { cookies } from 'next/headers';
import I18nProvider from '../components/I18n/I18nProvider';
import ThemeProvider from '../components/Theme/ThemeProvider';
import { getLanguage } from '../i18n/server';
import { parseThemeMode, THEME_COOKIE } from '../utils/theme';
import '../styles/globals.css';
export default async function Layout({
  children
}: {
  children: React.ReactNode;
}) {
  const mode = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  const language = await getLanguage();
  return (
    <html lang={language}>
      <body>
        <main>
          <AntdRegistry>
            <I18nProvider initialLanguage={language}>
              <ThemeProvider initialMode={mode}>{children}</ThemeProvider>
            </I18nProvider>
          </AntdRegistry>
        </main>
        {process.env.GOOGLE_TAG && (
          <GoogleAnalytics gaId={process.env.GOOGLE_TAG} />
        )}
      </body>
    </html>
  );
}
