import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DATABASE_CONNECTION } from './../src/data/database.providers';
import { AppModule } from './../src/app.module';
import { StatusController } from './../src/controllers/status.controller';

describe('AppModule (e2e)', () => {
  let app: INestApplication;
  const originalDbUrl = process.env.DB_URL;

  beforeEach(async () => {
    process.env.DB_URL =
      process.env.DB_URL || 'postgres://postgres:password@127.0.0.1:5432/northwind';

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
        createTableSql: vi.fn(),
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

    if (originalDbUrl == null) {
      delete process.env.DB_URL;
    } else {
      process.env.DB_URL = originalDbUrl;
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
        links: {
          self: '/api/status',
          docs: '/api/docs',
        },
      }),
    );
  });
});
