import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getRuntimeConfig,
  resetRuntimeConfigForTests,
  RuntimeConfigService,
} from './runtime-config';

function createConfigFile(contents: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fetchlane-config-'));
  const path = join(dir, 'fetchlane.json');
  writeFileSync(path, contents, 'utf8');
  return { dir, path };
}

function buildConfig(databaseUrl: string): string {
  return JSON.stringify({
    server: {
      host: '0.0.0.0',
      port: 3000,
      cors: {
        enabled: true,
        origins: ['*'],
      },
    },
    database: {
      url: databaseUrl,
    },
    limits: {
      requestBodyBytes: 1048576,
      fetchMaxPageSize: 1000,
      fetchMaxPredicates: 25,
      fetchMaxSortFields: 8,
      rateLimitWindowMs: 60000,
      rateLimitMax: 120,
    },
    authentication: {
      enabled: false,
      mode: 'oidc-jwt',
      issuerUrl: '',
      audience: '',
      jwksUrl: '',
      claimMappings: {
        subject: 'sub',
        roles: 'realm_access.roles',
      },
    },
  });
}

function buildAuthenticatedConfig(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    server: {
      host: '0.0.0.0',
      port: 3000,
      cors: { enabled: true, origins: ['*'] },
    },
    database: {
      url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
    },
    limits: {
      requestBodyBytes: 1048576,
      fetchMaxPageSize: 1000,
      fetchMaxPredicates: 25,
      fetchMaxSortFields: 8,
      rateLimitWindowMs: 60000,
      rateLimitMax: 120,
    },
    authentication: {
      enabled: true,
      mode: 'oidc-jwt',
      issuerUrl: 'https://issuer.example.com',
      audience: 'fetchlane-api',
      jwksUrl: '',
      claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
      authorization: {
        schema: ['admin'],
        crud: {
          default: {
            create: ['admin'],
            read: ['admin'],
            update: ['admin'],
            delete: ['admin'],
          },
          tables: {},
        },
      },
    },
    ...overrides,
  });
}

