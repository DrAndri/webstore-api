import {
  HttpError,
  parseId,
  readJson,
  withAdmin
} from '../../../../../utils/admin/api';
import {
  ApiUserInput,
  getApiUser,
  rethrowDuplicateEmail,
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
  if (id === user.id && (values.admin === false || values.enabled === false))
    throw new HttpError(
      400,
      'You can not remove your own admin access, ask another admin'
    );
  const email = 'email' in values ? values.email : existing.email;
  const admin = 'admin' in values ? values.admin : existing.admin;
  if (admin && !email)
    throw new HttpError(400, 'An admin needs an email address to sign in');
  await adminQuery(
    `UPDATE apiUsers SET ${columns.map((c) => `${c} = ?`).join(', ')}, updatedAt = UTC_TIMESTAMP(), updatedBy = ? WHERE id = ?`,
    [...Object.values(values), user.email, id]
  ).catch(rethrowDuplicateEmail);
  invalidateAccessCache();
  return getApiUser(id);
});
