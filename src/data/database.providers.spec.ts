import {
  ACTIVE_DATABASE_ADAPTER,
  DATABASE_ADAPTERS,
  DATABASE_CONNECTION,
  databaseProviders,
} from './database.providers';
import { RuntimeConfigService } from '../config/runtime-config';
import { DatabaseAdapterConstructor } from './database';

describe('databaseProviders', () => {
  const adaptersProvider = databaseProviders.find(
    (provider: any) => provider.provide === DATABASE_ADAPTERS,
  ) as any;
  const activeAdapterProvider = databaseProviders.find(
    (provider: any) => provider.provide === ACTIVE_DATABASE_ADAPTER,
  ) as any;
  const connectionProvider = databaseProviders.find(
    (provider: any) => provider.provide === DATABASE_CONNECTION,
  ) as any;
  const createRuntimeConfigService = (
    databaseUrl: string,
  ): RuntimeConfigService =>
    new RuntimeConfigService({
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
        authorization: undefined as any,
      },
      enableSchemaFeatures: false,
    });

  it('builds a registry with the supported database adapters', () => {
    const registry = adaptersProvider.useFactory();

    expect(registry.get('postgres')?.adapterName).toBe('postgres');
    expect(registry.get('postgresql')?.adapterName).toBe('postgres');
    expect(registry.get('mysql')?.adapterName).toBe('mysql');
    expect(registry.get('sqlserver')?.adapterName).toBe('sqlserver');
    expect(registry.get('mssql')?.adapterName).toBe('sqlserver');
  });

  it('selects the active adapter from runtime config', () => {
    const registry = adaptersProvider.useFactory();
    const runtimeConfig = createRuntimeConfigService(
      'postgres://user:password@localhost:5432/example',
    );

    const Adapter = activeAdapterProvider.useFactory(registry, runtimeConfig);

    expect(Adapter.adapterName).toBe('postgres');
  });

  it('throws a helpful error for unsupported engines', () => {
    const registry = new Map<string, DatabaseAdapterConstructor>([
      [
        'postgres',
        {
          adapterName: 'postgres',
          engines: ['postgres'],
        } as unknown as DatabaseAdapterConstructor,
      ],
      [
        'mysql',
        {
          adapterName: 'mysql',
          engines: ['mysql'],
        } as unknown as DatabaseAdapterConstructor,
      ],
    ]);
    const runtimeConfig = createRuntimeConfigService(
      'sqlite://user:password@localhost/example',
    );

    expect(() =>
      activeAdapterProvider.useFactory(registry, runtimeConfig),
    ).toThrow(
      'Unsupported database engine "sqlite". Supported engines: mysql, postgres',
    );
  });

  it('creates the active database adapter from runtime config', async () => {
    class FakeAdapter {
      public static readonly adapterName = 'mysql';
      public static readonly engines = ['mysql'];

      public readonly config: unknown;

      public constructor(config: unknown) {
        this.config = config;
      }
    }
    const runtimeConfig = createRuntimeConfigService(
      'mysql://user:password@db.internal:3307/example',
    );

    const result = await connectionProvider.useFactory(
      FakeAdapter as unknown as DatabaseAdapterConstructor,
      runtimeConfig,
    );

    expect(result).toBeInstanceOf(FakeAdapter);
    expect((result as FakeAdapter).config).toEqual({
      engine: 'mysql',
      user: 'user',
      password: 'password',
      host: 'db.internal',
      port: 3307,
      database: 'example',
    });
  });
});
