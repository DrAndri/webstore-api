import { AntdRegistry } from '@ant-design/nextjs-registry';
import { GoogleAnalytics } from '@next/third-parties/google';
import { ConfigProvider } from 'antd';
import '../styles/globals.css';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="is">
      <body>
        <main>
          <AntdRegistry>
            <ConfigProvider>{children}</ConfigProvider>
          </AntdRegistry>
        </main>
        {process.env.GOOGLE_TAG && (
          <GoogleAnalytics gaId={process.env.GOOGLE_TAG} />
        )}
      </body>
    </html>
  );
}
