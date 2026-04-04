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

3. Create a local runtime config file, for example `fetchlane.local.json`.
   You can start from the tracked example at `config/fetchlane.example.json`:

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
    "requestBodyBytes": 1048576,
    "fetchMaxPageSize": 1000,
    "fetchMaxPredicates": 25,
    "fetchMaxSortFields": 8,
    "rateLimitWindowMs": 60000,
    "rateLimitMax": 120
  },
  "authentication": {
    "enabled": true,
    "mode": "oidc-jwt",
    "issuerUrl": "",
    "audience": "",
    "jwksUrl": "",
    "claimMappings": {
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

> **Security note:** The quick-start config above has authentication enabled but with
> empty issuer/audience values, which will reject all tokens. For local
> development you may set `authentication.enabled` to `false`, but **never do so for
> any network-reachable deployment**. See [Optional Authentication](#optional-authentication) below.

- Swagger UI: `http://localhost:3000/api/docs`
- Status endpoint: `http://localhost:3000/api/status`
  This returns a structured service snapshot with runtime metadata, safe config details, database connectivity, and capability flags.
  If authentication is enabled, authorize in Swagger UI with a bearer token before calling `/api/docs` or `/api/data-access/**`.

## Runtime Config

Fetchlane boots from a single environment variable:

```text
FETCHLANE_CONFIG=/path/to/fetchlane.json
```

That JSON file becomes the primary runtime interface for server settings, database connectivity, limits, and authentication. String values may use full-string environment placeholders such as `${FETCHLANE_DATABASE_URL}`.

Placeholders are optional — you can write literal values directly in the JSON file. This is convenient for local development:

```json
{
  "database": {
    "url": "postgres://postgres:password@127.0.0.1:5432/northwind"
  }
}
```

However, hardcoding secrets in the config file is discouraged for any shared, committed, or network-reachable environment. Prefer environment variable placeholders for credentials and connection strings outside of trusted local setups.

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

The tracked baseline config lives at `config/fetchlane.example.json`.

## Schema Features

Schema-exposing endpoints (`table-names`, `table-info`, `describe-table`, `create-table`) are disabled by default. To enable them, set `enableSchemaFeatures` to `true` in the runtime config:

```json
{
  "enableSchemaFeatures": true
}
```

When disabled, those endpoints return `404 Not Found`.

## Optional Authentication

> **WARNING — Running Fetchlane without authentication exposes your entire
> database to anyone who can reach the service.** All tables, all rows, and all
> write operations (insert, update, delete) are fully accessible without any
> credentials. **Never run with `authentication.enabled: false` outside of a trusted
> local development environment.** For any network-reachable or production
> deployment, enable authentication and configure an OIDC provider.

Fetchlane can run fully open for local development, or it can require bearer JWTs from OIDC-compatible providers such as Keycloak, Auth0, or Entra ID.

When `authentication.enabled` is `false`:

- `/api/status` is public
- `/api/docs` is public
- `/api/data-access/**` is public

When `authentication.enabled` is `true`:

- `/api/status` stays public
- `/api/docs` requires a bearer token
- `/api/data-access/**` requires a bearer token

Authentication validation checks token signature, issuer, audience, and expiry. Claim mapping is driven by `authentication.claimMappings`, so provider-specific claim layouts can still map into a consistent Fetchlane request principal.

Swagger UI follows the same protection model as the data routes. When authentication is enabled, the docs UI itself also requires a valid bearer token.

## Fine-Grained Authorization

When authentication is enabled, Fetchlane supports an `authorization` section
inside `authentication` that enforces per-channel, per-table role requirements.
Authorization is required when authentication is enabled.

### Channels

| Channel          | Protects                                                | Config key                  |
| ---------------- | ------------------------------------------------------- | --------------------------- |
| **Schema**       | `table-names`, `:table/info`, `:table/schema`           | `authorization.schema`      |
| **Create table** | `tables/:table` (POST)                                  | `authorization.createTable` |
| **CRUD**         | All record-level endpoints, per table and per operation | `authorization.crud`        |

CRUD is further divided into four operations — `create`, `read`, `update`,
`delete` — each with its own role list.

### Role semantics

Each channel's role configuration can be either a **simple array** (shorthand
for allow-only) or an **object** with explicit `allow` and `deny` lists.

| Value                                       | Meaning                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `["role1", "role2"]`                        | Shorthand: principal must hold **at least one** listed role (no deny rules)         |
| `{ "allow": ["role1"], "deny": ["role2"] }` | Explicit: principal must hold an allowed role **and** must not hold any denied role |
| `["*"]`                                     | Any authenticated principal is allowed (wildcard)                                   |
| `[]`                                        | Nobody is allowed — the channel is completely locked                                |

**Deny always overrides allow.** If a principal holds any denied role, access is
rejected regardless of which allowed roles the principal also holds.

### CRUD defaults and table overrides

`authorization.crud.default` provides baseline roles for all tables. Individual
tables can override any subset of operations via `authorization.crud.tables`.
Operations not listed in a table override fall back to the default.

### Example config

```json
{
  "authentication": {
    "enabled": true,
    "mode": "oidc-jwt",
    "issuerUrl": "https://keycloak.example.com/realms/fetchlane",
    "audience": "fetchlane-api",
    "jwksUrl": "",
    "claimMappings": {
      "subject": "sub",
      "roles": "realm_access.roles"
    },
    "authorization": {
      "schema": ["admin", "schema-viewer"],
      "createTable": { "allow": ["admin"], "deny": ["intern"] },
      "crud": {
        "default": {
          "create": ["admin", "editor"],
          "read": ["admin", "editor", "viewer"],
          "update": ["admin", "editor"],
          "delete": ["admin"]
        },
        "tables": {
          "audit_log": {
            "read": ["admin", "auditor"],
            "create": [],
            "update": [],
            "delete": []
          },
          "public_data": {
            "read": ["*"]
          },
          "sensitive": {
            "read": { "allow": ["admin"], "deny": ["contractor"] }
          }
        }
      }
    }
  }
}
```

In this example:

- Only `admin` and `schema-viewer` can inspect table schemas
- Only `admin` can create new tables; anyone holding the `intern` role is explicitly denied
- All tables default to editor/viewer-style access
- `audit_log` restricts reads to `admin` and `auditor`, and locks all writes
- `public_data` is readable by any authenticated user
- `sensitive` is readable only by `admin`, and anyone holding `contractor` is blocked even if they are also `admin`
- Missing operations in table overrides (e.g. `public_data.delete`) fall back to the default

When `authorization` is configured, the fine-grained channels define all
access control.

## Operational Limits

Fetchlane can now enforce a small set of production-safe limits entirely from runtime config:

- `limits.requestBodyBytes`
- `limits.fetchMaxPageSize`
- `limits.fetchMaxPredicates`
- `limits.fetchMaxSortFields`
- `limits.rateLimitWindowMs`
- `limits.rateLimitMax`

HTTP rate limiting is applied in memory. Anonymous callers are limited by client IP. Authenticated callers are limited by their mapped subject claim when available, and fall back to IP otherwise.

The status endpoint exposes the active limit values so container operators can verify what is actually running without exposing secrets.

These limits are runtime-config driven. The examples in this README assume the default values from `config/fetchlane.example.json`.

## Deployment

Fetchlane is designed for mounted runtime config in containers.

- Docker, Kubernetes, and Keycloak-ready examples live in [docs/deployment.md](docs/deployment.md).
- `.env.example` only contains the bootstrap env var and placeholder secret references.
- `config/fetchlane.example.json` is the tracked starting point for mounted config.

## Supported Engines

Fetchlane is designed around injectable engine support rather than hardcoded controller behavior. The API stays generic while connector implementations handle engine-specific differences internally.

| Engine     | URL scheme     | Driver   |
| ---------- | -------------- | -------- |
| PostgreSQL | `postgres://`  | `pg`     |
| MySQL      | `mysql://`     | `mysql2` |
| SQL Server | `sqlserver://` | `mssql`  |

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

Swagger UI reflects the currently exposed controller surface and is the best source for concrete request and response shapes. The status endpoint is the best machine-readable snapshot for active config, database connectivity, and capability support.

## FetchRequest

`POST /api/data-access/fetch` is the more expressive querying route. It supports:

- table selection
- predicate lists with parameter arguments
- sort definitions
- pagination

The response shape is an object with `rows`, plus optional `info` and `fields` metadata when the active driver exposes them.

Predicate placeholders are database-agnostic:

- Use `?` with `args` as an array for positional mode
- Use `:name` with `args` as an object for named mode
- Do not mix positional and named placeholders anywhere within the same request

Runtime guardrails also apply:

- `pagination.size` must not exceed `limits.fetchMaxPageSize`
- total predicate clauses must not exceed `limits.fetchMaxPredicates`
- sort fields must not exceed `limits.fetchMaxSortFields`

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
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "path": "/api/data-access/member?pageSize=5000",
  "timestamp": "2026-04-02T00:00:00.000Z"
}
```

The goal is that validation errors, not-found cases, unsupported engine capabilities, and translated database failures all tell you both what went wrong and how to fix it.

## Documentation

Fetchlane ships with two documentation surfaces:

| Docs                  | Purpose                                       | Location                         |
| --------------------- | --------------------------------------------- | -------------------------------- |
| Swagger UI            | Explore and test the HTTP API                 | `http://localhost:3000/api/docs` |
| TypeDoc               | Browse the TypeScript API surface             | `docs/api`                       |
| FetchRequest examples | Real request payloads from simple to advanced | `docs/fetchrequest-examples.md`  |
| Deployment guide      | Config, Docker, Kubernetes, and OIDC examples | `docs/deployment.md`             |
| REST client examples  | Runnable HTTP requests for IDE REST clients   | `rest/data-access.rest`          |

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
