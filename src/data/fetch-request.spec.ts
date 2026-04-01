import { FetchRequestSQLWriter } from './fetch-request';

describe('FetchRequestSQLWriter', () => {
  it('writes a basic select statement', () => {
    const writer = new FetchRequestSQLWriter();

    const result = writer.write({
      table: 'test',
      predicates: [],
      sort: [],
      pagination: {
        index: 0,
        size: 0,
      },
    });

    expect(result.args).toEqual([]);
    expect(result.text.replace(/(\n|\s\s)/g, ' ').trim()).toBe(
      'SELECT * FROM "test" LIMIT 0 OFFSET 0',
    );
  });

  it('supports custom identifier quoting for other engines', () => {
    const writer = new FetchRequestSQLWriter((name) => `\`${name}\``);

    const result = writer.write({
      table: 'member',
      predicates: [
        {
          text: 'name = ?',
          args: ['Alice'],
        },
      ],
      sort: [
        {
          column: 'name',
          direction: 'ASC',
        },
      ],
      pagination: {
        index: 2,
        size: 5,
      },
    });

    expect(result.args).toEqual([['Alice']]);
    expect(result.text.replace(/(\n|\s\s)/g, ' ').trim()).toBe(
      'SELECT * FROM `member` WHERE (name = ?) ORDER BY name ASC LIMIT 5 OFFSET 10',
    );
  });

  it('supports engine-specific pagination syntax', () => {
    const writer = new FetchRequestSQLWriter(
      (name) => `[${name}]`,
      (baseQuery, limit, offset, orderByClause) => `
        SELECT *
        FROM (
          SELECT
            paged_source.*,
            ROW_NUMBER() OVER (${orderByClause || 'ORDER BY (SELECT NULL)'}) AS row_index
          FROM (
            ${baseQuery}
          ) AS paged_source
        ) AS paged_result
        WHERE row_index BETWEEN ${offset + 1} AND ${offset + limit}
        ORDER BY row_index
      `.trim(),
    );

    const result = writer.write({
      table: 'member',
      predicates: [],
      sort: [],
      pagination: {
        index: 1,
        size: 5,
      },
    });

    expect(result.text.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT * FROM ( SELECT paged_source.*, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS row_index FROM ( SELECT * FROM [member] ) AS paged_source ) AS paged_result WHERE row_index BETWEEN 6 AND 10 ORDER BY row_index',
    );
  });
});
