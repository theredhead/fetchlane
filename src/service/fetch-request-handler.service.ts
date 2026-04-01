import { Inject, Injectable } from '@nestjs/common';
import { Record, RecordSet } from '../data/database';
import { DatabaseEngine } from '../data/database-engine';
import { FetchRequest } from '../data/fetch-predicate.types';
import { FetchRequestSQLWriter } from '../data/fetch-request';
import { ACTIVE_DATABASE_ENGINE } from '../data/database.providers';
import { DataAccessService } from './data-access.service';

export interface FetchResponse<T extends Record> extends RecordSet {
  rows: T[];
}

@Injectable()
export class FetchRequestHandlerService {
  private writer: FetchRequestSQLWriter;

  constructor(
    private db: DataAccessService,
    @Inject(ACTIVE_DATABASE_ENGINE) engine: DatabaseEngine,
  ) {
    this.writer = new FetchRequestSQLWriter(
      (name) => engine.quoteIdentifier(name),
      (baseQuery, limit, offset, orderByClause) =>
        engine.paginateQuery(baseQuery, limit, offset, orderByClause),
    );
  }

  async handleRequest<T extends Record>(
    request: FetchRequest,
  ): Promise<FetchResponse<T>> {
    const cmd = this.writer.write(request);
    const result = await this.db.execute(cmd.text, cmd.args);
    return <FetchResponse<T>>result;
  }
}
