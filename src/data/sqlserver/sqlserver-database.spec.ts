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

import { SqlServerDatabase } from './sqlserver-database';

describe('SqlServerDatabase', () => {
  let database: SqlServerDatabase;

  beforeEach(() => {
    database = new SqlServerDatabase({
      engine: 'sqlserver',
      user: 'sa',
      password: 'password',
      host: 'localhost',
      port: 1433,
      database: 'master',
    });
  });

  it('executes queries through the pooled request object', async () => {
    const input = vi.fn();
    const query = vi.fn().mockResolvedValue({
      recordset: [{ id: 1 }],
      rowsAffected: [1],
    });
    vi.spyOn(database as any, 'getPool').mockResolvedValue({
      request: () => ({ input, query }),
    });

    const result = await database.execute(
      'SELECT * FROM [member] WHERE id=@p1',
      [1],
    );

    expect(input).toHaveBeenCalledWith('p1', 1);
    expect(query).toHaveBeenCalledWith('SELECT * FROM [member] WHERE id=@p1');
    expect(result).toEqual({
      info: { affectedRows: 1, insertId: 1 },
      fields: [],
      rows: [{ id: 1 }],
    });
  });

  it('prefers recordsets when recordset is absent', async () => {
    vi.spyOn(database as any, 'getPool').mockResolvedValue({
      request: () => ({
        input: vi.fn(),
        query: vi.fn().mockResolvedValue({
          recordset: undefined,
          recordsets: [[{ id: 2 }]],
          rowsAffected: [0],
        }),
      }),
    });

    const result = await database.execute('SELECT * FROM [member]');

    expect(result.rows).toEqual([{ id: 2 }]);
  });

  it('supports selectSingle, executeScalar, and tableExists', async () => {
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
      database.selectSingle('member', 'WHERE id=@p1', [2]),
    ).resolves.toEqual({ id: 2, name: 'Bob' });
    await expect(database.tableExists('member')).resolves.toBe(true);
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

  it('closes the pool on release and ignores close failures', async () => {
    const close = vi.fn().mockRejectedValue(new Error('close failed'));
    (database as any).poolPromise = Promise.resolve({ close });

    database.release();
    await Promise.resolve();

    expect(close).toHaveBeenCalled();
    expect((database as any).poolPromise).toBeNull();
  });

  it('quotes identifiers using SQL Server bracket syntax', () => {
    expect(database.quoteIdentifier('member')).toBe('[member]');
    expect(database.quoteIdentifier('odd]name')).toBe('[odd]]name]');
  });

  it('returns the native SQL Server parameter token', () => {
    expect(database.parameter(1)).toBe('@p1');
    expect(database.parameter(5)).toBe('@p5');
  });

  it('applies ROW_NUMBER pagination with an order clause', () => {
    const result = database.paginateQuery(
      'SELECT * FROM [member]',
      10,
      20,
      'ORDER BY [id] ASC',
    );
    expect(result).toContain('ROW_NUMBER() OVER (ORDER BY [id] ASC)');
    expect(result).toContain('BETWEEN 21 AND 30');
  });

  it('applies ROW_NUMBER pagination without an order clause', () => {
    const result = database.paginateQuery(
      'SELECT * FROM [member]',
      10,
      0,
      null,
    );
    expect(result).toContain('ORDER BY (SELECT NULL)');
    expect(result).toContain('BETWEEN 1 AND 10');
  });

  it('builds an INSERT statement with OUTPUT INSERTED.*', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValue({ rows: [{ id: 1, name: 'Alice' }], fields: [] });

    const result = await database.insert('member', { name: 'Alice', age: 30 });

    expect(result).toEqual({ id: 1, name: 'Alice' });
    const statement = executeSpy.mock.calls[0][0] as string;
    expect(statement).toContain('INSERT INTO [member]');
    expect(statement).toContain('OUTPUT INSERTED.*');
    expect(statement).toContain('@p1');
    expect(statement).toContain('@p2');
    expect(executeSpy.mock.calls[0][1]).toEqual(['Alice', 30]);
  });

  it('builds an UPDATE statement with OUTPUT INSERTED.*', async () => {
    const executeSpy = vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ id: 1, name: 'Updated' }],
      fields: [],
    });

    const result = await database.update(
      'member',
      { id: 1 },
      { name: 'Updated' },
    );

    expect(result).toEqual({ id: 1, name: 'Updated' });
    const statement = executeSpy.mock.calls[0][0] as string;
    expect(statement).toContain('UPDATE [member] SET');
    expect(statement).toContain('[name]=@p1');
    expect(statement).toContain('OUTPUT INSERTED.*');
    expect(statement).toContain('[id]=@p2');
  });

  it('builds an UPDATE with composite primary key', async () => {
    vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ a: 1, b: 2, name: 'Bob' }],
      fields: [],
    });

    await database.update('member', { a: 1, b: 2 }, { name: 'Bob' });

    const statement = vi.mocked(database.execute).mock.calls[0][0] as string;
    expect(statement).toContain('[a]=@p2 AND [b]=@p3');
    expect(vi.mocked(database.execute).mock.calls[0][1]).toEqual(['Bob', 1, 2]);
  });

  it('builds a DELETE statement with OUTPUT DELETED.*', async () => {
    const executeSpy = vi.spyOn(database, 'execute').mockResolvedValue({
      rows: [{ id: 5, name: 'Gone' }],
      fields: [],
    });

    const result = await database.delete('member', { id: 5 });

    expect(result).toEqual({ id: 5, name: 'Gone' });
    const statement = executeSpy.mock.calls[0][0] as string;
    expect(statement).toContain('DELETE FROM [member]');
    expect(statement).toContain('OUTPUT DELETED.*');
    expect(statement).toContain('[id]=@p1');
  });

  it('delegates select to execute', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValue({ rows: [{ id: 1 }], fields: [] });

    await database.select('member', 'WHERE id=@p1', [1]);

    expect(executeSpy).toHaveBeenCalledWith(
      'SELECT * FROM [member] WHERE id=@p1',
      [1],
    );
  });

  it('uses SELECT TOP 1 for selectSingle', async () => {
    const executeSpy = vi
      .spyOn(database, 'execute')
      .mockResolvedValue({ rows: [{ id: 1, name: 'Only' }], fields: [] });

    const result = await database.selectSingle('member', 'WHERE id=@p1', [1]);

    expect(result).toEqual({ id: 1, name: 'Only' });
    expect(executeSpy.mock.calls[0][0]).toContain('SELECT TOP 1');
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
        {
          column_name: 'tenant_id',
          data_type: 'uniqueidentifier',
          is_generated: 0,
        },
      ],
      fields: [],
    });

    const result = await database.getPrimaryKeyColumns('member');

    expect(result).toEqual([
      { column: 'id', dataType: 'int', isGenerated: true },
      { column: 'tenant_id', dataType: 'uniqueidentifier', isGenerated: false },
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
      table_schema: 'dbo',
      table_type: 'BASE TABLE',
    } as any);

    vi.spyOn(database, 'execute')
      .mockResolvedValueOnce({
        rows: [
          {
            ordinal_position: 1,
            column_name: 'id',
            data_type: 'int',
            udt_name: 'int',
            is_nullable: false,
            column_default: null,
            is_identity: 1,
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
            constraint_name: 'PK_member',
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
            index_name: 'PK_member',
            is_unique: true,
            is_primary: true,
            method: 'CLUSTERED',
            columns_csv: 'id',
          },
        ],
        fields: [],
      });

    const result = await database.describeTable('member');

    expect(result).not.toBeNull();
    expect(result!.table_name).toBe('member');
    expect(result!.table_schema).toBe('dbo');
    expect(result!.columns).toHaveLength(1);
    expect(result!.columns[0].is_identity).toBe(true);
    expect(result!.constraints).toHaveLength(1);
    expect(result!.constraints[0].constraint_type).toBe('PRIMARY KEY');
    expect(result!.indexes).toHaveLength(1);
    expect(result!.indexes[0].definition).toContain('PRIMARY KEY CLUSTERED');
  });

  it('maps FOREIGN KEY constraints in describeTable', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValueOnce({
      table_name: 'order',
      table_schema: 'dbo',
      table_type: 'BASE TABLE',
    } as any);

    vi.spyOn(database, 'execute')
      .mockResolvedValueOnce({ rows: [], fields: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            constraint_name: 'FK_member',
            constraint_type: 'FOREIGN KEY',
            columns_csv: 'member_id',
            referenced_table_schema: 'dbo',
            referenced_table: 'member',
            referenced_columns_csv: 'id',
            update_rule: 'CASCADE',
            delete_rule: 'NO_ACTION',
          },
        ],
        fields: [],
      })
      .mockResolvedValueOnce({ rows: [], fields: [] });

    const result = await database.describeTable('order');

    expect(result!.constraints[0].referenced_table).toBe('member');
    expect(result!.constraints[0].update_rule).toBe('CASCADE');
    expect(result!.constraints[0].delete_rule).toBe('NO_ACTION');
  });

  it('does not release when no pool exists', () => {
    expect(() => database.release()).not.toThrow();
  });

  it('falls back to empty rows when recordset and recordsets are both absent', async () => {
    vi.spyOn(database as any, 'getPool').mockResolvedValue({
      request: () => ({
        input: vi.fn(),
        query: vi.fn().mockResolvedValue({
          recordset: undefined,
          recordsets: undefined,
          rowsAffected: [0],
        }),
      }),
    });

    const result = await database.execute('SELECT 1');

    expect(result.rows).toEqual([]);
  });

  it('handles empty rowsAffected array', async () => {
    vi.spyOn(database as any, 'getPool').mockResolvedValue({
      request: () => ({
        input: vi.fn(),
        query: vi.fn().mockResolvedValue({
          recordset: [],
          rowsAffected: [],
        }),
      }),
    });

    const result = await database.execute('SELECT 1');

    expect(result.info.affectedRows).toBe(0);
  });
});

describe('SqlServerDatabase driver module loading', () => {
  afterEach(() => {
    moduleLoadingState.createRequireOverride = null;
  });

  it('throws a developer error when the mssql module is not installed', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      const error: any = new Error("Cannot find module 'mssql'");
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    };

    const database = new SqlServerDatabase({
      engine: 'sqlserver',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /optional dependency "mssql"/,
    );
  });

  it('throws a developer error for unexpected driver load failures', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      throw new Error('Segmentation fault');
    };

    const database = new SqlServerDatabase({
      engine: 'sqlserver',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /Failed to load the SQL Server driver/,
    );
  });

  it('throws a developer error when a non-Error value is thrown', async () => {
    moduleLoadingState.createRequireOverride = () => () => {
      throw 42;
    };

    const database = new SqlServerDatabase({
      engine: 'sqlserver',
      user: 'test',
      password: 'test',
      host: 'localhost',
      database: 'test',
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow(
      /Failed to load the SQL Server driver/,
    );
  });
});
