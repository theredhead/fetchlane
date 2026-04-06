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

  describe('schema metadata', () => {
    function mockEmployeeSchema(): void {
      vi.spyOn(database, 'executeSingle').mockResolvedValueOnce({
        table_name: 'employee',
        table_schema: 'public',
        table_type: 'BASE TABLE',
      } as any);

      vi.spyOn(database, 'execute')
        .mockResolvedValueOnce({
          rows: [
            {
              ordinal_position: 1,
              column_name: 'employee_id',
              data_type: 'integer',
              udt_name: 'int4',
              is_nullable: false,
              column_default: "nextval('employee_employee_id_seq'::regclass)",
              is_identity: false,
              identity_generation: null,
              character_maximum_length: null,
              numeric_precision: 32,
              numeric_scale: 0,
            },
            {
              ordinal_position: 2,
              column_name: 'last_name',
              data_type: 'character varying',
              udt_name: 'varchar',
              is_nullable: false,
              column_default: null,
              is_identity: false,
              identity_generation: null,
              character_maximum_length: 20,
              numeric_precision: null,
              numeric_scale: null,
            },
            {
              ordinal_position: 3,
              column_name: 'hire_date',
              data_type: 'timestamp without time zone',
              udt_name: 'timestamp',
              is_nullable: true,
              column_default: null,
              is_identity: false,
              identity_generation: null,
              character_maximum_length: null,
              numeric_precision: null,
              numeric_scale: null,
            },
            {
              ordinal_position: 4,
              column_name: 'reports_to',
              data_type: 'integer',
              udt_name: 'int4',
              is_nullable: true,
              column_default: null,
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
              constraint_name: 'pk_employee',
              constraint_type: 'PRIMARY KEY',
              columns: ['employee_id'],
              referenced_table_schema: null,
              referenced_table: null,
              referenced_columns: null,
              update_rule: null,
              delete_rule: null,
            },
            {
              constraint_name: 'fk_employee_reports_to',
              constraint_type: 'FOREIGN KEY',
              columns: ['reports_to'],
              referenced_table_schema: 'public',
              referenced_table: 'employee',
              referenced_columns: ['employee_id'],
              update_rule: 'NO ACTION',
              delete_rule: 'NO ACTION',
            },
          ],
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              index_name: 'pk_employee',
              is_unique: true,
              is_primary: true,
              method: 'btree',
              predicate: null,
              columns: ['employee_id'],
              definition:
                'CREATE UNIQUE INDEX pk_employee ON public.employee USING btree (employee_id)',
            },
            {
              index_name: 'ix_employee_reports_to',
              is_unique: false,
              is_primary: false,
              method: 'btree',
              predicate: null,
              columns: ['reports_to'],
              definition:
                'CREATE INDEX ix_employee_reports_to ON public.employee USING btree (reports_to)',
            },
          ],
          fields: [],
        });
    }

    it('maps every column field with correct names, types, and values', async () => {
      mockEmployeeSchema();

      const result = await database.describeTable('employee');

      expect(result).not.toBeNull();
      expect(result!.columns).toHaveLength(4);

      const pk = result!.columns[0];
      expect(pk.ordinal_position).toBe(1);
      expect(pk.column_name).toBe('employee_id');
      expect(pk.data_type).toBe('integer');
      expect(pk.udt_name).toBe('int4');
      expect(pk.is_nullable).toBe(false);
      expect(pk.column_default).toBe(
        "nextval('employee_employee_id_seq'::regclass)",
      );
      expect(pk.is_identity).toBe(false);
      expect(pk.identity_generation).toBeNull();
      expect(pk.character_maximum_length).toBeNull();
      expect(pk.numeric_precision).toBe(32);
      expect(pk.numeric_scale).toBe(0);

      const varchar = result!.columns[1];
      expect(varchar.column_name).toBe('last_name');
      expect(varchar.data_type).toBe('character varying');
      expect(varchar.udt_name).toBe('varchar');
      expect(varchar.is_nullable).toBe(false);
      expect(varchar.character_maximum_length).toBe(20);
      expect(varchar.numeric_precision).toBeNull();

      const nullable = result!.columns[2];
      expect(nullable.column_name).toBe('hire_date');
      expect(nullable.data_type).toBe('timestamp without time zone');
      expect(nullable.is_nullable).toBe(true);
      expect(nullable.column_default).toBeNull();

      const fk = result!.columns[3];
      expect(fk.column_name).toBe('reports_to');
      expect(fk.is_nullable).toBe(true);
    });

    it('maps every constraint field with correct names, types, and values', async () => {
      mockEmployeeSchema();

      const result = await database.describeTable('employee');

      expect(result!.constraints).toHaveLength(2);

      const pkConstraint = result!.constraints[0];
      expect(pkConstraint.constraint_name).toBe('pk_employee');
      expect(pkConstraint.constraint_type).toBe('PRIMARY KEY');
      expect(pkConstraint.columns).toEqual(['employee_id']);
      expect(pkConstraint.referenced_table_schema).toBeNull();
      expect(pkConstraint.referenced_table).toBeNull();
      expect(pkConstraint.referenced_columns).toEqual([]);
      expect(pkConstraint.update_rule).toBeNull();
      expect(pkConstraint.delete_rule).toBeNull();

      const fkConstraint = result!.constraints[1];
      expect(fkConstraint.constraint_name).toBe('fk_employee_reports_to');
      expect(fkConstraint.constraint_type).toBe('FOREIGN KEY');
      expect(fkConstraint.columns).toEqual(['reports_to']);
      expect(fkConstraint.referenced_table_schema).toBe('public');
      expect(fkConstraint.referenced_table).toBe('employee');
      expect(fkConstraint.referenced_columns).toEqual(['employee_id']);
      expect(fkConstraint.update_rule).toBe('NO ACTION');
      expect(fkConstraint.delete_rule).toBe('NO ACTION');
    });

    it('maps every index field with correct names, types, and values', async () => {
      mockEmployeeSchema();

      const result = await database.describeTable('employee');

      expect(result!.indexes).toHaveLength(2);

      const pkIndex = result!.indexes[0];
      expect(pkIndex.index_name).toBe('pk_employee');
      expect(pkIndex.is_unique).toBe(true);
      expect(pkIndex.is_primary).toBe(true);
      expect(pkIndex.method).toBe('btree');
      expect(pkIndex.predicate).toBeNull();
      expect(pkIndex.columns).toEqual(['employee_id']);
      expect(pkIndex.definition).toContain('USING btree');

      const secondaryIndex = result!.indexes[1];
      expect(secondaryIndex.index_name).toBe('ix_employee_reports_to');
      expect(secondaryIndex.is_unique).toBe(false);
      expect(secondaryIndex.is_primary).toBe(false);
      expect(secondaryIndex.columns).toEqual(['reports_to']);
    });

    it('returns normalized getTableInfo rows', async () => {
      vi.spyOn(database, 'execute').mockResolvedValue({
        rows: [
          {
            ordinal_position: 1,
            column_name: 'employee_id',
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: "nextval('employee_employee_id_seq'::regclass)",
            character_maximum_length: null,
            numeric_precision: 32,
            numeric_scale: 0,
          },
          {
            ordinal_position: 2,
            column_name: 'last_name',
            data_type: 'character varying',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: 20,
            numeric_precision: null,
            numeric_scale: null,
          },
        ],
        fields: [],
      });

      const result = await database.getTableInfo('employee');

      expect(result).toHaveLength(2);
      expect(Object.keys(result[0]).sort()).toEqual([
        'character_maximum_length',
        'column_default',
        'column_name',
        'data_type',
        'is_nullable',
        'numeric_precision',
        'numeric_scale',
        'ordinal_position',
      ]);
      expect(result[0].column_name).toBe('employee_id');
      expect(result[0].data_type).toBe('integer');
      expect(result[1].column_name).toBe('last_name');
      expect(result[1].character_maximum_length).toBe(20);
    });

    it('returns normalized getTableNames rows', async () => {
      vi.spyOn(database, 'execute').mockResolvedValue({
        rows: [
          { table_name: 'album', table_type: 'BASE TABLE' },
          { table_name: 'artist', table_type: 'BASE TABLE' },
        ],
        fields: [],
      });

      const result = await database.getTableNames();

      expect(result).toHaveLength(2);
      expect(Object.keys(result[0]).sort()).toEqual([
        'table_name',
        'table_type',
      ]);
      expect(result[0].table_name).toBe('album');
      expect(result[0].table_type).toBe('BASE TABLE');
    });
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
