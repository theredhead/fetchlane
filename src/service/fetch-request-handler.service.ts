import { Inject, Injectable } from '@nestjs/common';
import { Record, RecordSet } from '../data/database';
import { DatabaseEngine } from '../data/database-engine';
import { FetchRequest } from '../data/fetch-predicate.types';
import { FetchRequestSQLWriter } from '../data/fetch-request';
import { ACTIVE_DATABASE_ENGINE } from '../data/database.providers';
import { DataAccessService } from './data-access.service';

/**
 * Typed response wrapper returned by the fetch request handler.
 */
export interface FetchResponse<T extends Record> extends RecordSet {
  rows: T[];
}

@Injectable()
/**
 * Executes structured fetch requests by translating them into engine-specific SQL.
 */
export class FetchRequestHandlerService {
  private readonly writer: FetchRequestSQLWriter;

  /**
   * Creates the handler that turns structured fetch requests into engine-specific SQL.
   */
  public constructor(
    private readonly db: DataAccessService,
    @Inject(ACTIVE_DATABASE_ENGINE) engine: DatabaseEngine,
  ) {
    this.writer = new FetchRequestSQLWriter(
      (name) => engine.quoteIdentifier(name),
      (baseQuery, limit, offset, orderByClause) =>
        engine.paginateQuery(baseQuery, limit, offset, orderByClause),
    );
  }

  /** Executes a structured fetch request and returns the typed result set. */
  public async handleRequest<T extends Record>(
    request: FetchRequest,
  ): Promise<FetchResponse<T>> {
    const cmd = this.writer.write(request);
    const result = await this.db.execute(cmd.text, cmd.args);
    return <FetchResponse<T>>result;
  }
}
