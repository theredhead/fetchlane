# Fetchlane

<p align="center">
  <img src="assets/branding/fetchlane-logo.svg" alt="Fetchlane logo" width="340" />
</p>

<p align="center">
  <strong>Query once. Connect everywhere.</strong>
</p>

<p align="center">
  Multi-engine REST API for table access, schema discovery, and FetchRequest-based querying.
</p>

![Fetchlane banner](assets/branding/fetchlane-banner.svg)

Fetchlane is a NestJS service that exposes a consistent HTTP interface across multiple database engines. It is built for browsing data, inspecting schemas, performing CRUD operations, and executing structured fetch requests without baking engine-specific logic into the API surface.

## Why Fetchlane

- One REST shape across multiple database engines
- Mounted JSON runtime config via `FETCHLANE_CONFIG`
- Structured `FetchRequest` querying with predicates, sorting, and pagination
- Swagger UI for the HTTP API
- TypeDoc output for the TypeScript API surface
- Optional per-engine drivers instead of hard dependencies for every database

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file:

```bash
cp .env.example .env
```

3. Create a local runtime config file, for example `fetchlane.local.json`:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3000,
    "cors": {
      "enabled": true,
      "origins": ["*"]
    }
  },
  "database": {
    "url": "${FETCHLANE_DATABASE_URL}"
  },
  "limits": {
    "request_body_bytes": 1048576,
    "fetch_max_page_size": 1000,
    "fetch_max_predicates": 25,
    "fetch_max_sort_fields": 8,
    "rate_limit_window_ms": 60000,
    "rate_limit_max": 120
  },
  "auth": {
    "enabled": false,
    "mode": "oidc-jwt",
    "issuer_url": "",
    "audience": "",
    "jwks_url": "",
    "claim_mappings": {
      "subject": "sub",
      "roles": "realm_access.roles"
    }
  }
}
```

4. Set the bootstrap env var and database URL in `.env`:

```env
FETCHLANE_CONFIG=./fetchlane.local.json
FETCHLANE_DATABASE_URL=postgres://postgres:password@127.0.0.1:5432/northwind
```

5. Start the app:

```bash
npm run start:dev
```

6. Open the docs:

- Swagger UI: `http://localhost:3000/api/docs`
- Status endpoint: `http://localhost:3000/api/status`
  This returns a structured service snapshot with runtime metadata, safe config details, database connectivity, and capability flags.

## Runtime Config

Fetchlane boots from a single environment variable:

```text
FETCHLANE_CONFIG=/path/to/fetchlane.json
```

That JSON file becomes the primary runtime interface for server settings, database connectivity, limits, and auth. String values may use full-string environment placeholders such as `${FETCHLANE_DATABASE_URL}`.

The database connection URL still uses this format:

Expected format:

```text
<engine>://<user>:<password>@<host>:<port?>/<database>
```

Examples:

```text
postgres://postgres:password@127.0.0.1:5432/northwind
mysql://root:password@127.0.0.1:3306/northwind
sqlserver://sa:YourStrong!Passw0rd@127.0.0.1:1433/master
```

Startup fails fast with hint-rich errors when the config path is missing, the file cannot be read, the JSON is invalid, required fields are missing, or placeholder environment variables are unresolved.

## Optional Auth

Fetchlane can run fully open for local development, or it can require bearer JWTs from OIDC-compatible providers such as Keycloak, Auth0, or Entra ID.

When `auth.enabled` is `false`:

- `/api/status` is public
- `/api/docs` is public
- `/api/data-access/**` is public

When `auth.enabled` is `true`:

- `/api/status` stays public
- `/api/docs` requires a bearer token
- `/api/data-access/**` requires a bearer token

Auth validation checks token signature, issuer, audience, and expiry. Claim mapping is driven by `auth.claim_mappings`, so provider-specific claim layouts can still map into a consistent Fetchlane request principal.

## Supported Engines

Fetchlane is designed around injectable engine support rather than hardcoded controller behavior. The API stays generic while connector implementations handle engine-specific differences internally.

| Engine | URL scheme | Driver |
| --- | --- | --- |
| PostgreSQL | `postgres://` | `pg` |
| MySQL | `mysql://` | `mysql2` |
| SQL Server | `sqlserver://` | `mssql` |

Engine drivers are listed as optional dependencies. Install the driver for the engine you want to use.

## Example `.env`

