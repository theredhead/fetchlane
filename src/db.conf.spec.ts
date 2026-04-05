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

  it('rejects a completely invalid URL', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(() => parseDatabaseUrl('not_a_url')).toThrow(
      /Invalid database URL format/,
    );
  });

  it('rejects a URL with an empty engine in the protocol', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(() => parseDatabaseUrl('://user:pass@host/db')).toThrow(
      /Invalid database URL format/,
    );
  });

  it('rejects a URL missing the database name', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(() => parseDatabaseUrl('postgres://user:pass@host:5432')).toThrow(
      /missing database name/,
    );
  });

  it('rejects a URL missing the username', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(() =>
      parseDatabaseUrl('postgres://:password@host:5432/mydb'),
    ).toThrow(/missing username/);
  });

  it('rejects a URL missing the password', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    expect(() => parseDatabaseUrl('postgres://user@host:5432/mydb')).toThrow(
      /missing password/,
    );
  });

  it('rejects a URL missing the host', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    // The URL constructor rejects hostless forms before our validation can
    // run, so we simply verify that parseDatabaseUrl surfaces an error.
    expect(() => parseDatabaseUrl('postgres://user:pass@/mydb')).toThrow(
      /Invalid database URL/,
    );
  });

  it('decodes percent-encoded credentials', async () => {
    const { parseDatabaseUrl } = await import('./db.conf');

    const result = parseDatabaseUrl('postgres://us%40er:p%40ss@host:5432/mydb');
    expect(result.user).toBe('us@er');
    expect(result.password).toBe('p@ss');
  });
});
