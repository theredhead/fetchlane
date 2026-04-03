# AGENTS.md — Fetchlane

> **This is the single source of truth for all AI agents working in this
> repository.** Every convention, pattern, and architectural decision is
> documented here. When in doubt, follow this file.

---

## Project Overview

Fetchlane is a **NestJS 11** back-end service that exposes a single, consistent
REST API for table access, schema discovery, and structured querying across
**PostgreSQL**, **MySQL**, and **SQL Server**. It ships as a Docker container
and requires no code changes to switch engines — only a connection URL.

| Layer       | Responsibility                                                         |
| ----------- | ---------------------------------------------------------------------- |
| Controllers | HTTP routing, Swagger decorators, request validation                   |
| Services    | Business logic, FetchRequest handling, database lifecycle              |
| Data        | Engine-specific adapters (Postgres, MySQL, SQL Server), query building |
| Auth        | Optional OIDC/JWT bearer authentication middleware                     |
| Config      | Runtime JSON config with env-var interpolation, deep-frozen singleton  |
| Filters     | Global exception filter with structured error responses                |
| Middleware  | Request logging, rate limiting                                         |

---

## Toolchain

| Tool       | Version / Config        | Notes                                             |
| ---------- | ----------------------- | ------------------------------------------------- |
| Node.js    | 22+                     | Runtime                                           |
| NestJS     | 11                      | Decorators, DI, middleware pipeline               |
| TypeScript | 5.7+                    | `experimentalDecorators`, `emitDecoratorMetadata` |
| Build      | `nest build` (nest-cli) | Compiles to `dist/`                               |
| Tests      | Vitest + unplugin-swc   | Two projects: `unit` and `integration`            |
| Coverage   | @vitest/coverage-v8     | `npm run test:cov`                                |
| Lint       | ESLint 8 + Prettier 3   | `npm run lint`, `npm run format`                  |
| Git hooks  | Husky + lint-staged     | Pre-commit: Prettier + ESLint `--fix` on `*.ts`   |
| API docs   | Swagger (via NestJS)    | Auto-generated at runtime                         |
| Type docs  | TypeDoc                 | `npm run docs:api` → `docs/api/`                  |
| Container  | Docker                  | Single-stage Dockerfile                           |

---

## Project Structure

```
src/
├─ main.ts                    ← Bootstrap, global middleware, Swagger setup
├─ app.module.ts              ← Root module: imports, providers, middleware config
├─ db.conf.ts                 ← Connection URL parser
├─ controllers/               ← DataAccessController, StatusController
├─ service/                   ← DataAccessService, FetchRequestHandlerService,
│                                StatusService, DatabaseLifecycleService, LoggerService
├─ data/                      ← Database abstraction layer
│   ├─ database.ts            ← Abstract Database base class
│   ├─ database.providers.ts  ← DI token registration (DATABASE_ADAPTERS, etc.)
│   ├─ fetch-request.ts       ← FetchRequest model
│   ├─ fetch-request-builder.ts
│   ├─ postgres/              ← PostgresDatabase adapter
│   ├─ mysql/                 ← MysqlDatabase adapter
│   └─ sqlserver/             ← SqlServerDatabase adapter
├─ auth/                      ← AuthMiddleware, OidcAuthService, RequestContext
├─ config/                    ← RuntimeConfigService (JSON + env-var interpolation)
├─ errors/                    ← Structured error builders (badRequest, notFound, …)
├─ filters/                   ← ApiExceptionFilter (global catch-all)
├─ limits/                    ← RateLimitMiddleware
├─ middleware/                ← RequestLoggerMiddleware
├─ swagger/                   ← DTO models for Swagger documentation
└─ types/                     ← Shared type definitions
```

---

## Dependency Injection Conventions

- Services are decorated with `@Injectable()` and registered in `AppModule`.
- Database adapters use **Symbol injection tokens**:
  `DATABASE_ADAPTERS`, `ACTIVE_DATABASE_ADAPTER`, `DATABASE_CONNECTION`.
- Runtime config is injected via the `RUNTIME_CONFIG` symbol.
- Constructor injection is the standard pattern — no property injection.

---

## Access Modifiers

Every method and field in **every** class **must** have an explicit access
modifier (`public`, `protected`, or `private`). Never rely on TypeScript's
implicit `public`. This applies to constructors as well.

---

## JSDoc Documentation

Every **public** member (field, method, constructor) and every **exported**
function, class, interface, type alias, and constant **must** have a JSDoc
comment. This applies to production source files — test files are exempt.

Guidelines:

- **Always use multiline JSDoc** — never cram a doc comment onto a single
  line. Even short descriptions get the three-line form.
- Start with a **single-sentence summary** that describes _what_ the member
  does, not _how_.
- Use third-person declarative voice: "Returns the …", "Validates the …",
  "Authenticated caller information attached to …".
- Add `@param` / `@returns` tags when the purpose is not obvious from the
  name and type alone.
- Keep comments concise — one to three lines is ideal.
- Do **not** restate the TypeScript type in the description.
- Do **not** add JSDoc to private or protected members unless the intent is
  genuinely non-obvious.

### Examples

