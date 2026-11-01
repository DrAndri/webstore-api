import {
  HttpError,
  parseId,
  readJson,
  withAdmin
} from '../../../../../utils/admin/api';
import {
  ApiUserInput,
  getApiUser,
  validateApiUser
} from '../../../../../utils/admin/apiUsers';
import { adminQuery } from '../../../../../utils/admin/db';
import { invalidateAccessCache } from '../../../../../utils/apiAccess';

type Context = { params: Promise<{ id: string }> };

export const GET = withAdmin<Context>(async (request, { params }) =>
  getApiUser(parseId((await params).id))
);

// Changes the details, limits or status. Limits apply to each token of the user.
export const PATCH = withAdmin<Context>(async (request, { params, user }) => {
  const id = parseId((await params).id);
  const { user: existing } = await getApiUser(id);
  const values = validateApiUser(
    await readJson<ApiUserInput>(request),
    existing.anonymous
  );
  const columns = Object.keys(values);
  if (columns.length === 0) throw new HttpError(400, 'Nothing to update');
  await adminQuery(
    `UPDATE apiUsers SET ${columns.map((c) => `${c} = ?`).join(', ')}, updatedAt = UTC_TIMESTAMP(), updatedBy = ? WHERE id = ?`,
    [...Object.values(values), user.login, id]
  );
  invalidateAccessCache();
  return getApiUser(id);
});
