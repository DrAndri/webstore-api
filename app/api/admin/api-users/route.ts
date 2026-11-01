import { UpsertResult } from 'mariadb';
import { HttpError, readJson, withAdmin } from '../../../../utils/admin/api';
import {
  ApiUserInput,
  createToken,
  listApiUsers,
  validateApiUser
} from '../../../../utils/admin/apiUsers';
import { adminQuery } from '../../../../utils/admin/db';

export const GET = withAdmin(() => listApiUsers());

// Creates the user with a first token, which is only returned this once
export const POST = withAdmin(async (request, { user }) => {
  const input = await readJson<ApiUserInput>(request);
  if (!input.name) throw new HttpError(400, 'Enter a name');
  const values = validateApiUser({ enabled: true, ...input }, false);
  const columns = Object.keys(values);
  const result = await adminQuery<UpsertResult>(
    `INSERT INTO apiUsers (${columns.join(', ')}, anonymous, createdAt, createdBy)
     VALUES (${columns.map(() => '?').join(', ')}, FALSE, UTC_TIMESTAMP(), ?)`,
    [...Object.values(values), user.login]
  );
  const id = Number(result.insertId);
  const token = await createToken(id, 'Default', user);
  return { id, token };
});