describe('runtime-config', () => {
  const originalFetchlaneConfig = process.env.FETCHLANE_CONFIG;
  const originalDatabaseUrl = process.env.FETCHLANE_DATABASE_URL;
  const createdDirs: string[] = [];

  afterEach(() => {
    resetRuntimeConfigForTests();

    if (originalFetchlaneConfig == null) {
      delete process.env.FETCHLANE_CONFIG;
    } else {
      process.env.FETCHLANE_CONFIG = originalFetchlaneConfig;
    }

    if (originalDatabaseUrl == null) {
      delete process.env.FETCHLANE_DATABASE_URL;
    } else {
      process.env.FETCHLANE_DATABASE_URL = originalDatabaseUrl;
    }

    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads valid JSON config and resolves environment placeholders', () => {
    process.env.FETCHLANE_DATABASE_URL =
      'postgres://postgres:password@127.0.0.1:5432/northwind';
    const configFile = createConfigFile(
      buildConfig('${FETCHLANE_DATABASE_URL}'),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.database.url).toBe(
      'postgres://postgres:password@127.0.0.1:5432/northwind',
    );
    expect(result.server.host).toBe('0.0.0.0');
    expect(result.server.port).toBe(3000);
    expect(result.limits.fetchMaxPageSize).toBe(1000);
    expect(result.authentication.mode).toBe('oidc-jwt');
  });

  it('fails when FETCHLANE_CONFIG is missing', () => {
    delete process.env.FETCHLANE_CONFIG;

    expect(() => getRuntimeConfig()).toThrow(/Missing FETCHLANE_CONFIG/);
    expect(() => getRuntimeConfig()).toThrow(/mounted JSON config path/);
  });

  it('fails when the configured file does not exist', () => {
    process.env.FETCHLANE_CONFIG = '/tmp/does-not-exist-fetchlane.json';

    expect(() => getRuntimeConfig()).toThrow(/Runtime config file not found/);
    expect(() => getRuntimeConfig()).toThrow(/Mount the JSON config file/);
  });

  it('fails when the config file contains invalid JSON', () => {
    const configFile = createConfigFile('{ invalid json');
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/does not contain valid JSON/);
    expect(() => getRuntimeConfig()).toThrow(/Fix the JSON syntax/);
  });

  it('fails when a placeholder is not a full-string reference', () => {
    const configFile = createConfigFile(
      buildConfig('postgres://${FETCHLANE_DATABASE_URL}'),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;
    process.env.FETCHLANE_DATABASE_URL =
      'postgres://postgres:password@127.0.0.1:5432/northwind';

    expect(() => getRuntimeConfig()).toThrow(/Invalid environment placeholder/);
    expect(() => getRuntimeConfig()).toThrow(/full-string placeholders/);
  });

  it('fails when a referenced environment variable is missing', () => {
    delete process.env.FETCHLANE_DATABASE_URL;
    const configFile = createConfigFile(
      buildConfig('${FETCHLANE_DATABASE_URL}'),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /Missing environment variable "FETCHLANE_DATABASE_URL"/,
    );
    expect(() => getRuntimeConfig()).toThrow(/Set FETCHLANE_DATABASE_URL/);
  });

  it('fails when required config fields are missing or invalid', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 0,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {},
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: {
            subject: 'sub',
            roles: 'realm_access.roles',
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/config.server.port/);
    expect(() => getRuntimeConfig()).toThrow(/positive integer/);
  });

  it('fails when authentication is enabled without authorization', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: true,
          mode: 'oidc-jwt',
          issuerUrl: 'https://issuer.example.com',
          audience: 'fetchlane-api',
          jwksUrl: '',
          claimMappings: {
            subject: 'sub',
            roles: 'realm_access.roles',
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /config.authentication.authorization/,
    );
    expect(() => getRuntimeConfig()).toThrow(
      /required when authentication is enabled/,
    );
  });

  it('loads valid config when authentication is enabled with authorization', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: true,
          mode: 'oidc-jwt',
          issuerUrl: 'https://issuer.example.com',
          audience: 'fetchlane-api',
          jwksUrl: '',
          claimMappings: {
            subject: 'sub',
            roles: 'realm_access.roles',
          },
          authorization: {
            schema: ['admin'],
            crud: {
              default: {
                create: ['admin'],
                read: ['admin'],
                update: ['admin'],
                delete: ['admin'],
              },
              tables: {},
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.authentication.authorization).toBeDefined();
    expect(result.authentication.authorization!.schema).toEqual({
      allow: ['admin'],
      deny: [],
    });
    expect(result.authentication.authorization!.crud.default.read).toEqual({
      allow: ['admin'],
      deny: [],
    });
  });

  it('loads authorization config with table overrides', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: true,
          mode: 'oidc-jwt',
          issuerUrl: 'https://issuer.example.com',
          audience: 'fetchlane-api',
          jwksUrl: '',
          claimMappings: {
            subject: 'sub',
            roles: 'realm_access.roles',
          },
          authorization: {
            schema: ['admin', 'viewer'],
            crud: {
              default: {
                create: ['editor'],
                read: ['viewer'],
                update: ['editor'],
                delete: ['admin'],
              },
              tables: {
                audit_log: {
                  read: ['auditor'],
                  create: [],
                },
                public_data: {
                  read: ['*'],
                },
              },
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.authentication.authorization!.crud.tables.audit_log).toEqual({
      read: { allow: ['auditor'], deny: [] },
      create: { allow: [], deny: [] },
    });
    expect(
      result.authentication.authorization!.crud.tables.public_data,
    ).toEqual({
      read: { allow: ['*'], deny: [] },
    });
  });

  it('omits authorization when the section is absent from config', () => {
    const configFile = createConfigFile(
      buildConfig('postgres://postgres:password@127.0.0.1:5432/northwind'),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.authentication.authorization).toBeUndefined();
  });

  it('fails when authorization.schema is not an array or role gate object', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: {
            subject: 'sub',
            roles: 'realm_access.roles',
          },
          authorization: {
            schema: 'not-an-array',
            crud: {
              default: {
                create: [],
                read: [],
                update: [],
                delete: [],
              },
              tables: {},
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /config.authentication.authorization.schema/,
    );
    expect(() => getRuntimeConfig()).toThrow(
      /string array or an object with "allow"/,
    );
  });

  it('fails when authorization.crud.default is missing a required operation', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: {
            subject: 'sub',
            roles: 'realm_access.roles',
          },
          authorization: {
            schema: [],
            crud: {
              default: {
                create: [],
                read: [],
              },
              tables: {},
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /config.authentication.authorization.crud.default.update/,
    );
  });

  it('parses explicit role gate objects with allow and deny arrays', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: true,
          mode: 'oidc-jwt',
          issuerUrl: 'https://issuer.example.com',
          audience: 'fetchlane-api',
          jwksUrl: '',
          claimMappings: {
            subject: 'sub',
            roles: 'realm_access.roles',
          },
          authorization: {
            schema: { allow: ['admin'], deny: ['blocked'] },
            crud: {
              default: {
                create: ['editor'],
                read: { allow: ['*'], deny: ['banned'] },
                update: ['editor'],
                delete: ['admin'],
              },
              tables: {
                sensitive: {
                  read: { allow: ['admin'], deny: ['intern'] },
                },
              },
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.authentication.authorization!.schema).toEqual({
      allow: ['admin'],
      deny: ['blocked'],
    });
    expect(result.authentication.authorization!.crud.default.read).toEqual({
      allow: ['*'],
      deny: ['banned'],
    });
    expect(result.authentication.authorization!.crud.default.create).toEqual({
      allow: ['editor'],
      deny: [],
    });
    expect(result.authentication.authorization!.crud.tables.sensitive).toEqual({
      read: { allow: ['admin'], deny: ['intern'] },
    });
  });

  it('loads primaryKeys config with simple primary key definitions', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
        primaryKeys: {
          member: [{ column: 'id', dataType: 'integer', isGenerated: true }],
          orderItem: [
            { column: 'orderId', dataType: 'integer' },
            { column: 'productCode', dataType: 'varchar' },
          ],
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.primaryKeys).toBeDefined();
    expect(result.primaryKeys!.member).toEqual([
      { column: 'id', dataType: 'integer', isGenerated: true },
    ]);
    expect(result.primaryKeys!.orderItem).toEqual([
      { column: 'orderId', dataType: 'integer', isGenerated: false },
      { column: 'productCode', dataType: 'varchar', isGenerated: false },
    ]);
  });

  it('omits primaryKeys when the section is absent', () => {
    const configFile = createConfigFile(
      buildConfig('postgres://postgres:password@127.0.0.1:5432/northwind'),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.primaryKeys).toBeUndefined();
  });

  it('fails when primaryKeys entry is an empty array', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
        primaryKeys: {
          member: [],
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/config.primaryKeys.member/);
  });

  it('fails when a primaryKeys entry is missing the column name', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
        primaryKeys: {
          member: [{ column: '', dataType: 'integer' }],
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /column must be a non-empty string/,
    );
  });

  it('fails when a primaryKeys entry is missing the data type', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
        primaryKeys: {
          member: [{ column: 'id', dataType: '' }],
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /dataType must be a non-empty string/,
    );
  });

  it('fails when a primaryKeys entry is not an object', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
        primaryKeys: {
          member: ['not-an-object'],
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/must be an object/);
  });

  it('warns about unknown keys in config sections', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
        unknownRootKey: 'should-trigger-warning',
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.server.host).toBe('0.0.0.0');
  });

  it('reads enableSchemaFeatures from the config', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
        enableSchemaFeatures: false,
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.enableSchemaFeatures).toBe(false);
  });

  it('defaults statusRateLimitMax to five times rateLimitMax when omitted', () => {
    const configFile = createConfigFile(
      buildConfig('postgres://postgres:password@127.0.0.1:5432/northwind'),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.limits.statusRateLimitMax).toBe(600);
  });

  it('reads explicit statusRateLimitMax when provided', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
          statusRateLimitMax: 200,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(result.limits.statusRateLimitMax).toBe(200);
  });

  it('fails when CORS is enabled but origins array is empty', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: [] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/origins must not be empty/);
  });

  it('fails when authentication is enabled without an audience', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: true,
          mode: 'oidc-jwt',
          issuerUrl: 'https://issuer.example.com',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
          authorization: {
            schema: ['admin'],
            crud: {
              default: {
                create: ['admin'],
                read: ['admin'],
                update: ['admin'],
                delete: ['admin'],
              },
              tables: {},
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/audience is required/);
  });

  it('fails when authentication is enabled without issuer or JWKS URL', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: true,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: 'fetchlane-api',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
          authorization: {
            schema: ['admin'],
            crud: {
              default: {
                create: ['admin'],
                read: ['admin'],
                update: ['admin'],
                delete: ['admin'],
              },
              tables: {},
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /requires either config.authentication.issuerUrl or config.authentication.jwksUrl/,
    );
  });

  it('fails when a config section is not a JSON object', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: 'not-an-object',
        database: { url: 'postgres://u:p@h:5432/d' },
        limits: {},
        authentication: {},
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/must be a JSON object/);
  });

  it('fails when a string field receives a non-string value', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: { url: 12345 },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/must be a string/);
  });

  it('fails when a boolean field receives a non-boolean value', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: 'yes', origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/must be a boolean/);
  });

  it('fails when a string array field contains non-strings', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: [123] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /must be an array of non-empty strings/,
    );
  });

  it('fails when authentication mode is not oidc-jwt', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'basic',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/must be "oidc-jwt"/);
  });

  it('fails when a role gate is neither an array nor an object', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
          authorization: {
            schema: 42,
            crud: {
              default: {
                create: [],
                read: [],
                update: [],
                delete: [],
              },
              tables: {},
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(
      /must be a string array or an object/,
    );
  });

  it('parses table overrides with update and delete operations', () => {
    const configFile = createConfigFile(
      buildAuthenticatedConfig({
        authentication: {
          enabled: true,
          mode: 'oidc-jwt',
          issuerUrl: 'https://issuer.example.com',
          audience: 'fetchlane-api',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
          authorization: {
            schema: ['admin'],
            crud: {
              default: {
                create: ['admin'],
                read: ['admin'],
                update: ['admin'],
                delete: ['admin'],
              },
              tables: {
                protected_table: {
                  read: ['viewer'],
                  update: ['editor'],
                  delete: { allow: ['admin'], deny: ['intern'] },
                },
              },
            },
          },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const result = getRuntimeConfig();

    expect(
      result.authentication.authorization!.crud.tables.protected_table,
    ).toEqual({
      read: { allow: ['viewer'], deny: [] },
      update: { allow: ['editor'], deny: [] },
      delete: { allow: ['admin'], deny: ['intern'] },
    });
  });

  it('fails when the config file cannot be read due to permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fetchlane-config-'));
    const path = join(dir, 'fetchlane.json');
    writeFileSync(path, buildConfig('postgres://u:p@h:5432/d'), 'utf8');
    chmodSync(path, 0o000);
    createdDirs.push(dir);
    process.env.FETCHLANE_CONFIG = path;

    try {
      expect(() => getRuntimeConfig()).toThrow(/could not be read/);
    } finally {
      chmodSync(path, 0o644);
    }
  });

  it('fails when a non-empty string field is empty', () => {
    const configFile = createConfigFile(
      JSON.stringify({
        server: {
          host: '',
          port: 3000,
          cors: { enabled: true, origins: ['*'] },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: { subject: 'sub', roles: 'realm_access.roles' },
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    expect(() => getRuntimeConfig()).toThrow(/must not be empty/);
  });
});

describe('RuntimeConfigService', () => {
  const originalFetchlaneConfig = process.env.FETCHLANE_CONFIG;
  const createdDirs: string[] = [];

  afterEach(() => {
    resetRuntimeConfigForTests();

    if (originalFetchlaneConfig == null) {
      delete process.env.FETCHLANE_CONFIG;
    } else {
      process.env.FETCHLANE_CONFIG = originalFetchlaneConfig;
    }

    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createService(): RuntimeConfigService {
    const configFile = createConfigFile(
      buildAuthenticatedConfig({
        enableSchemaFeatures: true,
        primaryKeys: {
          member: [{ column: 'id', dataType: 'integer', isGenerated: true }],
        },
      }),
    );
    createdDirs.push(configFile.dir);
    process.env.FETCHLANE_CONFIG = configFile.path;

    const config = getRuntimeConfig();
    return new RuntimeConfigService(config);
  }

  it('getConfig returns the full runtime config', () => {
    const service = createService();
    const config = service.getConfig();

    expect(config.server.host).toBe('0.0.0.0');
    expect(config.database.url).toBe(
      'postgres://postgres:password@127.0.0.1:5432/northwind',
    );
  });

  it('getServer returns server settings', () => {
    const service = createService();

    expect(service.getServer()).toEqual({
      host: '0.0.0.0',
      port: 3000,
      cors: { enabled: true, origins: ['*'] },
    });
  });

  it('getDatabase returns database settings', () => {
    const service = createService();

    expect(service.getDatabase()).toEqual({
      url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
    });
  });

  it('isSchemaFeaturesEnabled returns the configured value', () => {
    const service = createService();

    expect(service.isSchemaFeaturesEnabled()).toBe(true);
  });

  it('getAuthorization returns the authorization config', () => {
    const service = createService();
    const authorization = service.getAuthorization();

    expect(authorization).toBeDefined();
    expect(authorization!.schema).toEqual({ allow: ['admin'], deny: [] });
  });

  it('getPrimaryKeyOverride returns the override for a configured table', () => {
    const service = createService();

    expect(service.getPrimaryKeyOverride('member')).toEqual([
      { column: 'id', dataType: 'integer', isGenerated: true },
    ]);
  });

  it('getPrimaryKeyOverride returns undefined for an unconfigured table', () => {
    const service = createService();

    expect(service.getPrimaryKeyOverride('unknown')).toBeUndefined();
  });

  it('getAuthentication returns authentication settings', () => {
    const service = createService();
    const authentication = service.getAuthentication();

    expect(authentication.enabled).toBe(true);
    expect(authentication.mode).toBe('oidc-jwt');
  });

  it('getLimits returns limits settings', () => {
    const service = createService();

    expect(service.getLimits().rateLimitMax).toBe(120);
  });

  it('getStatusSnapshot returns the safe config subset', () => {
    const service = createService();
    const snapshot = service.getStatusSnapshot();

    expect(snapshot.server.host).toBe('0.0.0.0');
    expect(snapshot.server.port).toBe(3000);
    expect(snapshot.server.corsEnabled).toBe(true);
    expect(snapshot.authentication.enabled).toBe(true);
    expect(snapshot.limits.rateLimitMax).toBe(120);
  });

  it('getParsedDatabaseUrl returns parsed connection details', () => {
    const service = createService();
    const parsed = service.getParsedDatabaseUrl();

    expect(parsed.engine).toBe('postgres');
    expect(parsed.host).toBe('127.0.0.1');
  });
});
