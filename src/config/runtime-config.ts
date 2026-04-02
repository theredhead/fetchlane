import { Inject, Injectable, Provider } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { parseDatabaseUrl, ParsedDatabaseUrl } from '../db.conf';
import { formatDeveloperError } from '../errors/api-error';

/** Supported server CORS configuration. */
export interface RuntimeCorsConfig {
  /** Enables or disables CORS for the HTTP server. */
  enabled: boolean;
  /** Allowed origins for CORS requests. */
  origins: string[];
}

/** Server settings loaded from the runtime config file. */
export interface RuntimeServerConfig {
  /** Interface address for the HTTP listener. */
  host: string;
  /** TCP port for the HTTP listener. */
  port: number;
  /** CORS settings for the HTTP server. */
  cors: RuntimeCorsConfig;
}

/** Database settings loaded from the runtime config file. */
export interface RuntimeDatabaseConfig {
  /** Connection URL used to reach the active database engine. */
  url: string;
}

/** Operational limits loaded from the runtime config file. */
export interface RuntimeLimitsConfig {
  /** Maximum accepted HTTP request body size in bytes. */
  request_body_bytes: number;
  /** Maximum allowed FetchRequest page size. */
  fetch_max_page_size: number;
  /** Maximum number of predicates in a FetchRequest. */
  fetch_max_predicates: number;
  /** Maximum number of sort fields in a FetchRequest. */
  fetch_max_sort_fields: number;
  /** Rate-limit window length in milliseconds. */
  rate_limit_window_ms: number;
  /** Maximum requests allowed per rate-limit window. */
  rate_limit_max: number;
}

/** Claim mapping settings for authenticated principals. */
export interface RuntimeAuthClaimMappingsConfig {
  /** Claim path used as the authenticated subject identifier. */
  subject: string;
  /** Claim path used as the authenticated roles collection. */
  roles: string;
}

/** Authentication settings loaded from the runtime config file. */
export interface RuntimeAuthConfig {
  /** Enables or disables authentication. */
  enabled: boolean;
  /** Authentication mode for the service. */
  mode: 'oidc-jwt';
  /** OIDC issuer URL used for discovery and issuer validation. */
  issuer_url: string;
  /** JWT audience expected by the service. */
  audience: string;
  /** Optional JWKS URL override. */
  jwks_url: string;
  /** Roles that grant full authenticated access to protected routes. */
  allowed_roles: string[];
  /** Claim mappings used when auth is enabled. */
  claim_mappings: RuntimeAuthClaimMappingsConfig;
}

/** Fully validated runtime configuration for Fetchlane. */
export interface RuntimeConfig {
  /** Server settings. */
  server: RuntimeServerConfig;
  /** Database connection settings. */
  database: RuntimeDatabaseConfig;
  /** Operational limits. */
  limits: RuntimeLimitsConfig;
  /** Authentication settings. */
  auth: RuntimeAuthConfig;
}

/** Public subset of runtime config exposed by the status endpoint. */
export interface StatusRuntimeConfigSnapshot {
  /** Safe server settings. */
  server: {
    host: string;
    port: number;
    cors_enabled: boolean;
  };
  /** Safe auth summary. */
  auth: {
    enabled: boolean;
    allowed_roles: string[];
  };
  /** Effective operational limits. */
  limits: RuntimeLimitsConfig;
}

/** Injection token for the validated runtime config object. */
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
  const interpolated = interpolateEnvironmentPlaceholders(parsedJson, configPath);
  cachedRuntimeConfig = deepFreeze(validateRuntimeConfig(interpolated, configPath));
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
  public constructor(@Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig) {}

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
  public getAuth(): RuntimeAuthConfig {
    return this.config.auth;
  }

  /**
   * Returns the safe runtime config subset exposed through status.
   */
  public getStatusSnapshot(): StatusRuntimeConfigSnapshot {
    return {
      server: {
        host: this.config.server.host,
        port: this.config.server.port,
        cors_enabled: this.config.server.cors.enabled,
      },
      auth: {
        enabled: this.config.auth.enabled,
        allowed_roles: this.config.auth.allowed_roles,
      },
      limits: this.config.limits,
    };
  }
}

