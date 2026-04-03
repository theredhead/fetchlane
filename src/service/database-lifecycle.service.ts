import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DatabaseAdapter } from '../data/database';
import { DATABASE_CONNECTION } from '../data/database.providers';

/**
 * Releases the active database adapter when Nest shuts down.
 */
@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  /**
   * Creates the lifecycle service for the active adapter instance.
   */
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly adapter: DatabaseAdapter,
  ) {}

  /**
   * Releases the active adapter during application shutdown.
   */
  public async onApplicationShutdown(): Promise<void> {
    await this.adapter.release();
  }
}
