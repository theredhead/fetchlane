import { Inject, Injectable, Provider } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { parseDatabaseUrl, ParsedDatabaseUrl } from '../db.conf';
import type { PrimaryKeyColumn } from '../data/database';
import { formatDeveloperError } from '../errors/api-error';

/**
 * Supported server CORS configuration.
 */
export interface RuntimeCorsConfig {
  /**
   * Enables or disables CORS for the HTTP server.
   */
  enabled: boolean;
  /**
   * Allowed origins for CORS requests.
   */
  origins: string[];
}

/**
 * Server settings loaded from the runtime config file.
 */
export interface RuntimeServerConfig {
  /**
   * Interface address for the HTTP listener.
   */
  host: string;
  /**
   * TCP port for the HTTP listener.
   */
  port: number;
  /**
   * CORS settings for the HTTP server.
   */
  cors: RuntimeCorsConfig;
}

/**
 * Database settings loaded from the runtime config file.
 */
export interface RuntimeDatabaseConfig {
  /**
   * Connection URL used to reach the active database engine.
   */
  url: string;
}

/**
 * Operational limits loaded from the runtime config file.
 */
export interface RuntimeLimitsConfig {
  /**
   * Maximum accepted HTTP request body size in bytes.
   */
  requestBodyBytes: number;
  /**
   * Maximum allowed FetchRequest page size.
   */
  fetchMaxPageSize: number;
  /**
   * Maximum number of predicates in a FetchRequest.
   */
  fetchMaxPredicates: number;
  /**
   * Maximum number of sort fields in a FetchRequest.
   */
  fetchMaxSortFields: number;
  /**
   * Rate-limit window length in milliseconds.
   */
  rateLimitWindowMs: number;
  /**
   * Maximum requests allowed per rate-limit window.
   */
  rateLimitMax: number;
}

/**
 * Claim mapping settings for authenticated principals.
 */
export interface RuntimeAuthenticationClaimMappingsConfig {
  /**
   * Claim path used as the authenticated subject identifier.
   */
  subject: string;
  /**
   * Claim path used as the authenticated roles collection.
   */
  roles: string;
}

/**
 * CRUD operation type for authorization checks.
 */
export type CrudOperation = 'create' | 'read' | 'update' | 'delete';

/**
 * A pair of allow and deny role lists for a single authorization gate.
 *
 * Deny always overrides allow: if a principal holds any denied role, access
 * is rejected regardless of which allowed roles the principal also holds.
 */
export interface RoleGate {
  /**
   * Roles that grant access. `["*"]` means any authenticated principal.
   * An empty array locks the gate completely.
   */
  allow: string[];
  /**
   * Roles that explicitly revoke access, overriding any allow match.
   * An empty array means no deny rules are configured.
   */
  deny: string[];
}

/**
 * Role requirements for each CRUD operation.
 */
export interface CrudOperationRoles {
  /**
   * Gate controlling record creation.
   */
  create: RoleGate;
  /**
   * Gate controlling record reads.
   */
  read: RoleGate;
  /**
   * Gate controlling record updates.
   */
  update: RoleGate;
  /**
   * Gate controlling record deletion.
   */
  delete: RoleGate;
}

/**
 * Per-table override — omitted operations fall back to the CRUD default.
 */
export interface TableCrudOverride {
  /**
   * Gate controlling record creation in this table.
   */
  create?: RoleGate;
  /**
   * Gate controlling record reads in this table.
   */
  read?: RoleGate;
  /**
   * Gate controlling record updates in this table.
   */
  update?: RoleGate;
  /**
   * Gate controlling record deletion in this table.
   */
  delete?: RoleGate;
}

/**
 * Fine-grained authorization settings for functional segments.
 */
export interface RuntimeAuthorizationConfig {
  /**
   * Gate controlling access to schema endpoints (table-names, table info, describe).
   */
  schema: RoleGate;
  /**
   * CRUD authorization with a default and optional per-table overrides.
   */
  crud: {
    /**
     * Default CRUD role requirements applied to all tables.
     */
    default: CrudOperationRoles;
    /**
     * Per-table overrides — missing operations fall back to `default`.
     */
    tables: { [tableName: string]: TableCrudOverride };
  };
}

