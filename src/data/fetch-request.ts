import { Logger } from '@nestjs/common';
import {
  FetchCompoundPredicteClause,
  FetchPredicteClause,
  FetchRequest,
  FetchSimplePredicteClause,
  Sort,
} from './fetch-predicate.types';

export class FetchRequestSQLWriter {
  private logger = new Logger('FetchRequestSQLWriter');

  constructor(
    private readonly quoteObjectName: (objectName: string) => string = (
      objectName,
    ) => ['"', objectName, '"'].join(''),
  ) {}

  quote(objectName: string): string {
    return this.quoteObjectName(objectName);
  }

  write(request: FetchRequest) {
    const args = [];
    const text = [
      'SELECT * ',
      'FROM ' + this.quote(request.table),
      request.predicates.length > 0 ? 'WHERE' : null,
      request.predicates.length
        ? request.predicates
            .map((p) => this.expandPredicate(p, args))
            .join(' AND ')
        : null,
      request.sort.length > 0 ? this.expandSort(request.sort) : null,
      request.pagination ? this.expandPagination(request.pagination) : null,
    ]
      .filter((segment) => segment !== null)
      .join('\n');

    this.logger.verbose(text);
    return { text, args };
  }

  protected expandPredicate(clause: FetchPredicteClause, args: any[]) {
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
  ) {
    args.push(clause.args);
    return `(${clause.text})`;
  }

  protected expandCompoundPredicateClause(
    clause: FetchCompoundPredicteClause,
    args: any[],
  ) {
    return [
      '(',
      clause.predicates
        .map((p) => this.expandPredicate(p, args))
        .join(` ${clause.type} `),
      ')',
    ].join('');
  }

  protected expandSort(sort: Sort) {
    return [
      'ORDER BY ',
      sort.map((clause) => `${clause.column} ${clause.direction}`).join(', '),
    ].join('');
  }

  protected expandPagination(pagination: { index: number; size: number }) {
    const limit = Number(pagination.size);
    const offset = Number(pagination.index) * limit;
    return `LIMIT ${limit} OFFSET ${offset}`;
  }
}
