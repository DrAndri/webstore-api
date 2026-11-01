import { NextRequest } from 'next/server';
import {
  AdminUser,
  isSameOrigin,
  sessionCookieName,
  verifySession
} from './session';

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

// Wraps every admin api route. The session is checked here as well as in
// proxy.ts so a route is never reachable without it.
export const withAdmin =
  <C>(
    handler: (
      request: NextRequest,
      context: C & { user: AdminUser }
    ) => Promise<unknown>
  ) =>
  async (request: NextRequest, context: C) => {
    const user = await verifySession(
      request.cookies.get(sessionCookieName())?.value
    );
    if (!user) return json({ error: 'Not signed in' }, 401);
    if (request.method !== 'GET' && !isSameOrigin(request))
      return json({ error: 'Invalid origin' }, 403);
    try {
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
