import { BadRequestException } from '@nestjs/common';
import { FetchRequestHandlerService } from './fetch-request-handler.service';

describe('FetchRequestHandlerService', () => {
  it('writes and executes positional fetch requests using the active adapter rules', async () => {
    const execute = vi.fn().mockResolvedValue({
      info: {},
      fields: [],
      rows: [{ id: 1, name: 'Alice' }],
    });
    const service = new FetchRequestHandlerService(
      { execute } as any,
      {
        name: 'sqlserver',
        quoteIdentifier: (name: string) => `[${name}]`,
        parameter: (index: number) => `@p${index}`,
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
    expect(statement).toContain('ORDER BY [name] ASC');
    expect(statement).toContain('ROWS 5 TO 5');
    expect(args).toEqual(['Alice']);
    expect(result.rows).toEqual([{ id: 1, name: 'Alice' }]);
  });

  it('supports named request parameters and rewrites them to native placeholders', async () => {
    const execute = vi.fn().mockResolvedValue({
      info: {},
      fields: [],
      rows: [],
    });
    const service = new FetchRequestHandlerService(
      { execute } as any,
      {
        name: 'postgres',
        quoteIdentifier: (name: string) => `"${name}"`,
        parameter: (index: number) => `$${index}`,
        paginateQuery: (baseQuery: string) => baseQuery,
      } as any,
    );

    await service.handleRequest({
      table: 'member',
      predicates: [
        { text: 'status = :status AND city = :city', args: { status: 'open', city: 'Enschede' } },
      ],
      sort: [],
    });

    const [statement, args] = execute.mock.calls[0];
    expect(statement).toContain('(status = $1 AND city = $2)');
    expect(args).toEqual(['open', 'Enschede']);
  });

  it('rejects mixed parameter modes within one request', async () => {
    const service = new FetchRequestHandlerService(
      { execute: vi.fn() } as any,
      {
        name: 'postgres',
        quoteIdentifier: (name: string) => `"${name}"`,
        parameter: (index: number) => `$${index}`,
        paginateQuery: (baseQuery: string) => baseQuery,
      } as any,
    );

    await expect(
      service.handleRequest({
        table: 'member',
        predicates: [
          { text: 'status = ?', args: ['open'] },
          { text: 'city = :city', args: { city: 'Enschede' } },
        ],
        sort: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