/**
 * Authentication settings loaded from the runtime config file.
 */
/**
 * The only authentication mode supported in v1.0.
 */
export const AUTHENTICATION_MODE_OIDC_JWT = 'oidc-jwt' as const;

export interface RuntimeAuthenticationConfig {
  /**
   * Enables or disables authentication.
   */
  enabled: boolean;
  /**
   * Authentication mode for the service.
   */
  mode: typeof AUTHENTICATION_MODE_OIDC_JWT;
  /**
   * OIDC issuer URL used for discovery and issuer validation.
   */
  issuerUrl: string;
  /**
   * JWT audience expected by the service.
   */
  audience: string;
  /**
   * Optional JWKS URL override.
   */
  jwksUrl: string;
  /**
   * Claim mappings used when authentication is enabled.
   */
  claimMappings: RuntimeAuthenticationClaimMappingsConfig;
  /**
   * Fine-grained per-channel authorization, required when authentication is enabled.
   */
  authorization: RuntimeAuthorizationConfig;
}

/**
 * Fully validated runtime configuration for Fetchlane.
 */
export interface RuntimeConfig {
  /**
   * Server settings.
   */
  server: RuntimeServerConfig;
  /**
   * Database connection settings.
   */
  database: RuntimeDatabaseConfig;
  /**
   * Operational limits.
   */
  limits: RuntimeLimitsConfig;
  /**
   * Authentication settings.
   */
  authentication: RuntimeAuthenticationConfig;
  /**
   * Whether schema-exposing features (table listing, column info, describe) are enabled.
   */
  enableSchemaFeatures: boolean;
  /**
   * Optional per-table primary key overrides.
   *
   * When a table lacks discoverable primary key metadata (e.g. views, tables
   * without constraints), operators can specify columns here so that
   * single-record operations still work.
   */
  primaryKeys?: { [tableName: string]: PrimaryKeyColumn[] };
}

/**
 * Public subset of runtime config exposed by the status endpoint.
 */
export interface StatusRuntimeConfigSnapshot {
  /**
   * Safe server settings.
   */
  server: {
    host: string;
    port: number;
    corsEnabled: boolean;
  };
  /**
   * Safe authentication summary.
   */
  authentication: {
    enabled: boolean;
  };
  /**
   * Effective operational limits.
   */
  limits: RuntimeLimitsConfig;
}

/**
 * Injection token for the validated runtime config object.
 */
export const RUNTIME_CONFIG = Symbol('RUNTIME_CONFIG');

let cachedRuntimeConfig: RuntimeConfig | null = null;

/**
 * Loads and validates the runtime config defined by `FETCHLANE_CONFIG`.
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (cachedRuntimeConfig) {
    return cachedRuntimeConfig;
  }

  const configPath = readConfigPathFromEnvironment();
  const fileContents = readConfigFile(configPath);
  const parsedJson = parseJsonConfig(fileContents, configPath);
  const interpolated = interpolateEnvironmentPlaceholders(
    parsedJson,
    configPath,
  );
  cachedRuntimeConfig = deepFreeze(
    validateRuntimeConfig(interpolated, configPath),
  );
  return cachedRuntimeConfig;
}

/**
 * Clears the memoized runtime config for isolated tests.
 */
export function resetRuntimeConfigForTests(): void {
  cachedRuntimeConfig = null;
}

/**
 * Typed access to the validated runtime config and safe status projection.
 */