```env
FETCHLANE_CONFIG=./fetchlane.local.json
FETCHLANE_DATABASE_URL=postgres://postgres:password@127.0.0.1:5432/northwind
```

Alternative examples:

```env
FETCHLANE_DATABASE_URL=mysql://root:password@127.0.0.1:3306/northwind
FETCHLANE_DATABASE_URL=sqlserver://sa:YourStrong!Passw0rd@127.0.0.1:1433/master
```

Real `.env` files are gitignored so local secrets do not end up in source control. Only `.env.example` is tracked.

## Core API

### Data access

- `GET /api/data-access/table-names`
- `GET /api/data-access/:table`
- `GET /api/data-access/:table/info`
- `GET /api/data-access/:table/schema`
- `GET /api/data-access/:table/record/:id`
- `GET /api/data-access/:table/record/:id/column/:column`
- `POST /api/data-access/fetch`
- `POST /api/data-access/tables/:table`
- `POST /api/data-access/:table`
- `PATCH /api/data-access/:table/record/:id/column/:column`
- `PUT /api/data-access/:table/record/:id`
- `DELETE /api/data-access/:table/record/:id`

### Platform

- `GET /api/docs`
- `GET /api/status`

Swagger UI reflects the currently exposed controller surface and is the best source for concrete request and response shapes.

## FetchRequest

`POST /api/data-access/fetch` is the more expressive querying route. It supports:

- table selection
- predicate lists with parameter arguments
- sort definitions
- pagination

Predicate placeholders are database-agnostic:

- Use `?` with `args` as an array for positional mode
- Use `:name` with `args` as an object for named mode
- Do not mix positional and named placeholders anywhere within the same request

Example shape:

```json
{
  "table": "member",
  "predicates": [
    {
      "text": "age > ?",
      "args": [18]
    }
  ],
  "sort": [
    {
      "column": "name",
      "direction": "ASC"
    }
  ],
  "pagination": {
    "size": 25,
    "index": 0
  }
}
```

Named-parameter example:

```json
{
  "table": "member",
  "predicates": [
    {
      "text": "status = :status AND city = :city",
      "args": {
        "status": "open",
        "city": "Enschede"
      }
    }
  ],
  "sort": [],
  "pagination": {
    "size": 25,
    "index": 0
  }
}
```

For practical examples that go from basic table browsing to grouped business filters, see [docs/fetchrequest-examples.md](docs/fetchrequest-examples.md).

## Error Responses

Fetchlane returns structured API errors with a developer hint:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Query parameter \"pageSize\" must be an integer between 1 and 1000.",
  "hint": "Choose a page size from 1 to 1000 so the API can paginate safely.",
  "path": "/api/data-access/member?pageSize=5000",
  "timestamp": "2026-04-02T00:00:00.000Z"
}
```

The goal is that validation errors, not-found cases, unsupported engine capabilities, and translated database failures all tell you both what went wrong and how to fix it.

## Documentation

Fetchlane ships with two documentation surfaces:

| Docs | Purpose | Location |
| --- | --- | --- |
| Swagger UI | Explore and test the HTTP API | `http://localhost:3000/api/docs` |
| TypeDoc | Browse the TypeScript API surface | `docs/api` |
| FetchRequest examples | Real request payloads from simple to advanced | `docs/fetchrequest-examples.md` |

Generate TypeDoc:

```bash
npm run docs:api
```

Watch and rebuild TypeDoc while editing:

```bash
npm run docs:api:watch
```

Generated TypeDoc output is gitignored.

## Development

Start the app in watch mode:

```bash
npm run start:dev
```

Build for production:

```bash
npm run build
```

Start the production build:

```bash
npm run start:prod
```

## Testing

Run unit tests:

```bash
npm test
```

Run coverage:

```bash
npm run test:cov
```

Run integration tests:

```bash
npm run test:integration
```

Run per-engine integration tests:

```bash
npm run test:integration:postgres
npm run test:integration:mysql
npm run test:integration:sqlserver
```

## Branding

Brand assets live in `assets/branding/`:

- `fetchlane-logo.svg`
- `fetchlane-logo-dark.svg`
- `fetchlane-mark.svg`
- `fetchlane-banner.svg`
- `fetchlane-visualization-dreamscape.svg`

## Project Direction

Fetchlane focuses on the generic, database-agnostic API surface. Engine-specific behavior belongs in connector implementations, where differences can be handled gracefully without leaking those details into the public REST contract.
