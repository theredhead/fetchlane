import { mySqlDatabaseEngine } from './mysql-engine';

describe('mySqlDatabaseEngine', () => {
  it('renders mysql-specific SQL helpers', () => {
    expect(mySqlDatabaseEngine.quoteIdentifier('member')).toBe('`member`');
    expect(mySqlDatabaseEngine.parameter(99)).toBe('?');
    expect(
      mySqlDatabaseEngine.paginateQuery(
        'SELECT * FROM `member`',
        10,
        20,
        'ORDER BY name ASC',
      ),
    ).toContain('LIMIT 10 OFFSET 20');
    expect(
      mySqlDatabaseEngine.createTableSql('member', [
        { name: 'name', type: 'varchar(255)', nullable: false },
      ]),
    ).toContain('`id` integer AUTO_INCREMENT PRIMARY KEY');
  });

  it('describes a table with mysql-specific metadata mapping', async () => {
    const db = {
      executeSingle: vi.fn().mockResolvedValue({
        table_name: 'member',
        table_schema: 'northwind',
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
              udt_name: 'int(11)',
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
              constraint_name: 'PRIMARY',
              constraint_type: 'PRIMARY KEY',
              columns_csv: 'id',
              referenced_table_schema: null,
              referenced_table: null,
              referenced_columns_csv: null,
              update_rule: null,
              delete_rule: null,
            },
            {
              constraint_name: 'member_org_fk',
              constraint_type: 'FOREIGN KEY',
              columns_csv: 'organization_id',
              referenced_table_schema: 'northwind',
              referenced_table: 'organization',
              referenced_columns_csv: 'id',
              update_rule: 'CASCADE',
              delete_rule: 'RESTRICT',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              index_name: 'PRIMARY',
              is_unique: true,
              is_primary: true,
              method: 'BTREE',
              columns_csv: 'id',
            },
            {
              index_name: 'member_name_uq',
              is_unique: true,
              is_primary: false,
              method: 'BTREE',
              columns_csv: 'name',
            },
          ],
        }),
    };

    const description = await mySqlDatabaseEngine.describeTable(
      db as any,
      'member',
    );

    expect(description?.columns[0]).toEqual({
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
    });
    expect(description?.constraints[1]).toEqual({
      constraint_name: 'member_org_fk',
      constraint_type: 'FOREIGN KEY',
      columns: ['organization_id'],
      referenced_table_schema: 'northwind',
      referenced_table: 'organization',
      referenced_columns: ['id'],
      update_rule: 'CASCADE',
      delete_rule: 'RESTRICT',
    });
    expect(description?.indexes).toEqual([
      {
        index_name: 'PRIMARY',
        is_unique: true,
        is_primary: true,
        method: 'BTREE',
        predicate: null,
        columns: ['id'],
        definition: 'PRIMARY KEY USING BTREE (`id`)',
      },
      {
        index_name: 'member_name_uq',
        is_unique: true,
        is_primary: false,
        method: 'BTREE',
        predicate: null,
        columns: ['name'],
        definition: 'UNIQUE INDEX `member_name_uq` USING BTREE (`name`)',
      },
    ]);
  });
});