@Injectable()
export class RuntimeConfigService {
  /**
   * Creates the runtime config service from the validated config snapshot.
   */
  public constructor(
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  /**
   * Returns the full validated runtime config.
   */
  public getConfig(): RuntimeConfig {
    return this.config;
  }

  /**
   * Returns the configured server settings.
   */
  public getServer(): RuntimeServerConfig {
    return this.config.server;
  }

  /**
   * Returns the configured database settings.
   */
  public getDatabase(): RuntimeDatabaseConfig {
    return this.config.database;
  }

  /**
   * Returns the parsed database URL details.
   */
  public getParsedDatabaseUrl(): ParsedDatabaseUrl {
    return parseDatabaseUrl(this.config.database.url);
  }

  /**
   * Returns the configured operational limits.
   */
  public getLimits(): RuntimeLimitsConfig {
    return this.config.limits;
  }

  /**
   * Returns the configured authentication settings.
   */
  public getAuthentication(): RuntimeAuthenticationConfig {
    return this.config.authentication;
  }

  /**
   * Returns whether schema-exposing features are enabled.
   */
  public isSchemaFeaturesEnabled(): boolean {
    return this.config.enableSchemaFeatures;
  }

  /**
   * Returns the fine-grained authorization settings.
   */
  public getAuthorization(): RuntimeAuthorizationConfig | undefined {
    return this.config.authentication.authorization;
  }

  /**
   * Returns the primary key column override for a table, or `undefined`
   * when no override is configured.
   */
  public getPrimaryKeyOverride(table: string): PrimaryKeyColumn[] | undefined {
    return this.config.primaryKeys?.[table];
  }

  /**
   * Returns the safe runtime config subset exposed through status.
   */
  public getStatusSnapshot(): StatusRuntimeConfigSnapshot {
    return {
      server: {
        host: this.config.server.host,
        port: this.config.server.port,
        corsEnabled: this.config.server.cors.enabled,
      },
      authentication: {
        enabled: this.config.authentication.enabled,
      },
      limits: this.config.limits,
    };
  }
}

/**
 * Nest providers exposing the validated runtime config and service wrapper.
 */
export const runtimeConfigProviders: Provider[] = [
  {
    provide: RUNTIME_CONFIG,
    useFactory: (): RuntimeConfig => getRuntimeConfig(),
  },
  RuntimeConfigService,
];

function readConfigPathFromEnvironment(): string {
  const configPath = process.env.FETCHLANE_CONFIG?.trim();
  if (!configPath) {
    throw new Error(
      formatDeveloperError(
        'Missing FETCHLANE_CONFIG.',
        'Set FETCHLANE_CONFIG to the mounted JSON config path, for example /app/config/fetchlane.json.',
      ),
    );
  }

  return configPath;
}

function readConfigFile(configPath: string): string {
  try {
    return readFileSync(configPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message =
      code === 'ENOENT'
        ? `Runtime config file not found at "${configPath}".`
        : `Runtime config file could not be read at "${configPath}".`;
    const hint =
      code === 'ENOENT'
        ? 'Mount the JSON config file at the configured path, or update FETCHLANE_CONFIG to the correct location.'
        : 'Verify that the config file exists and that the Fetchlane process has permission to read it.';

    throw new Error(formatDeveloperError(message, hint));
  }
}

function parseJsonConfig(fileContents: string, configPath: string): unknown {
  try {
    return JSON.parse(fileContents) as unknown;
  } catch (error) {
    throw new Error(
      formatDeveloperError(
        `Runtime config file "${configPath}" does not contain valid JSON.`,
        'Fix the JSON syntax, then restart the service.',
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
}

function interpolateEnvironmentPlaceholders(
  value: unknown,
  configPath: string,
  path = 'config',
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      interpolateEnvironmentPlaceholders(
        entry,
        configPath,
        `${path}[${index}]`,
      ),
    );
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        interpolateEnvironmentPlaceholders(entry, configPath, `${path}.${key}`),
      ]),
    );
  }

  if (typeof value !== 'string' || !value.includes('${')) {
    return value;
  }

  const placeholderMatch = value.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (!placeholderMatch) {
    throw new Error(
      formatDeveloperError(
        `Invalid environment placeholder at "${path}" in "${configPath}".`,
        'Use full-string placeholders like ${FETCHLANE_DATABASE_URL} with no extra text around them.',
      ),
    );
  }

  const [, envName] = placeholderMatch;
  const envValue = process.env[envName];
  if (!envValue) {
    throw new Error(
      formatDeveloperError(
        `Missing environment variable "${envName}" referenced by "${path}".`,
        `Set ${envName} in the environment before startup, or replace the placeholder with a literal value in "${configPath}".`,
      ),
    );
  }

  return envValue;
}

