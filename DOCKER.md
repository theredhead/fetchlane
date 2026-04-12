# theredhead/fetchlane

<p align="center">
  <img src="https://raw.githubusercontent.com/theredhead/fetchlane/main/assets/branding/fetchlane-logo.svg" alt="Fetchlane logo" width="340" />
</p>

<p align="center">
  <strong>Query once. Connect everywhere.</strong>
</p>

Multi-engine REST API for table access, schema discovery, and structured querying across PostgreSQL, MySQL, and SQL Server.

## Quick Reference

- **Source:** [github.com/theredhead/fetchlane](https://github.com/theredhead/fetchlane)
- **License:** MIT
- **Exposed port:** `3000`

## Supported Engines

| Engine     | URL Scheme     | Driver   |
| ---------- | -------------- | -------- |
| PostgreSQL | `postgres://`  | `pg`     |
| MySQL      | `mysql://`     | `mysql2` |
| SQL Server | `sqlserver://` | `mssql`  |

## Getting Started

Fetchlane boots from a single JSON config file pointed to by the `FETCHLANE_CONFIG` environment variable.

### Minimal Example

Create a config file `fetchlane.json`:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3000,
    "cors": {
      "enabled": true,
      "origins": ["http://localhost:3000"]
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
  "enableSchemaFeatures": true,
  "authentication": {
    "enabled": false
  }
}
```

Run the container:

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/fetchlane.json:/app/config/fetchlane.json:ro \
  -e FETCHLANE_CONFIG=/app/config/fetchlane.json \
  -e FETCHLANE_DATABASE_URL=postgres://user:password@host:5432/mydb \
  theredhead/fetchlane
```

Then open:

- **Swagger UI:** http://localhost:3000/api/docs
- **Status:** http://localhost:3000/api/status

### Docker Compose

```yaml
services:
  fetchlane:
    image: theredhead/fetchlane:latest
    ports:
      - '3000:3000'
    volumes:
      - ./fetchlane.json:/app/config/fetchlane.json:ro
    environment:
      FETCHLANE_CONFIG: /app/config/fetchlane.json
      FETCHLANE_DATABASE_URL: postgres://user:password@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:17
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: mydb
```

## Environment Variables

| Variable                    | Required | Description                                                                         |
| --------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `FETCHLANE_CONFIG`          | Yes      | Path to the runtime JSON config inside the container                                |
| `FETCHLANE_DATABASE_URL`    | No\*     | Database connection URL (when referenced via `${FETCHLANE_DATABASE_URL}` in config) |
| `FETCHLANE_OIDC_ISSUER_URL` | No\*     | OIDC issuer URL (when authentication is enabled)                                    |
| `FETCHLANE_OIDC_AUDIENCE`   | No\*     | OIDC audience (when authentication is enabled)                                      |

\* Required when the config file references them via `${...}` placeholders.

## Configuration

The JSON config file supports `${ENV_VAR}` interpolation for secrets. String values like `"${FETCHLANE_DATABASE_URL}"` are replaced with the corresponding environment variable at startup.

### Config Sections

| Section                | Controls                                     |
| ---------------------- | -------------------------------------------- |
| `server`               | Listen address, port, CORS origins           |
| `database`             | Connection URL (engine, host, credentials)   |
| `limits`               | Body size, page sizes, rate limiting         |
| `enableSchemaFeatures` | Whether schema endpoints are available       |
| `authentication`       | OIDC/JWT bearer validation and authorization |

### Database URL Format

```
<engine>://<user>:<password>@<host>:<port>/<database>
```

## Security

> **WARNING:** Running Fetchlane without authentication exposes your entire
> database to anyone who can reach the service — all tables, all rows, all
> write operations. **Never run with `authentication.enabled: false` outside
> of a trusted local environment.**

For production, enable authentication and configure an OIDC provider:

```json
{
  "authentication": {
    "enabled": true,
    "mode": "oidc-jwt",
    "issuerUrl": "${FETCHLANE_OIDC_ISSUER_URL}",
    "audience": "${FETCHLANE_OIDC_AUDIENCE}",
    "claimMappings": {
      "subject": "sub",
      "roles": "realm_access.roles"
    },
    "authorization": {
      "schema": ["admin"],
      "crud": {
        "default": {
          "create": ["admin", "editor"],
          "read": ["admin", "editor", "viewer"],
          "update": ["admin", "editor"],
          "delete": ["admin"]
        }
      }
    }
  }
}
```

## API Endpoints

### Data Access

| Method   | Path                                             | Description             |
| -------- | ------------------------------------------------ | ----------------------- |
| `GET`    | `/api/data-access/table-names`                   | List all tables         |
| `GET`    | `/api/data-access/:table`                        | Browse table rows       |
| `GET`    | `/api/data-access/:table/info`                   | Table metadata          |
| `GET`    | `/api/data-access/:table/schema`                 | Column schema           |
| `GET`    | `/api/data-access/:table/record/:pk`             | Single record by key    |
| `GET`    | `/api/data-access/:table/record/:pk/column/:col` | Single column value     |
| `POST`   | `/api/data-access/fetch`                         | Structured FetchRequest |
| `POST`   | `/api/data-access/:table`                        | Insert record           |
| `PUT`    | `/api/data-access/:table/record/:pk`             | Replace record          |
| `PATCH`  | `/api/data-access/:table/record/:pk/column/:col` | Update column value     |
| `DELETE` | `/api/data-access/:table/record/:pk`             | Delete record           |

### Platform

| Method | Path          | Description       |
| ------ | ------------- | ----------------- |
| `GET`  | `/api/docs`   | Swagger UI        |
| `GET`  | `/api/status` | Health and status |

## License

MIT
