import { StatusController } from './status.controller';
import { StatusService } from '../service/status.service';

describe('StatusController', () => {
  let controller: StatusController;
  const statusService = {
    getStatus: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    controller = new StatusController(
      statusService as unknown as StatusService,
    );
  });

  it('returns the structured status payload', async () => {
    statusService.getStatus.mockResolvedValueOnce({
      status: 'ok',
      service: {
        name: 'fetchlane',
        version: '0.0.1',
        environment: 'test',
      },
      runtime: {
        startedAt: '2026-04-02T00:00:00.000Z',
        checkedAt: '2026-04-02T00:05:00.000Z',
        uptimeMs: 300000,
        nodeVersion: 'v22.14.0',
        platform: 'darwin/arm64',
        pid: 12345,
      },
      database: {
        engine: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        database: 'northwind',
        connected: true,
        roundTripMs: 4,
        capabilities: {
          tableListing: true,
          tableInfo: true,
          schemaDescription: true,
          createTableSql: true,
        },
        error: null,
      },
      links: {
        self: '/api/status',
        docs: '/api/docs',
      },
    });

    await expect(controller.index()).resolves.toEqual(
      expect.objectContaining({
        status: 'ok',
        service: expect.objectContaining({
          name: 'fetchlane',
        }),
        database: expect.objectContaining({
          connected: true,
        }),
      }),
    );
  });
});
