import { Flex } from 'antd';
import Title from 'antd/es/typography/Title';
import LogViewer from '../../../../components/admin/LogViewer';

const toList = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

// The log of the scraper itself. ?label=, ?start= and ?end= (ms) open it
// filtered, e.g. from a scan to the lines logged while it ran.
export default async function LogsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const start = Number(params.start);
  const end = Number(params.end);
  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        Logs
      </Title>
      <LogViewer
        source="app"
        initialLabels={toList(params.label)}
        initialRange={start > 0 && end > start ? { start, end } : undefined}
      />
    </Flex>
  );
}
