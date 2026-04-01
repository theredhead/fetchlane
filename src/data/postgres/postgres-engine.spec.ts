import { postgresDatabaseEngine } from './postgres-engine';

describe('postgresDatabaseEngine', () => {
  it('renders postgres-specific SQL helpers', () => {
    expect(postgresDatabaseEngine.quoteIdentifier('member')).toBe('"member"');
    expect(postgresDatabaseEngine.parameter(3)).toBe('$3');
    expect(
      postgresDatabaseEngine.paginateQuery(
        'SELECT * FROM "member"',
        10,
        20,
        'ORDER BY name ASC',
      ),
    ).toContain('LIMIT 10 OFFSET 20');
    expect(
      postgresDatabaseEngine.createTableSql('member', [
        { name: 'name', type: 'text', nullable: false },
        { name: 'nickname', type: 'text', nullable: true },
      ]),
    ).toContain('"id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY');
  });

  it('describes a table by mapping columns, constraints, and indexes', async () => {
    const db = {
      executeSingle: vi.fn().mockResolvedValue({
        table_name: 'member',
        table_schema: 'public',
        table_type: 'BASE TABLE',
      }),
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              ordinal_position: '1',
              column_name: 'id',
              data_type: 'integer',
              udt_name: 'int4',
              is_nullable: false,
              column_default: null,
              is_identity: true,
              identity_generation: 'ALWAYS',
              character_maximum_length: null,
              numeric_precision: '32',
              numeric_scale: '0',
            },
          ],
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
            {
              constraint_name: 'member_org_fk',
              constraint_type: 'FOREIGN KEY',
              columns: ['organization_id'],
              referenced_table_schema: 'public',
              referenced_table: 'organization',
              referenced_columns: ['id'],
              update_rule: 'CASCADE',
              delete_rule: 'RESTRICT',
            },
          ],
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
              definition: 'CREATE UNIQUE INDEX member_pkey ON member (id)',
            },
          ],
        }),
    };

    const description = await postgresDatabaseEngine.describeTable(
      db as any,
      'member',
    );

    expect(description).toEqual({
      table_name: 'member',
      table_schema: 'public',
      table_type: 'BASE TABLE',
      columns: [
        {
          ordinal_position: 1,
          column_name: 'id',
          data_type: 'integer',
          udt_name: 'int4',
          is_nullable: false,
          column_default: null,
          is_identity: true,
          identity_generation: 'ALWAYS',
          character_maximum_length: null,
          numeric_precision: 32,
          numeric_scale: 0,
        },
      ],
      constraints: [
        {
          constraint_name: 'member_pkey',
          constraint_type: 'PRIMARY KEY',
          columns: ['id'],
          referenced_table_schema: null,
          referenced_table: null,
          referenced_columns: [],
          update_rule: null,
          delete_rule: null,
        },
        {
          constraint_name: 'member_org_fk',
          constraint_type: 'FOREIGN KEY',
          columns: ['organization_id'],
          referenced_table_schema: 'public',
          referenced_table: 'organization',
          referenced_columns: ['id'],
          update_rule: 'CASCADE',
          delete_rule: 'RESTRICT',
        },
      ],
      indexes: [
        {
          index_name: 'member_pkey',
          is_unique: true,
          is_primary: true,
          method: 'btree',
          predicate: null,
          columns: ['id'],
          definition: 'CREATE UNIQUE INDEX member_pkey ON member (id)',
        },
      ],
    });
  });

  it('returns null when the table does not exist', async () => {
    const db = {
      executeSingle: vi.fn().mockResolvedValue(null),
    };

    await expect(
      postgresDatabaseEngine.describeTable(db as any, 'missing'),
    ).resolves.toBeNull();
  });
});
