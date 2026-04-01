import { FetchRequestHandlerService } from './fetch-request-handler.service';

describe('FetchRequestHandlerService', () => {
  it('writes and executes fetch requests using the active engine rules', async () => {
    const execute = vi.fn().mockResolvedValue({
      info: {},
      fields: [],
      rows: [{ id: 1, name: 'Alice' }],
    });
    const service = new FetchRequestHandlerService(
      { execute } as any,
      {
        quoteIdentifier: (name: string) => `[${name}]`,
        paginateQuery: (
          baseQuery: string,
          limit: number,
          offset: number,
          orderByClause: string | null,
        ) =>
          [baseQuery, orderByClause, `ROWS ${offset} TO ${limit}`]
            .filter(Boolean)
            .join('\n'),
      } as any,
    );

    const result = await service.handleRequest({
      table: 'member',
      predicates: [{ text: 'name = ?', args: ['Alice'] }],
      sort: [{ column: 'name', direction: 'ASC' }],
      pagination: { index: 1, size: 5 },
    });

    const [statement, args] = execute.mock.calls[0];

    expect(statement).toContain('FROM [member]');
    expect(statement).toContain('ORDER BY name ASC');
    expect(statement).toContain('ROWS 5 TO 5');
    expect(args).toEqual([['Alice']]);
    expect(result.rows).toEqual([{ id: 1, name: 'Alice' }]);
  });
});
