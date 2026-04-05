import { FetchRequest } from './../data/fetch-predicate.types';
import {
  DataAccessService,
  TableSchemaDescription,
} from './../service/data-access.service';
import { FetchRequestHandlerService } from './../service/fetch-request-handler.service';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthorizationService } from '../authentication/authorization.service';
import { RuntimeConfigService } from '../config/runtime-config';
import {
  Record,
  RecordSet,
  PrimaryKeyValue,
  PrimaryKeyColumn,
} from '../data/database';
import { badRequest, notFound, serviceUnavailable } from '../errors/api-error';
import { TableSchemaDescriptionDto } from '../swagger/models';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$.]*$/;

/**
 * Default page size for the simple GET /:table endpoint when the caller
 * does not provide a pageSize query parameter.
 */
const DEFAULT_QUERY_PAGE_SIZE = 100;

/**
 * As is good practice, this controller follows REST principles:
 *
 * GET: read data from your API
 * POST: add new data to your API
 * PUT: update existing data with your API
 * PATCH: updates a subset of existing data with your API
 * DELETE: remove data (usually a single resource) from your API
 */
@ApiTags('data-access')
@ApiBearerAuth('bearer')
@Controller('api/data-access')
export class DataAccessController {
  /**
   * Creates the Fetchlane data-access controller.
   */
  public constructor(
    private readonly db: DataAccessService,
    private readonly fetchRequestHandler: FetchRequestHandlerService,
    private readonly authz: AuthorizationService,
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

  @ApiOperation({
    summary: 'Fetch table data using predicates, sorting, and pagination',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['table', 'predicates', 'sort'],
      properties: {
        table: {
          type: 'string',
          example: 'member',
        },
        predicates: {
          type: 'array',
          example: [
            {
              text: 'age > ?',
              args: [18],
            },
          ],
        },
        sort: {
          type: 'array',
          example: [
            {
              column: 'name',
              direction: 'ASC',
            },
          ],
        },
        pagination: {
          type: 'object',
          properties: {
            size: {
              type: 'number',
              example: 25,
            },
            index: {
              type: 'number',
              example: 0,
            },
          },
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },
        info: {
          type: 'object',
          additionalProperties: true,
        },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
  })
  @Post('fetch')
  /**
   * Executes a structured fetch request with predicates, sorting, and pagination.
   */
  public async fetch(
    @Req() req: Request,
    @Body() request: FetchRequest,
  ): Promise<RecordSet> {
    this.validateFetchRequestEnvelope(request);
    this.authz.authorizeCrud(req, request.table, 'read');
    return await this.fetchRequestHandler.handleRequest(request);
  }

  @ApiOperation({ summary: 'List public tables in the database' })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            example: 'member',
          },
          table_type: {
            type: 'string',
            example: 'BASE TABLE',
          },
        },
      },
    },
  })
  @Get('table-names')
  /**
   * Lists the tables visible to the active database connection.
   */
  public async tableNames(@Req() req: Request): Promise<Record[]> {
    this.requireSchemaFeatures();
    this.authz.authorizeSchemaAccess(req);
    return await this.db.getTableNames();
  }

  @ApiOperation({ summary: 'Get column metadata for a table' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
  })
  @Get(':table/info')
  /**
   * Returns basic column metadata for a table.
   */
  public async tableInfo(
    @Req() req: Request,
    @Param('table') table: string,
  ): Promise<Record[]> {
    this.requireSchemaFeatures();
    this.authz.authorizeSchemaAccess(req);
    return await this.db.tableInfo(this.validateIdentifier(table, 'table'));
  }

  @ApiOperation({
    summary: 'Get detailed schema metadata for a table',
  })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiOkResponse({ type: TableSchemaDescriptionDto })
  @Get(':table/schema')
  /**
   * Returns a normalized schema description for a table.
   */
  public async describeTable(
    @Req() req: Request,
    @Param('table') table: string,
  ): Promise<TableSchemaDescription | null> {
    this.requireSchemaFeatures();
    this.authz.authorizeSchemaAccess(req);
    return await this.db.describeTable(this.validateIdentifier(table, 'table'));
  }

  @ApiOperation({ summary: 'List records from a table' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiQuery({ name: 'pageIndex', required: false, example: 0 })
  @ApiQuery({ name: 'pageSize', required: false, example: 10 })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
  })
  @Get(':table')
  /**
   * Returns a paginated list of rows from a table.
   */
  public async index(
    @Req() req: Request,
    @Param('table') table: string,
    @Query('pageIndex') pageIndex: number | string = 0,
    @Query('pageSize') pageSize: number | string = DEFAULT_QUERY_PAGE_SIZE,
  ): Promise<Record[]> {
    const validatedTable = this.validateIdentifier(table, 'table');
    this.authz.authorizeCrud(req, validatedTable, 'read');
    return await this.db.index(
      validatedTable,
      this.parsePageIndex(pageIndex),
      this.parsePageSize(pageSize),
    );
  }

  @ApiOperation({ summary: 'Create a record in a table' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        name: 'Alice',
        email: 'alice@example.com',
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @Post(':table')
  /**
   * Creates a new record in the target table.
   */
  public async createRecord(
    @Req() req: Request,
    @Param('table') table: string,
    @Body() record: Record,
  ): Promise<Record> {
    const validatedTable = this.validateIdentifier(table, 'table');
    this.authz.authorizeCrud(req, validatedTable, 'create');
    return await this.db.insert(
      validatedTable,
      this.validateRecordBody(record, 'create'),
    );
  }

  @ApiOperation({ summary: 'Get a single record by primary key' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({
    name: 'primaryKey',
    example: '42',
    description:
      'Primary key value. For composite keys, use comma-separated values matching the column order (e.g. "42,2023-01-15").',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @Get(':table/record/:primaryKey')
  /**
   * Returns a single record by primary key.
   */
  public async getRecord(
    @Req() req: Request,
    @Param('table') table: string,
    @Param('primaryKey') primaryKeyPath: string,
  ): Promise<Record> {
    const validatedTable = this.validateIdentifier(table, 'table');
    this.authz.authorizeCrud(req, validatedTable, 'read');
    const primaryKey = await this.resolvePrimaryKey(
      validatedTable,
      primaryKeyPath,
    );
    return await this.db.selectSingleByPrimaryKey(validatedTable, primaryKey);
  }

  @ApiOperation({ summary: 'Get a single column value from a record' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({
    name: 'primaryKey',
    example: '42',
    description:
      'Primary key value. For composite keys, use comma-separated values.',
  })
  @ApiParam({ name: 'column', example: 'email' })
  @ApiOkResponse({
    schema: {
      type: 'string',
      example: 'alice@example.com',
      nullable: true,
    },
  })
  @Get(':table/record/:primaryKey/column/:column')
  /**
   * Returns a single column value from a record identified by primary key.
   */
  public async getColumnFromRecord(
    @Req() req: Request,
    @Param('table') table: string,
    @Param('primaryKey') primaryKeyPath: string,
    @Param('column') column: string,
  ): Promise<string | null> {
    const validatedTable = this.validateIdentifier(table, 'table');
    this.authz.authorizeCrud(req, validatedTable, 'read');
    const primaryKey = await this.resolvePrimaryKey(
      validatedTable,
      primaryKeyPath,
    );
    return await this.db.getColumnFromRecord(
      validatedTable,
      primaryKey,
      this.validateIdentifier(column, 'column'),
    );
  }

  @ApiOperation({ summary: 'Update a single column value for a record' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({
    name: 'primaryKey',
    example: '42',
    description:
      'Primary key value. For composite keys, use comma-separated values.',
  })
  @ApiParam({ name: 'column', example: 'email' })
  @ApiBody({
    schema: {
      type: 'string',
      example: 'alice@example.com',
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @Patch(':table/record/:primaryKey/column/:column')
  /**
   * Updates a single column on a record identified by primary key.
   */
  public async updateColumnForRecord(
    @Req() req: Request,
    @Param('table') table: string,
    @Param('primaryKey') primaryKeyPath: string,
    @Param('column') column: string,
    @Body() value: unknown,
  ): Promise<Record> {
    const validatedTable = this.validateIdentifier(table, 'table');
    this.authz.authorizeCrud(req, validatedTable, 'update');
    const primaryKey = await this.resolvePrimaryKey(
      validatedTable,
      primaryKeyPath,
    );
    return await this.db.updateColumnForRecord(
      validatedTable,
      primaryKey,
      this.validateIdentifier(column, 'column'),
      value,
    );
  }

  @ApiOperation({ summary: 'Replace a record by primary key' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({
    name: 'primaryKey',
    example: '42',
    description:
      'Primary key value. For composite keys, use comma-separated values.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        name: 'Alice',
        email: 'alice@example.com',
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @Put(':table/record/:primaryKey')
  /**
   * Replaces a record by primary key.
   */
  public async updateRecord(
    @Req() req: Request,
    @Param('table') table: string,
    @Param('primaryKey') primaryKeyPath: string,
    @Body() record: Record,
  ): Promise<Record> {
    const validatedTable = this.validateIdentifier(table, 'table');
    this.authz.authorizeCrud(req, validatedTable, 'update');
    const primaryKey = await this.resolvePrimaryKey(
      validatedTable,
      primaryKeyPath,
    );
    return await this.db.update(
      validatedTable,
      primaryKey,
      this.validateRecordBody(record, 'update'),
    );
  }

  @ApiOperation({ summary: 'Delete a record by primary key' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({
    name: 'primaryKey',
    example: '42',
    description:
      'Primary key value. For composite keys, use comma-separated values.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @Delete(':table/record/:primaryKey')
  /**
   * Deletes a record by primary key.
   */
  public async deleteRecord(
    @Req() req: Request,
    @Param('table') table: string,
    @Param('primaryKey') primaryKeyPath: string,
  ): Promise<Record> {
    const validatedTable = this.validateIdentifier(table, 'table');
    this.authz.authorizeCrud(req, validatedTable, 'delete');
    const primaryKey = await this.resolvePrimaryKey(
      validatedTable,
      primaryKeyPath,
    );
    return await this.db.delete(validatedTable, primaryKey);
  }

  private async resolvePrimaryKey(
    table: string,
    primaryKeyPath: string,
  ): Promise<PrimaryKeyValue> {
    const segments = primaryKeyPath
      .split(',')
      .map((segment) => decodeURIComponent(segment.trim()))
      .filter(Boolean);

    if (segments.length === 0) {
      throw badRequest(
        'Primary key path must contain at least one value.',
        'Provide one or more comma-separated primary key values in the URL, for example /record/42 or /record/42,2023-01-15.',
      );
    }

    const primaryKeyColumns = await this.db.getPrimaryKeyColumns(table);

    if (primaryKeyColumns.length === 0) {
      throw serviceUnavailable(
        `No primary key metadata is available for table "${table}".`,
        'Ensure the table has a primary key constraint, or configure a primaryKeys override in the runtime config.',
      );
    }

    if (segments.length !== primaryKeyColumns.length) {
      const columnNames = primaryKeyColumns
        .map((column) => column.column)
        .join(', ');
      throw badRequest(
        `Expected ${primaryKeyColumns.length} primary key value(s) (${columnNames}) but received ${segments.length}.`,
        `Provide exactly ${primaryKeyColumns.length} comma-separated value(s) matching the primary key columns: ${columnNames}.`,
      );
    }

    const primaryKey: PrimaryKeyValue = {};
    for (let index = 0; index < primaryKeyColumns.length; index++) {
      primaryKey[primaryKeyColumns[index].column] = this.coercePrimaryKeyValue(
        segments[index],
        primaryKeyColumns[index],
      );
    }

    return primaryKey;
  }

  private coercePrimaryKeyValue(
    rawValue: string,
    column: PrimaryKeyColumn,
  ): unknown {
    const integerTypes = [
      'integer',
      'int',
      'smallint',
      'bigint',
      'tinyint',
      'serial',
      'bigserial',
    ];

    if (integerTypes.includes(column.dataType.toLowerCase())) {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        throw badRequest(
          `Primary key column "${column.column}" expects an integer but received "${rawValue}".`,
          `Provide a valid integer value for the "${column.column}" column.`,
        );
      }
      return parsed;
    }

    return rawValue;
  }

  private requireSchemaFeatures(): void {
    if (!this.runtimeConfig.isSchemaFeaturesEnabled()) {
      throw notFound(
        'Schema features are disabled.',
        'Set enableSchemaFeatures to true in the runtime config to enable schema endpoints.',
      );
    }
  }

  private parsePageIndex(value: number | string): number {
    const parsed = this.parseIntegerQueryValue(value, 'pageIndex');

    if (parsed < 0) {
      throw badRequest(
        'Query parameter "pageIndex" must be a non-negative integer.',
        'Use zero for the first page, then increment by whole numbers for subsequent pages.',
      );
    }

    return parsed;
  }

  private parsePageSize(value: number | string): number {
    const parsed = this.parseIntegerQueryValue(value, 'pageSize');
    const maxPageSize = this.runtimeConfig.getLimits().fetchMaxPageSize;

    if (parsed <= 0 || parsed > maxPageSize) {
      throw badRequest(
        `Query parameter "pageSize" must be an integer between 1 and ${maxPageSize}.`,
        `Choose a page size from 1 to ${maxPageSize} so the API can paginate safely.`,
      );
    }

    return parsed;
  }

  private parseIntegerQueryValue(
    value: number | string,
    parameterName: string,
  ): number {
    if (Array.isArray(value)) {
      throw badRequest(
        `Query parameter "${parameterName}" must be a single integer value.`,
        `Pass "${parameterName}" once in the query string, for example ?${parameterName}=10.`,
      );
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      throw badRequest(
        `Query parameter "${parameterName}" must be an integer.`,
        `Provide "${parameterName}" as a whole number, without decimals or text.`,
      );
    }

    return parsed;
  }

  private validateIdentifier(value: string, label: 'table' | 'column'): string {
    const normalized = typeof value === 'string' ? value.trim() : '';

    if (!normalized) {
      throw badRequest(
        `Route parameter "${label}" must be a non-empty identifier.`,
        `Provide a valid ${label} name such as "member" or "public.member".`,
      );
    }

    if (!IDENTIFIER_PATTERN.test(normalized)) {
      throw badRequest(
        `Route parameter "${label}" contains unsupported characters.`,
        `Use only letters, numbers, underscores, dots, and dollar signs in ${label} names, starting with a letter or underscore.`,
      );
    }

    return normalized;
  }

  private validateRecordBody(
    record: unknown,
    action: 'create' | 'update',
  ): Record {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw badRequest(
        `Request body for ${action} must be a JSON object.`,
        `Send an object with column names as properties when you ${action} a record.`,
      );
    }

    if (Object.keys(record).length === 0) {
      throw badRequest(
        `Request body for ${action} must contain at least one property.`,
        `Provide one or more column values when you ${action} a record.`,
      );
    }

    return record as Record;
  }

  private validateFetchRequestEnvelope(request: unknown): void {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw badRequest(
        'FetchRequest body must be a JSON object.',
        'Send an object with table, predicates, sort, and optional pagination fields.',
      );
    }
  }
}
