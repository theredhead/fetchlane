import { BadRequestException } from '@nestjs/common';
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
        size: 1,
      },
    });

    expect(result.args).toEqual([]);
    expect(result.text.replace(/(\n|\s\s)/g, ' ').trim()).toBe(
      'SELECT * FROM "test" LIMIT 1 OFFSET 0',
    );
  });

  it('supports custom identifier quoting and positional parameters', () => {
    const writer = new FetchRequestSQLWriter(
      (name) => `\`${name}\``,
      () => '?',
    );

    const result = writer.write({
      table: 'member',
      predicates: [
        {
          text: 'name = ? AND age > ?',
          args: ['Alice', 18],
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

    expect(result.args).toEqual(['Alice', 18]);
    expect(result.text.replace(/(\n|\s\s)/g, ' ').trim()).toBe(
      'SELECT * FROM `member` WHERE (name = ? AND age > ?) ORDER BY `name` ASC LIMIT 5 OFFSET 10',
    );
  });

  it('supports named parameters and rewrites them in occurrence order', () => {
    const writer = new FetchRequestSQLWriter();

    const result = writer.write({
      table: 'member',
      predicates: [
        {
          text: 'status = :status OR city = :city OR status = :status',
          args: {
            status: 'open',
            city: 'Enschede',
          },
        },
      ],
      sort: [],
    });

    expect(result.args).toEqual(['open', 'Enschede', 'open']);
    expect(result.text.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT * FROM "member" WHERE (status = $1 OR city = $2 OR status = $3)',
    );
  });

  it('supports engine-specific pagination syntax', () => {
    const writer = new FetchRequestSQLWriter(
      (name) => `[${name}]`,
      (index) => `@p${index}`,
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

  it('rejects mixed parameter modes within a predicate', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [
          {
            text: 'status = ? AND city = :city',
            args: ['open'],
          },
        ],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects mixed parameter modes within a request', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [
          {
            text: 'status = ?',
            args: ['open'],
          },
          {
            type: 'AND',
            predicates: [
              {
                text: 'city = :city',
                args: { city: 'Enschede' },
              },
            ],
          },
        ],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects args when a predicate has no placeholders', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [
          {
            text: 'is_active = true',
            args: [true],
          },
        ],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects named predicates when a named value is missing', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [
          {
            text: 'status = :status AND city = :city',
            args: { status: 'open' },
          },
        ],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });
});
