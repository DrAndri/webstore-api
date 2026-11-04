import { Flex } from 'antd';
import Title from 'antd/es/typography/Title';
import { getTranslation } from '../../../../i18n/server';
import Schedules from '../../../../components/admin/Schedules';

export default async function SchedulesPage() {
  const { t } = await getTranslation('admin');
  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        {t('schedules.title')}
      </Title>
      <Schedules />
    </Flex>
  );
}
