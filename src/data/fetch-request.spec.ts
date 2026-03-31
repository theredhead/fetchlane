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
});
