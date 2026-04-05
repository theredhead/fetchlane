import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SqlServerDatabase } from '../src/data/sqlserver/sqlserver-database';
import {
  RunningDockerContainer,
  startDockerContainer,
  waitFor,
} from './helpers/docker-database';

describe('SqlServerDatabase', () => {
  let container: RunningDockerContainer;
  let database: SqlServerDatabase;
  const testTableName = 'sqlserver_database_test';

  const testRecords: Array<Record<string, string>> = [
    { foo: 'Lorum ipsum', bar: 'dolar sit', baz: 'amet' },
    { foo: 'Amet', bar: 'sit dolar', baz: 'ipsum lorem' },
  ];

  beforeAll(async () => {
    container = await startDockerContainer({
      image: 'mcr.microsoft.com/azure-sql-edge:latest',
      env: {
        ACCEPT_EULA: '1',
        MSSQL_SA_PASSWORD: 'StrongPassw0rd!',
        MSSQL_PID: 'Developer',
      },
      containerPort: 1433,
    });

    database = new SqlServerDatabase({
      engine: 'sqlserver',
      user: 'sa',
      password: 'StrongPassw0rd!',
      host: container.host,
      port: container.port,
      database: 'master',
    });

    await waitFor(
      async () => {
        expect(await database.executeScalar('SELECT 1 AS value')).toBe(1);
      },
      { timeoutMs: 120000, intervalMs: 1000 },
    );
  }, 150000);

  afterAll(async () => {
    database?.release();
    await container?.stop();
  });

  beforeEach(async () => {
    await database.execute(`
      IF OBJECT_ID('${testTableName}', 'U') IS NOT NULL
        DROP TABLE [${testTableName}]
    `);
    await database.execute(`
      CREATE TABLE [${testTableName}] (
        [id] int IDENTITY(1,1) PRIMARY KEY,
        [foo] varchar(100),
        [bar] varchar(100),
        [baz] varchar(100)
      )
    `);
  });

  it('can create a table', async () => {
    expect(await database.tableExists(testTableName)).toBe(true);
  });

  it('can connect to the dockerized database', async () => {
    const result = await database.executeScalar(
      'SELECT CURRENT_TIMESTAMP AS value',
    );
    expect(result).not.toBeNull();

    const hello = await database.executeScalar(
      "SELECT CAST('Hello, World!' AS varchar(32)) AS value",
    );
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
    const missing = await database.tableExists('i_most_certainly_do_not_exist');
    expect(missing).toBe(false);

    const present = await database.tableExists(testTableName);
    expect(present).toBe(true);
  });

  it('can drop a table', async () => {
    await database.execute(`DROP TABLE [${testTableName}]`);
    expect(await database.tableExists(testTableName)).toBe(false);
  });
});
