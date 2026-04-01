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
- Connector selection based on a single `DB_URL`
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

3. Set `DB_URL` in `.env`:

```env
DB_URL=postgres://postgres:password@127.0.0.1:5432/northwind
```

4. Start the app:

```bash
npm run start:dev
```

5. Open the docs:

- Swagger UI: `http://localhost:3000/api/docs`
- Status endpoint: `http://localhost:3000/api/status`

## Connection URL

Fetchlane reads its connector configuration from `DB_URL`.

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

`DB_URL` is required.

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
DB_URL=postgres://postgres:password@127.0.0.1:5432/northwind
```

Alternative examples:

```env
DB_URL=mysql://root:password@127.0.0.1:3306/northwind
DB_URL=sqlserver://sa:YourStrong!Passw0rd@127.0.0.1:1433/master
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
