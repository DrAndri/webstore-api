# webstore-api

Price history website, public api and admin interface for the products that
[webstore-scraper](https://github.com/DrAndri/webstore-scraper) collects. Built
with Next.js, reads from MariaDB and Solr.

| Path               | What                                                       |
| ------------------ | ---------------------------------------------------------- |
| `/`                | Price history chart with autocomplete search               |
| `/search`          | Advanced search with conditions and facets                 |
| `/compare`         | Side by side comparison of selected products               |
| `/admin`           | Admin interface, signed in with GitHub                     |
| `/api/*`           | Public api, needs a token                                  |
| `/api/admin/*`     | Admin api, needs an admin session                          |

## Getting started

```bash
yarn
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable                                         | Used for                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `MARIADB_HOST`, `MARIADB_DATABASE`               | Database                                                                                       |
| `MARIADB_USER`, `MARIADB_PASSWORD`               | `webstore-api` user, reads products and writes api usage                                       |
| `MARIADB_ADMIN_USER`, `MARIADB_ADMIN_PASSWORD`   | `webstore-admin` user, used by the admin interface only                                         |
| `SOLR_URL`                                       | Solr base url with a trailing slash, e.g. `http://solr:8983/solr/`                             |
| `API_TOKEN_SECRET`                               | At least 32 random characters, signs the tokens website visitors get                           |
| `API_VISITOR_TOKENS_PER_IP_HOUR`                 | New visitor tokens per ip address and hour, default 30                                         |
| `ADMIN_BASE_URL`                                 | Public origin of the site, e.g. `https://example.is`. Used for the OAuth callback and CSRF checks |
| `ADMIN_SESSION_SECRET`                           | At least 32 random characters, signs admin sessions                                            |
| `ADMIN_GITHUB_USERS`                             | Comma separated GitHub logins or numeric user ids that may sign in                             |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app used to sign in                                                         |
| `GITHUB_CONFIG_REPO`                             | Repository with the store configs, e.g. `DrAndri/webstore-scraper`                             |
| `GITHUB_CONFIG_BRANCH`                           | Branch the configs are read from and committed to, default `master`                            |
| `GITHUB_CONFIG_DIR`                              | Directory of the configs in the repository, default `stores`                                    |
| `GITHUB_TOKEN`                                   | Fine-grained token with read and write access to the contents of `GITHUB_CONFIG_REPO`          |

Generate secrets with `openssl rand -base64 48`.

## Admin interface

The admin interface shows the health of the scraper and each store, running
and past scans with error trends, lets you start and cancel scans, edit the
cron schedules, add and edit stores, and manage api users.

### Setup

1. Run the migrations in `webstore-scraper/migrations` and change the password
   of the `webstore-admin` database user.
2. Create a GitHub OAuth app (Settings → Developer settings → OAuth Apps) with
   the callback url `<ADMIN_BASE_URL>/api/admin/auth/callback`.
3. Create a fine-grained personal access token for the scraper repository with
   **Contents: Read and write**. Commits are authored as the admin that made the
   change.
4. Set the environment variables above and add your GitHub login to
   `ADMIN_GITHUB_USERS`.

### Security

- Signing in uses GitHub OAuth with PKCE and an allowlist. The GitHub token is
  revoked right after the user is identified.
- Sessions are HMAC signed, HttpOnly, SameSite=Lax cookies that expire after 8
  hours. Removing a user from `ADMIN_GITHUB_USERS` ends their session.
- `proxy.ts` redirects pages and refuses api calls without a session, and every
  admin route checks the session again.
- Requests that change something must come from `ADMIN_BASE_URL` (Origin check).
- Admin pages can not be framed and are not cached or indexed.
- The admin database user can only write to the tables the admin interface
  manages, the public api user can only read what the api serves.

### How it works with the scraper

The admin interface and the scraper only talk through the database:

- Starting a scan adds a row to `scrapeJobs`, the scraper picks it up within
  seconds. Cancelling sets `cancelRequested`.
- The schedules are rows in `scraperSchedules`, the scraper applies changes
  within 30 seconds.
- The scraper reports in `scraperStatus` every 5 seconds.
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

Website visitors get a token automatically in a cookie, with the limits of the
**Website visitors** user. Turning that user off makes every request need a
token.

Counters are kept in memory and written to the database every 10 seconds, so
the limits are exact for a single instance of the app. The limit on new visitor
tokens per ip address relies on a reverse proxy that appends the client address
to `X-Forwarded-For`.

| Endpoint                                   | Method | Body or query                                                     |
| ------------------------------------------ | ------ | ----------------------------------------------------------------- |
| `/api/autocomplete`                        | POST   | `{ term }`                                                        |
| `/api/prices`                              | POST   | `{ productIds, start?, end? }`                                    |
| `/api/search`                              | POST   | `{ q?, conditions?, filters?, sort?, page?, pageSize? }`          |
| `/api/search/attributes`                   | GET    | `?q=` attribute name                                              |
| `/api/search/attribute-values`             | GET    | `?id=<attributeId>&q=`                                            |
| `/api/compare`                             | POST   | `{ productIds }`, at most 6                                       |

Search conditions are `{ field, op, value, value2? }` where `field` is `name`,
`sku`, `ean`, `description`, `price`, `inStock`, `firstSeenDate`,
`lastChangeDate` or `attr_<attributeId>`, and `op` is `contains`,
`startsWith`, `endsWith`, `exact`, `between` or `is`. See
`utils/searchFields.ts`.

Exact whole value matching needs the `name_ci`, `sku_ci` and `attrci_*` fields
in the products core, which the scraper adds when it starts. Until the products
are reindexed, matching is word by word and attribute values are case
sensitive.
