'use client';
import { Empty, Flex, Grid } from 'antd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StoreConfig } from '../../types';
import PriceChart from '../PriceChart/PriceChart';
import Search from '../Search/Search';
import { SELECTION_PARAM, useSelection } from '../Selection/SelectionProvider';
import SiteHeader from '../SiteHeader/SiteHeader';

// The price history of the selected products, more can be picked by name or
// SKU. The selection is shared with the advanced search.
export default function PriceView({
  stores,
  userMenu
}: {
  stores: StoreConfig[];
  userMenu?: React.ReactNode;
}) {
  const { t } = useTranslation('site');
  const screens = Grid.useBreakpoint();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { selectedIds } = useSelection();
  const idsKey = selectedIds.join(',');

  // Keep the selection in the url so the chart can be shared
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (idsKey) next.set(SELECTION_PARAM, idsKey);
    else next.delete(SELECTION_PARAM);
    if (next.toString() === params.toString()) return;
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false
    });
    // Written when the selection changes, the other params are kept
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, router, pathname]);

  return (
    <Flex vertical gap={16} style={{ padding: screens.md ? 24 : 12 }}>
      <SiteHeader page="prices" userMenu={userMenu} />
      <Flex>
        <Search stores={stores} />
      </Flex>
      {selectedIds.length ? (
        <div style={{ height: 'max(400px, calc(100vh - 200px))' }}>
          <PriceChart stores={stores} productIds={selectedIds} />
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('prices.empty')}
        />
      )}
    </Flex>
  );
}
