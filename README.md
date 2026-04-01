# Fetchlane

Fetchlane is a NestJS API for browsing table data, describing schemas, and exposing database content over HTTP across multiple database engines.

Swagger UI is available at `http://localhost:3000/api/docs` when the app is running.

## API documentation

This project exposes two kinds of docs:

- Swagger UI for the HTTP API at `http://localhost:3000/api/docs`
- TypeDoc for the TypeScript API surface in `docs/api`

Generate the TypeDoc site with:

```bash
npm run docs:api
```

To rebuild docs automatically while editing:

```bash
npm run docs:api:watch
```

Generated TypeDoc output is gitignored.

## Environment setup

This project now loads a local `.env` file automatically at startup.

1. Copy `.env.example` to `.env`
2. Adjust the values for your local database
3. Start the app

Real `.env` files are gitignored so local credentials do not get committed. Only `.env.example` is tracked.

## Database connector factory

Fetchlane selects its connector from `DB_URL`.

Supported URL format:

```text
<engine>://<user>:<password>@<host>:<port?>/<database>
```

Examples:

```text
postgres://postgres:password@127.0.0.1:5432/northwind
mysql://root:password@127.0.0.1:3306/northwind
```

Supported engines:

- `postgres`
- `mysql`

## Example `.env`

```env
DB_URL=postgres://postgres:password@127.0.0.1:5432/northwind
```

For MySQL:

```env
DB_URL=mysql://root:password@127.0.0.1:3306/northwind
```

`DB_URL` is required.

## Generic API scope

Fetchlane focuses on the generic, database-agnostic API surface. Engine-specific behavior lives inside connector implementations rather than separate HTTP features on this branch.

## Main routes

### Generic data-access

- `GET /api/data-access/table-names`
- `GET /api/data-access/:table`
- `GET /api/data-access/:table/info`
- `GET /api/data-access/:table/schema`
- `GET /api/data-access/:table/record/:id`
- `GET /api/data-access/:table/record/:id/column/:column`
- `POST /api/data-access/fetch`
- `POST /api/data-access/:table`
- `POST /api/data-access/tables/:table`
- `PATCH /api/data-access/:table/record/:id/column/:column`
- `PUT /api/data-access/:table/record/:id`
- `DELETE /api/data-access/:table/record/:id`

### Docs and status

- `GET /api/docs`
- `GET /api/status`
