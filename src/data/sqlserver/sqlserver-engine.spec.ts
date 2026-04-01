import { sqlServerDatabaseEngine } from './sqlserver-engine';

describe('sqlServerDatabaseEngine', () => {
  it('renders sql server-specific SQL helpers', () => {
    expect(sqlServerDatabaseEngine.quoteIdentifier('member')).toBe('[member]');
    expect(sqlServerDatabaseEngine.parameter(4)).toBe('@p4');
    expect(
      sqlServerDatabaseEngine.paginateQuery(
        'SELECT * FROM [member]',
        5,
        10,
        'ORDER BY [name] ASC',
      ),
    ).toContain('ROW_NUMBER() OVER (ORDER BY [name] ASC) AS row_index');
    expect(
      sqlServerDatabaseEngine.createTableSql('member', [
        { name: 'name', type: 'nvarchar(100)', nullable: false },
      ]),
    ).toContain('[id] int IDENTITY(1,1) PRIMARY KEY');
  });

  it('describes a table with sql server metadata mapping', async () => {
    const db = {
      executeSingle: vi.fn().mockResolvedValue({
        table_name: 'member',
        table_schema: 'dbo',
        table_type: 'BASE TABLE',
      }),
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              ordinal_position: '1',
              column_name: 'id',
              data_type: 'int',
              udt_name: 'int',
              is_nullable: false,
              column_default: null,
              is_identity: true,
              character_maximum_length: null,
              numeric_precision: '10',
              numeric_scale: '0',
            },
          ],
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
            {
              constraint_name: 'FK_member_org',
              constraint_type: 'FOREIGN KEY',
              columns_csv: 'organization_id',
              referenced_table_schema: 'dbo',
              referenced_table: 'organization',
              referenced_columns_csv: 'id',
              update_rule: 'CASCADE',
              delete_rule: 'NO_ACTION',
            },
          ],
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
            {
              index_name: 'IX_member_name',
              is_unique: false,
              is_primary: false,
              method: 'NONCLUSTERED',
              columns_csv: 'name',
            },
          ],
        }),
    };

    const description = await sqlServerDatabaseEngine.describeTable(
      db as any,
      'member',
    );

    expect(description?.columns[0]).toEqual({
      ordinal_position: 1,
      column_name: 'id',
      data_type: 'int',
      udt_name: 'int',
      is_nullable: false,
      column_default: null,
      is_identity: true,
      identity_generation: null,
      character_maximum_length: null,
      numeric_precision: 10,
      numeric_scale: 0,
    });
    expect(description?.constraints[1]).toEqual({
      constraint_name: 'FK_member_org',
      constraint_type: 'FOREIGN KEY',
      columns: ['organization_id'],
      referenced_table_schema: 'dbo',
      referenced_table: 'organization',
      referenced_columns: ['id'],
      update_rule: 'CASCADE',
      delete_rule: 'NO_ACTION',
    });
    expect(description?.indexes).toEqual([
      {
        index_name: 'PK_member',
        is_unique: true,
        is_primary: true,
        method: 'CLUSTERED',
        predicate: null,
        columns: ['id'],
        definition: 'PRIMARY KEY CLUSTERED ([id])',
      },
      {
        index_name: 'IX_member_name',
        is_unique: false,
        is_primary: false,
        method: 'NONCLUSTERED',
        predicate: null,
        columns: ['name'],
        definition: 'INDEX [IX_member_name] NONCLUSTERED ([name])',
      },
    ]);
  });
});
