import { DatabaseLifecycleService } from './database-lifecycle.service';
import { DatabaseAdapter } from '../data/database';

describe('DatabaseLifecycleService', () => {
  it('releases the adapter on application shutdown', async () => {
    const adapter: DatabaseAdapter = {
      name: 'test',
      quoteIdentifier: vi.fn(),
      parameter: vi.fn(),
      paginateQuery: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      select: vi.fn(),
      selectSingle: vi.fn(),
      execute: vi.fn(),
      executeSingle: vi.fn(),
      executeScalar: vi.fn(),
      tableExists: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
      getPrimaryKeyColumns: vi.fn(),
    };

    const service = new DatabaseLifecycleService(adapter);
    await service.onApplicationShutdown();

    expect(adapter.release).toHaveBeenCalledOnce();
  });
});
