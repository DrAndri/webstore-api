import enAdmin from './locales/en/admin.json';
import enApiUsers from './locales/en/apiUsers.json';
import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import enSite from './locales/en/site.json';
import enStores from './locales/en/stores.json';
import isAdmin from './locales/is/admin.json';
import isApiUsers from './locales/is/apiUsers.json';
import isCommon from './locales/is/common.json';
import isErrors from './locales/is/errors.json';
import isSite from './locales/is/site.json';
import isStores from './locales/is/stores.json';

// One namespace for each part of the app. common: shared by every page,
// site: the public pages, admin: the admin shell, dashboard, scans, logs and
// schedules, stores: the stores and their configs, apiUsers: api users and
// tokens, errors: the error messages of the api.
const en = {
  common: enCommon,
  site: enSite,
  admin: enAdmin,
  stores: enStores,
  apiUsers: enApiUsers,
  errors: enErrors
};

// Both languages must have the same keys, a key missing from either one is a
// type error
const is = {
  common: isCommon satisfies typeof enCommon,
  site: isSite satisfies typeof enSite,
  admin: isAdmin satisfies typeof enAdmin,
  stores: isStores satisfies typeof enStores,
  apiUsers: isApiUsers satisfies typeof enApiUsers,
  errors: isErrors satisfies typeof enErrors
};
void (en satisfies typeof is);

export const resources = { is, en };

export type Resources = typeof en;
export type Namespace = keyof Resources;
export const NAMESPACES = Object.keys(en) as Namespace[];
