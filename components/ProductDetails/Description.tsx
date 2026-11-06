'use client';
import { Button, Flex, Typography } from 'antd';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const clamp = (rows: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: rows,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
});

// The HTML description of a product, cut to its first rows lines until expanded.
// The ellipsis of antd's Typography can only cut text, not HTML, so the lines
// are clamped with css instead.
export default function Description({
  html,
  rows = 6
}: {
  html: string;
  rows?: number;
}) {
  const { t } = useTranslation('site');
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Whether the clamp hides any lines, measured again when the width changes
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    // 1px slack since the heights are rounded
    const measure = () =>
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [html, rows, expanded]);

  return (
    <Flex vertical align="flex-start" gap={4}>
      <Typography.Paragraph style={{ margin: 0, width: '100%' }}>
        <div
          ref={ref}
          style={{ whiteSpace: 'pre-line', ...(expanded ? {} : clamp(rows)) }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Typography.Paragraph>
      {(overflows || expanded) && (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? t('productDetails.showLess')
            : t('productDetails.showMore')}
        </Button>
      )}
    </Flex>
  );
}
