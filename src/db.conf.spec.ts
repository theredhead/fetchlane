import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  delete process.env.DB_URL;
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

  it('reads postgres config from DB_URL', async () => {
    process.env.DB_URL = 'postgres://shared-user:shared-pass@pg.local:5544/locationdb';

    const { readDatabaseUrlFromEnvironment } = await import('./db.conf');
    const conf = readDatabaseUrlFromEnvironment();

    expect(conf.engine).toBe('postgres');
    expect(conf.host).toBe('pg.local');
    expect(conf.port).toBe(5544);
    expect(conf.database).toBe('locationdb');
    expect(conf.user).toBe('shared-user');
    expect(conf.password).toBe('shared-pass');
  });

  it('reads mysql config from DB_URL', async () => {
    process.env.DB_URL = 'mysql://root:password@mysql.local:3307/appdb';

    const { readDatabaseUrlFromEnvironment } = await import('./db.conf');
    const conf = readDatabaseUrlFromEnvironment();

    expect(conf.engine).toBe('mysql');
    expect(conf.user).toBe('root');
    expect(conf.password).toBe('password');
    expect(conf.host).toBe('mysql.local');
    expect(conf.port).toBe(3307);
    expect(conf.database).toBe('appdb');
  });

  it('requires DB_URL to be present', async () => {
    const { readDatabaseUrlFromEnvironment } = await import('./db.conf');

    expect(() => readDatabaseUrlFromEnvironment()).toThrow(/Missing DB_URL/);
  });
});
