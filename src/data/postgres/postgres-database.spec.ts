const moduleLoadingState = vi.hoisted(() => ({
  createRequireOverride: null as
    | ((filename: string) => (moduleName: string) => any)
    | null,
}));

vi.mock('module', async () => {
  const actual = await vi.importActual<typeof import('module')>('module');
  return {
    ...actual,
    createRequire: (...args: any[]) => {
      if (moduleLoadingState.createRequireOverride) {
        return moduleLoadingState.createRequireOverride(String(args[0]));
      }
      return actual.createRequire(args[0]);
    },
  };
});

import { PostgresDatabase } from './postgres-database';

describe('PostgresDatabase', () => {
  let database: PostgresDatabase;

  beforeEach(() => {
    database = new PostgresDatabase({
      engine: 'postgres',
      user: 'postgres',
      password: 'password',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
    });
  });

  it('executes select queries and releases the client', async () => {
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'SELECT',
        rowCount: 1,
        rows: [{ id: 1 }],
        fields: [{ name: 'id' }],
      }),
      release,
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({ connect });

    const result = await database.execute('SELECT 1');

    expect(result.rows).toEqual([{ id: 1 }]);
    expect(result.fields).toEqual([{ name: 'id' }]);
    expect(release).toHaveBeenCalled();
  });

  it('maps command results into info', async () => {
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'INSERT',
        rowCount: 1,
        rows: [{ id: 7 }],
        fields: [],
      }),
      release,
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({ connect });

    const result = await database.execute('INSERT ...');

    expect(result.info).toEqual({ affectedRows: 1, insertId: 7 });
    expect(result.rows).toEqual([{ id: 7 }]);
    expect(release).toHaveBeenCalled();
  });

  it('casts table-existence checks to a boolean', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValueOnce({
      count: 1,
    } as any);

    await expect(database.tableExists('member')).resolves.toBe(true);
    expect(database.executeSingle).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.tables'),
      ['member'],
    );
  });

  it('escapes identifiers and ends the pool on release', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    (database as any).poolPromise = Promise.resolve({ end });

    expect(database.quoteIdentifier('odd"name')).toBe('"odd""name"');

    database.release();
    await Promise.resolve();

    expect(end).toHaveBeenCalled();
  });

  it('returns the native PostgreSQL parameter token', () => {
    expect(database.parameter(1)).toBe('$1');
    expect(database.parameter(5)).toBe('$5');
  });

  it('applies LIMIT/OFFSET pagination with an order clause', () => {
    const result = database.paginateQuery(
      'SELECT * FROM "member"',
      10,
      20,
      'ORDER BY "id" ASC',
    );
    expect(result).toContain('SELECT * FROM "member"');
    expect(result).toContain('ORDER BY "id" ASC');
    expect(result).toContain('LIMIT 10 OFFSET 20');
  });

  it('applies LIMIT/OFFSET pagination without an order clause', () => {
    const result = database.paginateQuery(
      'SELECT * FROM "member"',
      10,
      0,
      null,
    );
    expect(result).not.toContain('ORDER BY');
    expect(result).toContain('LIMIT 10 OFFSET 0');
  });

  it('builds an INSERT statement with RETURNING *', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValue({ rows: [{ id: 1, name: 'Alice' }], fields: [] });

    const result = await database.insert('member', { name: 'Alice', age: 30 });

    expect(result).toEqual({ id: 1, name: 'Alice' });
    expect(executeSpy).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "member"'),
      ['Alice', 30],
    );
    expect(executeSpy.mock.calls[0][0]).toContain('RETURNING *');
    expect(executeSpy.mock.calls[0][0]).toContain('$1');
    expect(executeSpy.mock.calls[0][0]).toContain('$2');
  });

  it('builds an UPDATE statement with composite primary key', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValue({ rows: [{ a: 1, b: 2, name: 'Bob' }], fields: [] });

    const result = await database.update(
      'member',
      { a: 1, b: 2 },
      { name: 'Bob' },
    );

    expect(result).toEqual({ a: 1, b: 2, name: 'Bob' });
    const statement = executeSpy.mock.calls[0][0] as string;
    expect(statement).toContain('UPDATE "member" SET');
    expect(statement).toContain('"name"=$1');
    expect(statement).toContain('"a"=$2 AND "b"=$3');
    expect(statement).toContain('RETURNING *');
    expect(executeSpy.mock.calls[0][1]).toEqual(['Bob', 1, 2]);
  });

  it('builds a DELETE statement with RETURNING *', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValue({ rows: [{ id: 5, name: 'Gone' }], fields: [] });

    const result = await database.delete('member', { id: 5 });

    expect(result).toEqual({ id: 5, name: 'Gone' });
    const statement = executeSpy.mock.calls[0][0] as string;
    expect(statement).toContain('DELETE FROM "member"');
    expect(statement).toContain('"id"=$1');
    expect(statement).toContain('RETURNING *');
    expect(executeSpy.mock.calls[0][1]).toEqual([5]);
  });

  it('delegates select to execute', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValue({ rows: [{ id: 1 }], fields: [] });

    await database.select('member', 'WHERE id=$1', [1]);

    expect(executeSpy).toHaveBeenCalledWith(
      'SELECT * FROM "member" WHERE id=$1',
      [1],
    );
  });

  it('delegates selectSingle to execute and returns the first row', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ id: 1, name: 'Only' }],
      fields: [],
    });

    const result = await database.selectSingle('member', 'WHERE id=$1', [1]);

    expect(result).toEqual({ id: 1, name: 'Only' });
  });

  it('returns first column value from executeScalar', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ count: 42 }],
      fields: [],
    });

    const result = await database.executeScalar<number>('SELECT COUNT(*)');

    expect(result).toBe(42);
  });

  it('returns false from tableExists when count is 0', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValueOnce({
      count: 0,
    } as any);

    await expect(database.tableExists('missing')).resolves.toBe(false);
  });

  it('maps getPrimaryKeyColumns results', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [
        { column_name: 'id', data_type: 'integer', is_generated: true },
        { column_name: 'tenant', data_type: 'uuid', is_generated: false },
      ],
      fields: [],
    });

    const result = await database.getPrimaryKeyColumns('member');

    expect(result).toEqual([
      { column: 'id', dataType: 'integer', isGenerated: true },
      { column: 'tenant', dataType: 'uuid', isGenerated: false },
    ]);
  });

  it('returns rows from getTableNames', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [
        { table_name: 'member', table_type: 'BASE TABLE' },
        { table_name: 'order', table_type: 'BASE TABLE' },
      ],
      fields: [],
    });

    const result = await database.getTableNames();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      table_name: 'member',
      table_type: 'BASE TABLE',
    });
  });

  it('returns rows from getTableInfo', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ column_name: 'id', data_type: 'integer' }],
      fields: [],
    });

    const result = await database.getTableInfo('member');

    expect(result).toEqual([{ column_name: 'id', data_type: 'integer' }]);
  });

  it('returns null from describeTable when table does not exist', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValue(undefined as any);

    const result = await database.describeTable('nonexistent');

    expect(result).toBeNull();
  });

  it('assembles a full schema description from describeTable', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValueOnce({
      table_name: 'member',
      table_schema: 'public',
      table_type: 'BASE TABLE',
    } as any);

    vi.spyOn(database, 'execute')
      .mockResolvedValueOnce({
        rows: [
          {
            ordinal_position: 1,
            column_name: 'id',
            data_type: 'integer',
            udt_name: 'int4',
            is_nullable: false,
            column_default: "nextval('member_id_seq')",
            is_identity: false,
            identity_generation: null,
            character_maximum_length: null,
            numeric_precision: 32,
            numeric_scale: 0,
          },
        ],
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            constraint_name: 'member_pkey',
            constraint_type: 'PRIMARY KEY',
            columns: ['id'],
            referenced_table_schema: null,
            referenced_table: null,
            referenced_columns: null,
            update_rule: null,
            delete_rule: null,
          },
        ],
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            index_name: 'member_pkey',
            is_unique: true,
            is_primary: true,
            method: 'btree',
            predicate: null,
            columns: ['id'],
            definition:
              'CREATE UNIQUE INDEX member_pkey ON public.member USING btree (id)',
          },
        ],
        fields: [],
      });

    const result = await database.describeTable('member');

    expect(result).not.toBeNull();
    expect(result!.table_name).toBe('member');
    expect(result!.table_schema).toBe('public');
    expect(result!.table_type).toBe('BASE TABLE');
    expect(result!.columns).toHaveLength(1);
    expect(result!.columns[0].column_name).toBe('id');
    expect(result!.constraints).toHaveLength(1);
    expect(result!.constraints[0].constraint_type).toBe('PRIMARY KEY');
    expect(result!.indexes).toHaveLength(1);
    expect(result!.indexes[0].is_primary).toBe(true);
  });

  it('does not release when no pool exists', () => {
    expect(() => database.release()).not.toThrow();
  });

  it('resets the cached pool when createPool fails so retries can recover', async () => {
    const createPoolSpy = vi
      .spyOn(database as any, 'createPool')
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce({ ok: true });

    await expect((database as any).getPool()).rejects.toThrow('not ready');
    await expect((database as any).getPool()).resolves.toEqual({ ok: true });
    expect(createPoolSpy).toHaveBeenCalledTimes(2);
  });

  it('handles SELECT results with null rows gracefully', async () => {
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'SELECT',
        rowCount: 0,
        rows: null,
        fields: [],
      }),
      release,
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({ connect });

    const result = await database.execute('SELECT * FROM empty');

    expect(result.rows).toEqual([]);
  });
});

describe('PostgresDatabase driver module loading', () => {
  afterEach(() => {
    moduleLoadingState.createRequireOverride = null;
  });

  it('throws a developer error when the pg module is not installed', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      const error: any = new Error("Cannot find module 'pg'");
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    };

    const database = new PostgresDatabase({
      engine: 'postgres',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /optional dependency "pg"/,
    );
  });

  it('throws a developer error for unexpected driver load failures', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      throw new Error('Segmentation fault');
    };

    const database = new PostgresDatabase({
      engine: 'postgres',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /Failed to load the PostgreSQL driver/,
    );
  });

  it('throws a developer error when a non-Error value is thrown', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      throw 42;
    };

    const database = new PostgresDatabase({
      engine: 'postgres',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /Failed to load the PostgreSQL driver/,
    );
  });
});
