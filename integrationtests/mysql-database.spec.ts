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

  describe('primary key scenarios', () => {
    const uuidTable = 'mysql_pk_uuid_test';
    const stringTable = 'mysql_pk_string_test';
    const compositeTable = 'mysql_pk_composite_test';

    afterEach(async () => {
      await database.execute(`DROP TABLE IF EXISTS \`${uuidTable}\``);
      await database.execute(`DROP TABLE IF EXISTS \`${stringTable}\``);
      await database.execute(`DROP TABLE IF EXISTS \`${compositeTable}\``);
    });

    it('reports isGenerated correctly for an auto_increment column', async () => {
      const columns = await database.getPrimaryKeyColumns(testTableName);
      expect(columns).toEqual([
        { column: 'id', dataType: 'int', isGenerated: true },
      ]);
    });

    it('performs CRUD with a caller-supplied CHAR(36) primary key', async () => {
      await database.execute(`
        CREATE TABLE \`${uuidTable}\` (
          \`pk\` char(36) NOT NULL PRIMARY KEY,
          \`label\` varchar(100)
        ) charset=utf8mb4
      `);

      const columns = await database.getPrimaryKeyColumns(uuidTable);
      expect(columns).toEqual([
        { column: 'pk', dataType: 'char', isGenerated: false },
      ]);

      const id = '550e8400-e29b-41d4-a716-446655440000';
      const inserted = await database.insert(uuidTable, {
        pk: id,
        label: 'first',
      });
      expect(inserted.pk).toBe(id);
      expect(inserted.label).toBe('first');

      const updated = await database.update(
        uuidTable,
        { pk: id },
        { label: 'updated' },
      );
      expect(updated.pk).toBe(id);
      expect(updated.label).toBe('updated');

      const deleted = await database.delete(uuidTable, { pk: id });
      expect(deleted.pk).toBe(id);

      const remaining = await database.select(uuidTable);
      expect(remaining.rows).toHaveLength(0);
    });

    it('performs CRUD with a varchar primary key', async () => {
      await database.execute(`
        CREATE TABLE \`${stringTable}\` (
          \`code\` varchar(20) NOT NULL PRIMARY KEY,
          \`description\` varchar(200)
        ) charset=utf8mb4
      `);

      const columns = await database.getPrimaryKeyColumns(stringTable);
      expect(columns).toEqual([
        { column: 'code', dataType: 'varchar', isGenerated: false },
      ]);

      const inserted = await database.insert(stringTable, {
        code: 'US',
        description: 'United States',
      });
      expect(inserted.code).toBe('US');

      const updated = await database.update(
        stringTable,
        { code: 'US' },
        { description: 'United States of America' },
      );
      expect(updated.description).toBe('United States of America');

      const deleted = await database.delete(stringTable, { code: 'US' });
      expect(deleted.code).toBe('US');
    });

    it('performs CRUD with a composite primary key', async () => {
      await database.execute(`
        CREATE TABLE \`${compositeTable}\` (
          \`tenant_id\` int NOT NULL,
          \`record_id\` int NOT NULL,
          \`value\` varchar(100),
          PRIMARY KEY (\`tenant_id\`, \`record_id\`)
        ) charset=utf8mb4
      `);

      const columns = await database.getPrimaryKeyColumns(compositeTable);
      expect(columns).toEqual([
        { column: 'tenant_id', dataType: 'int', isGenerated: false },
        { column: 'record_id', dataType: 'int', isGenerated: false },
      ]);

      const inserted = await database.insert(compositeTable, {
        tenant_id: 1,
        record_id: 100,
        value: 'original',
      });
      expect(inserted.tenant_id).toBe(1);
      expect(inserted.record_id).toBe(100);

      const updated = await database.update(
        compositeTable,
        { tenant_id: 1, record_id: 100 },
        { value: 'modified' },
      );
      expect(updated.value).toBe('modified');

      await database.insert(compositeTable, {
        tenant_id: 1,
        record_id: 200,
        value: 'second',
      });

      const deleted = await database.delete(compositeTable, {
        tenant_id: 1,
        record_id: 100,
      });
      expect(deleted.value).toBe('modified');

      const remaining = await database.select(compositeTable);
      expect(remaining.rows).toHaveLength(1);
      expect(remaining.rows[0].record_id).toBe(200);
    });
  });

  describe('connection lifecycle', () => {
    it('does not leak connections across many sequential queries', async () => {
      for (let i = 0; i < 100; i++) {
        await database.executeScalar('SELECT 1');
      }

      const result = await database.executeScalar('SELECT 1');
      expect(result).toBe(1);
    });

    it('does not leak connections when creating and releasing many adapters', async () => {
      for (let i = 0; i < 20; i++) {
        const adapter = new MySqlDatabase({
          engine: 'mysql',
          user: 'root',
          password: 'password',
          host: container.host,
          port: container.port,
          database: 'testdb',
        });

        const value = await adapter.executeScalar('SELECT 1');
        expect(value).toBe(1);
        adapter.release();
      }

      const result = await database.executeScalar('SELECT 1');
      expect(result).toBe(1);
    });

    it('handles concurrent queries without exhausting the pool', async () => {
      const promises = Array.from({ length: 50 }, () =>
        database.executeScalar('SELECT 1'),
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);
      expect(results.every((value) => value === 1)).toBe(true);
    });
  });
});
