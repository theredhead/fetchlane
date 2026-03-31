import { Provider } from '@nestjs/common';
import { readDatabaseUrlFromEnvironment } from '../db.conf';
import {
  createDatabaseEngineRegistry,
  DatabaseEngine,
  DatabaseEngineRegistry,
} from './database-engine';
import { Database } from './database';
import { mySqlDatabaseEngine } from './mysql/mysql-engine';
import { postgresDatabaseEngine } from './postgres/postgres-engine';

export const DATABASE_ENGINES = Symbol('DATABASE_ENGINES');
export const ACTIVE_DATABASE_ENGINE = Symbol('ACTIVE_DATABASE_ENGINE');
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

const supportedDatabaseEngines: readonly DatabaseEngine[] = [
  postgresDatabaseEngine,
  mySqlDatabaseEngine,
];

export const databaseProviders: Provider[] = [
  {
    provide: DATABASE_ENGINES,
    useFactory: (): DatabaseEngineRegistry =>
      createDatabaseEngineRegistry(supportedDatabaseEngines),
  },
  {
    provide: ACTIVE_DATABASE_ENGINE,
    inject: [DATABASE_ENGINES],
    useFactory: (registry: DatabaseEngineRegistry): DatabaseEngine => {
      const config = readDatabaseUrlFromEnvironment();
      const engine = registry.get(config.engine);

      if (engine) {
        return engine;
      }

      const supportedEngines = [...registry.keys()].sort().join(', ');
      throw new Error(
        `Unsupported database engine "${config.engine}". Supported engines: ${supportedEngines}`,
      );
    },
  },
  {
    provide: DATABASE_CONNECTION,
    inject: [ACTIVE_DATABASE_ENGINE],
    useFactory: async (engine: DatabaseEngine): Promise<Database> =>
      await engine.createDatabase(readDatabaseUrlFromEnvironment()),
  },
];
