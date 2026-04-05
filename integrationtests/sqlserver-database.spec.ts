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

  describe('primary key scenarios', () => {
    const uuidTable = 'ss_pk_uuid_test';
    const stringTable = 'ss_pk_string_test';
    const compositeTable = 'ss_pk_composite_test';

    afterEach(async () => {
      await database.execute(`
        IF OBJECT_ID('${uuidTable}', 'U') IS NOT NULL DROP TABLE [${uuidTable}]
      `);
      await database.execute(`
        IF OBJECT_ID('${stringTable}', 'U') IS NOT NULL DROP TABLE [${stringTable}]
      `);
      await database.execute(`
        IF OBJECT_ID('${compositeTable}', 'U') IS NOT NULL DROP TABLE [${compositeTable}]
      `);
    });

    it('reports isGenerated correctly for an identity column', async () => {
      const columns = await database.getPrimaryKeyColumns(testTableName);
      expect(columns).toEqual([
        { column: 'id', dataType: 'int', isGenerated: true },
      ]);
    });

    it('performs CRUD with a caller-supplied uniqueidentifier primary key', async () => {
      await database.execute(`
        CREATE TABLE [${uuidTable}] (
          [pk] uniqueidentifier NOT NULL PRIMARY KEY,
          [label] varchar(100)
        )
      `);

      const columns = await database.getPrimaryKeyColumns(uuidTable);
      expect(columns).toEqual([
        { column: 'pk', dataType: 'uniqueidentifier', isGenerated: false },
      ]);

      const id = '550E8400-E29B-41D4-A716-446655440000';
      const inserted = await database.insert(uuidTable, {
        pk: id,
        label: 'first',
      });
      expect(inserted.pk).toEqual(id);
      expect(inserted.label).toBe('first');

      const updated = await database.update(
        uuidTable,
        { pk: id },
        { label: 'updated' },
      );
      expect(updated.pk).toEqual(id);
      expect(updated.label).toBe('updated');

      const deleted = await database.delete(uuidTable, { pk: id });
      expect(deleted.pk).toEqual(id);

      const remaining = await database.select(uuidTable);
      expect(remaining.rows).toHaveLength(0);
    });

    it('performs CRUD with a varchar primary key', async () => {
      await database.execute(`
        CREATE TABLE [${stringTable}] (
          [code] varchar(20) NOT NULL PRIMARY KEY,
          [description] varchar(200)
        )
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
        CREATE TABLE [${compositeTable}] (
          [tenant_id] int NOT NULL,
          [record_id] int NOT NULL,
          [value] varchar(100),
          PRIMARY KEY ([tenant_id], [record_id])
        )
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
        await database.executeScalar('SELECT 1 AS value');
      }

      const result = await database.executeScalar('SELECT 1 AS value');
      expect(result).toBe(1);
    });

    it('does not leak connections when creating and releasing many adapters', async () => {
      for (let i = 0; i < 20; i++) {
        const adapter = new SqlServerDatabase({
          engine: 'sqlserver',
          user: 'sa',
          password: 'StrongPassw0rd!',
          host: container.host,
          port: container.port,
          database: 'master',
        });

        const value = await adapter.executeScalar('SELECT 1 AS value');
        expect(value).toBe(1);
        adapter.release();
      }

      const result = await database.executeScalar('SELECT 1 AS value');
      expect(result).toBe(1);
    });

    it('handles concurrent queries without exhausting the pool', async () => {
      const promises = Array.from({ length: 50 }, () =>
        database.executeScalar('SELECT 1 AS value'),
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);
      expect(results.every((value) => value === 1)).toBe(true);
    });
  });
});
