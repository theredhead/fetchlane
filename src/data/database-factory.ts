import { databaseConfiguration, databaseEngine, pgDatabaseConfiguration } from '../db.conf';
import { Database } from './database';
import { MySqlDatabase } from './mysql/mysql-database';
import { PostgresDatabase } from './postgres/postgres-database';

export function createDatabase(): Database {
  if (databaseEngine === 'mysql') {
    return new MySqlDatabase(databaseConfiguration);
  }

  return new PostgresDatabase(pgDatabaseConfiguration);
}
