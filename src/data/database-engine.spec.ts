import {
  createDatabaseAdapterRegistry,
  DatabaseAdapterConstructor,
} from './database';

describe('createDatabaseAdapterRegistry', () => {
  it('registers each adapter under all of its aliases', () => {
    class PostgresAdapter {
      public static readonly adapterName = 'postgres';
      public static readonly engines = ['postgres', 'postgresql'];
      public constructor(_config: unknown) {}
    }

    class MySqlAdapter {
      public static readonly adapterName = 'mysql';
      public static readonly engines = ['mysql'];
      public constructor(_config: unknown) {}
    }

    const registry = createDatabaseAdapterRegistry([
      PostgresAdapter as unknown as DatabaseAdapterConstructor,
      MySqlAdapter as unknown as DatabaseAdapterConstructor,
    ]);

    expect(registry.get('postgres')).toBe(PostgresAdapter);
    expect(registry.get('postgresql')).toBe(PostgresAdapter);
    expect(registry.get('mysql')).toBe(MySqlAdapter);
  });

  it('lets later adapters override earlier aliases', () => {
    class FirstAdapter {
      public static readonly adapterName = 'first';
      public static readonly engines = ['shared'];
      public constructor(_config: unknown) {}
    }

    class SecondAdapter {
      public static readonly adapterName = 'second';
      public static readonly engines = ['shared'];
      public constructor(_config: unknown) {}
    }

    const registry = createDatabaseAdapterRegistry([
      FirstAdapter as unknown as DatabaseAdapterConstructor,
      SecondAdapter as unknown as DatabaseAdapterConstructor,
    ]);

    expect(registry.get('shared')).toBe(SecondAdapter);
  });
});
