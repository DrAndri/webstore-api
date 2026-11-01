// Only redirect back to admin pages, never to another site
export const safeReturnTo = (value: string | null | undefined) =>
  value && /^\/admin(\/|\?|$)/.test(value) && !/[\\\s]/.test(value)
    ? value
    : '/admin';
