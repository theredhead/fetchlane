import { StatusService } from './status.service';
import { RuntimeConfigService } from '../config/runtime-config';
import { DatabaseAdapter } from '../data/database';

function createAdapterMock(): DatabaseAdapter {
  return {
    name: 'postgres',
    quoteIdentifier: vi.fn((name: string) => `"${name}"`),
    parameter: vi.fn((index: number) => `$${index}`),
    paginateQuery: vi.fn((baseQuery: string) => baseQuery),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    selectSingle: vi.fn(),
    execute: vi.fn(),
    executeSingle: vi.fn(),
    executeScalar: vi.fn(),
    tableExists: vi.fn(),
    release: vi.fn(),
    getTableNames: vi.fn(),
    getTableInfo: vi.fn(),
    describeTable: vi.fn(),
    createTableSql: vi.fn(),
  } as DatabaseAdapter;
}

describe('StatusService', () => {
  const createRuntimeConfigService = (
    databaseUrl: string,
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
        url: databaseUrl,
      },
      limits: {
        requestBodyBytes: 1048576,
        fetchMaxPageSize: 1000,
        fetchMaxPredicates: 25,
        fetchMaxSortFields: 8,
        rateLimitWindowMs: 60000,
        rateLimitMax: 120,
      },
      authentication: {
        enabled: false,
        mode: 'oidc-jwt',
        issuerUrl: '',
        audience: '',
        jwksUrl: '',
        claimMappings: {
          subject: 'sub',
          roles: 'realm_access.roles',
        },
      },
    });

  it('returns an ok status when the database health check succeeds', async () => {
    const adapter = createAdapterMock();
    const runtimeConfig = createRuntimeConfigService(
      'postgres://postgres:password@127.0.0.1:5432/northwind',
    );
    vi.mocked(adapter.execute).mockResolvedValueOnce({
      rows: [{ fetchlane_status_check: 1 }],
    });
    const service = new StatusService(adapter, runtimeConfig);

    const result = await service.getStatus();

    expect(result.status).toBe('ok');
    expect(result.service.name).toBe('fetchlane');
    expect(result.config).toEqual({
      server: {
        host: '0.0.0.0',
        port: 3000,
        corsEnabled: true,
      },
      authentication: {
        enabled: false,
      },
      limits: {
        requestBodyBytes: 1048576,
        fetchMaxPageSize: 1000,
        fetchMaxPredicates: 25,
        fetchMaxSortFields: 8,
        rateLimitWindowMs: 60000,
        rateLimitMax: 120,
      },
    });
    expect(result.database.engine).toBe('postgres');
    expect(result.database.connected).toBe(true);
    expect(result.database.capabilities).toEqual({
      tableListing: true,
      tableInfo: true,
      schemaDescription: true,
      createTableSql: true,
    });
    expect(adapter.execute).toHaveBeenCalledWith(
      'SELECT 1 AS fetchlane_status_check',
      [],
    );
  });

  it('returns a degraded status when the database health check fails', async () => {
    const adapter = createAdapterMock();
    const runtimeConfig = createRuntimeConfigService(
      'mysql://root:password@127.0.0.1:3306/northwind',
    );
    adapter.name = 'mysql';
    vi.mocked(adapter.execute).mockRejectedValueOnce(
      new Error('connect ECONNREFUSED'),
    );
    const service = new StatusService(adapter, runtimeConfig);

    const result = await service.getStatus();

    expect(result.status).toBe('degraded');
    expect(result.database.connected).toBe(false);
    expect(result.database.error).toEqual({
      message: 'The database connectivity check failed.',
      hint: 'Verify the configured database URL, credentials, host, port, driver installation, and that the target database server is reachable.',
    });
  });
});