Fields:

```ts
/**
 * Canonical adapter name used for registration and logging.
 */
public static readonly adapterName = 'postgres';
```

Methods:

```ts
/**
 * Returns the configured authentication settings.
 */
public getAuth(): RuntimeAuthConfig {
  return this.config.auth;
}
```

Constructors:

```ts
/**
 * Creates the runtime config service from the validated config snapshot.
 */
public constructor(
  @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
) {}
```

Interfaces and type aliases:

```ts
/**
 * Authenticated caller information attached to the current request.
 */
export interface AuthenticatedPrincipal {
  /**
   * Stable subject identifier extracted from the configured subject claim.
   */
  subject: string;
}
```

**Wrong** — single-line cramped form (never do this):

```ts
/** Returns the auth config. */
public getAuth(): RuntimeAuthConfig { … }
```

---

## Class Member Ordering

Lay out members in this fixed order:

1. **Static fields**
2. **Public fields** — `public readonly …`, `public …`
3. **Protected fields** — `protected readonly …`, `protected …`
4. **Private fields** — `private readonly …`, `private …`
5. **Constructor** — `public constructor(…)`
6. **Static / factory methods**
7. **Lifecycle hooks** — `onModuleInit`, `onModuleDestroy`, etc.
8. **Public methods**
9. **Protected methods**
10. **Private methods**

---

## Error Handling

### Structured Error Responses

All API errors follow a consistent shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid predicate syntax",
  "hint": "Ensure predicates match FetchRequest schema",
  "details": "optional technical details",
  "path": "/api/data-access/table",
  "timestamp": "2026-04-02T00:00:00.000Z"
}
```

### Error Builders

Use the helpers in `errors/api-error.ts` — never throw raw `HttpException`
with an ad-hoc body:

- `badRequest(message, hint, details?)`
- `notFound(message, hint, details?)`
- `conflict(message, hint, details?)`
- `notImplemented(message, hint, details?)`
- `serviceUnavailable(message, hint, details?)`
- `internalServerError(message, hint, details?)`
- `formatDeveloperError(message, hint, details?)` — for startup/config errors

### Global Exception Filter

`ApiExceptionFilter` is registered globally and catches all exceptions.
It normalises them into the JSON shape above. Server errors (≥ 500) are logged
with a stack trace via `LoggerService`.

---

## Configuration

- Config is loaded from the path in the `FETCHLANE_CONFIG` env var.
- The JSON file supports `${ENV_VAR}` interpolation.
- The config object is validated and **deep-frozen** at startup (singleton).
- Sections: `server`, `database`, `limits`, `auth`.
- See `config/fetchlane.example.json` for the full schema and defaults.

---

## Authentication

- **Optional** — disabled by default in config.
- When enabled, `AuthMiddleware` validates bearer tokens via `OidcAuthService`
  (OIDC/JWT).
- Authenticated principal (subject + roles) is attached to the request context
  via `setAuthenticatedPrincipal()`.

---

## Testing Conventions

### Unit Tests

- **Framework:** Vitest (uses `vi` for mocking)
- **File pattern:** `<name>.spec.ts` co-located with source
- **Run:** `npm test`

```ts
describe('StatusController', () => {
  const statusService = { getStatus: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new StatusController(
      statusService as unknown as StatusService,
    );
  });

  it('returns structured status payload', async () => {
    statusService.getStatus.mockResolvedValueOnce({
      /* … */
    });
    await expect(controller.index()).resolves.toEqual(/* … */);
  });
});
```

Key patterns:

- Mock dependencies with `vi.fn()`, cast via `as unknown as Service`
- Call `vi.clearAllMocks()` in `beforeEach`
- Use `vi.mocked()` for typed mock assertions
- Nested `describe` blocks by feature area

### Integration Tests

- Located in `integrationtests/` (separate Vitest project).
- Engine-specific files: `postgres-database.spec.ts`, `mysql-database.spec.ts`,
  `sqlserver-database.spec.ts`.
- Run: `npm run test:integration` (or per-engine variants).

### E2E Tests

- Located in `test/`.
- Run: `npm run test:e2e`.

---

## Formatting & Linting

- Always prioritize readability over terseness. Try not to do more than one thing per line of code

### Prettier

- Single quotes, trailing commas everywhere.
- Config in `.prettierrc`.

### ESLint

- Parser: `@typescript-eslint/parser`
- Extends: `@typescript-eslint/recommended`, `prettier`
- Relaxed rules: no forced explicit return types, no forced module boundaries,
  `any` is allowed.

### Pre-commit

Husky + lint-staged runs **Prettier** and **ESLint --fix** on staged `*.ts`
files automatically.

---

## Git Conventions

- **Commit messages:** conventional commits — `feat:`, `fix:`, `chore:`,
  `refactor:`, `test:`, `docs:`
- **Scope:** optional, matches feature area — `feat(auth):`, `fix(postgres):`
- **Branches:** feature branches (e.g. `feature/rate-limiting`)

---

## Verification Checklist

Before committing, always run:

1. `npm run lint` — must be clean
2. `npm test` — all unit tests must pass
3. `npm run build` — must compile without errors
