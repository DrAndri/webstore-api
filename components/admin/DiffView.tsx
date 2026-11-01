'use client';
import { Empty } from 'antd';
import { DiffLine } from '../../utils/admin/storeConfig';

const STYLES: Record<DiffLine['type'], React.CSSProperties> = {
  add: { background: '#e6ffec' },
  remove: { background: '#ffebe9' },
  context: {},
  hunk: { background: '#f0f5ff', color: '#52514e' }
};
const PREFIX = { add: '+', remove: '-', context: ' ', hunk: '' };

export default function DiffView({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0)
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No changes" />
    );
  return (
    <pre
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        margin: 0,
        maxHeight: 480,
        overflow: 'auto',
        border: '1px solid #e8e8e6',
        borderRadius: 6
      }}
    >
      {lines.map((line, index) => (
        <div
          key={index}
          style={{ ...STYLES[line.type], padding: '0 8px', whiteSpace: 'pre' }}
        >
          {PREFIX[line.type]}
          {line.text}
        </div>
      ))}
    </pre>
  );
}
