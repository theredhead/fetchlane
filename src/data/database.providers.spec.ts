import {
  ACTIVE_DATABASE_ADAPTER,
  DATABASE_ADAPTERS,
  DATABASE_CONNECTION,
  databaseProviders,
} from './database.providers';
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

  const originalDbUrl = process.env.DB_URL;

  afterEach(() => {
    if (originalDbUrl == null) {
      delete process.env.DB_URL;
      return;
    }

    process.env.DB_URL = originalDbUrl;
  });

  it('builds a registry with the supported database adapters', () => {
    const registry = adaptersProvider.useFactory();

    expect(registry.get('postgres')?.adapterName).toBe('postgres');
    expect(registry.get('postgresql')?.adapterName).toBe('postgres');
    expect(registry.get('mysql')?.adapterName).toBe('mysql');
    expect(registry.get('sqlserver')?.adapterName).toBe('sqlserver');
    expect(registry.get('mssql')?.adapterName).toBe('sqlserver');
  });

  it('selects the active adapter from DB_URL', () => {
    process.env.DB_URL = 'postgres://user:password@localhost:5432/example';
    const registry = adaptersProvider.useFactory();

    const Adapter = activeAdapterProvider.useFactory(registry);

    expect(Adapter.adapterName).toBe('postgres');
  });

  it('throws a helpful error for unsupported engines', () => {
    process.env.DB_URL = 'sqlite://user:password@localhost/example';
    const registry = new Map<string, DatabaseAdapterConstructor>([
      [
        'postgres',
        {
          adapterName: 'postgres',
          engines: ['postgres'],
        } as DatabaseAdapterConstructor,
      ],
      [
        'mysql',
        {
          adapterName: 'mysql',
          engines: ['mysql'],
        } as DatabaseAdapterConstructor,
      ],
    ]);

    expect(() => activeAdapterProvider.useFactory(registry)).toThrow(
      'Unsupported database engine "sqlite". Supported engines: mysql, postgres',
    );
  });

  it('creates the active database adapter from DB_URL', async () => {
    process.env.DB_URL = 'mysql://user:password@db.internal:3307/example';

    class FakeAdapter {
      public static readonly adapterName = 'mysql';
      public static readonly engines = ['mysql'];

      public readonly config: unknown;

      public constructor(config: unknown) {
        this.config = config;
      }
    }

    const result = await connectionProvider.useFactory(
      FakeAdapter as unknown as DatabaseAdapterConstructor,
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
