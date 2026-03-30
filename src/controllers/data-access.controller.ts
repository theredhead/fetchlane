import { FetchRequest } from './../data/fetch-predicate.types';
import {
  ColumnDescription,
  DataAccessService,
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
import { Record } from 'src/data/database';

/**
 * As is good practice, this controller follows REST principles:
 *
 * GET: read data from your API
 * POST: add new data to your API
 * PUT: update existing data with your API
 * PATCH: updates a subset of existing data with your API
 * DELETE: remove data (usually a single resource) from your API
 */
@Controller('api/data-access')
export class DataAccessController {
  constructor(
    private db: DataAccessService,
    private fetchRequestHandler: FetchRequestHandlerService,
  ) {}

  @Post('fetch')
  async fetch(@Body() request: FetchRequest) {
    try {
      return await this.fetchRequestHandler.handleRequest(request);
    } catch (error) {
      return {
        error,
      };
    }
  }

  @Get('table-names')
  async tableNames(): Promise<any> {
    return await this.db.getTableNames();
  }

  @Get(':table/info')
  async tableInfo(@Param('table') table: string): Promise<any> {
    return await this.db.tableInfo(table);
  }

  @Get('table/:table/info')
  async tableInfoLegacy(@Param('table') table: string): Promise<any> {
    return await this.db.tableInfo(table);
  }

  @Get(':table')
  async index(
    @Param('table') table: string,
    @Query('pageIndex') pageIndex = 0,
    @Query('pageSize') pageSize = 10,
  ): Promise<Record> {
    return await this.db.index(table, pageIndex, pageSize);
  }

  @Get('table/:table')
  async indexLegacy(
    @Param('table') table: string,
    @Query('pageIndex') pageIndex = 0,
    @Query('pageSize') pageSize = 10,
  ): Promise<Record> {
    return await this.db.index(table, pageIndex, pageSize);
  }

  @Post(':table')
  async createRecord(
    @Param('table') table: string,
    @Body() record: Record,
  ): Promise<Record> {
    return await this.db.insert(table, record);
  }

  @Get(':table/record/:id')
  async getRecordbyId(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Record> {
    return await this.db.selectSingleById(table, id);
  }

  @Get(':table/record/:id/column/:column')
  async getColumnFromRecordbyId(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('column') column: string,
  ): Promise<string> {
    return await this.db.getColumnFromRecordbyId(table, id, column);
  }

  @Patch(':table/record/:id/column/:column')
  async updateColumnForRecordById(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id,
    @Param('column') column,
    @Body() value: string,
  ): Promise<Record> {
    return await this.db.updateColumnForRecordById(table, id, column, value);
  }

  @Put(':table/record/:id')
  async updateRecord(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id,
    @Body() record: Record,
  ): Promise<Record> {
    return await this.db.update(table, id, record);
  }

  @Delete(':table/record/:id')
  async deleteRecord(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id,
  ): Promise<Record> {
    return await this.db.delete(table, id);
  }

  @Post(':table')
  async createTable(
    @Param('table') table: string,
    @Body() columns: ColumnDescription[],
  ) {
    return await this.db.createTable(table, columns);
  }
}
