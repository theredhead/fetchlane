import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const app = {
  enableCors: vi.fn(),
  enableShutdownHooks: vi.fn(),
  useGlobalFilters: vi.fn(),
  use: vi.fn(),
  listen: vi.fn().mockResolvedValue(undefined),
};

const createDocument = vi.fn().mockReturnValue({ openapi: '3.0.0' });
const setup = vi.fn();
const build = vi.fn().mockReturnValue({ title: 'Fetchlane API' });

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    create: vi.fn().mockResolvedValue(app),
  },
}));

vi.mock('@nestjs/swagger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/swagger')>();

  return {
    ...actual,
    DocumentBuilder: class {
      setTitle() {
        return this;
      }
      setDescription() {
        return this;
      }
      setVersion() {
        return this;
      }
      build() {
        return build();
      }
    },
    SwaggerModule: {
      ...actual.SwaggerModule,
      createDocument,
      setup,
    },
  };
});

describe('main bootstrap', () => {
  const originalFetchlaneConfig = process.env.FETCHLANE_CONFIG;
  const createdDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalFetchlaneConfig == null) {
      delete process.env.FETCHLANE_CONFIG;
    } else {
      process.env.FETCHLANE_CONFIG = originalFetchlaneConfig;
    }

    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('boots Nest with config-driven CORS, global error handling, and Swagger', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fetchlane-main-'));
    createdDirs.push(dir);
    const configPath = join(dir, 'fetchlane.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        server: {
          host: '127.0.0.1',
          port: 4321,
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        database: {
          url: 'postgres://postgres:password@127.0.0.1:5432/northwind',
        },
        limits: {
          request_body_bytes: 1048576,
          fetch_max_page_size: 1000,
          fetch_max_predicates: 25,
          fetch_max_sort_fields: 8,
          rate_limit_window_ms: 60000,
          rate_limit_max: 120,
        },
        auth: {
          enabled: false,
          mode: 'oidc-jwt',
          issuer_url: '',
          audience: '',
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

    const { bootstrap } = await import('./main');
    await bootstrap();

    expect(app.enableCors).toHaveBeenCalledWith({ origin: true });
    expect(app.enableShutdownHooks).toHaveBeenCalled();
    expect(app.useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(app.use).toHaveBeenCalledTimes(1);
    expect(createDocument).toHaveBeenCalledWith(app, {
      title: 'Fetchlane API',
    });
    expect(setup).toHaveBeenCalledWith(
      'api/docs',
      app,
      { openapi: '3.0.0' },
      {
        swaggerOptions: {
          persistAuthorization: true,
        },
      },
    );
    expect(app.listen).toHaveBeenCalledWith(4321, '127.0.0.1');
  });
});
