import { formatDeveloperError } from './errors/api-error';

/**
 * Parsed connection details extracted from a database connection URL.
 */
export interface ParsedDatabaseUrl {
  /** Database engine or protocol name, such as `postgres` or `mysql`. */
  engine: string;
  /** Username used to authenticate with the database server. */
  user: string;
  /** Password used to authenticate with the database server. */
  password: string;
  /** Hostname or IP address of the database server. */
  host: string;
  /** Optional TCP port for the database server. */
  port?: number;
  /** Database or catalog name selected by the connection URL. */
  database: string;
}

/**
 * Parses a database connection URL into a structured configuration object.
 */
export function parseDatabaseUrl(value: string): ParsedDatabaseUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      formatDeveloperError(
        'Invalid database URL format.',
        'Use the format <engine>://<user>:<password>@<host>:<port?>/<database>.',
      ),
    );
  }

  const engine = normalizeEngine(url.protocol);
  if (!engine) {
    throw new Error(
      formatDeveloperError(
        'Invalid database URL: missing database engine in the protocol.',
        'Start the URL with a supported scheme such as postgres://, mysql://, or sqlserver://.',
      ),
    );
  }

  const database = url.pathname.replace(/^\/+/, '');
  if (!database) {
    throw new Error(
      formatDeveloperError(
        'Invalid database URL: missing database name in the path.',
        'Append the target database name after the host and optional port, for example /northwind.',
      ),
    );
  }

  const user = url.username ? decodeURIComponent(url.username) : '';
  if (!user) {
    throw new Error(
      formatDeveloperError(
        'Invalid database URL: missing username.',
        'Provide credentials in the URL, for example postgres://user:password@host:5432/database.',
      ),
    );
  }

  const password = url.password ? decodeURIComponent(url.password) : '';
  if (!password) {
    throw new Error(
      formatDeveloperError(
        'Invalid database URL: missing password.',
        'Provide credentials in the URL, for example postgres://user:password@host:5432/database.',
      ),
    );
  }

  if (!url.hostname) {
    throw new Error(
      formatDeveloperError(
        'Invalid database URL: missing host.',
        'Add a hostname or IP address after the credentials, for example @127.0.0.1:5432/database.',
      ),
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

function normalizeEngine(value?: string | null): string | null {
  const normalized = (value || '').replace(/:$/, '').trim().toLowerCase();
  return normalized || null;
}
