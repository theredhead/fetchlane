import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATABASE_CONNECTION } from './../src/data/database.providers';
import { AppModule } from './../src/app.module';
import { StatusController } from './../src/controllers/status.controller';
import { resetRuntimeConfigForTests } from './../src/config/runtime-config';

describe('AppModule (e2e)', () => {
  let app: INestApplication;
  const originalFetchlaneConfig = process.env.FETCHLANE_CONFIG;
  let tempDir: string | null = null;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'fetchlane-e2e-'));
    const configPath = join(tempDir, 'fetchlane.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        server: {
          host: '0.0.0.0',
          port: 3000,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          requestBodyBytes: 1048576,
          fetchMaxPageSize: 1000,
          fetchMaxPredicates: 25,
          fetchMaxSortFields: 8,
          rateLimitWindowMs: 60000,
          rateLimitMax: 120,
        },
        authentication: {
          enabled: false,
          mode: 'oidc-jwt',
          issuerUrl: '',
          audience: '',
          jwksUrl: '',
          claimMappings: {
            subject: 'sub',
            roles: 'realm_access.roles',
          },
        },
      }),
      'utf8',
    );
    process.env.FETCHLANE_CONFIG = configPath;
    resetRuntimeConfigForTests();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue({
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        select: vi.fn(),
        selectSingle: vi.fn(),
        execute: vi.fn(),
        executeSingle: vi.fn(),
        executeScalar: vi.fn(),
        tableExists: vi.fn(),
        release: vi.fn(),
        quoteIdentifier: (name: string) => `"${name}"`,
        parameter: (index: number) => `$${index}`,
        paginateQuery: (
          baseQuery: string,
          limit: number,
          offset: number,
          orderByClause: string | null,
        ) =>
          [baseQuery, orderByClause, `LIMIT ${limit} OFFSET ${offset}`]
            .filter(Boolean)
            .join('\n'),
        getTableNames: vi.fn(),
        getTableInfo: vi.fn(),
        describeTable: vi.fn(),
        getPrimaryKeyColumns: vi.fn().mockResolvedValue([]),
        name: 'test',
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    resetRuntimeConfigForTests();

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }

    if (originalFetchlaneConfig == null) {
      delete process.env.FETCHLANE_CONFIG;
    } else {
      process.env.FETCHLANE_CONFIG = originalFetchlaneConfig;
    }
  });

  it('boots the application and resolves the status controller', () => {
    const controller = app.get(StatusController);

    return expect(controller.index()).resolves.toEqual(
      expect.objectContaining({
        status: expect.stringMatching(/ok|degraded/),
        service: expect.objectContaining({
          name: 'fetchlane',
        }),
        config: expect.objectContaining({
          server: expect.objectContaining({
            host: '0.0.0.0',
            port: 3000,
          }),
          authentication: {
            enabled: false,
          },
        }),
        links: {
          self: '/api/status',
          docs: '/api/docs',
        },
      }),
    );
  });
});
