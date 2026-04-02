import { BadRequestException } from '@nestjs/common';
import { RuntimeConfigService } from '../config/runtime-config';
import { FetchRequestHandlerService } from './fetch-request-handler.service';

describe('FetchRequestHandlerService', () => {
  const createRuntimeConfigService = (
    limitOverrides: Partial<ReturnType<RuntimeConfigService['getLimits']>> = {},
  ): RuntimeConfigService =>
    new RuntimeConfigService({
      server: {
        host: '0.0.0.0',
        port: 3000,
        cors: {
          enabled: true,
          origins: ['*'],
        },
      },
      database: {
        url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
      },
      limits: {
        request_body_bytes: 1048576,
        fetch_max_page_size: 1000,
        fetch_max_predicates: 25,
        fetch_max_sort_fields: 8,
        rate_limit_window_ms: 60000,
        rate_limit_max: 120,
        ...limitOverrides,
      },
      auth: {
        enabled: false,
        mode: 'oidc-jwt',
        issuer_url: '',
        audience: '',
        jwks_url: '',
        allowed_roles: [],
        claim_mappings: {
          subject: 'sub',
          roles: 'realm_access.roles',
        },
      },
    });

  it('writes and executes positional fetch requests using the active adapter rules', async () => {
    const execute = vi.fn().mockResolvedValue({
      info: {},
      fields: [],
      rows: [{ id: 1, name: 'Alice' }],
    });
    const service = new FetchRequestHandlerService(
      { execute } as any,
      createRuntimeConfigService(),
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
      createRuntimeConfigService(),
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
      createRuntimeConfigService(),
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

  it('enforces the configured maximum predicate count', async () => {
    const service = new FetchRequestHandlerService(
      { execute: vi.fn() } as any,
      createRuntimeConfigService({
        fetch_max_predicates: 1,
      }),
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
          { text: 'city = ?', args: ['Enschede'] },
        ],
        sort: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the configured maximum sort field count', async () => {
    const service = new FetchRequestHandlerService(
      { execute: vi.fn() } as any,
      createRuntimeConfigService({
        fetch_max_sort_fields: 1,
      }),
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
        predicates: [],
        sort: [
          { column: 'name', direction: 'ASC' },
          { column: 'city', direction: 'ASC' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the configured maximum page size', async () => {
    const service = new FetchRequestHandlerService(
      { execute: vi.fn() } as any,
      createRuntimeConfigService({
        fetch_max_page_size: 5,
      }),
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
        predicates: [],
        sort: [],
        pagination: {
          index: 0,
          size: 6,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
