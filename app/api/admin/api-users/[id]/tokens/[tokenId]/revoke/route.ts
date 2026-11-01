import { UpsertResult } from 'mariadb';
import {
  HttpError,
  parseId,
  withAdmin
} from '../../../../../../../../utils/admin/api';
import { adminQuery } from '../../../../../../../../utils/admin/db';
import { invalidateAccessCache } from '../../../../../../../../utils/apiAccess';

// Revoked tokens are kept so their usage stays in the history
export const POST = withAdmin<{
  params: Promise<{ id: string; tokenId: string }>;
}>(async (request, { params }) => {
  const { id, tokenId } = await params;
  const result = await adminQuery<UpsertResult>(
    'UPDATE apiTokens SET revokedAt = UTC_TIMESTAMP() WHERE id = ? AND userId = ? AND revokedAt IS NULL',
    [parseId(tokenId), parseId(id)]
  );
  if (result.affectedRows === 0)
    throw new HttpError(404, 'The token does not exist or is already revoked');
  invalidateAccessCache();
  return { ok: true };
});
