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
    const address = server.address() as AddressInfo;
    const issuer = `http://127.0.0.1:${address.port}`;

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
              kid: 'fetchlane-test',
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
    async signToken(options: { roles?: string[] } = {}): Promise<string> {
      return await new SignJWT({
        realm_access: {
          roles: options.roles || ['reader'],
        },
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'fetchlane-test' })
        .setIssuedAt()
        .setIssuer(issuer)
        .setAudience('fetchlane-api')
        .setSubject('integration-user')
        .setExpirationTime('10m')
        .sign(privateKey);
    },
  };
}

function writeConfig(
  tempDir: string,
  options: {
    authenticationEnabled: boolean;
    issuer?: string;
  },
) {
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
      enableSchemaFeatures: true,
      limits: {
        requestBodyBytes: 1048576,
        fetchMaxPageSize: 1000,
        fetchMaxPredicates: 25,
        fetchMaxSortFields: 8,
        rateLimitWindowMs: 60000,
        rateLimitMax: 120,
      },
      authentication: {
        enabled: options.authenticationEnabled,
        mode: 'oidc-jwt',
        issuerUrl: options.issuer || '',
        audience: options.authenticationEnabled ? 'fetchlane-api' : '',
        jwksUrl: '',
        claimMappings: {
          subject: 'sub',
          roles: 'realm_access.roles',
        },
        ...(options.authenticationEnabled
          ? {
              authorization: {
                schema: ['*'],
                crud: {
                  default: {
                    create: ['*'],
                    read: ['*'],
                    update: ['*'],
                    delete: ['*'],
                  },
                  tables: {},
                },
              },
            }
          : {}),
      },
    }),
    'utf8',
  );
  return configPath;
}

describe('Optional authentication (e2e)', () => {
  let app: INestApplication;
  let tempDir: string | null = null;
  let oidcServer: Awaited<ReturnType<typeof createOidcServer>> | null = null;
  const originalFetchlaneConfig = process.env.FETCHLANE_CONFIG;

  async function bootApp(authenticationEnabled: boolean): Promise<void> {
    tempDir = mkdtempSync(join(tmpdir(), 'fetchlane-authentication-e2e-'));
    if (authenticationEnabled) {
      oidcServer = await createOidcServer();
    }

    process.env.FETCHLANE_CONFIG = writeConfig(tempDir, {
      authenticationEnabled,
      issuer: oidcServer?.issuer,
    });
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
        execute: vi
          .fn()
          .mockResolvedValue({ rows: [{ fetchlane_status_check: 1 }] }),
        executeSingle: vi.fn(),
        executeScalar: vi.fn(),
        tableExists: vi.fn(),
        release: vi.fn(),
        getTableNames: vi.fn().mockResolvedValue([{ table_name: 'member' }]),
        getTableInfo: vi.fn(),
        describeTable: vi.fn(),
        getPrimaryKeyColumns: vi.fn().mockResolvedValue([]),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    app = null as unknown as INestApplication;

    if (oidcServer) {
      await new Promise<void>((resolve, reject) =>
        oidcServer?.server.close((error) =>
          error ? reject(error) : resolve(),
        ),
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

  it('leaves data routes open when authentication is disabled', async () => {
    await bootApp(false);

    await request(app.getHttpServer())
      .get('/api/data-access/table-names')
      .expect(200)
      .expect([{ table_name: 'member' }]);

    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('keeps /api/status public when authentication is enabled', async () => {
    await bootApp(true);

    await request(app.getHttpServer()).get('/api/status').expect(200);
  });

  it('protects /api/data-access and /api/docs when authentication is enabled', async () => {
    await bootApp(true);

    const token = await oidcServer!.signToken();

    await request(app.getHttpServer())
      .get('/api/data-access/table-names')
      .expect(401)
      .expect((response) => {
        expect(response.body.hint).toMatch(/Authorization header/);
      });

    await request(app.getHttpServer()).get('/api/docs').expect(401);

    await request(app.getHttpServer())
      .get('/api/data-access/table-names')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect([{ table_name: 'member' }]);

    await request(app.getHttpServer())
      .get('/api/docs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
