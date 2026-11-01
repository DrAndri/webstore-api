import { connection } from 'next/server';
import { auth } from '../auth';

// The session of the current request, for server components. next-auth creates
// random values (a CSRF token) while reading it, which Next.js only allows
// once rendering waits for the request.
export const getSession = async () => {
  await connection();
  return auth();
};
