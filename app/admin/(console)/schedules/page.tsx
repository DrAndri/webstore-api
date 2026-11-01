import { Flex } from 'antd';
import Title from 'antd/es/typography/Title';
import Schedules from '../../../../components/admin/Schedules';

export default function SchedulesPage() {
  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        Schedules
      </Title>
      <Schedules />
    </Flex>
  );
}
