import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DATABASE_CONNECTION, ACTIVE_DATABASE_ENGINE } from './../src/data/database.providers';
import { AppModule } from './../src/app.module';
import { StatusController } from './../src/controllers/status.controller';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
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
      })
      .overrideProvider(ACTIVE_DATABASE_ENGINE)
      .useValue({
        name: 'test',
        engines: ['test'],
        createDatabase: vi.fn(),
        quoteIdentifier: (name: string) => `"${name}"`,
        parameter: (index: number) => `$${index}`,
        getTableNames: vi.fn(),
        getTableInfo: vi.fn(),
        describeTable: vi.fn(),
        createTableSql: vi.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('boots the application and resolves the status controller', () => {
    const controller = app.get(StatusController);

    expect(controller.index()).toEqual({
      status: 'Running',
    });
  });
});
