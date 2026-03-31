import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  delete process.env.DB_URL;
});

describe('db.conf', () => {
  it('parses a postgres url with credentials and an explicit port', async () => {
    process.env.DB_URL = 'postgres://bootstrap:bootstrap@localhost:5432/bootstrap';
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
    process.env.DB_URL = 'mysql://bootstrap:bootstrap@localhost/bootstrap';
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(parseDatabaseUrl('mysql://root:password@mysql.local/northwind')).toEqual({
      engine: 'mysql',
      user: 'root',
      password: 'password',
      host: 'mysql.local',
      port: undefined,
      database: 'northwind',
    });
  });

  it('derives the active engine and postgres config from DB_URL', async () => {
    process.env.DB_URL = 'postgres://shared-user:shared-pass@pg.local:5544/locationdb';

    const conf = await import('./db.conf');

    expect(conf.databaseEngine).toBe('postgres');
    expect(conf.pgDatabaseConfiguration.host).toBe('pg.local');
    expect(conf.pgDatabaseConfiguration.port).toBe(5544);
    expect(conf.pgDatabaseConfiguration.database).toBe('locationdb');
    expect(conf.pgDatabaseConfiguration.user).toBe('shared-user');
    expect(conf.pgDatabaseConfiguration.password).toBe('shared-pass');
  });

  it('derives the active engine and mysql config from DB_URL', async () => {
    process.env.DB_URL = 'mysql://root:password@mysql.local:3307/appdb';

    const conf = await import('./db.conf');

    expect(conf.databaseEngine).toBe('mysql');
    expect(conf.databaseConfiguration.user).toBe('root');
    expect(conf.databaseConfiguration.password).toBe('password');
    expect(conf.databaseConfiguration.host).toBe('mysql.local');
    expect(conf.databaseConfiguration.port).toBe(3307);
    expect(conf.databaseConfiguration.database).toBe('appdb');
  });

  it('requires DB_URL to be present', async () => {
    await expect(import('./db.conf')).rejects.toThrow(/Missing DB_URL/);
  });
});
