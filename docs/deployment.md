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

The tracked baseline config lives at `config/fetchlane.example.json`.

## Route Exposure

When `auth.enabled` is `false`:

- `/api/status` is public
- `/api/docs` is public
- `/api/data-access/**` is public

When `auth.enabled` is `true`:

- `/api/status` stays public
- `/api/docs` requires bearer auth
- `/api/data-access/**` requires bearer auth

## Keycloak Example

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
    "request_body_bytes": 1048576,
    "fetch_max_page_size": 1000,
    "fetch_max_predicates": 25,
    "fetch_max_sort_fields": 8,
    "rate_limit_window_ms": 60000,
    "rate_limit_max": 120
  },
  "auth": {
    "enabled": true,
    "mode": "oidc-jwt",
    "issuer_url": "https://keycloak.example.com/realms/fetchlane",
    "audience": "fetchlane-api",
    "jwks_url": "",
    "claim_mappings": {
      "subject": "sub",
      "roles": "realm_access.roles"
    }
  }
}
```

## Docker Bind Mount

```bash
docker run --rm \
  -p 3000:3000 \
  --env FETCHLANE_CONFIG=/app/config/fetchlane.json \
  --env FETCHLANE_DATABASE_URL=postgres://postgres:password@db:5432/northwind \
  --mount type=bind,src="$(pwd)/config/fetchlane.example.json",dst=/app/config/fetchlane.json,readonly \
  fetchlane:latest
```

## Kubernetes ConfigMap and Secret

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
        "request_body_bytes": 1048576,
        "fetch_max_page_size": 1000,
        "fetch_max_predicates": 25,
        "fetch_max_sort_fields": 8,
        "rate_limit_window_ms": 60000,
        "rate_limit_max": 120
      },
      "auth": {
        "enabled": true,
        "mode": "oidc-jwt",
        "issuer_url": "https://keycloak.example.com/realms/fetchlane",
        "audience": "fetchlane-api",
        "jwks_url": "",
        "claim_mappings": {
          "subject": "sub",
          "roles": "realm_access.roles"
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

## Limits Reference

| Setting | Meaning |
| --- | --- |
| `limits.request_body_bytes` | Maximum accepted JSON payload size |
| `limits.fetch_max_page_size` | Maximum `pagination.size` in a `FetchRequest` |
| `limits.fetch_max_predicates` | Maximum total predicate clauses in a `FetchRequest` |
| `limits.fetch_max_sort_fields` | Maximum sort fields in a `FetchRequest` |
| `limits.rate_limit_window_ms` | Duration of the in-memory rate-limit window |
| `limits.rate_limit_max` | Maximum requests allowed per key inside one window |