/** Nest providers exposing the validated runtime config and service wrapper. */
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
      interpolateEnvironmentPlaceholders(entry, configPath, `${path}[${index}]`),
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

function validateRuntimeConfig(value: unknown, configPath: string): RuntimeConfig {
  const root = readObject(value, 'config', configPath);
  const server = readObject(root.server, 'config.server', configPath);
  const serverCors = readObject(server.cors, 'config.server.cors', configPath);
  const database = readObject(root.database, 'config.database', configPath);
  const limits = readObject(root.limits, 'config.limits', configPath);
  const auth = readObject(root.auth, 'config.auth', configPath);
  const claimMappings = readObject(
    auth.claim_mappings,
    'config.auth.claim_mappings',
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
      request_body_bytes: readPositiveInteger(
        limits.request_body_bytes,
        'config.limits.request_body_bytes',
        configPath,
      ),
      fetch_max_page_size: readPositiveInteger(
        limits.fetch_max_page_size,
        'config.limits.fetch_max_page_size',
        configPath,
      ),
      fetch_max_predicates: readPositiveInteger(
        limits.fetch_max_predicates,
        'config.limits.fetch_max_predicates',
        configPath,
      ),
      fetch_max_sort_fields: readPositiveInteger(
        limits.fetch_max_sort_fields,
        'config.limits.fetch_max_sort_fields',
        configPath,
      ),
      rate_limit_window_ms: readPositiveInteger(
        limits.rate_limit_window_ms,
        'config.limits.rate_limit_window_ms',
        configPath,
      ),
      rate_limit_max: readPositiveInteger(
        limits.rate_limit_max,
        'config.limits.rate_limit_max',
        configPath,
      ),
    },
    auth: {
      enabled: readBoolean(auth.enabled, 'config.auth.enabled', configPath),
      mode: readAuthMode(auth.mode, 'config.auth.mode', configPath),
      issuer_url: readString(auth.issuer_url, 'config.auth.issuer_url', configPath),
      audience: readString(auth.audience, 'config.auth.audience', configPath),
      jwks_url: readString(auth.jwks_url, 'config.auth.jwks_url', configPath),
      allowed_roles: readStringArray(
        auth.allowed_roles,
        'config.auth.allowed_roles',
        configPath,
      ),
      claim_mappings: {
        subject: readNonEmptyString(
          claimMappings.subject,
          'config.auth.claim_mappings.subject',
          configPath,
        ),
        roles: readNonEmptyString(
          claimMappings.roles,
          'config.auth.claim_mappings.roles',
          configPath,
        ),
      },
    },
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

  if (config.auth.enabled && !config.auth.audience.trim()) {
    throw new Error(
      formatDeveloperError(
        'Invalid runtime config: config.auth.audience is required when auth is enabled.',
        'Set config.auth.audience to the JWT audience expected by Fetchlane.',
      ),
    );
  }

  if (
    config.auth.enabled &&
    !config.auth.issuer_url.trim() &&
    !config.auth.jwks_url.trim()
  ) {
    throw new Error(
      formatDeveloperError(
        'Invalid runtime config: auth requires either config.auth.issuer_url or config.auth.jwks_url.',
        'Set an issuer URL for OIDC discovery, or provide a direct JWKS URL override.',
      ),
    );
  }

  if (config.auth.enabled && config.auth.allowed_roles.length === 0) {
    throw new Error(
      formatDeveloperError(
        'Invalid runtime config: config.auth.allowed_roles must contain at least one role when auth is enabled.',
        'Add one or more role names that should have full access to protected Fetchlane routes.',
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

function readBoolean(value: unknown, path: string, configPath: string): boolean {
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

function readAuthMode(
  value: unknown,
  path: string,
  configPath: string,
): 'oidc-jwt' {
  const mode = readNonEmptyString(value, path, configPath);
  if (mode === 'oidc-jwt') {
    return mode;
  }

  throw new Error(
    formatDeveloperError(
      `Invalid runtime config: ${path} must be "oidc-jwt".`,
      'Use the locked v1.0 auth mode "oidc-jwt".',
    ),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
