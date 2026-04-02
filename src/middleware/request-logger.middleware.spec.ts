import { RequestLoggerMiddleware } from './request-logger.middleware';

describe('RequestLoggerMiddleware', () => {
  it('logs the request line for every request', () => {
    const logger = { log: vi.fn() };
    const middleware = new RequestLoggerMiddleware(logger as any);
    const next = vi.fn();

    middleware.use(
      {
        ip: '127.0.0.1',
        method: 'GET',
        url: '/api/data-access/member',
        body: {},
      } as any,
      {} as any,
      next,
    );

    expect(logger.log).toHaveBeenCalledWith(
      '[127.0.0.1] GET /api/data-access/member',
    );
    expect(next).toHaveBeenCalled();
  });

  it('does not log the request body for POST requests', () => {
    const logger = { log: vi.fn() };
    const middleware = new RequestLoggerMiddleware(logger as any);

    middleware.use(
      {
        ip: '127.0.0.1',
        method: 'POST',
        url: '/api/data-access/member',
        body: { name: 'Alice' },
      } as any,
      {} as any,
      vi.fn(),
    );

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      '[127.0.0.1] POST /api/data-access/member',
    );
  });
});
