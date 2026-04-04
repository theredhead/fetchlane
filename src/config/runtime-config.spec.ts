import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRuntimeConfig, resetRuntimeConfigForTests } from './runtime-config';

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
            createTable: ['admin'],
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
    expect(result.authentication.authorization!.createTable).toEqual({
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
            createTable: ['admin'],
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
            createTable: [],
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
            createTable: [],
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
            createTable: { allow: ['admin'], deny: [] },
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
    expect(result.authentication.authorization!.createTable).toEqual({
      allow: ['admin'],
      deny: [],
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
});
