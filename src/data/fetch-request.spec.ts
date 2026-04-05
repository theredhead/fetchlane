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
      (baseQuery, limit, offset, orderByClause) =>
        `
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

  it('writes compound OR predicates', () => {
    const writer = new FetchRequestSQLWriter();

    const result = writer.write({
      table: 'member',
      predicates: [
        {
          type: 'OR',
          predicates: [
            { text: 'age > ?', args: [18] },
            { text: 'status = ?', args: ['active'] },
          ],
        },
      ],
      sort: [],
    });

    expect(result.args).toEqual([18, 'active']);
    expect(result.text.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT * FROM "member" WHERE ((age > $1) OR (status = $2))',
    );
  });

  it('rejects compound predicates with an empty child array', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [{ type: 'AND', predicates: [] }],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects sort clauses missing a column', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [],
        sort: [{ column: '', direction: 'ASC' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects sort clauses with an invalid direction', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [],
        sort: [{ column: 'name', direction: 'INVALID' as any }],
      }),
    ).toThrow(BadRequestException);
  });

  it('generates ORDER BY with multiple sort clauses', () => {
    const writer = new FetchRequestSQLWriter();

    const result = writer.write({
      table: 'member',
      predicates: [],
      sort: [
        { column: 'name', direction: 'ASC' },
        { column: 'age', direction: 'DESC' },
      ],
    });

    expect(result.text).toContain('ORDER BY "name" ASC, "age" DESC');
  });

  it('rejects pagination with zero size', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [],
        sort: [],
        pagination: { index: 0, size: 0 },
      }),
    ).toThrow(/pagination.size/);
  });

  it('rejects pagination with size exceeding max page size', () => {
    const writer = new FetchRequestSQLWriter(
      undefined,
      undefined,
      undefined,
      50,
    );

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [],
        sort: [],
        pagination: { index: 0, size: 51 },
      }),
    ).toThrow(/pagination.size/);
  });

  it('rejects pagination with a negative index', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [],
        sort: [],
        pagination: { index: -1, size: 10 },
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a request with a missing table', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: '',
        predicates: [],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a request with non-array predicates', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: 'invalid' as any,
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a request with non-array sort', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [],
        sort: 'invalid' as any,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects named predicates with array args', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [
          {
            text: 'status = :status',
            args: ['open'],
          },
        ],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects positional predicates with object args', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [
          {
            text: 'status = ?',
            args: { status: 'open' },
          },
        ],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects positional predicates when arg count does not match placeholder count', () => {
    const writer = new FetchRequestSQLWriter();

    expect(() =>
      writer.write({
        table: 'member',
        predicates: [
          {
            text: 'status = ? AND age > ?',
            args: ['open'],
          },
        ],
        sort: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('writes a query without pagination when pagination is omitted', () => {
    const writer = new FetchRequestSQLWriter();

    const result = writer.write({
      table: 'member',
      predicates: [],
      sort: [{ column: 'name', direction: 'ASC' }],
    });

    expect(result.text).toContain('ORDER BY "name" ASC');
    expect(result.text).not.toContain('LIMIT');
  });

  it('allows predicates with no placeholders and empty args array', () => {
    const writer = new FetchRequestSQLWriter();

    const result = writer.write({
      table: 'member',
      predicates: [{ text: 'is_active = true', args: [] }],
      sort: [],
    });

    expect(result.text).toContain('(is_active = true)');
    expect(result.args).toEqual([]);
  });

  it('allows predicates with no placeholders and empty object args', () => {
    const writer = new FetchRequestSQLWriter();

    const result = writer.write({
      table: 'member',
      predicates: [{ text: 'is_active = true', args: {} }],
      sort: [],
    });

    expect(result.text).toContain('(is_active = true)');
  });

  it('quotes identifiers using the provided quoting function', () => {
    const writer = new FetchRequestSQLWriter((name) => `[${name}]`);

    expect(writer.quote('member')).toBe('[member]');
  });
});
