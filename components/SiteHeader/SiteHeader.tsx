'use client';
import { Flex, Typography } from 'antd';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useSelection } from '../Selection/SelectionProvider';

export type SitePage = 'search' | 'prices' | 'compare';

// The title of the page, links to the other pages of the site and the user
// menu. Uses the selection, so it must be rendered inside Suspense.
export default function SiteHeader({
  page,
  userMenu
}: {
  page: SitePage;
  // Rendered by the page, it reads the session on the server
  userMenu?: React.ReactNode;
}) {
  const { t } = useTranslation('site');
  const { selected, lastSearch } = useSelection();
  const titles: Record<SitePage, string> = {
    search: t('advancedSearch.title'),
    prices: t('prices.title'),
    compare: t('compare.title')
  };
  return (
    <Flex justify="space-between" align="center" wrap gap={8}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {titles[page]}
      </Typography.Title>
      <Flex gap={16} align="center" wrap>
        {page !== 'search' && (
          <Link href={lastSearch ? `/?${lastSearch}` : '/'}>
            {t('header.advancedSearch')}
          </Link>
        )}
        {page !== 'prices' && (
          <Link href="/prices">
            {selected.length
              ? t('header.priceHistoryCount', { selected: selected.length })
              : t('header.priceHistory')}
          </Link>
        )}
        {userMenu}
      </Flex>
    </Flex>
  );
}