function validateRuntimeConfig(
  value: unknown,
  configPath: string,
): RuntimeConfig {
  const root = readObject(value, 'config', configPath);
  const server = readObject(root.server, 'config.server', configPath);
  const serverCors = readObject(server.cors, 'config.server.cors', configPath);
  const database = readObject(root.database, 'config.database', configPath);
  const limits = readObject(root.limits, 'config.limits', configPath);
  const authenticationSection = readObject(
    root.authentication,
    'config.authentication',
    configPath,
  );
  const claimMappings = readObject(
    authenticationSection.claimMappings,
    'config.authentication.claimMappings',
    configPath,
  );

  const config: RuntimeConfig = {
    server: {
      host: readNonEmptyString(server.host, 'config.server.host', configPath),
      port: readPositiveInteger(server.port, 'config.server.port', configPath),
      cors: {
        enabled: readBoolean(
          serverCors.enabled,
          'config.server.cors.enabled',
          configPath,
        ),
        origins: readStringArray(
          serverCors.origins,
          'config.server.cors.origins',
          configPath,
        ),
      },
    },
    database: {
      url: readNonEmptyString(database.url, 'config.database.url', configPath),
    },
    limits: {
      requestBodyBytes: readPositiveInteger(
        limits.requestBodyBytes,
        'config.limits.requestBodyBytes',
        configPath,
      ),
      fetchMaxPageSize: readPositiveInteger(
        limits.fetchMaxPageSize,
        'config.limits.fetchMaxPageSize',
        configPath,
      ),
      fetchMaxPredicates: readPositiveInteger(
        limits.fetchMaxPredicates,
        'config.limits.fetchMaxPredicates',
        configPath,
      ),
      fetchMaxSortFields: readPositiveInteger(
        limits.fetchMaxSortFields,
        'config.limits.fetchMaxSortFields',
        configPath,
      ),
      rateLimitWindowMs: readPositiveInteger(
        limits.rateLimitWindowMs,
        'config.limits.rateLimitWindowMs',
        configPath,
      ),
      rateLimitMax: readPositiveInteger(
        limits.rateLimitMax,
        'config.limits.rateLimitMax',
        configPath,
      ),
    },
    authentication: {
      enabled: readBoolean(
        authenticationSection.enabled,
        'config.authentication.enabled',
        configPath,
      ),
      mode: readAuthenticationMode(
        authenticationSection.mode,
        'config.authentication.mode',
        configPath,
      ),
      issuerUrl: readString(
        authenticationSection.issuerUrl,
        'config.authentication.issuerUrl',
        configPath,
      ),
      audience: readString(
        authenticationSection.audience,
        'config.authentication.audience',
        configPath,
      ),
      jwksUrl: readString(
        authenticationSection.jwksUrl,
        'config.authentication.jwksUrl',
        configPath,
      ),
      claimMappings: {
        subject: readNonEmptyString(
          claimMappings.subject,
          'config.authentication.claimMappings.subject',
          configPath,
        ),
        roles: readNonEmptyString(
          claimMappings.roles,
          'config.authentication.claimMappings.roles',
          configPath,
        ),
      },
      authorization: readOptionalAuthorization(
        authenticationSection,
        configPath,
      ),
    },
    enableSchemaFeatures: root.enableSchemaFeatures === true,
    primaryKeys: readOptionalPrimaryKeys(root, configPath),
  };

  parseDatabaseUrl(config.database.url);

  if (config.server.cors.enabled && config.server.cors.origins.length === 0) {
    throw new Error(
      formatDeveloperError(
        'Invalid runtime config: config.server.cors.origins must not be empty when CORS is enabled.',
        'Add at least one allowed origin, or set config.server.cors.enabled to false.',
      ),
    );
  }

  if (config.authentication.enabled && !config.authentication.audience.trim()) {
    throw new Error(
      formatDeveloperError(
        'Invalid runtime config: config.authentication.audience is required when authentication is enabled.',
        'Set config.authentication.audience to the JWT audience expected by Fetchlane.',
      ),
    );
  }

  if (
    config.authentication.enabled &&
    !config.authentication.issuerUrl.trim() &&
    !config.authentication.jwksUrl.trim()
  ) {
    throw new Error(
      formatDeveloperError(
        'Invalid runtime config: authentication requires either config.authentication.issuerUrl or config.authentication.jwksUrl.',
        'Set an issuer URL for OIDC discovery, or provide a direct JWKS URL override.',
      ),
    );
  }

  if (config.authentication.enabled && !config.authentication.authorization) {
    throw new Error(
      formatDeveloperError(
        'Invalid runtime config: config.authentication.authorization is required when authentication is enabled.',
        'Add an authorization section with schema and crud role definitions.',
      ),
    );
  }

  return config;
}

