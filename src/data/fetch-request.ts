import { Logger } from '@nestjs/common';
import {
  FetchCompoundPredicteClause,
  FetchPredicteClause,
  FetchRequest,
  FetchSimplePredicteClause,
  Sort,
} from './fetch-predicate.types';

/**
 * Converts a structured fetch request into executable SQL plus bound arguments.
 */
export class FetchRequestSQLWriter {
  private readonly logger = new Logger('FetchRequestSQLWriter');

  /**
   * Creates a SQL writer with pluggable identifier quoting and pagination rules.
   */
  public constructor(
    private readonly quoteObjectName: (objectName: string) => string = (
      objectName,
    ) => ['"', objectName, '"'].join(''),
    private readonly paginateQuery: (
      baseQuery: string,
      limit: number,
      offset: number,
      orderByClause: string | null,
    ) => string = (baseQuery, limit, offset, orderByClause) =>
      [baseQuery, orderByClause, `LIMIT ${limit} OFFSET ${offset}`]
        .filter(Boolean)
        .join('\n'),
  ) {}

  /** Quotes a table or column name using the active engine rules. */
  public quote(objectName: string): string {
    return this.quoteObjectName(objectName);
  }

  /** Renders a fetch request into SQL text and bound arguments. */
  public write(request: FetchRequest): { text: string; args: any[] } {
    const args = [];
    const orderByClause =
      request.sort.length > 0 ? this.expandSort(request.sort) : null;
    const baseQuery = [
      'SELECT * ',
      'FROM ' + this.quote(request.table),
      request.predicates.length > 0 ? 'WHERE' : null,
      request.predicates.length
        ? request.predicates
            .map((p) => this.expandPredicate(p, args))
            .join(' AND ')
        : null,
    ]
      .filter((segment) => segment !== null)
      .join('\n');
    const text = request.pagination
      ? this.expandPagination(baseQuery, request.pagination, orderByClause)
      : [baseQuery, orderByClause].filter(Boolean).join('\n');

    this.logger.verbose(text);
    return { text, args };
  }

  protected expandPredicate(clause: FetchPredicteClause, args: any[]): string {
    if (clause.hasOwnProperty('type')) {
      return this.expandCompoundPredicateClause(
        <FetchCompoundPredicteClause>clause,
        args,
      );
    } else {
      return this.expandSimplePredicateClause(
        <FetchSimplePredicteClause>clause,
        args,
      );
    }
  }

  protected expandSimplePredicateClause(
    clause: FetchSimplePredicteClause,
    args: any[],
  ): string {
    args.push(clause.args);
    return `(${clause.text})`;
  }

  protected expandCompoundPredicateClause(
    clause: FetchCompoundPredicteClause,
    args: any[],
  ): string {
    return [
      '(',
      clause.predicates
        .map((p) => this.expandPredicate(p, args))
        .join(` ${clause.type} `),
      ')',
    ].join('');
  }

  protected expandSort(sort: Sort): string {
    return [
      'ORDER BY ',
      sort.map((clause) => `${clause.column} ${clause.direction}`).join(', '),
    ].join('');
  }

  protected expandPagination(
    baseQuery: string,
    pagination: { index: number; size: number },
    orderByClause: string | null,
  ): string {
    const limit = Number(pagination.size);
    const offset = Number(pagination.index) * limit;
    return this.paginateQuery(baseQuery, limit, offset, orderByClause);
  }
}
