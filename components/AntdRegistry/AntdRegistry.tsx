'use client';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import CacheEntity from '@ant-design/cssinjs/es/Cache';
import { useServerInsertedHTML } from 'next/navigation';
import { useState } from 'react';

// @ant-design/nextjs-registry, except that the server does not call
// createCache(). It names the cache with Math.random(), which Cache Components
// does not allow while prerendering. The name is only used in the browser, to
// tell apart the style elements of different caches.
export default function AntdRegistry({
  children
}: {
  children: React.ReactNode;
}) {
  const [cache] = useState(() =>
    typeof window === 'undefined' ? new CacheEntity('server') : createCache()
  );
  useServerInsertedHTML(() => {
    const styleText = extractStyle(cache, { plain: true, once: true });
    if (styleText.includes('.data-ant-cssinjs-cache-path{content:"";}'))
      return null;
    return (
      <style
        id="antd-cssinjs"
        // Before the styles antd adds in the browser
        data-rc-order="prepend"
        data-rc-priority="-1000"
        dangerouslySetInnerHTML={{ __html: styleText }}
      />
    );
  });
  return <StyleProvider cache={cache}>{children}</StyleProvider>;
}
