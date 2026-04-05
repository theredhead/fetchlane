import { RateLimitMiddleware } from './rate-limit.middleware';
import { RuntimeConfigService } from '../config/runtime-config';

describe('RateLimitMiddleware', () => {
  let middleware: RateLimitMiddleware;
  const runtimeConfig = {
    getLimits: vi.fn().mockReturnValue({
      rateLimitWindowMs: 60000,
      rateLimitMax: 3,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.getLimits.mockReturnValue({
      rateLimitWindowMs: 60000,
      rateLimitMax: 3,
    });
    middleware = new RateLimitMiddleware(
      runtimeConfig as unknown as RuntimeConfigService,
    );
  });

  function fakeRequest(overrides: Record<string, any> = {}): any {
    return {
      ip: '192.168.1.1',
      socket: { remoteAddress: '192.168.1.1' },
      originalUrl: '/api/data-access/member',
      url: '/api/data-access/member',
      ...overrides,
    };
  }

  function fakeResponse(): any {
    const response: any = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    return response;
  }

  it('allows requests within the rate limit', () => {
    const next = vi.fn();
    middleware.use(fakeRequest(), fakeResponse(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows exactly rateLimitMax requests in a window', () => {
    const request = fakeRequest({ ip: '10.0.0.1' });
    for (let i = 0; i < 3; i++) {
      const next = vi.fn();
      middleware.use(request, fakeResponse(), next);
      expect(next).toHaveBeenCalled();
    }
  });

  it('rejects requests exceeding the rate limit with 429', () => {
    const request = fakeRequest({ ip: '10.0.0.2' });
    for (let i = 0; i < 3; i++) {
      middleware.use(request, fakeResponse(), vi.fn());
    }

    const response = fakeResponse();
    const next = vi.fn();
    middleware.use(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'The request rate limit has been exceeded.',
        hint: expect.stringContaining('rateLimitMax'),
      }),
    );
  });

  it('includes path and timestamp in the 429 response', () => {
    const request = fakeRequest({
      ip: '10.0.0.3',
      originalUrl: '/api/data-access/table-names',
    });
    for (let i = 0; i < 3; i++) {
      middleware.use(request, fakeResponse(), vi.fn());
    }

    const response = fakeResponse();
    middleware.use(request, response, vi.fn());

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/data-access/table-names',
        timestamp: expect.any(String),
      }),
    );
  });

  it('uses authenticated subject as the rate-limit key', () => {
    const authedRequest = fakeRequest({ ip: '10.0.0.4' });
    authedRequest.fetchlaneContext = {
      requestId: 'test-id',
      principal: { subject: 'user-alpha', roles: [], claims: {} },
    };

    for (let i = 0; i < 3; i++) {
      middleware.use(authedRequest, fakeResponse(), vi.fn());
    }

    const response = fakeResponse();
    middleware.use(authedRequest, response, vi.fn());
    expect(response.status).toHaveBeenCalledWith(429);

    const anonRequest = fakeRequest({ ip: '10.0.0.5' });
    const anonNext = vi.fn();
    middleware.use(anonRequest, fakeResponse(), anonNext);
    expect(anonNext).toHaveBeenCalled();
  });

  it('tracks separate buckets per IP for anonymous requests', () => {
    for (let i = 0; i < 3; i++) {
      middleware.use(fakeRequest({ ip: '10.0.0.6' }), fakeResponse(), vi.fn());
    }

    const differentIpNext = vi.fn();
    middleware.use(
      fakeRequest({ ip: '10.0.0.7' }),
      fakeResponse(),
      differentIpNext,
    );
    expect(differentIpNext).toHaveBeenCalled();
  });

  it('resets the bucket after the window expires', () => {
    const request = fakeRequest({ ip: '10.0.0.8' });
    for (let i = 0; i < 3; i++) {
      middleware.use(request, fakeResponse(), vi.fn());
    }

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);

    const next = vi.fn();
    middleware.use(request, fakeResponse(), next);
    expect(next).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('falls back to socket.remoteAddress when ip is absent', () => {
    const request = fakeRequest({
      ip: undefined,
      socket: { remoteAddress: '172.16.0.1' },
    });

    for (let i = 0; i < 3; i++) {
      middleware.use(request, fakeResponse(), vi.fn());
    }

    const response = fakeResponse();
    middleware.use(request, response, vi.fn());
    expect(response.status).toHaveBeenCalledWith(429);
  });

  it('uses "unknown" key when both ip and remoteAddress are absent', () => {
    const request = fakeRequest({
      ip: undefined,
      socket: { remoteAddress: undefined },
    });

    const next = vi.fn();
    middleware.use(request, fakeResponse(), next);
    expect(next).toHaveBeenCalled();
  });
});
