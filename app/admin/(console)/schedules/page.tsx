import { Flex, Typography } from 'antd';
import Schedules from '../../../../components/admin/Schedules';

export default function SchedulesPage() {
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Schedules
      </Typography.Title>
      <Schedules />
    </Flex>
  );
}
