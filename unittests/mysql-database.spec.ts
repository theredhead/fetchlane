import { beforeEach, describe, expect, it } from 'vitest';
import { MySqlDatabase } from '../src/data/mysql/mysql-database';
import { parseDatabaseUrl } from '../src/db.conf';

const describeMySqlIntegration =
  process.env.RUN_MYSQL_INTEGRATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeMySqlIntegration('MySqlDatabase', () => {
  let database: MySqlDatabase;
  const testTableName = 'mysql_database_test';

  const testRecords: Array<Record<string, string>> = [
    { foo: 'Lorum ipsum', bar: 'dolar sit', baz: 'amet' },
    { foo: 'Amet', bar: 'sit dolar', baz: 'ipsum lorem' },
  ];

  beforeEach(() => {
    const config = parseDatabaseUrl(
      process.env.DB_URL || 'mysql://root:password@127.0.0.1:3306/mysql',
    );

    database = new MySqlDatabase({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port || 3306,
      database: config.database,
    });
  });

  it('can create a table', async () => {
    await database.execute(`
      DROP TABLE IF EXISTS ${testTableName};
      CREATE TABLE ${testTableName} (
        id int not null auto_increment primary key,
        foo varchar(100),
        bar varchar(100),
        baz varchar(100)
      ) charset=utf8
    `);
  });

  it('can connect to a local database', async () => {
    const result = await database.executeScalar('SELECT CURRENT_TIMESTAMP');
    expect(result).not.toBeNull();

    const hello = await database.executeScalar("SELECT 'Hello, World!'");
    expect(hello).toBe('Hello, World!');

    const one = await database.executeScalar('SELECT 1');
    expect(one).toBe(1);
  });

  it('can perform insert operations against an existing table', async () => {
    for (const testRecord of testRecords) {
      const result = await database.insert(testTableName, testRecord);
      expect(result.id).toBeDefined();

      for (const key of Object.keys(testRecord)) {
        expect(result[key]).toEqual(testRecord[key]);
      }
    }
  });

  it('can perform select operations against an existing table', async () => {
    const result = await database.select(testTableName);
    expect(result.rows.length).toBe(testRecords.length);
  });

  it('can perform delete, reinsert, and update operations against an existing table', async () => {
    const deleted = await database.delete(testTableName, 1);
    const remaining = await database.select(testTableName);
    expect(remaining.rows.length).toBe(testRecords.length - 1);

    expect(remaining.rows.find((row) => row.id === deleted.id)).toBeUndefined();

    const reinserted = await database.insert(testTableName, deleted);
    reinserted.foo = 'foo';
    reinserted.bar = 'bar';
    reinserted.baz = 'baz';

    const updated = await database.update(testTableName, reinserted);

    expect(updated.id).not.toEqual(deleted.id);
    expect(updated.id).toEqual(reinserted.id);
    expect(updated.foo).toEqual('foo');
    expect(updated.bar).toEqual('bar');
    expect(updated.baz).toEqual('baz');
  });

  it('can select from an existing table', async () => {
    const result = await database.select('test', '', []);
    expect(result.rows.length).toBeGreaterThan(3);
  });

  it('can determine if a table exists', async () => {
    const missing = await database.tableExists('i-most-certainly-do-not-exist');
    expect(missing).toBe(false);

    const present = await database.tableExists('test');
    expect(present).toBe(true);
  });

  it('can drop a table', async () => {
    await database.execute(`
      DROP TABLE ${testTableName}
    `);
  });
});
