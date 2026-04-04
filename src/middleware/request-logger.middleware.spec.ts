import { RequestLoggerMiddleware } from './request-logger.middleware';

describe('RequestLoggerMiddleware', () => {
  it('logs the request line with request id for every request', () => {
    const logger = { log: vi.fn() };
    const middleware = new RequestLoggerMiddleware(logger as any);
    const next = vi.fn();

    middleware.use(
      {
        ip: '127.0.0.1',
        method: 'GET',
        url: '/api/data-access/member',
        body: {},
        fetchlaneContext: { requestId: 'req-1', principal: null },
      } as any,
      {} as any,
      next,
    );

    expect(logger.log).toHaveBeenCalledWith(
      '[req-1] [127.0.0.1] GET /api/data-access/member',
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
        fetchlaneContext: { requestId: 'req-2', principal: null },
      } as any,
      {} as any,
      vi.fn(),
    );

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      '[req-2] [127.0.0.1] POST /api/data-access/member',
    );
  });
});
