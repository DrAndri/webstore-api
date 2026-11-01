import { connection, NextRequest } from 'next/server';
import { AdminUser, getAdmin, isSameOrigin } from './auth';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

// Wraps every admin api route. proxy.ts only checks that someone is signed in,
// whether they are an admin is checked here.
export const withAdmin =
  <C>(
    handler: (
      request: NextRequest,
      context: C & { user: AdminUser }
    ) => Promise<unknown>
  ) =>
  async (request: NextRequest, context: C) => {
    // Never prerendered. Outside the try, which would otherwise catch the
    // signal Next.js throws to stop prerendering.
    await connection();
    if (request.method !== 'GET' && !isSameOrigin(request))
      return json({ error: 'Invalid origin' }, 403);
    try {
      const { signedIn, admin: user } = await getAdmin();
      if (!signedIn) return json({ error: 'Not signed in' }, 401);
      if (!user) return json({ error: 'You are not an admin' }, 403);
      return json(await handler(request, { ...context, user }));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(
        `Admin api ${request.method} ${request.nextUrl.pathname}`,
        e
      );
      return json({ error: 'Something went wrong' }, 500);
    }
  };

export const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
};

export const parseId = (value: string | null | undefined, name = 'id') => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0)
    throw new HttpError(400, `Invalid ${name}`);
  return id;
};
