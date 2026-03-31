/** @format  */

export type DatabaseEngine = 'mysql' | 'postgres';

export interface ParsedDatabaseUrl {
  engine: DatabaseEngine;
  user: string;
  password: string;
  host: string;
  port?: number;
  database: string;
}

const rawDatabaseUrl = process.env.DB_URL;
if (!rawDatabaseUrl) {
  throw new Error('Missing DB_URL. Expected format: <engine>://<user>:<password>@<host>:<port?>/<database>');
}

const parsedDatabaseUrl = parseDatabaseUrl(rawDatabaseUrl);

export const databaseEngine: DatabaseEngine = parsedDatabaseUrl.engine;

export const databaseConfiguration = {
  user: parsedDatabaseUrl.user,
  password: parsedDatabaseUrl.password,
  host: parsedDatabaseUrl.host,
  port: parsedDatabaseUrl.engine === 'mysql' ? parsedDatabaseUrl.port || 3306 : undefined,
  database: parsedDatabaseUrl.database,
};

export const pgDatabaseConfiguration = {
  user: parsedDatabaseUrl.user,
  password: parsedDatabaseUrl.password,
  host: parsedDatabaseUrl.host,
  port: parsedDatabaseUrl.engine === 'postgres' ? parsedDatabaseUrl.port || 5432 : 5432,
  database: parsedDatabaseUrl.database,
};

export function parseDatabaseUrl(value: string): ParsedDatabaseUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `Invalid database URL "${value}". Expected format: <engine>://<user>:<password>@<host>:<port?>/<database>`,
    );
  }

  const engine = normalizeEngine(url.protocol.replace(/:$/, ''));
  if (!engine) {
    throw new Error(
      `Unsupported database engine "${url.protocol}". Expected mysql:// or postgres://`,
    );
  }

  const database = url.pathname.replace(/^\/+/, '');
  if (!database) {
    throw new Error(
      `Invalid database URL "${value}". Missing database name in path.`,
    );
  }

  const user = url.username ? decodeURIComponent(url.username) : '';
  if (!user) {
    throw new Error(
      `Invalid database URL "${value}". Missing username.`,
    );
  }

  const password = url.password ? decodeURIComponent(url.password) : '';
  if (!password) {
    throw new Error(
      `Invalid database URL "${value}". Missing password.`,
    );
  }

  if (!url.hostname) {
    throw new Error(
      `Invalid database URL "${value}". Missing host.`,
    );
  }

  return {
    engine,
    user,
    password,
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    database,
  };
}

function normalizeEngine(value?: string | null): DatabaseEngine | null {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'mysql') {
    return 'mysql';
  }

  if (normalized === 'postgres' || normalized === 'postgresql') {
    return 'postgres';
  }

  return null;
}
