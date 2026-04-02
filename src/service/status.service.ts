import { Inject, Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RuntimeConfigService } from '../config/runtime-config';
import { DATABASE_CONNECTION } from '../data/database.providers';
import {
  DatabaseAdapter,
  supportsCreateTableSql,
  supportsSchemaDescription,
  supportsTableInfo,
  supportsTableListing,
} from '../data/database';

const APP_STARTED_AT = new Date();
const PACKAGE_METADATA = loadPackageMetadata();

/**
 * Public status snapshot returned by the status endpoint.
 */
export interface StatusSnapshot {
  status: 'ok' | 'degraded';
  service: {
    name: string;
    version: string;
    environment: string;
  };
  runtime: {
    started_at: string;
    checked_at: string;
    uptime_ms: number;
    node_version: string;
    platform: string;
    pid: number;
  };
  config: {
    server: {
      host: string;
      port: number;
      cors_enabled: boolean;
    };
    auth: {
      enabled: boolean;
      allowed_roles: string[];
    };
    limits: {
      request_body_bytes: number;
      fetch_max_page_size: number;
      fetch_max_predicates: number;
      fetch_max_sort_fields: number;
      rate_limit_window_ms: number;
      rate_limit_max: number;
    };
  };
  database: {
    engine: string;
    host: string;
    port: number | null;
    database: string;
    connected: boolean;
    round_trip_ms: number | null;
    capabilities: {
      table_listing: boolean;
      table_info: boolean;
      schema_description: boolean;
      create_table_sql: boolean;
    };
    error: {
      message: string;
      hint: string;
    } | null;
  };
  links: {
    self: string;
    docs: string;
  };
}

/**
 * Builds the structured service status response.
 */
@Injectable()
export class StatusService {
  /**
   * Creates the status service for the active adapter.
   */
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly adapter: DatabaseAdapter,
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

  /**
   * Creates a status snapshot, including a lightweight database connectivity check.
   */
  public async getStatus(): Promise<StatusSnapshot> {
    const checkedAt = new Date();
    const databaseConfig = this.runtimeConfig.getParsedDatabaseUrl();
    const database = await this.checkDatabase();

    return {
      status: database.connected ? 'ok' : 'degraded',
      service: {
        name: PACKAGE_METADATA.name,
        version: PACKAGE_METADATA.version,
        environment: process.env.NODE_ENV || 'development',
      },
      runtime: {
        started_at: APP_STARTED_AT.toISOString(),
        checked_at: checkedAt.toISOString(),
        uptime_ms: checkedAt.getTime() - APP_STARTED_AT.getTime(),
        node_version: process.version,
        platform: `${process.platform}/${process.arch}`,
        pid: process.pid,
      },
      config: this.runtimeConfig.getStatusSnapshot(),
      database: {
        engine: this.adapter.name,
        host: databaseConfig.host,
        port: databaseConfig.port ?? null,
        database: databaseConfig.database,
        connected: database.connected,
        round_trip_ms: database.roundTripMs,
        capabilities: {
          table_listing: supportsTableListing(this.adapter),
          table_info: supportsTableInfo(this.adapter),
          schema_description: supportsSchemaDescription(this.adapter),
          create_table_sql: supportsCreateTableSql(this.adapter),
        },
        error: database.error,
      },
      links: {
        self: '/api/status',
        docs: '/api/docs',
      },
    };
  }

  private async checkDatabase(): Promise<{
    connected: boolean;
    roundTripMs: number | null;
    error: { message: string; hint: string } | null;
  }> {
    const startedAt = Date.now();

    try {
      await this.adapter.execute('SELECT 1 AS fetchlane_status_check', []);

      return {
        connected: true,
        roundTripMs: Date.now() - startedAt,
        error: null,
      };
    } catch (error) {
      return {
        connected: false,
        roundTripMs: null,
        error: {
          message: 'The database connectivity check failed.',
          hint:
            'Verify the configured database URL, credentials, host, port, driver installation, and that the target database server is reachable.',
        },
      };
    }
  }
}

function loadPackageMetadata(): { name: string; version: string } {
  const packageJsonPath = [
    resolve(__dirname, '../../package.json'),
    resolve(__dirname, '../../../package.json'),
    resolve(process.cwd(), 'package.json'),
  ].find((candidate) => existsSync(candidate));

  const packageJson = JSON.parse(
    readFileSync(packageJsonPath ?? resolve(process.cwd(), 'package.json'), 'utf8'),
  ) as Partial<{
    name: string;
    version: string;
  }>;

  return {
    name: packageJson.name || 'fetchlane',
    version: packageJson.version || '0.0.0',
  };
}
