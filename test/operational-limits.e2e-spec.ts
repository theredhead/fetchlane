import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { resetRuntimeConfigForTests } from '../src/config/runtime-config';
import { DATABASE_CONNECTION } from '../src/data/database.providers';
import { configureApplication } from '../src/main';

async function createOidcServer() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const server = createServer((req, res) => {
    const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    if (req.url === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer,
          jwks_uri: `${issuer}/jwks`,
        }),
      );
      return;
    }

    if (req.url === '/jwks') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          keys: [
            {
              ...publicJwk,
              use: 'sig',
              alg: 'RS256',
              kid: 'fetchlane-limit-test',
            },
          ],
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    issuer,
    server,
    async signToken(subject: string): Promise<string> {
      return await new SignJWT({
        realm_access: {
          roles: ['reader'],
        },
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'fetchlane-limit-test' })
        .setIssuedAt()
        .setIssuer(issuer)
        .setAudience('fetchlane-api')
        .setSubject(subject)
        .setExpirationTime('10m')
        .sign(privateKey);
    },
  };
}

describe('Operational limits (e2e)', () => {
  let app: INestApplication | null = null;
  let tempDir: string | null = null;
  let oidcServer: Awaited<ReturnType<typeof createOidcServer>> | null = null;
  const originalFetchlaneConfig = process.env.FETCHLANE_CONFIG;

  async function bootApp(options: {
    authEnabled: boolean;
    rateLimitMax: number;
    bodyLimitBytes?: number;
    fetchMaxPageSize?: number;
    fetchMaxPredicates?: number;
    fetchMaxSortFields?: number;
  }): Promise<void> {
    tempDir = mkdtempSync(join(tmpdir(), 'fetchlane-limits-e2e-'));
    if (options.authEnabled) {
      oidcServer = await createOidcServer();
    }

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
          request_body_bytes: options.bodyLimitBytes || 1048576,
          fetch_max_page_size: options.fetchMaxPageSize || 1000,
          fetch_max_predicates: options.fetchMaxPredicates || 25,
          fetch_max_sort_fields: options.fetchMaxSortFields || 8,
          rate_limit_window_ms: 60000,
          rate_limit_max: options.rateLimitMax,
        },
        auth: {
          enabled: options.authEnabled,
          mode: 'oidc-jwt',
          issuer_url: oidcServer?.issuer || '',
          audience: options.authEnabled ? 'fetchlane-api' : '',
          jwks_url: '',
          claim_mappings: {
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
        name: 'postgres',
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
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        select: vi.fn(),
        selectSingle: vi.fn(),
        execute: vi.fn().mockResolvedValue({ rows: [{ fetchlane_status_check: 1 }] }),
        executeSingle: vi.fn(),
        executeScalar: vi.fn(),
        tableExists: vi.fn(),
        release: vi.fn(),
        getTableNames: vi.fn().mockResolvedValue([{ table_name: 'member' }]),
        getTableInfo: vi.fn(),
        describeTable: vi.fn(),
        createTableSql: vi.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  }

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }

    if (oidcServer) {
      await new Promise<void>((resolve, reject) =>
        oidcServer?.server.close((error) => (error ? reject(error) : resolve())),
      );
      oidcServer = null;
    }

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }

    resetRuntimeConfigForTests();
    if (originalFetchlaneConfig == null) {
      delete process.env.FETCHLANE_CONFIG;
    } else {
      process.env.FETCHLANE_CONFIG = originalFetchlaneConfig;
    }
  });

  it('rate limits anonymous requests by client IP', async () => {
    await bootApp({
      authEnabled: false,
      rateLimitMax: 1,
    });

    await request(app!.getHttpServer()).get('/api/status').expect(200);
    await request(app!.getHttpServer())
      .get('/api/status')
      .expect(429)
      .expect((response) => {
        expect(response.body.hint).toMatch(/rate_limit_max/);
      });
  });

  it('rate limits authenticated requests by subject claim', async () => {
    await bootApp({
      authEnabled: true,
      rateLimitMax: 1,
    });

    const tokenA = await oidcServer!.signToken('subject-a');
    const tokenB = await oidcServer!.signToken('subject-b');

    await request(app!.getHttpServer())
      .get('/api/data-access/table-names')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    await request(app!.getHttpServer())
      .get('/api/data-access/table-names')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(429);

    await request(app!.getHttpServer())
      .get('/api/data-access/table-names')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
  });

  it('returns a structured error when the request body exceeds the configured limit', async () => {
    await bootApp({
      authEnabled: false,
      rateLimitMax: 100,
      bodyLimitBytes: 120,
    });

    const largeBody = {
      table: 'member',
      predicates: [
        {
          text: 'name = ?',
          args: ['A'.repeat(1000)],
        },
      ],
      sort: [],
    };

    await request(app!.getHttpServer())
      .post('/api/data-access/fetch')
      .send(largeBody)
      .expect(413)
      .expect((response) => {
        expect(response.body.message).toBe(
          'The request body exceeds the configured size limit.',
        );
        expect(response.body.hint).toMatch(/request_body_bytes/);
      });
  });

  it('enforces fetch request limits from runtime config', async () => {
    await bootApp({
      authEnabled: false,
      rateLimitMax: 100,
      fetchMaxPageSize: 2,
      fetchMaxPredicates: 1,
      fetchMaxSortFields: 1,
    });

    await request(app!.getHttpServer())
      .post('/api/data-access/fetch')
      .send({
        table: 'member',
        predicates: [{ text: 'status = ?', args: ['open'] }],
        sort: [],
        pagination: {
          index: 0,
          size: 3,
        },
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.hint).toMatch(/fetch_max_page_size/);
      });

    await request(app!.getHttpServer())
      .post('/api/data-access/fetch')
      .send({
        table: 'member',
        predicates: [
          { text: 'status = ?', args: ['open'] },
          { text: 'city = ?', args: ['Enschede'] },
        ],
        sort: [],
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.hint).toMatch(/fetch_max_predicates/);
      });

    await request(app!.getHttpServer())
      .post('/api/data-access/fetch')
      .send({
        table: 'member',
        predicates: [],
        sort: [
          { column: 'name', direction: 'ASC' },
          { column: 'city', direction: 'ASC' },
        ],
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.hint).toMatch(/fetch_max_sort_fields/);
      });
  });
});
