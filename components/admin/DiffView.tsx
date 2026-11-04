'use client';
import { Empty, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { DiffLine } from '../../utils/admin/storeConfig';

const PREFIX = { add: '+', remove: '-', context: ' ', hunk: '' };

export default function DiffView({ lines }: { lines: DiffLine[] }) {
  const { t } = useTranslation('stores');
  const { token } = theme.useToken();
  const styles: Record<DiffLine['type'], React.CSSProperties> = {
    add: { background: token.colorSuccessBg },
    remove: { background: token.colorErrorBg },
    context: {},
    hunk: { background: token.colorPrimaryBg, color: token.colorTextSecondary }
  };
  if (lines.length === 0)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('diff.noChanges')}
      />
    );
  return (
    <pre
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        margin: 0,
        maxHeight: 480,
        overflow: 'auto',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 6
      }}
    >
      {lines.map((line, index) => (
        <div
          key={index}
          style={{ ...styles[line.type], padding: '0 8px', whiteSpace: 'pre' }}
        >
          {PREFIX[line.type]}
          {line.text}
        </div>
      ))}
    </pre>
  );
}
