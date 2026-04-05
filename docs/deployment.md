# Fetchlane Deployment Guide

This guide shows the recommended production-facing deployment shape for Fetchlane `v1.0`.

## Runtime Files

Fetchlane boots from one environment variable:

```env
FETCHLANE_CONFIG=/app/config/fetchlane.json
```

That file is JSON and may reference secrets through full-string environment placeholders:

```json
{
  "database": {
    "url": "${FETCHLANE_DATABASE_URL}"
  }
}
```

Placeholders are optional. You can also write literal values directly in the JSON:

```json
{
  "database": {
    "url": "postgres://postgres:password@127.0.0.1:5432/northwind"
  }
}
```

This is convenient for local development, but hardcoding secrets in the config file is discouraged for any shared, committed, or network-reachable environment.

Two tracked example configs are available:

| File                                | Purpose                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `config/config.local.example.json`  | Local development — auth disabled, schema features enabled                 |
| `config/config.secure.example.json` | Production template — auth enabled with OIDC placeholders, authorization configured. Rebind host and fill in secrets before deploying. |

Recommended secret handling for `v1.0`:

- keep non-secret operational settings in the mounted JSON file
- inject secrets such as `FETCHLANE_DATABASE_URL` through environment variables or secret stores
- reference those secrets from JSON with full-string placeholders like `${FETCHLANE_DATABASE_URL}`
- never commit config files that contain real credentials

## Route Exposure

> **WARNING — Running Fetchlane without authentication exposes your entire
> database to anyone who can reach the service.** All tables, all rows, and all
> write operations are fully accessible without credentials. **Never deploy
> with `authentication.enabled: false` in production or on any network-reachable host.**
> Always enable authentication and configure an OIDC provider for non-local deployments.

When `authentication.enabled` is `false`:

- `/api/status` is public
- `/api/docs` is public
- `/api/data-access/**` is public

When `authentication.enabled` is `true`:

- `/api/status` stays public
- `/api/docs` requires bearer authentication
- `/api/data-access/**` requires bearer authentication

That means health and readiness probes can still hit `/api/status` without identity-provider dependencies, while interactive docs and data access remain protected.

## Keycloak Example

> **Template — not runnable as shown.** Replace the `issuerUrl`, `audience`,
> and CORS `origins` values with your Keycloak realm's actual endpoints and
> your application's domain before using this config.

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3000,
    "cors": {
      "enabled": true,
      "origins": ["https://app.example.com"]
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
    "rateLimitMax": 120,
    "statusRateLimitMax": 600
  },
  "enableSchemaFeatures": false,
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
      "schema": ["admin"],
      "crud": {
        "default": {
          "create": ["admin", "editor"],
          "read": ["admin", "editor", "viewer"],
          "update": ["admin", "editor"],
          "delete": ["admin"]
        },
        "tables": {}
      }
    }
  }
}
```

## Fine-Grained Authorization

When `authentication.enabled` is `true`, an `authorization` section in `authentication`
enables per-channel, per-table role checks. Authorization is required when
authentication is enabled.

### Channels

| Channel | Endpoints                                       | Config key             |
| ------- | ----------------------------------------------- | ---------------------- |
| Schema  | `table-names`, `:table/info`, `:table/schema`   | `authorization.schema` |
| CRUD    | All record endpoints, per table × per operation | `authorization.crud`   |

### Role values

Each role configuration can be a **simple array** (shorthand for allow-only) or
an **object** with explicit `allow` and `deny` lists:

- `["role1", "role2"]` — principal needs at least one listed role (no deny rules)
- `{ "allow": ["role1"], "deny": ["role2"] }` — principal must hold an allowed role and must not hold any denied role
- `["*"]` — any authenticated principal passes
- `[]` — channel is locked (nobody allowed)

**Deny always overrides allow.** If a principal holds any denied role, access is
rejected regardless of which allowed roles the principal also holds.

### CRUD structure

```json
{
  "authorization": {
    "schema": ["admin", "schema-viewer"],
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
        "sensitive": {
          "read": { "allow": ["admin"], "deny": ["contractor"] }
        }
      }
    }
  }
}
```

`crud.default` applies to every table. Per-table overrides in `crud.tables`
take precedence for the operations they define; missing operations fall back to
the default.

When `authorization` is present, the fine-grained channels define access
control.

## Docker Bind Mount

```bash
docker run --rm \
  -p 3000:3000 \
  --env FETCHLANE_CONFIG=/app/config/fetchlane.json \
  --env FETCHLANE_DATABASE_URL=postgres://postgres:password@db:5432/northwind \
  --mount type=bind,src="$(pwd)/config/config.secure.example.json",dst=/app/config/fetchlane.json,readonly \
  fetchlane:latest
