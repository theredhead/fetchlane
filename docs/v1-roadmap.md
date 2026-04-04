# Fetchlane v1.0 Roadmap

This document tracks the remaining work needed to ship Fetchlane `v1.0`.

Status values:

- `planned`: scoped and ready to start
- `in_progress`: actively being implemented
- `blocked`: waiting on another track or a design decision
- `done`: merged back into `develop`

## Goals

- Move runtime configuration into a container-friendly config file
- Support optional authentication with Keycloak and similar OIDC providers
- Make limits and operational safeguards configurable
- Improve deployment readiness and documentation for production usage

## Branch Plan

| Track                | Branch                         | Status | Scope                                                                                                            |
| -------------------- | ------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Runtime config       | `feature/runtime-config`       | `done` | Typed config file loader, schema validation, config service, `database.url`, host/port, CORS, bootstrap refactor |
| Authentication       | `feature/optional-auth`        | `done` | Optional authentication module, OIDC JWT validation, Keycloak-compatible config, route protection strategy       |
| Operational limits   | `feature/operational-limits`   | `done` | Rate limiting, body size limits, fetch/query guardrails, config-driven limits, status exposure                   |
| Deployment readiness | `feature/deployment-readiness` | `done` | Container config examples, README updates, example config files, operator docs, release readiness pass           |

## Delivery Order

### 1. Runtime config

Why first:
This becomes the foundation for authentication, limits, and deployment settings.

Checklist:

- [x] Introduce a mounted config file as the primary runtime configuration source
- [x] Add a typed config model and validation at startup
- [x] Add a config service for use across the application
- [x] Move database connection URL into config
- [x] Move `host`, `port`, and CORS settings into config
- [x] Fail fast with developer-friendly startup errors and hints
- [x] Update tests and docs

### 2. Optional authentication

Why second:
Authentication should consume the new config system instead of inventing its own.

Checklist:

- [x] Add authentication config section with `enabled`, `mode`, `issuerUrl`, `audience`, and claim settings
- [x] Implement optional bearer token authentication
- [x] Support OIDC discovery and JWT validation
- [x] Ensure Keycloak-compatible behavior
- [x] Keep authentication provider-agnostic for similar OIDC products
- [x] Decide which routes remain public, especially `/api/status` and `/api/docs`
- [x] Add tests and documentation

### 3. Operational limits

Why third:
This closes the biggest production-safety gaps once config and authentication are in place.

Checklist:

- [x] Add configurable rate limiting
- [x] Add configurable request body size limits
- [x] Add configurable fetch page-size and query-shape limits
- [x] Explicitly defer optional table allowlists or deny-lists to post-v1 unless production usage proves they are required
- [x] Expose effective limits through the status endpoint where useful
- [x] Add tests and documentation

### 4. Deployment readiness

Why fourth:
This consolidates the final production-facing setup and operator experience.

Checklist:

- [x] Add example mounted config file
- [x] Add container/Kubernetes-friendly config instructions
- [x] Document secret-handling expectations
- [x] Update README quick start and deployment guidance
- [x] Run final docs, build, unit, and e2e verification
- [x] Prepare a final v1.0 readiness checklist

## Cross-Track Rules

- Keep tests green before every commit
- Update docs in the same branch as the feature they describe
- Prefer additive, backward-compatible refactors while tracks are in progress
- Merge feature branches back into `develop` only after tests and docs are complete

## Progress Log

### 2026-04-02

- Created the v1.0 roadmap and branch plan
- Reserved separate feature branches off `develop` for each major workstream
- Merged `main` back into `develop` so the v1.0 tracks start from the current Fetchlane codebase
- Started `feature/runtime-config`
- Added a typed JSON runtime config loader with `FETCHLANE_CONFIG` bootstrap support and `${ENV_NAME}` interpolation
- Switched bootstrap, database adapter selection, and status reporting to the validated config service
- Updated runtime-config tests, e2e smoke coverage, and the README quick start to reflect config-first startup
- Merged `feature/runtime-config` back into `develop`
- Started `feature/optional-auth`
- Added config-driven OIDC bearer JWT validation, request principal mapping, and protected-route middleware for `/api/docs` and `/api/data-access/**`
- Merged `feature/optional-auth` back into `develop`
- Started `feature/operational-limits`
- Added config-driven rate limiting, request body size enforcement, and FetchRequest page-size / predicate / sort guardrails
- Merged `feature/operational-limits` back into `develop`
- Started `feature/deployment-readiness`
- Added tracked deployment examples for mounted config, Docker bind mounts, Kubernetes ConfigMap and Secret usage, and Keycloak-ready authentication config
- Completed final unit, e2e, build, and TypeDoc verification for the v1 production foundation tracks

## V1 Readiness Sweep

Ready for `v1.0`:

- Config-driven runtime bootstrapping is in place and validated at startup
- Optional OIDC bearer authentication protects docs and data routes while keeping status public
- Request body limits, FetchRequest guardrails, and HTTP throttling are configurable
- Example config, `.env`, Docker, Kubernetes, and OIDC deployment docs are tracked in the repo
- Unit tests, e2e tests, build output, and TypeDoc generation have all been verified on the current branch

Remaining non-blockers:

- Rate limiting is currently in-memory and therefore per-process; multi-replica deployments will need a shared store if they require globally coordinated throttling
- Authorization is still binary authenticated-vs-public; role-based or table-level authorization can layer on top of the authenticated request context later
