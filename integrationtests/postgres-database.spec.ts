import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresDatabase } from '../src/data/postgres/postgres-database';
import {
  RunningDockerContainer,
  startDockerContainer,
  waitFor,
} from './helpers/docker-database';

describe('PostgresDatabase', () => {
  let container: RunningDockerContainer;
  let database: PostgresDatabase;
  const testTableName = 'postgres_database_test';

  const testRecords: Array<Record<string, string>> = [
    { foo: 'Lorum ipsum', bar: 'dolar sit', baz: 'amet' },
    { foo: 'Amet', bar: 'sit dolar', baz: 'ipsum lorem' },
  ];

  beforeAll(async () => {
    container = await startDockerContainer({
      image: 'postgres:16-alpine',
      env: {
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'password',
        POSTGRES_DB: 'testdb',
      },
      containerPort: 5432,
    });

    database = new PostgresDatabase({
      engine: 'postgres',
      user: 'postgres',
      password: 'password',
      host: container.host,
      port: container.port,
      database: 'testdb',
    });

    await waitFor(async () => {
      expect(await database.executeScalar('SELECT 1')).toBe(1);
    });
  }, 60000);

  afterAll(async () => {
    database?.release();
    await container?.stop();
  });

  beforeEach(async () => {
    await database.execute(`DROP TABLE IF EXISTS "${testTableName}"`);
    await database.execute(`
      CREATE TABLE "${testTableName}" (
        id serial primary key,
        foo varchar(100),
        bar varchar(100),
        baz varchar(100)
      )
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
    const missing = await database.tableExists('i_most_certainly_do_not_exist');
    expect(missing).toBe(false);

    const present = await database.tableExists(testTableName);
    expect(present).toBe(true);
  });

  it('can drop a table', async () => {
    await database.execute(`DROP TABLE "${testTableName}"`);
    expect(await database.tableExists(testTableName)).toBe(false);
  });
});
