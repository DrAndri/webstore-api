import { Flex, Typography } from 'antd';
import JobHistory from '../../../../components/admin/JobHistory';

export default function JobsPage() {
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Scan history
      </Typography.Title>
      <JobHistory />
    </Flex>
  );
}
