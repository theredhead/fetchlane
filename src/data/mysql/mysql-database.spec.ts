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

import { MySqlDatabase } from './mysql-database';

describe('MySqlDatabase', () => {
  let database: MySqlDatabase;

  beforeEach(() => {
    database = new MySqlDatabase({
      engine: 'mysql',
      user: 'root',
      password: 'password',
      host: 'localhost',
      port: 3306,
      database: 'testdb',
    });
  });

  it('executes select queries and maps fields', async () => {
    const release = vi.fn();
    const getConnection = vi.fn((callback: any) => {
      callback(null, {
        query: (_statement: string, _args: any[], queryCallback: any) =>
          queryCallback(
            null,
            [{ id: 1, name: 'Alice' }],
            [{ name: 'id', flags: 1, type: 3, length: 11, default: null }],
          ),
        release,
      });
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({
      getConnection,
    });

    const result = await database.execute('SELECT * FROM `member`');

    expect(result.rows).toEqual([{ id: 1, name: 'Alice' }]);
    expect(result.fields).toEqual([
      { name: 'id', flags: 1, type: 3, length: 11, default: null },
    ]);
    expect(release).toHaveBeenCalled();
  });

  it('maps command result headers into info', async () => {
    const release = vi.fn();
    const getConnection = vi.fn((callback: any) => {
      callback(null, {
        query: (_statement: string, _args: any[], queryCallback: any) =>
          queryCallback(
            null,
            {
              fieldCount: 0,
              affectedRows: 1,
              insertId: 7,
              info: '',
              serverStatus: 2,
              warningStatus: 0,
            },
            undefined,
          ),
        release,
      });
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({
      getConnection,
    });

    const result = await database.execute(
      'INSERT INTO `member` (`name`) VALUES (?)',
      ['Alice'],
    );

    expect(result.info).toMatchObject({ affectedRows: 1, insertId: 7 });
    expect(result.rows).toEqual([]);
    expect(release).toHaveBeenCalled();
  });

  it('rejects when no connection can be acquired', async () => {
    const getConnection = vi.fn((callback: any) => {
      callback(new Error('no connection'));
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({
      getConnection,
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow('no connection');
  });

  it('supports selectSingle, executeScalar, tableExists, escaping, and release', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    (database as any).poolPromise = Promise.resolve({ end });

    vi.spyOn(database, 'execute')
      .mockResolvedValueOnce({
        info: {},
        fields: [],
        rows: [{ id: 2, name: 'Bob' }],
      } as any)
      .mockResolvedValueOnce({
        info: {},
        fields: [],
        rows: [{ count: 1 }],
      } as any);

    await expect(
      database.selectSingle('member', 'WHERE id=?', [2]),
    ).resolves.toEqual({ id: 2, name: 'Bob' });
    await expect(database.tableExists('member')).resolves.toBe(true);
    expect(database.quoteIdentifier('odd`name')).toBe('`odd``name`');

    database.release();
    await Promise.resolve();

    expect(end).toHaveBeenCalled();
  });

  it('returns the native MySQL parameter token', () => {
    expect(database.parameter(1)).toBe('?');
    expect(database.parameter(99)).toBe('?');
  });

  it('applies LIMIT/OFFSET pagination with an order clause', () => {
    const result = database.paginateQuery(
      'SELECT * FROM `member`',
      10,
      20,
      'ORDER BY `id` ASC',
    );
    expect(result).toContain('SELECT * FROM `member`');
    expect(result).toContain('ORDER BY `id` ASC');
    expect(result).toContain('LIMIT 10 OFFSET 20');
  });

  it('applies LIMIT/OFFSET pagination without an order clause', () => {
    const result = database.paginateQuery(
      'SELECT * FROM `member`',
      10,
      0,
      null,
    );
    expect(result).not.toContain('ORDER BY');
    expect(result).toContain('LIMIT 10 OFFSET 0');
  });

  it('builds an INSERT and returns the re-selected row when lastId is available', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValueOnce({ rows: [], fields: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }], fields: [] });

    vi.spyOn(database, 'selectSingle').mockResolvedValueOnce({
      id: 7,
      name: 'Alice',
    } as any);

    const result = await database.insert('member', { name: 'Alice' });

    expect(result).toEqual({ id: 7, name: 'Alice' });
    expect(executeSpy.mock.calls[0][0]).toContain('INSERT INTO `member`');
    expect(executeSpy.mock.calls[0][0]).toContain('VALUES (?)');
  });

  it('returns the original record from insert when lastId is falsy', async () => {
    vi.spyOn(database, 'execute').mockResolvedValueOnce({
      rows: [],
      fields: [],
    });

    vi.spyOn(database, 'executeScalar').mockResolvedValueOnce(0);

    const result = await database.insert('member', {
      id: 'abc',
      name: 'Manual',
    });

    expect(result).toEqual({ id: 'abc', name: 'Manual' });
  });

  it('builds an UPDATE statement and re-selects the row', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [],
      fields: [],
    });
    vi.spyOn(database, 'selectSingle').mockResolvedValueOnce({
      id: 1,
      name: 'Updated',
    } as any);

    const result = await database.update(
      'member',
      { id: 1 },
      { name: 'Updated' },
    );

    expect(result).toEqual({ id: 1, name: 'Updated' });
    const statement = vi.mocked(database.execute).mock.calls[0][0] as string;
    expect(statement).toContain('UPDATE `member` SET');
    expect(statement).toContain('`name`=?');
    expect(statement).toContain('`id`=?');
  });

  it('builds an UPDATE with composite primary key', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [],
      fields: [],
    });
    vi.spyOn(database, 'selectSingle').mockResolvedValueOnce({
      a: 1,
      b: 2,
      name: 'Bob',
    } as any);

    await database.update('member', { a: 1, b: 2 }, { name: 'Bob' });

    const statement = vi.mocked(database.execute).mock.calls[0][0] as string;
    expect(statement).toContain('`a`=? AND `b`=?');
  });

  it('reads then deletes in the delete path', async () => {
    vi.spyOn(database, 'selectSingle').mockResolvedValueOnce({
      id: 5,
      name: 'Gone',
    } as any);
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [],
      fields: [],
    });

    const result = await database.delete('member', { id: 5 });

    expect(result).toEqual({ id: 5, name: 'Gone' });
    const deleteStatement = vi.mocked(database.execute).mock
      .calls[0][0] as string;
    expect(deleteStatement).toContain('DELETE FROM `member`');
    expect(deleteStatement).toContain('`id`=?');
  });

  it('delegates select to execute', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValue({ rows: [{ id: 1 }], fields: [] });

    await database.select('member', 'WHERE id=?', [1]);

    expect(executeSpy).toHaveBeenCalledWith(
      'SELECT * FROM `member` WHERE id=?',
      [1],
    );
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
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ count: 0 }],
      fields: [],
    });

    await expect(database.tableExists('missing')).resolves.toBe(false);
  });

  it('maps getPrimaryKeyColumns results', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [
        { column_name: 'id', data_type: 'int', is_generated: 1 },
        { column_name: 'tenant_id', data_type: 'varchar', is_generated: 0 },
      ],
      fields: [],
    });

    const result = await database.getPrimaryKeyColumns('member');

    expect(result).toEqual([
      { column: 'id', dataType: 'int', isGenerated: true },
      { column: 'tenant_id', dataType: 'varchar', isGenerated: false },
    ]);
  });

  it('returns rows from getTableNames', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ table_name: 'member', table_type: 'BASE TABLE' }],
      fields: [],
    });

    const result = await database.getTableNames();

    expect(result).toEqual([
      { table_name: 'member', table_type: 'BASE TABLE' },
    ]);
  });

  it('returns rows from getTableInfo', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ column_name: 'id', data_type: 'int' }],
      fields: [],
    });

    const result = await database.getTableInfo('member');

    expect(result).toEqual([{ column_name: 'id', data_type: 'int' }]);
  });

  it('returns null from describeTable when table does not exist', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValue(undefined as any);

    const result = await database.describeTable('nonexistent');

    expect(result).toBeNull();
  });

  it('assembles a full schema description from describeTable', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValueOnce({
      table_name: 'member',
      table_schema: 'testdb',
      table_type: 'BASE TABLE',
    } as any);

    vi.spyOn(database, 'execute')
      .mockResolvedValueOnce({
        rows: [
          {
            ordinal_position: 1,
            column_name: 'id',
            data_type: 'int',
            udt_name: 'int(11)',
            is_nullable: false,
            column_default: null,
            is_identity: true,
            identity_generation: null,
            character_maximum_length: null,
            numeric_precision: 10,
            numeric_scale: 0,
          },
        ],
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            constraint_name: 'PRIMARY',
            constraint_type: 'PRIMARY KEY',
            columns_csv: 'id',
            referenced_table_schema: null,
            referenced_table: null,
            referenced_columns_csv: null,
            update_rule: null,
            delete_rule: null,
          },
        ],
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            index_name: 'PRIMARY',
            is_unique: 1,
            is_primary: 1,
            method: 'BTREE',
            columns_csv: 'id',
          },
        ],
        fields: [],
      });

    const result = await database.describeTable('member');

    expect(result).not.toBeNull();
    expect(result!.table_name).toBe('member');
    expect(result!.columns).toHaveLength(1);
    expect(result!.columns[0].column_name).toBe('id');
    expect(result!.constraints).toHaveLength(1);
    expect(result!.constraints[0].constraint_type).toBe('PRIMARY KEY');
    expect(result!.indexes).toHaveLength(1);
    expect(result!.indexes[0].is_primary).toBe(true);
    expect(result!.indexes[0].definition).toContain('PRIMARY KEY');
  });

  it('maps FOREIGN KEY constraints in describeTable', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValueOnce({
      table_name: 'order',
      table_schema: 'testdb',
      table_type: 'BASE TABLE',
    } as any);

    vi.spyOn(database, 'execute')
      .mockResolvedValueOnce({ rows: [], fields: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            constraint_name: 'fk_member',
            constraint_type: 'FOREIGN KEY',
            columns_csv: 'member_id',
            referenced_table_schema: 'testdb',
            referenced_table: 'member',
            referenced_columns_csv: 'id',
            update_rule: 'CASCADE',
            delete_rule: 'SET NULL',
          },
        ],
        fields: [],
      })
      .mockResolvedValueOnce({ rows: [], fields: [] });

    const result = await database.describeTable('order');

    expect(result!.constraints[0].referenced_table).toBe('member');
    expect(result!.constraints[0].referenced_columns).toEqual(['id']);
    expect(result!.constraints[0].update_rule).toBe('CASCADE');
  });

  it('does not release when no pool exists', () => {
    expect(() => database.release()).not.toThrow();
  });

  it('handles ResultSetHeader as the first element of rows array', async () => {
    const release = vi.fn();
    const getConnection = vi.fn((callback: any) => {
      callback(null, {
        query: (_statement: string, _args: any[], queryCallback: any) =>
          queryCallback(
            null,
            [
              {
                fieldCount: 0,
                affectedRows: 2,
                insertId: 0,
                info: '',
                serverStatus: 34,
                warningStatus: 0,
              },
              { id: 1 },
              { id: 2 },
            ],
            undefined,
          ),
        release,
      });
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({
      getConnection,
    });

    const result = await database.execute('UPDATE ...');

    expect(result.info).toMatchObject({ affectedRows: 2 });
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
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

  it('rejects when connection is null without an error', async () => {
    const getConnection = vi.fn((callback: any) => {
      callback(null, null);
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({
      getConnection,
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      'Failed to acquire a MySQL connection',
    );
  });
});

describe('MySqlDatabase driver module loading', () => {
  afterEach(() => {
    moduleLoadingState.createRequireOverride = null;
  });

  it('throws a developer error when the mysql2 module is not installed', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      const error: any = new Error("Cannot find module 'mysql2'");
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    };

    const database = new MySqlDatabase({
      engine: 'mysql',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /optional dependency "mysql2"/,
    );
  });

  it('throws a developer error for unexpected driver load failures', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      throw new Error('Segmentation fault');
    };

    const database = new MySqlDatabase({
      engine: 'mysql',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /Failed to load the MySQL driver/,
    );
  });

  it('throws a developer error when a non-Error value is thrown', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      throw 42;
    };

    const database = new MySqlDatabase({
      engine: 'mysql',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /Failed to load the MySQL driver/,
    );
  });
});
