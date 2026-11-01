import { Flex } from 'antd';
import Title from 'antd/es/typography/Title';
import JobHistory from '../../../../components/admin/JobHistory';

export default function JobsPage() {
  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        Scan history
      </Title>
      <JobHistory />
    </Flex>
  );
}
