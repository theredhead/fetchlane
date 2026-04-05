import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MySqlDatabase } from '../src/data/mysql/mysql-database';
import {
  RunningDockerContainer,
  startDockerContainer,
  waitFor,
} from './helpers/docker-database';

describe('MySqlDatabase', () => {
  let container: RunningDockerContainer;
  let database: MySqlDatabase;
  const testTableName = 'mysql_database_test';

  const testRecords: Array<Record<string, string>> = [
    { foo: 'Lorum ipsum', bar: 'dolar sit', baz: 'amet' },
    { foo: 'Amet', bar: 'sit dolar', baz: 'ipsum lorem' },
  ];

  beforeAll(async () => {
    container = await startDockerContainer({
      image: 'mysql:8.4',
      env: {
        MYSQL_DATABASE: 'testdb',
        MYSQL_ROOT_PASSWORD: 'password',
      },
      containerPort: 3306,
    });

    database = new MySqlDatabase({
      engine: 'mysql',
      user: 'root',
      password: 'password',
      host: container.host,
      port: container.port,
      database: 'testdb',
    });

    await waitFor(
      async () => {
        expect(await database.executeScalar('SELECT 1')).toBe(1);
      },
      { timeoutMs: 60000 },
    );
  }, 90000);

  afterAll(async () => {
    database?.release();
    await container?.stop();
  });

  beforeEach(async () => {
    await database.execute(`
      DROP TABLE IF EXISTS \`${testTableName}\`;
      CREATE TABLE \`${testTableName}\` (
        id int not null auto_increment primary key,
        foo varchar(100),
        bar varchar(100),
        baz varchar(100)
      ) charset=utf8mb4
    `);
  });

  it('can create a table', async () => {
    expect(await database.tableExists(testTableName)).toBe(true);
  });

  it('can connect to the dockerized database', async () => {
    const result = await database.executeScalar('SELECT CURRENT_TIMESTAMP');
    expect(result).not.toBeNull();

    const hello = await database.executeScalar("SELECT 'Hello, World!'");
    expect(hello).toBe('Hello, World!');
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
    for (const testRecord of testRecords) {
      await database.insert(testTableName, testRecord);
    }

    const result = await database.select(testTableName);
    expect(result.rows.length).toBe(testRecords.length);
  });

  it('can perform delete, reinsert, and update operations against an existing table', async () => {
    const inserted = await database.insert(testTableName, testRecords[0]);
    await database.insert(testTableName, testRecords[1]);

    const deleted = await database.delete(testTableName, {
      id: Number(inserted.id),
    });
    const remaining = await database.select(testTableName);
    expect(remaining.rows.length).toBe(testRecords.length - 1);
    expect(remaining.rows.find((row) => row.id === deleted.id)).toBeUndefined();

    const { id, ...recordWithoutId } = deleted;
    void id;
    const reinserted = await database.insert(testTableName, recordWithoutId);

    const updated = await database.update(
      testTableName,
      { id: reinserted.id },
      { foo: 'foo', bar: 'bar', baz: 'baz' },
    );

    expect(updated.id).toEqual(reinserted.id);
    expect(updated.foo).toEqual('foo');
    expect(updated.bar).toEqual('bar');
    expect(updated.baz).toEqual('baz');
  });

  it('can select from an existing table', async () => {
    await database.insert(testTableName, testRecords[0]);

    const result = await database.select(testTableName, '', []);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('can determine if a table exists', async () => {
    const missing = await database.tableExists('i-most-certainly-do-not-exist');
    expect(missing).toBe(false);

    const present = await database.tableExists(testTableName);
    expect(present).toBe(true);
  });

  it('can drop a table', async () => {
    await database.execute(`DROP TABLE \`${testTableName}\``);
    expect(await database.tableExists(testTableName)).toBe(false);
  });
});
