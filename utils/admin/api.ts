import { NextRequest } from 'next/server';
import { getTranslation } from '../../i18n/server';
import { HttpError } from '../httpError';
import { AdminUser, getAdmin, isSameOrigin } from './auth';

export { HttpError } from '../httpError';

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

// Wraps every admin api route. proxy.ts only checks that someone is signed in,
// whether they are an admin is checked here. Error messages are in the
// language of the request.
export const withAdmin =
  <C>(
    handler: (
      request: NextRequest,
      context: C & { user: AdminUser }
    ) => Promise<unknown>
  ) =>
  async (request: NextRequest, context: C) => {
    const { t } = await getTranslation('errors');
    if (request.method !== 'GET' && !isSameOrigin(request))
      return json({ error: t('invalidOrigin') }, 403);
    try {
      const { signedIn, admin: user } = await getAdmin();
      if (!signedIn) return json({ error: t('notSignedIn') }, 401);
      if (!user) return json({ error: t('notAdmin') }, 403);
      return json(await handler(request, { ...context, user }));
    } catch (e) {
      if (e instanceof HttpError)
        return json({ error: e.translate(t) }, e.status);
      console.error(
        'Admin api %s %s',
        request.method,
        request.nextUrl.pathname,
        e
      );
      return json({ error: t('somethingWentWrong') }, 500);
    }
  };

export const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, { key: 'invalidJson' });
  }
};

export const parseId = (value: string | null | undefined, name = 'id') => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0)
    throw new HttpError(400, { key: 'invalidParam', values: { name } });
  return id;
};
