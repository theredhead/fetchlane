import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getRuntimeConfig,
  resetRuntimeConfigForTests,
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
      request_body_bytes: 1048576,
      fetch_max_page_size: 1000,
      fetch_max_predicates: 25,
      fetch_max_sort_fields: 8,
      rate_limit_window_ms: 60000,
      rate_limit_max: 120,
    },
    auth: {
      enabled: false,
      mode: 'oidc-jwt',
      issuer_url: '',
      audience: '',
      jwks_url: '',
      claim_mappings: {
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
    expect(result.limits.fetch_max_page_size).toBe(1000);
    expect(result.auth.mode).toBe('oidc-jwt');
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
          request_body_bytes: 1048576,
          fetch_max_page_size: 1000,
          fetch_max_predicates: 25,
          fetch_max_sort_fields: 8,
          rate_limit_window_ms: 60000,
          rate_limit_max: 120,
        },
        auth: {
          enabled: false,
          mode: 'oidc-jwt',
          issuer_url: '',
          audience: '',
          jwks_url: '',
          claim_mappings: {
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
});