function readObject(
  value: unknown,
  path: string,
  configPath: string,
): Record<string, unknown> {
  if (isPlainObject(value)) {
    return value;
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must be a JSON object.`,
      `Fix the structure at ${path} in "${configPath}".`,
    ),
  );
}

function readString(value: unknown, path: string, configPath: string): string {
  if (typeof value === 'string') {
    return value;
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must be a string.`,
      `Provide a string value at ${path} in "${configPath}".`,
    ),
  );
}

function readNonEmptyString(
  value: unknown,
  path: string,
  configPath: string,
): string {
  const parsed = readString(value, path, configPath).trim();
  if (parsed) {
    return parsed;
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must not be empty.`,
      `Provide a non-empty string value at ${path} in "${configPath}".`,
    ),
  );
}

function readBoolean(
  value: unknown,
  path: string,
  configPath: string,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must be a boolean.`,
      `Use true or false at ${path} in "${configPath}".`,
    ),
  );
}

function readPositiveInteger(
  value: unknown,
  path: string,
  configPath: string,
): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must be a positive integer.`,
      `Provide a whole number greater than zero at ${path} in "${configPath}".`,
    ),
  );
}

function readStringArray(
  value: unknown,
  path: string,
  configPath: string,
): string[] {
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  ) {
    return value.map((entry) => entry.trim());
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must be an array of non-empty strings.`,
      `Provide a JSON string array at ${path} in "${configPath}".`,
    ),
  );
}

