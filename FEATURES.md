# Fetchlane 1.0 — Features

## Multi-Engine Database Access

- Unified REST API across **PostgreSQL**, **MySQL**, and **SQL Server**
- Engine auto-detection from connection URL (`postgres://`, `mysql://`, `sqlserver://`)
- Injectable adapter architecture — only install the driver you need (`pg`, `mysql2`, `mssql`)

## CRUD Operations

- Paginated table browsing with configurable page size
- Single-record lookup by primary key (including composite keys)
- Single-column read and update on individual records
- Full record insert, replace, and delete
- Arbitrary primary key support (UUID, varchar, composite — not limited to auto-increment `id`)

## FetchRequest Querying

- Structured `POST /api/data-access/fetch` endpoint with predicates, sorting, and pagination
- Positional (`?`) and named (`:param`) parameter placeholders
- Engine-agnostic predicate syntax with automatic parameter binding
- Configurable guardrails: max page size, max predicates, max sort fields

## Schema Discovery

- `table-names` — list all public tables
- `info` — column metadata per table
- `schema` — detailed normalized schema (types, nullability, identity, defaults, precision)
- Primary key column discovery per table
- Toggled via `enableSchemaFeatures` — disabled by default

## Authentication and Authorization

- Optional OIDC/JWT bearer authentication (Keycloak, Auth0, Entra ID compatible)
- JWKS auto-discovery or explicit JWKS URL override
- Configurable claim mapping for subject and roles
- Per-channel authorization: schema endpoints and CRUD operations
- Per-table role overrides with allow/deny gates
- Deny always overrides allow
- Wildcard (`["*"]`) and locked (`[]`) gate support
- Request ID tracing and authorization audit logging

## Rate Limiting

- In-memory per-subject (authenticated) or per-IP (anonymous) rate limiting
- Standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` response headers
- Separate relaxed ceiling for `/api/status` (`statusRateLimitMax`)
- Automatic expired-bucket cleanup to prevent memory growth

## Runtime Configuration

- Single JSON config file via `FETCHLANE_CONFIG` environment variable
- `${ENV_VAR}` placeholder interpolation for secrets
- Deep-frozen, validated config singleton with fail-fast startup errors
- Configurable: server binding, CORS origins, database URL, limits, authentication, authorization

## Operational Safety

- Localhost-only binding by default (`127.0.0.1`) — must opt in to network exposure
- Request body size enforcement
- Structured error responses with `message`, `hint`, `details`, `requestId`, `path`, `timestamp`
- Global exception filter with stack-trace logging for server errors
- Request logger middleware

## API Documentation

- Auto-generated Swagger UI at `/api/docs` (follows the authentication model)
- TypeDoc generation for the TypeScript API surface
- `/api/status` health endpoint with runtime snapshot, database connectivity, and capability reporting

## Testing

- 415+ unit tests (Vitest + SWC)
- 21 end-to-end tests covering auth, rate limiting, body limits, and fetch guardrails
- Integration tests for all three database engines (UUID PKs, composite PKs, connection lifecycle)
- 95%+ code coverage

## Deployment

- Single-stage Dockerfile
- Docker bind-mount and Kubernetes ConfigMap/Secret examples
- Keycloak-ready OIDC config template
- Local and secure example configs tracked in the repo