```

## Kubernetes ConfigMap and Secret

> **Template — not runnable as shown.** Replace the `issuerUrl`, `audience`,
> CORS `origins`, and `FETCHLANE_DATABASE_URL` secret value with your actual
> provider and database details before applying.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fetchlane-config
data:
  fetchlane.json: |
    {
      "server": {
        "host": "0.0.0.0",
        "port": 3000,
        "cors": {
          "enabled": true,
          "origins": ["https://app.example.com"]
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
        "rateLimitMax": 120,
        "statusRateLimitMax": 600
      },
      "enableSchemaFeatures": false,
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
          "schema": ["admin"],
          "crud": {
            "default": {
              "create": ["admin", "editor"],
              "read": ["admin", "editor", "viewer"],
              "update": ["admin", "editor"],
              "delete": ["admin"]
            },
            "tables": {}
          }
        }
      }
    }
---
apiVersion: v1
kind: Secret
metadata:
  name: fetchlane-secrets
type: Opaque
stringData:
  FETCHLANE_DATABASE_URL: postgres://postgres:password@db:5432/northwind
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fetchlane
spec:
  replicas: 1
  selector:
    matchLabels:
      app: fetchlane
  template:
    metadata:
      labels:
        app: fetchlane
    spec:
      containers:
        - name: fetchlane
          image: fetchlane:latest
          env:
            - name: FETCHLANE_CONFIG
              value: /app/config/fetchlane.json
            - name: FETCHLANE_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: fetchlane-secrets
                  key: FETCHLANE_DATABASE_URL
          volumeMounts:
            - name: fetchlane-config
              mountPath: /app/config
              readOnly: true
      volumes:
        - name: fetchlane-config
          configMap:
            name: fetchlane-config
```

## Server Reference

| Setting               | Meaning                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.host`         | Network interface to bind. Defaults to `127.0.0.1` (localhost only). Set to `0.0.0.0` inside containers or when external access is intended |
| `server.port`         | TCP port the HTTP server listens on                                                                                                         |
| `server.cors.enabled` | Whether CORS preflight and headers are applied                                                                                              |
| `server.cors.origins` | Allowed origin list. Use explicit origins — avoid `["*"]` outside of development                                                            |

## Limits Reference

| Setting                     | Meaning                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `limits.requestBodyBytes`   | Maximum accepted JSON payload size                                                    |
| `limits.fetchMaxPageSize`   | Maximum `pagination.size` in a `FetchRequest`                                         |
| `limits.fetchMaxPredicates` | Maximum total predicate clauses in a `FetchRequest`                                   |
| `limits.fetchMaxSortFields` | Maximum sort fields in a `FetchRequest`                                               |
| `limits.rateLimitWindowMs`  | Duration of the in-memory rate-limit window                                           |
| `limits.rateLimitMax`       | Maximum requests allowed per key inside one window                                    |
| `limits.statusRateLimitMax` | Maximum requests per key for `/api/status` (optional, defaults to `rateLimitMax × 5`) |

## Operational Notes

- The server binds to `127.0.0.1` by default so that first-time users cannot accidentally expose the service to the network. Container and production deployments should set `server.host` to `0.0.0.0` explicitly.
- Rate limiting is currently in-memory and therefore scoped per process.
- Expired rate-limit buckets are automatically pruned to prevent unbounded memory growth.
- Every response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- The `/api/status` endpoint is rate-limited separately with a more relaxed ceiling (`statusRateLimitMax`).
- Multi-replica deployments will need a shared store later if they require globally coordinated throttling.
- `/api/status` exposes only safe effective config and limit values; secrets are intentionally excluded.
