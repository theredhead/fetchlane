import { Inject, Injectable } from '@nestjs/common';
import { RuntimeConfigService } from '../config/runtime-config';
import { Record, RecordSet } from '../data/database';
import { FetchRequest } from '../data/fetch-predicate.types';
import { FetchRequestSQLWriter } from '../data/fetch-request';
import { DATABASE_CONNECTION } from '../data/database.providers';
import { badRequest } from '../errors/api-error';
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
    private readonly runtimeConfig: RuntimeConfigService,
    @Inject(DATABASE_CONNECTION) adapter: DatabaseAdapter,
  ) {
    const limits = this.runtimeConfig.getLimits();
    this.writer = new FetchRequestSQLWriter(
      (name) => adapter.quoteIdentifier(name),
      (index) => adapter.parameter(index),
      (baseQuery, limit, offset, orderByClause) =>
        adapter.paginateQuery(baseQuery, limit, offset, orderByClause),
      limits.fetch_max_page_size,
    );
  }

  /**
   * Executes a structured fetch request and returns the typed result set.
   */
  public async handleRequest<T extends Record>(
    request: FetchRequest,
  ): Promise<FetchResponse<T>> {
    this.validateLimits(request);
    const cmd = this.writer.write(request);
    const result = await this.db.execute(cmd.text, cmd.args);
    return <FetchResponse<T>>result;
  }

  private validateLimits(request: FetchRequest): void {
    const limits = this.runtimeConfig.getLimits();
    const predicateCount = this.countPredicates(request.predicates);
    if (predicateCount > limits.fetch_max_predicates) {
      throw badRequest(
        `FetchRequest contains ${predicateCount} predicate clause(s), which exceeds the configured limit of ${limits.fetch_max_predicates}.`,
        `Reduce the number of predicate clauses, or increase limits.fetch_max_predicates in the runtime config.`,
      );
    }

    if (request.sort.length > limits.fetch_max_sort_fields) {
      throw badRequest(
        `FetchRequest contains ${request.sort.length} sort field(s), which exceeds the configured limit of ${limits.fetch_max_sort_fields}.`,
        `Reduce the number of sort fields, or increase limits.fetch_max_sort_fields in the runtime config.`,
      );
    }
  }

  private countPredicates(predicates: FetchRequest['predicates']): number {
    return predicates.reduce((total, predicate) => {
      if ('predicates' in predicate) {
        return total + this.countPredicates(predicate.predicates);
      }

      return total + 1;
    }, 0);
  }
}
