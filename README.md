# webstore-api

Price history website, public api and admin interface for the products that
[webstore-scraper](https://github.com/DrAndri/webstore-scraper) collects. Built
with Next.js, reads from MariaDB and Solr.

| Path           | What                                               |
| -------------- | -------------------------------------------------- |
| `/`            | Price history chart with autocomplete search       |
| `/search`      | Advanced search with conditions and facets         |
| `/compare`     | Side by side comparison of selected products       |
| `/login`       | Sign in with Google                                |
| `/admin`       | Admin interface, for api users with the admin flag |
| `/api/auth/*`  | next-auth                                          |
| `/api/*`       | Public api, limited per token or signed in user    |
| `/api/admin/*` | Admin api, needs an admin session                  |

## Getting started

```bash
yarn
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Languages

The website, the admin interface and the messages of the api are in Icelandic
and English, with [react-i18next](https://react.i18next.com). The language
switch next to the theme switch sets the `lang` cookie. Without it the
language comes from `Accept-Language`, and Icelandic is the default, so api
clients get Icelandic unless they ask for English.

- Translations are in `i18n/locales/<language>/<namespace>.json`, one
  namespace for each part of the app (see `i18n/resources.ts`). Both languages
  must have the same keys, a missing key is a type error, and keys passed to
  `t` are checked too.
- Client components use `useTranslation('<namespace>')` and `useFormat()` from
  `components/I18n/I18nProvider` for numbers, prices, times and durations.
  Server components, server actions and route handlers use
  `getTranslation('<namespace>')` from `i18n/server`.
- Store, product and attribute names and other scraped data are not
  translated.

To add a language, add it to `i18n/settings.ts`, add its JSON files and
resources, its antd locale in `components/I18n/I18nProvider.tsx` and its
dayjs locale in `i18n/format.ts`.

## Environment variables

| Variable                                       | Used for                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `MARIADB_HOST`, `MARIADB_DATABASE`             | Database                                                                              |
| `MARIADB_USER`, `MARIADB_PASSWORD`             | `webstore-api` user, reads products and writes api usage                              |
| `MARIADB_ADMIN_USER`, `MARIADB_ADMIN_PASSWORD` | `webstore-admin` user, used by the admin interface only                               |
| `SOLR_URL`                                     | Solr base url with a trailing slash, e.g. `http://solr:8983/solr/`                    |
| `API_TOKEN_SECRET`                             | At least 32 random characters, signs the tokens website visitors get                  |
| `API_VISITOR_TOKENS_PER_IP_HOUR`               | New visitor tokens per ip address and hour, default 30                                |
| `AUTH_URL`                                     | Public origin of the site, e.g. `https://example.is`                                  |
| `AUTH_SECRET`                                  | Random secret that encrypts the sign in sessions                                      |
| `AUTH_TRUST_HOST`                              | `true` when running behind a reverse proxy                                            |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`         | Google OAuth client used to sign in                                                   |
| `GITHUB_CONFIG_REPO`                           | Repository with the store configs, e.g. `DrAndri/webstore-scraper`                    |
| `GITHUB_CONFIG_BRANCH`                         | Branch the configs are read from and committed to, default `master`                   |
| `GITHUB_CONFIG_DIR`                            | Directory of the configs in the repository, default `stores`                          |
| `GITHUB_TOKEN`                                 | Fine-grained token with read and write access to the contents of `GITHUB_CONFIG_REPO` |
| `LOKI_URL`                                     | Loki the scraper logs to, for the admin logs, e.g. `http://loki:3100`                 |
| `LOKI_USERNAME`, `LOKI_PASSWORD`               | Basic auth for Loki, when it needs it                                                 |

Generate secrets with `openssl rand -base64 48`.

## Signing in

Users sign in with Google through [next-auth](https://authjs.dev), configured
in `auth.ts`. Only addresses Google has verified are accepted, since the
address decides what a user can do:

- A user whose address is the email of an enabled api user gets that user's
  limits on the website, other users get the limits of anonymous visitors.
- An api user with the **Admin** flag can use the admin interface.

Sessions are encrypted JWT cookies that last 7 days, there are no session
tables. To add a sign in option, add the provider in `auth.ts` and accept it in
the `signIn` callback only when the provider verifies email addresses.

### Setup

1. Create the database with `webstore-scraper/initMariaDb/init-db.sql` and
   change the passwords of its users.
2. Create an OAuth client in the Google Cloud console (APIs & Services →
   Credentials, type Web application) with the redirect URI
   `<AUTH_URL>/api/auth/callback/google`.
3. Add yourself as the first admin with the commented out `INSERT` in
   `init-db.sql`. After that admins are managed under API users.
4. Create a fine-grained personal access token for the scraper repository with
   **Contents: Read and write**. Config changes are committed with the admin's
   name and email as the author.
5. Set the environment variables above.

## Admin interface

The admin interface shows the health of the scraper and each store, running
and past scans with error trends, lets you start and cancel scans, reindex
Solr, edit the cron schedules of each store, and under **Settings** turn the
scheduler on or off and set how many stores are scanned at a time, add and edit
stores, and manage api users and admins. These are only configured here, not
with environment variables of the scraper.

**Logs** shows the scraper's own log from Loki (the job runner, Solr, the
scheduler, crawlee and the rest), filtered by level, by the label of the module
that logged a line and by text. Each scan has a page with its log, filtered by
level, by page and by text. Both follow new lines live, and each shows its
LogQL query to open the same log in Grafana.

The scraper labels the log of a scan with the id of its job. Older scans are
found by the store and the time they ran, so two scans of a store running at
the same time show each other's lines. Scans log their pages only when
**Scan log** is on for the store on its page, it is off for new stores.

### Security

- `proxy.ts` sends visitors who are not signed in to `/login` and refuses admin
  api calls without a session. The admin layout and every admin route then
  check that the signed in address belongs to an enabled api user with the
  admin flag, on every request, so removing the flag takes effect right away.
- Admins can not remove their own admin flag or disable themselves.
- Requests that change something must come from the site itself (Origin
  check), next-auth protects its own endpoints with a CSRF token.
- Admin pages can not be framed and are not cached or indexed.
- The admin database user can only write to the tables the admin interface
  manages, the public api user can only read what the api serves.

### How it works with the scraper

The admin interface and the scraper only talk through the database:

- Starting a scan adds a row to `scrapeJobs`, the scraper picks it up within
  seconds. Cancelling sets `cancelRequested`.
- **Reindex Solr** on the dashboard adds an `index` job to `scrapeJobs` without
  a store, the scraper sends everything in the database to Solr again. It shows
  with the scans, with the documents indexed as its progress and the scraper's
  log while it ran on its page. It needs the `index` value of
  `scrapeJobs.mode`, see `migrations/2026-11-04-solr-index-jobs.sql` in the
  scraper.
- **Sync Solr schema** on the dashboard adds a `schema` job, the scraper brings
  the schemas of the Solr cores in line with its `solr-configsets` and, when
  asked, queues a reindex if a schema changed. It no longer does this when it
  starts. The api does not check which fields the products core has, a search
  that uses a missing field fails. So when a release needs new fields, deploy
  the scraper's `solr-configsets`, run the sync, and only then deploy the api.
  The sync only adds fields, so the running api is not affected. Do this for
  every Solr the api is pointed at, local and staging included. It needs
  `migrations/2026-11-04-solr-schema-jobs.sql` in the scraper.
- How many stores are scanned at a time is the `concurrency` of
  `scraperSettings`, the scraper reads it every 5 seconds. It needs
  `migrations/2026-11-04-scraper-settings.sql` in the scraper.
- Each store has a full crawl and an active products schedule, rows in
  `storeSchedules` edited on the stores page. A schedule runs while it,
  **Scheduled scans** of the store and **Scheduler** under Settings are on. A
  new store gets both schedules, turned off, when it is created. The scraper
  applies changes within 30 seconds.
- **Scheduler** under Settings is the `schedulesEnabled` of `scraperSettings`.
  Turning it off stops the schedules of every store without changing them,
  scans started by hand still run and queued scans are not cancelled. It needs
  `migrations/2026-11-10-scheduler-switch.sql` in the scraper.
- The scraper reports in `scraperStatus` every 5 seconds.
- The logs are read from Loki, which the scraper sends them to every 5
  seconds. The browser never talks to Loki, the admin api builds the queries.
- Store configs are `stores/<storeId>.jsonc` in the scraper repository. Saving a
  config commits it through the GitHub api, the scraper loads it from GitHub
  before the next scan. History comes from the commits of the file.
- Testing a config queues a test job that scrapes one page with the draft
  config without writing anything to the database.

## Public api

Every request needs a token:

```bash
curl https://example.is/api/search \
  -H 'Authorization: Bearer wsk_...' \
  -H 'Content-Type: application/json' \
  -d '{"q": "iphone", "filters": {"inStock": ["true"]}}'
```

`X-API-Key: wsk_...` works too. Tokens are created in the admin interface
under API users, each user has a limit per minute and per day that applies to
each of its tokens. Responses carry `X-RateLimit-Remaining-Minute` and
`X-RateLimit-Remaining-Day`, requests over a limit get `429` with
`Retry-After`.

Requests without a token are counted by who makes them:

- Users signed in on the website whose address is the email of an enabled api
  user get the limits of that user.
- Everyone else gets a token automatically in a cookie, with the limits of the
  **Website visitors** user. Turning that user off makes every request need a
  token or a signed in api user.

Counters are kept in memory and written to the database every 10 seconds, so
the limits are exact for a single instance of the app. The limit on new visitor
tokens per ip address relies on a reverse proxy that appends the client address
to `X-Forwarded-For`.

| Endpoint                       | Method | Body or query                                            |
| ------------------------------ | ------ | -------------------------------------------------------- |
| `/api/autocomplete`            | POST   | `{ term, includeInactive? }`                             |
| `/api/prices`                  | POST   | `{ productIds, start?, end? }`                           |
| `/api/search`                  | POST   | `{ q?, conditions?, filters?, sort?, page?, pageSize? }` |
| `/api/search/attributes`       | GET    | `?q=` attribute name                                     |
| `/api/search/attribute-values` | GET    | `?id=<attributeId>&q=`                                   |
| `/api/compare`                 | POST   | `{ productIds }`, at most 6                              |
| `/api/products/<id>`           | GET    | One product with all its details and price history       |

Search conditions are `{ field, op, value, value2? }` where `field` is `name`,
`sku`, `ean`, `description`, `price`, `inStock`, `firstSeenDate`,
`lastChangeDate` or `attr_<attributeId>`, and `op` is `contains`,
`startsWith`, `endsWith`, `exact`, `between` or `is`. See
`utils/searchFields.ts`.

Search filters are the selected facet values, `{ <key>: [values] }`, where the
key is `storeId`, `manufacturerId`, `categoryId`, `inStock`, `active`, `price`
or `attr_<attributeId>`. `active` is `true` for products seen in the last scan
of their store and `false` for the ones a store no longer sells. It needs the
`active` field in the products core.

Autocomplete matches each word of the term anywhere in the name or the sku, so
`fart` finds `Fartölva` and `1000XM` finds `WH1000XM6B.CE7`. Whole words and
skus rank above their starts, and those above a match in the middle. It
searches the `name` and `sku` fields with wildcards, so it needs no reindex.

Autocomplete leaves out the products their store no longer sells, `active` is
`false`, unless `includeInactive` is `true`. Products indexed before the
`active` field was added are kept until a reindex sets it.

Autocomplete answers `{ total, results }`, where `total` is how many products
matched and `results` has the first 10. Each result has `matches`, the parts of
its `name` or `sku` the term matched, as `[start, end)` offsets into that
value:

```json
{
  "id": "1",
  "name": "Samsung Galaxy S24 Ultra",
  "sku": "SM-S928B",
  "storeId": 1,
  "matches": [{ "field": "sku", "ranges": [[0, 5]] }]
}
```

In the advanced search, clicking a product opens its details and price history
in a drawer. The product id is kept in the url as `product`.

Conditions match whole values on the `name_ci`, `sku_ci` and `attrci_*` fields
of the products core, and the attribute facets come from `attrIds`. Products
indexed before those fields were added have no values in them until a reindex.

The search box of the advanced search also matches the start of words in the
name through `name_prefix`, so `fart` finds `fartölva`, ranked below products
with the whole word. It is used once the products core has that field.
