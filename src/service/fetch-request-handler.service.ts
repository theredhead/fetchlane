import { Inject, Injectable } from '@nestjs/common';
import { Record, RecordSet } from '../data/database';
import { FetchRequest } from '../data/fetch-predicate.types';
import { FetchRequestSQLWriter } from '../data/fetch-request';
import { DATABASE_CONNECTION } from '../data/database.providers';
import { DataAccessService } from './data-access.service';
import { DatabaseAdapter } from '../data/database';

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
    @Inject(DATABASE_CONNECTION) adapter: DatabaseAdapter,
  ) {
    this.writer = new FetchRequestSQLWriter(
      (name) => adapter.quoteIdentifier(name),
      (index) => adapter.parameter(index),
      (baseQuery, limit, offset, orderByClause) =>
        adapter.paginateQuery(baseQuery, limit, offset, orderByClause),
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
