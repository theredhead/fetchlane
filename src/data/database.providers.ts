import { Provider } from '@nestjs/common';
import { RuntimeConfigService } from '../config/runtime-config';
import {
  createDatabaseAdapterRegistry,
  DatabaseAdapter,
  DatabaseAdapterConstructor,
  DatabaseAdapterRegistry,
} from './database';
import { MySqlDatabase } from './mysql/mysql-database';
import { PostgresDatabase } from './postgres/postgres-database';
import { SqlServerDatabase } from './sqlserver/sqlserver-database';

/** Injection token for the registry of supported database adapters. */
export const DATABASE_ADAPTERS = Symbol('DATABASE_ADAPTERS');
/** Injection token for the adapter constructor selected from runtime config. */
export const ACTIVE_DATABASE_ADAPTER = Symbol('ACTIVE_DATABASE_ADAPTER');
/** Injection token for the active database connection. */
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

const supportedDatabaseAdapters: readonly DatabaseAdapterConstructor[] = [
  PostgresDatabase,
  MySqlDatabase,
  SqlServerDatabase,
];

/** Nest providers that register and connect the active database adapter. */
export const databaseProviders: Provider[] = [
  {
    provide: DATABASE_ADAPTERS,
    useFactory: (): DatabaseAdapterRegistry =>
      createDatabaseAdapterRegistry(supportedDatabaseAdapters),
  },
  {
    provide: ACTIVE_DATABASE_ADAPTER,
    inject: [DATABASE_ADAPTERS, RuntimeConfigService],
    useFactory: (
      registry: DatabaseAdapterRegistry,
      runtimeConfig: RuntimeConfigService,
    ): DatabaseAdapterConstructor => {
      const config = runtimeConfig.getParsedDatabaseUrl();
      const adapter = registry.get(config.engine);

      if (adapter) {
        return adapter;
      }

      const supportedEngines = [...registry.keys()].sort().join(', ');
      throw new Error(
        `Unsupported database engine "${config.engine}". Supported engines: ${supportedEngines}`,
      );
    },
  },
  {
    provide: DATABASE_CONNECTION,
    inject: [ACTIVE_DATABASE_ADAPTER, RuntimeConfigService],
    useFactory: async (
      Adapter: DatabaseAdapterConstructor,
      runtimeConfig: RuntimeConfigService,
    ): Promise<DatabaseAdapter> =>
      new Adapter(runtimeConfig.getParsedDatabaseUrl()),
  },
];
