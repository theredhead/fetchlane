/**
 * Supported parameter payloads for a fetch predicate.
 *
 * Use either positional parameters (`?`) with an array, or named parameters
 * (`:name`) with an object. A single `FetchRequest` must use only one mode.
 */
export type FetchPredicateArgs = unknown[] | Record<string, unknown>;

/**
 * Structured request body for the `/fetch` endpoint.
 */
export interface FetchRequest {
  /**
   * Source table name.
   */
  table: string;
  /**
   * Filter predicates to apply to the query.
   */
  predicates: FetchPredicate;
  /**
   * Sort order to apply to the query.
   */
  sort: Sort;
  /**
   * Optional pagination settings.
   */
  pagination?: FetchRequestPagination;
}

/**
 * Zero-based pagination settings for a fetch request.
 */
export interface FetchRequestPagination {
  /**
   * Number of rows per page.
   */
  size: number;
  /**
   * Zero-based page index.
   */
  index: number;
}

/**
 * Simple text predicate with bound argument values.
 */
export interface FetchSimplePredicteClause {
  /**
   * SQL predicate fragment that may use `?` or `:name` placeholders.
   */
  text: string;
  /**
   * Bound values for the placeholders declared in `text`.
   */
  args: FetchPredicateArgs;
}

/**
 * Compound predicate that nests child predicates with a boolean operator.
 */
export interface FetchCompoundPredicteClause {
  /**
   * Boolean operator combining the nested predicates.
   */
  type: 'AND' | 'OR';
  /**
   * Nested predicate clauses joined by the operator.
   */
  predicates: FetchPredicate;
}

/**
 * Single predicate clause used in a fetch request.
 */
export type FetchPredicteClause =
  | FetchSimplePredicteClause
  | FetchCompoundPredicteClause;

/**
 * Ordered collection of fetch predicates.
 */
export type FetchPredicate = FetchPredicteClause[];

/**
 * Ordered collection of sort clauses.
 */
export type Sort = SortClause[];

/**
 * Sort definition for a single column.
 */
export interface SortClause {
  /**
   * Column name to sort by.
   */
  column: string;
  /**
   * Sort direction.
   */
  direction: 'ASC' | 'DESC';
}
