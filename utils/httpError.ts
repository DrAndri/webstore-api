import type { ParseKeys, TFunction } from 'i18next';

// A key of the errors namespace, e.g. 'storeNotFound'
export type ErrorKey = ParseKeys<'errors'>;

export interface ErrorMessage {
  key: ErrorKey;
  // Interpolation values of the message, e.g. { name } for {{name}}
  values?: Record<string, string | number>;
}

// An error that becomes a response with this status and { error: message }.
// The message is either a key of the errors namespace, translated to the
// language of the request when the response is built:
//   throw new HttpError(404, { key: 'storeNotFound' })
//   throw new HttpError(400, { key: 'invalidParam', values: { name } })
// or a plain message that is already translated:
//   throw new HttpError(400, t('config.invalid'))
export class HttpError extends Error {
  status: number;
  translation?: ErrorMessage;
  constructor(status: number, message: string | ErrorMessage) {
    // The key stands in for the message in logs
    super(typeof message === 'string' ? message : message.key);
    this.status = status;
    if (typeof message !== 'string') this.translation = message;
  }

  // The message in the language of t, the errors namespace
  translate(t: TFunction<'errors'>): string {
    if (!this.translation) return this.message;
    const { key, values } = this.translation;
    return t(key, values ?? {});
  }
}
