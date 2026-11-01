import { notFound } from 'next/navigation';
import ApiUserPage from '../../../../../components/admin/ApiUserPage';

export default async function ApiUserAdminPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <ApiUserPage userId={id} />;
}
