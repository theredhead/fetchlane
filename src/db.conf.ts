export interface ParsedDatabaseUrl {
  engine: string;
  user: string;
  password: string;
  host: string;
  port?: number;
  database: string;
}

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
