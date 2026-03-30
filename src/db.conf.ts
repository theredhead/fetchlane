/** @format  */

export const databaseConfiguration = {
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'northwind',
};

export const pgDatabaseConfiguration = {
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'password',
  host: process.env.PG_HOST || '127.0.0.1',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_NAME || 'northwind',
};
