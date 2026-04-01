import { StatusService } from './status.service';
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
  const originalDbUrl = process.env.DB_URL;

  afterEach(() => {
    if (originalDbUrl == null) {
      delete process.env.DB_URL;
    } else {
      process.env.DB_URL = originalDbUrl;
    }
  });

  it('returns an ok status when the database health check succeeds', async () => {
    process.env.DB_URL = 'postgres://postgres:password@127.0.0.1:5432/northwind';
    const adapter = createAdapterMock();
    vi.mocked(adapter.execute).mockResolvedValueOnce({ rows: [{ fetchlane_status_check: 1 }] });
    const service = new StatusService(adapter);

    const result = await service.getStatus();

    expect(result.status).toBe('ok');
    expect(result.service.name).toBe('fetchlane');
    expect(result.database.engine).toBe('postgres');
    expect(result.database.connected).toBe(true);
    expect(result.database.capabilities).toEqual({
      table_listing: true,
      table_info: true,
      schema_description: true,
      create_table_sql: true,
    });
    expect(adapter.execute).toHaveBeenCalledWith(
      'SELECT 1 AS fetchlane_status_check',
      [],
    );
  });

  it('returns a degraded status when the database health check fails', async () => {
    process.env.DB_URL = 'mysql://root:password@127.0.0.1:3306/northwind';
    const adapter = createAdapterMock();
    adapter.name = 'mysql';
    vi.mocked(adapter.execute).mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const service = new StatusService(adapter);

    const result = await service.getStatus();

    expect(result.status).toBe('degraded');
    expect(result.database.connected).toBe(false);
    expect(result.database.error).toEqual({
      message: 'The database connectivity check failed.',
      hint:
        'Verify DB_URL credentials, host, port, driver installation, and that the target database server is reachable.',
    });
  });
});
