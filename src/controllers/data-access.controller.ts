import { FetchRequest } from './../data/fetch-predicate.types';
import {
  ColumnDescription,
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
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Record } from 'src/data/database';
import { TableSchemaDescriptionDto } from 'src/swagger/models';

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
@Controller('api/data-access')
export class DataAccessController {
  /** Creates the generic data-access controller. */
  public constructor(
    private readonly db: DataAccessService,
    private readonly fetchRequestHandler: FetchRequestHandlerService,
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
              text: 'age > $1',
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
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
  })
  @Post('fetch')
  /** Executes a structured fetch request with predicates, sorting, and pagination. */
  public async fetch(@Body() request: FetchRequest) {
    try {
      return await this.fetchRequestHandler.handleRequest(request);
    } catch (error) {
      return {
        error,
      };
    }
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
  /** Lists the tables visible to the active database connection. */
  public async tableNames(): Promise<any> {
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
  /** Returns basic column metadata for a table. */
  public async tableInfo(@Param('table') table: string): Promise<any> {
    return await this.db.tableInfo(table);
  }

  @ApiOperation({ summary: 'Get column metadata for a table (legacy route)' })
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
  @Get('table/:table/info')
  /** Returns basic column metadata for a table using the legacy route. */
  public async tableInfoLegacy(@Param('table') table: string): Promise<any> {
    return await this.db.tableInfo(table);
  }

  @ApiOperation({
    summary: 'Get detailed schema metadata for a table',
  })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiOkResponse({ type: TableSchemaDescriptionDto })
  @Get(':table/schema')
  /** Returns a normalized schema description for a table. */
  public async describeTable(
    @Param('table') table: string,
  ): Promise<TableSchemaDescription | null> {
    return await this.db.describeTable(table);
  }

  @ApiOperation({
    summary: 'Get detailed schema metadata for a table (legacy route)',
  })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiOkResponse({ type: TableSchemaDescriptionDto })
  @Get('table/:table/schema')
  /** Returns a normalized schema description for a table using the legacy route. */
  public async describeTableLegacy(
    @Param('table') table: string,
  ): Promise<TableSchemaDescription | null> {
    return await this.db.describeTable(table);
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
  /** Returns a paginated list of rows from a table. */
  public async index(
    @Param('table') table: string,
    @Query('pageIndex') pageIndex = 0,
    @Query('pageSize') pageSize = 10,
  ): Promise<Record> {
    return await this.db.index(table, pageIndex, pageSize);
  }

  @ApiOperation({ summary: 'List records from a table (legacy route)' })
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
  @Get('table/:table')
  /** Returns a paginated list of rows from a table using the legacy route. */
  public async indexLegacy(
    @Param('table') table: string,
    @Query('pageIndex') pageIndex = 0,
    @Query('pageSize') pageSize = 10,
  ): Promise<Record> {
    return await this.db.index(table, pageIndex, pageSize);
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
  /** Creates a new record in the target table. */
  public async createRecord(
    @Param('table') table: string,
    @Body() record: Record,
  ): Promise<Record> {
    return await this.db.insert(table, record);
  }

  @ApiOperation({ summary: 'Get a single record by id' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @Get(':table/record/:id')
  /** Returns a single record by numeric `id`. */
  public async getRecordbyId(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Record> {
    return await this.db.selectSingleById(table, id);
  }

  @ApiOperation({ summary: 'Get a single column value from a record by id' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiParam({ name: 'column', example: 'email' })
  @ApiOkResponse({
    schema: {
      type: 'string',
      example: 'alice@example.com',
      nullable: true,
    },
  })
  @Get(':table/record/:id/column/:column')
  /** Returns a single column value from a record identified by numeric `id`. */
  public async getColumnFromRecordbyId(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('column') column: string,
  ): Promise<string> {
    return await this.db.getColumnFromRecordbyId(table, id, column);
  }

  @ApiOperation({ summary: 'Update a single column value for a record by id' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({ name: 'id', example: 1 })
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
  @Patch(':table/record/:id/column/:column')
  /** Updates a single column on a record identified by numeric `id`. */
  public async updateColumnForRecordById(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('column') column: string,
    @Body() value: string,
  ): Promise<Record> {
    return await this.db.updateColumnForRecordById(table, id, column, value);
  }

  @ApiOperation({ summary: 'Replace a record by id' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({ name: 'id', example: 1 })
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
  @Put(':table/record/:id')
  /** Replaces a record by numeric `id`. */
  public async updateRecord(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() record: Record,
  ): Promise<Record> {
    return await this.db.update(table, id, record);
  }

  @ApiOperation({ summary: 'Delete a record by id' })
  @ApiParam({ name: 'table', example: 'member' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @Delete(':table/record/:id')
  /** Deletes a record by numeric `id`. */
  public async deleteRecord(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Record> {
    return await this.db.delete(table, id);
  }

  @ApiOperation({ summary: 'Generate a CREATE TABLE script for a new table' })
  @ApiParam({ name: 'table', example: 'customer_notes' })
  @ApiBody({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type', 'nullable'],
        properties: {
          name: {
            type: 'string',
            example: 'note',
          },
          type: {
            type: 'string',
            example: 'text',
          },
          nullable: {
            type: 'boolean',
            example: false,
          },
        },
      },
      example: [
        {
          name: 'note',
          type: 'text',
          nullable: false,
        },
        {
          name: 'created_at',
          type: 'timestamp',
          nullable: false,
        },
      ],
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'string',
      example:
        'CREATE TABLE customer_notes (\n id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n note text NOT NULL\n)',
    },
  })
  @Post('tables/:table')
  /** Generates engine-specific SQL for creating a table. */
  public async createTable(
    @Param('table') table: string,
    @Body() columns: ColumnDescription[],
  ): Promise<string> {
    return await this.db.createTable(table, columns);
  }
}
