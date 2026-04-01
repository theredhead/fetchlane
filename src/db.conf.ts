/**
 * Parsed connection details extracted from the `DB_URL` environment variable.
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
      `Invalid database URL "${value}". Expected format: <engine>://<user>:<password>@<host>:<port?>/<database>`,
    );
  }

  const engine = normalizeEngine(url.protocol);
  if (!engine) {
    throw new Error(
      `Invalid database URL "${value}". Missing database engine in protocol.`,
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
    throw new Error(`Invalid database URL "${value}". Missing username.`);
  }

  const password = url.password ? decodeURIComponent(url.password) : '';
  if (!password) {
    throw new Error(`Invalid database URL "${value}". Missing password.`);
  }

  if (!url.hostname) {
    throw new Error(`Invalid database URL "${value}". Missing host.`);
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

/**
 * Reads and parses the database connection URL from `DB_URL`.
 */
export function readDatabaseUrlFromEnvironment(): ParsedDatabaseUrl {
  const rawDatabaseUrl = process.env.DB_URL;
  if (!rawDatabaseUrl) {
    throw new Error(
      'Missing DB_URL. Expected format: <engine>://<user>:<password>@<host>:<port?>/<database>',
    );
  }

  return parseDatabaseUrl(rawDatabaseUrl);
}

function normalizeEngine(value?: string | null): string | null {
  const normalized = (value || '').replace(/:$/, '').trim().toLowerCase();
  return normalized || null;
}
