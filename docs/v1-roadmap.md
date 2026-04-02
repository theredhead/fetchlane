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

| Track | Branch | Status | Scope |
| --- | --- | --- | --- |
| Runtime config | `feature/runtime-config` | `done` | Typed config file loader, schema validation, config service, `database.url`, host/port, CORS, bootstrap refactor |
| Auth | `feature/optional-auth` | `done` | Optional auth module, OIDC JWT validation, Keycloak-compatible config, route protection strategy |
| Operational limits | `feature/operational-limits` | `in_progress` | Rate limiting, body size limits, fetch/query guardrails, config-driven limits, status exposure |
| Deployment readiness | `feature/deployment-readiness` | `planned` | Container config examples, README updates, example config files, operator docs, release readiness pass |

## Delivery Order

### 1. Runtime config

Why first:
This becomes the foundation for auth, limits, and deployment settings.

Checklist:

- [x] Introduce a mounted config file as the primary runtime configuration source
- [x] Add a typed config model and validation at startup
- [x] Add a config service for use across the application
- [x] Move database connection URL into config
- [x] Move `host`, `port`, and CORS settings into config
- [x] Fail fast with developer-friendly startup errors and hints
- [x] Update tests and docs

### 2. Optional auth

Why second:
Authentication should consume the new config system instead of inventing its own.

Checklist:

- [ ] Add auth config section with `enabled`, `mode`, `issuer_url`, `audience`, and claim settings
- [ ] Implement optional bearer token authentication
- [ ] Support OIDC discovery and JWT validation
- [ ] Ensure Keycloak-compatible behavior
- [ ] Keep auth provider-agnostic for similar OIDC products
- [ ] Decide which routes remain public, especially `/api/status` and `/api/docs`
- [ ] Add tests and documentation

### 3. Operational limits

Why third:
This closes the biggest production-safety gaps once config and auth are in place.

Checklist:

- [ ] Add configurable rate limiting
- [ ] Add configurable request body size limits
- [ ] Add configurable fetch page-size and query-shape limits
- [ ] Consider optional table allowlists or deny-lists
- [ ] Expose effective limits through the status endpoint where useful
- [ ] Add tests and documentation

### 4. Deployment readiness

Why fourth:
This consolidates the final production-facing setup and operator experience.

Checklist:

- [ ] Add example mounted config file
- [ ] Add container/Kubernetes-friendly config instructions
- [ ] Document secret-handling expectations
- [ ] Update README quick start and deployment guidance
- [ ] Run final docs, build, unit, and e2e verification
- [ ] Prepare a final v1.0 readiness checklist

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
