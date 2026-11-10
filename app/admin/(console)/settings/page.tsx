import { Flex } from 'antd';
import Title from 'antd/es/typography/Title';
import { getTranslation } from '../../../../i18n/server';
import Settings from '../../../../components/admin/Settings';

export default async function SettingsPage() {
  const { t } = await getTranslation('admin');
  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        {t('settings.title')}
      </Title>
      <Settings />
    </Flex>
  );
}
