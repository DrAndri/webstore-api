import { notFound } from 'next/navigation';
import StorePage from '../../../../../components/admin/StorePage';

export default async function StoreAdminPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 0) notFound();
  return <StorePage storeId={id} />;
}
