import { getSession } from '../session';
import { adminQuery } from './db';

export interface AdminUser {
  // The id of the api user with the admin flag
  id: number;
  name: string;
  email: string;
  image: string | null;
}

// The signed in user when they are an enabled api user with the admin flag.
// Checked on every request so removing the flag takes effect right away.
export const getAdmin = async (): Promise<{
  signedIn: boolean;
  admin?: AdminUser;
}> => {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return { signedIn: false };
  const [row] = await adminQuery<{ id: number; name: string; email: string }[]>(
    'SELECT id, name, email FROM apiUsers WHERE email = ? AND admin = 1 AND enabled = 1 AND anonymous = 0',
    [email]
  );
  if (!row) return { signedIn: true };
  return {
    signedIn: true,
    admin: {
      id: row.id,
      name: session.user?.name || row.name,
      email: row.email,
      image: session.user?.image ?? null
    }
  };
};

// Requests that change something must come from the site itself, the same
// check Next.js does for server actions. Together with SameSite=Lax session
// cookies this protects against CSRF.
export const isSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = (
    request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  )
    ?.split(',')[0]
    .trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};
