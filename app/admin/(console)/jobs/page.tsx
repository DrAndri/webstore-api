import { Flex } from 'antd';
import Title from 'antd/es/typography/Title';
import { getTranslation } from '../../../../i18n/server';
import JobHistory from '../../../../components/admin/JobHistory';

export default async function JobsPage() {
  const { t } = await getTranslation('admin');
  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        {t('jobs.title')}
      </Title>
      <JobHistory />
    </Flex>
  );
}
