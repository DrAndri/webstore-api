import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// Sign in for website users and admins. The email address decides the api
// limits (an api user with that email) and admin access (the admin flag of
// that user), so only verified addresses are accepted. Nothing here touches the
// database so proxy.ts can use it.
//
// To add a provider, add it to providers and accept it in signIn only when the
// provider has verified the email address.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === 'google')
        return profile?.email_verified === true && !!profile.email;
      return false;
    }
  }
});

// Only redirect to paths on this site
export const safeRedirect = (value: unknown, fallback = '/') =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !/[\\\s]/.test(value)
    ? value
    : fallback;
