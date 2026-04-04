import {
  FetchPredicateArgs,
  FetchRequest,
  FetchSimplePredicteClause,
  Sort,
} from './fetch-predicate.types';

/**
 * Default page size used by the fetch request builder when no size is
 * specified through the fluent API.
 */
const DEFAULT_FETCH_PAGE_SIZE = 100;

/**
 * Creates a fluent builder for a fetch request targeting the given table.
 */
export function from(table: string): FetchRequestBuilder {
  return new FetchRequestBuilder(table);
}

/**
 * Raw predicate fragment that can be appended to a fetch request.
 */
export interface WhereClause {
  text: string;
  args: FetchPredicateArgs;
}

/**
 * Fluent builder for constructing `FetchRequest` payloads.
 */
export class FetchRequestBuilder {
  /**
   * Mutable request object assembled by the builder.
   */
  public readonly request: FetchRequest = {
    table: '',
    predicates: [],
    sort: [],
    pagination: {
      index: 0,
      size: DEFAULT_FETCH_PAGE_SIZE,
    },
  };

  /**
   * Creates a new builder for the supplied table.
   */
  public constructor(table: string) {
    this.request.table = table;
  }

  /**
   * Adds a simple SQL predicate or a batch of prebuilt where clauses.
   */
  public where(where: WhereClause[]): FetchRequestBuilder;
  /**
   * Adds a simple SQL predicate or a batch of prebuilt where clauses.
   */
  public where(text: string, ...args: any[]): FetchRequestBuilder;
  public where(...args: any[]): FetchRequestBuilder {
    if (args.length === 1) {
      return this._whereByAddingWhereClauseArray(args[0]);
    }
    return this._whereByAddingFetchSimplePredicteClause(args[0], args.slice(1));
  }

  /**
   * Groups predicates with `AND`.
   */
  public whereAnd(predicates: FetchSimplePredicteClause[]) {
    this.request.predicates.push({ type: 'AND', predicates });
    return this;
  }

  /**
   * Groups predicates with `OR`.
   */
  public whereOr(predicates: FetchSimplePredicteClause[]) {
    this.request.predicates.push({ type: 'OR', predicates });
    return this;
  }

  /**
   * Replaces or appends sort definitions for the fetch request.
   */
  public orderBy(clauses: Sort): FetchRequestBuilder;
  /**
   * Replaces or appends sort definitions for the fetch request.
   */
  public orderBy(
    column: string,
    direction: 'ASC' | 'DESC',
  ): FetchRequestBuilder;
  public orderBy(...args: any[]): FetchRequestBuilder {
    if (args.length === 1 && Array.isArray(args[0])) {
      return this._orderBySortClausesArray(args[0]);
    }
    return this._orderByColumnAndDirection(args[0], args[1]);
  }

  /**
   * Applies zero-based pagination to the request.
   */
  public paginate(
    pageSize: number,
    pageIndex: number = 0,
  ): FetchRequestBuilder {
    this.request.pagination.size = pageSize;
    this.request.pagination.index = pageIndex;
    return this;
  }

  private _whereByAddingFetchSimplePredicteClause(
    text: string,
    ...args: any[]
  ) {
    this.request.predicates.push({ text, args: args[0] ?? [] });
    return this;
  }

  private _whereByAddingWhereClauseArray(where: WhereClause[]) {
    this.request.predicates.push(...where);
    return this;
  }

  private _orderBySortClausesArray(clauses: Sort): FetchRequestBuilder {
    this.request.sort = clauses;
    return this;
  }

  private _orderByColumnAndDirection(
    column: string,
    direction: 'ASC' | 'DESC',
  ): FetchRequestBuilder {
    this.request.sort.push({ column, direction });
    return this;
  }
}

// const req = from('users').where('login = ?', 'kris')
