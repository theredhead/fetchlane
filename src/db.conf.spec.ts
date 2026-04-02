import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
});

describe('db.conf', () => {
  it('parses a postgres url with credentials and an explicit port', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(
      parseDatabaseUrl('postgres://postgres:password@db.internal:5433/appdb'),
    ).toEqual({
      engine: 'postgres',
      user: 'postgres',
      password: 'password',
      host: 'db.internal',
      port: 5433,
      database: 'appdb',
    });
  });

  it('parses a mysql url without a port', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(
      parseDatabaseUrl('mysql://root:password@mysql.local/northwind'),
    ).toEqual({
      engine: 'mysql',
      user: 'root',
      password: 'password',
      host: 'mysql.local',
      port: undefined,
      database: 'northwind',
    });
  });

  it('parses a sqlserver url with credentials and port', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(
      parseDatabaseUrl('sqlserver://sa:StrongPassword!@sql.local:1433/master'),
    ).toEqual({
      engine: 'sqlserver',
      user: 'sa',
      password: 'StrongPassword!',
      host: 'sql.local',
      port: 1433,
      database: 'master',
    });
  });

  it('does not leak credentials when the database URL is invalid', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(() =>
      parseDatabaseUrl('postgres://secret-user:secret-pass@:5432'),
    ).toThrow(/Hint:/);
    expect(() =>
      parseDatabaseUrl('postgres://secret-user:secret-pass@:5432'),
    ).not.toThrow(/secret-pass/);
  });
});
