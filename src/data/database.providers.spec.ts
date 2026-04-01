import {
  ACTIVE_DATABASE_ENGINE,
  DATABASE_CONNECTION,
  DATABASE_ENGINES,
  databaseProviders,
} from './database.providers';
import { DatabaseEngine } from './database-engine';

describe('databaseProviders', () => {
  const enginesProvider = databaseProviders.find(
    (provider: any) => provider.provide === DATABASE_ENGINES,
  ) as any;
  const activeEngineProvider = databaseProviders.find(
    (provider: any) => provider.provide === ACTIVE_DATABASE_ENGINE,
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

  it('builds a registry with the supported database engines', () => {
    const registry = enginesProvider.useFactory();

    expect(registry.get('postgres')?.name).toBe('postgres');
    expect(registry.get('postgresql')?.name).toBe('postgres');
    expect(registry.get('mysql')?.name).toBe('mysql');
    expect(registry.get('sqlserver')?.name).toBe('sqlserver');
    expect(registry.get('mssql')?.name).toBe('sqlserver');
  });

  it('selects the active engine from DB_URL', () => {
    process.env.DB_URL = 'postgres://user:password@localhost:5432/example';
    const registry = enginesProvider.useFactory();

    const engine = activeEngineProvider.useFactory(registry);

    expect(engine.name).toBe('postgres');
  });

  it('throws a helpful error for unsupported engines', () => {
    process.env.DB_URL = 'sqlite://user:password@localhost/example';
    const registry = new Map<string, DatabaseEngine>([
      ['postgres', { name: 'postgres', engines: ['postgres'] } as DatabaseEngine],
      ['mysql', { name: 'mysql', engines: ['mysql'] } as DatabaseEngine],
    ]);

    expect(() => activeEngineProvider.useFactory(registry)).toThrow(
      'Unsupported database engine "sqlite". Supported engines: mysql, postgres',
    );
  });

  it('creates the active database connection from DB_URL', async () => {
    process.env.DB_URL = 'mysql://user:password@db.internal:3307/example';
    const connection = { kind: 'connection' };
    const engine = {
      connectDatabase: vi.fn().mockResolvedValue(connection),
    };

    const result = await connectionProvider.useFactory(engine);

    expect(engine.connectDatabase).toHaveBeenCalledWith({
      engine: 'mysql',
      user: 'user',
      password: 'password',
      host: 'db.internal',
      port: 3307,
      database: 'example',
    });
    expect(result).toBe(connection);
  });
});
