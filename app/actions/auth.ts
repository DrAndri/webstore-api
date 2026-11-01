'use server';
import { safeRedirect, signIn, signOut } from '../../auth';

export async function signInWithGoogle(formData: FormData) {
  await signIn('google', {
    redirectTo: safeRedirect(formData.get('returnTo'))
  });
}

export async function signOutUser(formData: FormData) {
  await signOut({ redirectTo: safeRedirect(formData.get('returnTo')) });
}
