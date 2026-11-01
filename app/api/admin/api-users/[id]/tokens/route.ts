import {
  HttpError,
  parseId,
  readJson,
  withAdmin
} from '../../../../../../utils/admin/api';
import {
  createToken,
  getApiUser
} from '../../../../../../utils/admin/apiUsers';

// Creates a token, it is only returned this once
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  async (request, { params, user }) => {
    const id = parseId((await params).id);
    const { user: apiUser } = await getApiUser(id);
    if (apiUser.anonymous)
      throw new HttpError(
        400,
        'Website visitors get their tokens automatically'
      );
    const { name } = await readJson<{ name?: string }>(request);
    return { token: await createToken(id, name ?? null, user) };
  }
);
