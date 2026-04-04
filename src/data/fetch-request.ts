import { BadRequestException, Logger } from '@nestjs/common';
import { badRequest } from '../errors/api-error';
import {
  FetchCompoundPredicteClause,
  FetchPredicteClause,
  FetchPredicateArgs,
  FetchRequest,
  FetchSimplePredicteClause,
  Sort,
} from './fetch-predicate.types';

type FetchParameterMode = 'named' | 'positional' | null;

interface PlaceholderState {
  args: unknown[];
  index: number;
  mode: FetchParameterMode;
}

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
    private readonly renderParameter: (index: number) => string = (index) =>
      `$${index}`,
    private readonly paginateQuery: (
      baseQuery: string,
      limit: number,
      offset: number,
      orderByClause: string | null,
    ) => string = (baseQuery, limit, offset, orderByClause) =>
      [baseQuery, orderByClause, `LIMIT ${limit} OFFSET ${offset}`]
        .filter(Boolean)
        .join('\n'),
    private readonly maxPageSize = 1000,
  ) {}

  /**
   * Quotes a table or column name using the active engine rules.
   */
  public quote(objectName: string): string {
    return this.quoteObjectName(objectName);
  }

  /**
   * Renders a fetch request into SQL text and bound arguments.
   */
  public write(request: FetchRequest): { text: string; args: unknown[] } {
    this.validateRequestShape(request);

    const state: PlaceholderState = {
      args: [],
      index: 1,
      mode: null,
    };

    const orderByClause =
      request.sort.length > 0 ? this.expandSort(request.sort) : null;
    const baseQuery = [
      'SELECT *',
      'FROM ' + this.quote(request.table),
      request.predicates.length > 0 ? 'WHERE' : null,
      request.predicates.length
        ? request.predicates
            .map((predicate) => this.expandPredicate(predicate, state))
            .join(' AND ')
        : null,
    ]
      .filter((segment) => segment !== null)
      .join('\n');

    const text = request.pagination
      ? this.expandPagination(baseQuery, request.pagination, orderByClause)
      : [baseQuery, orderByClause].filter(Boolean).join('\n');

    this.logger.verbose(text);
    return { text, args: state.args };
  }

  protected expandPredicate(
    clause: FetchPredicteClause,
    state: PlaceholderState,
  ): string {
    if (Object.prototype.hasOwnProperty.call(clause, 'type')) {
      return this.expandCompoundPredicateClause(
        clause as FetchCompoundPredicteClause,
        state,
      );
    }

    return this.expandSimplePredicateClause(
      clause as FetchSimplePredicteClause,
      state,
    );
  }

  protected expandSimplePredicateClause(
    clause: FetchSimplePredicteClause,
    state: PlaceholderState,
  ): string {
    const placeholderMode = detectClausePlaceholderMode(clause.text);

    if (!placeholderMode) {
      this.ensureEmptyArgs(clause.args, clause.text);
      return `(${clause.text})`;
    }

    if (state.mode == null) {
      state.mode = placeholderMode;
    } else if (state.mode !== placeholderMode) {
      throw new BadRequestException(
        'FetchRequest cannot mix positional and named parameters within the same request.',
      );
    }

    if (placeholderMode === 'positional') {
      if (!Array.isArray(clause.args)) {
        throw new BadRequestException(
          'Positional FetchRequest predicates must provide args as an array.',
        );
      }

      const placeholderCount = countPositionalPlaceholders(clause.text);
      if (clause.args.length !== placeholderCount) {
        throw new BadRequestException(
          `Positional FetchRequest predicate "${clause.text}" expected ${placeholderCount} argument(s) but received ${clause.args.length}.`,
        );
      }

      let localIndex = 0;
      const renderedText = clause.text.replace(/\?/g, () => {
        const value = clause.args[localIndex++];
        state.args.push(value);
        return this.renderParameter(state.index++);
      });

      return `(${renderedText})`;
    }

    if (Array.isArray(clause.args) || clause.args == null) {
      throw new BadRequestException(
        'Named FetchRequest predicates must provide args as an object.',
      );
    }

    const renderedText = clause.text.replace(
      /(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, prefix: string, name: string) => {
        if (!Object.prototype.hasOwnProperty.call(clause.args, name)) {
          throw new BadRequestException(
            `Named FetchRequest predicate "${clause.text}" is missing the value for ":${name}".`,
          );
        }

        state.args.push((clause.args as Record<string, unknown>)[name]);
        return `${prefix}${this.renderParameter(state.index++)}`;
      },
    );

    return `(${renderedText})`;
  }

  protected expandCompoundPredicateClause(
    clause: FetchCompoundPredicteClause,
    state: PlaceholderState,
  ): string {
    if (!Array.isArray(clause.predicates) || clause.predicates.length === 0) {
      throw new BadRequestException(
        'Compound FetchRequest predicates must contain at least one child predicate.',
      );
    }

    return [
      '(',
      clause.predicates
        .map((predicate) => this.expandPredicate(predicate, state))
        .join(` ${clause.type} `),
      ')',
    ].join('');
  }

  protected expandSort(sort: Sort): string {
    const renderedSort = sort
      .map((clause) => {
        if (
          !clause ||
          typeof clause.column !== 'string' ||
          !clause.column.trim() ||
          (clause.direction !== 'ASC' && clause.direction !== 'DESC')
        ) {
          throw new BadRequestException(
            'FetchRequest sort clauses must define a column and direction of ASC or DESC.',
          );
        }

        return `${this.quote(clause.column)} ${clause.direction}`;
      })
      .join(', ');

    return ['ORDER BY', renderedSort].join(' ');
  }

  protected expandPagination(
    baseQuery: string,
    pagination: { index: number; size: number },
    orderByClause: string | null,
  ): string {
    const limit = Number(pagination.size);
    const pageIndex = Number(pagination.index);

    if (!Number.isInteger(limit) || limit <= 0 || limit > this.maxPageSize) {
      throw badRequest(
        `FetchRequest pagination.size must be an integer between 1 and ${this.maxPageSize}.`,
        `Choose a page size from 1 to ${this.maxPageSize}, or increase limits.fetchMaxPageSize in the runtime config if larger pages are required.`,
      );
    }

    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new BadRequestException(
        'FetchRequest pagination.index must be a non-negative integer.',
      );
    }

    const offset = pageIndex * limit;
    return this.paginateQuery(baseQuery, limit, offset, orderByClause);
  }

  private ensureEmptyArgs(args: FetchPredicateArgs, text: string): void {
    if (Array.isArray(args)) {
      if (args.length === 0) {
        return;
      }
    } else if (args && Object.keys(args).length === 0) {
      return;
    }

    throw new BadRequestException(
      `FetchRequest predicate "${text}" does not contain placeholders, so args must be empty.`,
    );
  }

  private validateRequestShape(request: FetchRequest): void {
    if (
      !request ||
      typeof request.table !== 'string' ||
      !request.table.trim()
    ) {
      throw new BadRequestException(
        'FetchRequest.table must be a non-empty string.',
      );
    }

    if (!Array.isArray(request.predicates)) {
      throw new BadRequestException(
        'FetchRequest.predicates must be an array.',
      );
    }

    if (!Array.isArray(request.sort)) {
      throw new BadRequestException('FetchRequest.sort must be an array.');
    }
  }
}

function detectClausePlaceholderMode(text: string): FetchParameterMode {
  const positionalCount = countPositionalPlaceholders(text);
  const namedCount = countNamedPlaceholders(text);

  if (positionalCount > 0 && namedCount > 0) {
    throw new BadRequestException(
      `FetchRequest predicate "${text}" cannot mix positional and named parameters.`,
    );
  }

  if (namedCount > 0) {
    return 'named';
  }

  if (positionalCount > 0) {
    return 'positional';
  }

  return null;
}

function countPositionalPlaceholders(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function countNamedPlaceholders(text: string): number {
  return text.match(/(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g)?.length ?? 0;
}
