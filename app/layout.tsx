import { AntdRegistry } from '@ant-design/nextjs-registry';
import { GoogleAnalytics } from '@next/third-parties/google';
import { cookies } from 'next/headers';
import ThemeProvider from '../components/Theme/ThemeProvider';
import { parseThemeMode, THEME_COOKIE } from '../utils/theme';
import '../styles/globals.css';
export default async function Layout({
  children
}: {
  children: React.ReactNode;
}) {
  const mode = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="is">
      <body>
        <main>
          <AntdRegistry>
            <ThemeProvider initialMode={mode}>{children}</ThemeProvider>
          </AntdRegistry>
        </main>
        {process.env.GOOGLE_TAG && (
          <GoogleAnalytics gaId={process.env.GOOGLE_TAG} />
        )}
      </body>
    </html>
  );
}
