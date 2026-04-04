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
    startedAt: string;
    checkedAt: string;
    uptimeMs: number;
    nodeVersion: string;
    platform: string;
    pid: number;
  };
  config: {
    server: {
      host: string;
      port: number;
      corsEnabled: boolean;
    };
    authentication: {
      enabled: boolean;
    };
    limits: {
      requestBodyBytes: number;
      fetchMaxPageSize: number;
      fetchMaxPredicates: number;
      fetchMaxSortFields: number;
      rateLimitWindowMs: number;
      rateLimitMax: number;
    };
  };
  database: {
    engine: string;
    host: string;
    port: number | null;
    database: string;
    connected: boolean;
    roundTripMs: number | null;
    capabilities: {
      tableListing: boolean;
      tableInfo: boolean;
      schemaDescription: boolean;
      createTableSql: boolean;
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
        startedAt: APP_STARTED_AT.toISOString(),
        checkedAt: checkedAt.toISOString(),
        uptimeMs: checkedAt.getTime() - APP_STARTED_AT.getTime(),
        nodeVersion: process.version,
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
        roundTripMs: database.roundTripMs,
        capabilities: {
          tableListing: supportsTableListing(this.adapter),
          tableInfo: supportsTableInfo(this.adapter),
          schemaDescription: supportsSchemaDescription(this.adapter),
          createTableSql: supportsCreateTableSql(this.adapter),
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
    } catch {
      return {
        connected: false,
        roundTripMs: null,
        error: {
          message: 'The database connectivity check failed.',
          hint: 'Verify the configured database URL, credentials, host, port, driver installation, and that the target database server is reachable.',
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
    readFileSync(
      packageJsonPath ?? resolve(process.cwd(), 'package.json'),
      'utf8',
    ),
  ) as Partial<{
    name: string;
    version: string;
  }>;

  return {
    name: packageJson.name || 'fetchlane',
    version: packageJson.version || '0.0.0',
  };
}
