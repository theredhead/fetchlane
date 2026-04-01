const app = {
  enableCors: vi.fn(),
  listen: vi.fn().mockResolvedValue(undefined),
};

const createDocument = vi.fn().mockReturnValue({ openapi: '3.0.0' });
const setup = vi.fn();
const build = vi.fn().mockReturnValue({ title: 'Generic Data Access API' });

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('boots Nest, enables CORS, and configures Swagger', async () => {
    await import('./main');

    expect(app.enableCors).toHaveBeenCalled();
    expect(createDocument).toHaveBeenCalledWith(app, {
      title: 'Generic Data Access API',
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
    expect(app.listen).toHaveBeenCalledWith(3000);
  });
});
