import { notFound } from 'next/navigation';
import JobLogPage from '../../../../../components/admin/JobLogPage';

export default async function JobPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 0) notFound();
  return <JobLogPage jobId={id} />;
}