function readAuthenticationMode(
  value: unknown,
  path: string,
  configPath: string,
): 'oidc-jwt' {
  const mode = readNonEmptyString(value, path, configPath);
  if (mode === AUTHENTICATION_MODE_OIDC_JWT) {
    return mode;
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must be "${AUTHENTICATION_MODE_OIDC_JWT}".`,
      `Use the locked v1.0 authentication mode "${AUTHENTICATION_MODE_OIDC_JWT}".`,
    ),
  );
}

function readOptionalAuthorization(
  authObject: globalThis.Record<string, unknown>,
  configPath: string,
): RuntimeAuthorizationConfig | undefined {
  if (authObject.authorization === undefined) {
    return undefined;
  }

  const authz = readObject(
    authObject.authorization,
    'config.authentication.authorization',
    configPath,
  );

  const schema = readRoleGate(
    authz.schema,
    'config.authentication.authorization.schema',
    configPath,
  );

  const crud = readObject(
    authz.crud,
    'config.authentication.authorization.crud',
    configPath,
  );

  const crudDefault = readObject(
    crud.default,
    'config.authentication.authorization.crud.default',
    configPath,
  );

  const defaultRoles: CrudOperationRoles = {
    create: readRoleGate(
      crudDefault.create,
      'config.authentication.authorization.crud.default.create',
      configPath,
    ),
    read: readRoleGate(
      crudDefault.read,
      'config.authentication.authorization.crud.default.read',
      configPath,
    ),
    update: readRoleGate(
      crudDefault.update,
      'config.authentication.authorization.crud.default.update',
      configPath,
    ),
    delete: readRoleGate(
      crudDefault.delete,
      'config.authentication.authorization.crud.default.delete',
      configPath,
    ),
  };

  const tablesObject = readObject(
    crud.tables,
    'config.authentication.authorization.crud.tables',
    configPath,
  );

  const tables: { [tableName: string]: TableCrudOverride } = {};

  for (const [tableName, tableValue] of Object.entries(tablesObject)) {
    const tableOverride = readObject(
      tableValue,
      `config.authentication.authorization.crud.tables.${tableName}`,
      configPath,
    );

    const override: TableCrudOverride = {};

    if (tableOverride.create !== undefined) {
      override.create = readRoleGate(
        tableOverride.create,
        `config.authentication.authorization.crud.tables.${tableName}.create`,
        configPath,
      );
    }

    if (tableOverride.read !== undefined) {
      override.read = readRoleGate(
        tableOverride.read,
        `config.authentication.authorization.crud.tables.${tableName}.read`,
        configPath,
      );
    }

    if (tableOverride.update !== undefined) {
      override.update = readRoleGate(
        tableOverride.update,
        `config.authentication.authorization.crud.tables.${tableName}.update`,
        configPath,
      );
    }

    if (tableOverride.delete !== undefined) {
      override.delete = readRoleGate(
        tableOverride.delete,
        `config.authentication.authorization.crud.tables.${tableName}.delete`,
        configPath,
      );
    }

    tables[tableName] = override;
  }

  return {
    schema,
    crud: {
      default: defaultRoles,
      tables,
    },
  };
}

/**
 * Reads a role gate value which can be either a plain string array (shorthand
 * for allow-only with no deny rules) or an object with explicit `allow` and
 * `deny` arrays.
 */
function readRoleGate(
  value: unknown,
  path: string,
  configPath: string,
): RoleGate {
  if (Array.isArray(value)) {
    return {
      allow: readStringArray(value, path, configPath),
      deny: [],
    };
  }

  if (isPlainObject(value)) {
    const gate = value as globalThis.Record<string, unknown>;

    return {
      allow: readStringArray(gate.allow, `${path}.allow`, configPath),
      deny:
        gate.deny !== undefined
          ? readStringArray(gate.deny, `${path}.deny`, configPath)
          : [],
    };
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must be a string array or an object with "allow" and optional "deny" arrays.`,
      `Provide either a JSON string array like ["admin"] or an object like {"allow": ["admin"], "deny": ["intern"]} at ${path} in "${configPath}".`,
    ),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the optional `primaryKeys` config section.
 *
 * Expected shape:
 * ```json
 * {
 *   "orderItem": [
 *     { "column": "orderId", "dataType": "integer" },
 *     { "column": "lineNumber", "dataType": "integer" }
 *   ]
 * }
 * ```
 *
 * Each entry may include an optional `isGenerated` boolean (defaults to
 * `false`) indicating that the column value is auto-assigned by the database.
 */
function readOptionalPrimaryKeys(
  root: globalThis.Record<string, unknown>,
  configPath: string,
): { [tableName: string]: PrimaryKeyColumn[] } | undefined {
  if (root.primaryKeys === undefined) {
    return undefined;
  }

  const section = readObject(
    root.primaryKeys,
    'config.primaryKeys',
    configPath,
  );
  const result: { [tableName: string]: PrimaryKeyColumn[] } = {};

  for (const [tableName, tableValue] of Object.entries(section)) {
    if (!Array.isArray(tableValue) || tableValue.length === 0) {
      throw new Error(
        formatDeveloperError(
          `Invalid runtime config: config.primaryKeys.${tableName} must be a non-empty array of primary key column definitions.`,
          `Provide at least one { "column": "...", "dataType": "..." } entry for "${tableName}" in "${configPath}".`,
        ),
      );
    }

    result[tableName] = tableValue.map((entry, index) => {
      if (!isPlainObject(entry)) {
        throw new Error(
          formatDeveloperError(
            `Invalid runtime config: config.primaryKeys.${tableName}[${index}] must be an object.`,
            `Each primary key column entry should be a JSON object with "column" and "dataType" fields in "${configPath}".`,
          ),
        );
      }

      const column =
        typeof entry.column === 'string' ? entry.column.trim() : '';
      const dataType =
        typeof entry.dataType === 'string' ? entry.dataType.trim() : '';

      if (!column) {
        throw new Error(
          formatDeveloperError(
            `Invalid runtime config: config.primaryKeys.${tableName}[${index}].column must be a non-empty string.`,
            `Provide a column name for the primary key entry in "${configPath}".`,
          ),
        );
      }

      if (!dataType) {
        throw new Error(
          formatDeveloperError(
            `Invalid runtime config: config.primaryKeys.${tableName}[${index}].dataType must be a non-empty string.`,
            `Provide a data type (e.g. "integer", "uuid", "varchar") for the primary key entry in "${configPath}".`,
          ),
        );
      }

      return { column, dataType, isGenerated: entry.isGenerated === true };
    });
  }

  return result;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
  } else if (isPlainObject(value)) {
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
  }

  return Object.freeze(value);
}
