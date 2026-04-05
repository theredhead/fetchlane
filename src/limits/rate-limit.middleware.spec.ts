import { RateLimitMiddleware } from './rate-limit.middleware';
import { RuntimeConfigService } from '../config/runtime-config';

describe('RateLimitMiddleware', () => {
  let middleware: RateLimitMiddleware;
  const runtimeConfig = {
    getLimits: vi.fn().mockReturnValue({
      rateLimitWindowMs: 60000,
      rateLimitMax: 3,
      statusRateLimitMax: 10,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.getLimits.mockReturnValue({
      rateLimitWindowMs: 60000,
      rateLimitMax: 3,
      statusRateLimitMax: 10,
    });
    middleware = new RateLimitMiddleware(
      runtimeConfig as unknown as RuntimeConfigService,
    );
  });

  afterEach(() => {
    middleware.onModuleDestroy();
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
    const response: any = {
      status: vi.fn(),
      json: vi.fn(),
      setHeader: vi.fn(),
    };
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

  describe('rate-limit headers', () => {
    it('sets X-RateLimit-* headers on allowed requests', () => {
      const response = fakeResponse();
      middleware.use(fakeRequest({ ip: '10.1.0.1' }), response, vi.fn());

      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 3);
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        2,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(Number),
      );
    });

    it('decrements X-RateLimit-Remaining with each request', () => {
      const request = fakeRequest({ ip: '10.1.0.2' });
      const firstResponse = fakeResponse();
      middleware.use(request, firstResponse, vi.fn());
      expect(firstResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        2,
      );

      const secondResponse = fakeResponse();
      middleware.use(request, secondResponse, vi.fn());
      expect(secondResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        1,
      );

      const thirdResponse = fakeResponse();
      middleware.use(request, thirdResponse, vi.fn());
      expect(thirdResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        0,
      );
    });

    it('sets X-RateLimit-* headers on 429 responses', () => {
      const request = fakeRequest({ ip: '10.1.0.3' });
      for (let i = 0; i < 3; i++) {
        middleware.use(request, fakeResponse(), vi.fn());
      }

      const response = fakeResponse();
      middleware.use(request, response, vi.fn());

      expect(response.status).toHaveBeenCalledWith(429);
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 3);
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        0,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(Number),
      );
    });

    it('sets X-RateLimit-Reset to a future epoch-seconds timestamp', () => {
      const response = fakeResponse();
      const before = Math.ceil(Date.now() / 1000);
      middleware.use(fakeRequest({ ip: '10.1.0.4' }), response, vi.fn());

      const resetCall = response.setHeader.mock.calls.find(
        (call: unknown[]) => call[0] === 'X-RateLimit-Reset',
      );
      expect(resetCall).toBeDefined();
      expect(resetCall![1]).toBeGreaterThanOrEqual(before);
    });
  });

  describe('status endpoint relaxed limits', () => {
    it('uses statusRateLimitMax for /api/status requests', () => {
      const request = fakeRequest({
        ip: '10.2.0.1',
        originalUrl: '/api/status',
        url: '/api/status',
      });

      for (let i = 0; i < 10; i++) {
        const next = vi.fn();
        middleware.use(request, fakeResponse(), next);
        expect(next).toHaveBeenCalled();
      }

      const response = fakeResponse();
      const next = vi.fn();
      middleware.use(request, response, next);
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(429);
    });

    it('reports statusRateLimitMax in headers for status requests', () => {
      const request = fakeRequest({
        ip: '10.2.0.2',
        originalUrl: '/api/status',
        url: '/api/status',
      });
      const response = fakeResponse();
      middleware.use(request, response, vi.fn());

      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    });

    it('keeps separate buckets for status and data requests', () => {
      const statusRequest = fakeRequest({
        ip: '10.2.0.3',
        originalUrl: '/api/status',
        url: '/api/status',
      });
      const dataRequest = fakeRequest({
        ip: '10.2.0.3',
        originalUrl: '/api/data-access/member',
        url: '/api/data-access/member',
      });

      for (let i = 0; i < 3; i++) {
        middleware.use(dataRequest, fakeResponse(), vi.fn());
      }

      const blockedResponse = fakeResponse();
      middleware.use(dataRequest, blockedResponse, vi.fn());
      expect(blockedResponse.status).toHaveBeenCalledWith(429);

      const statusNext = vi.fn();
      middleware.use(statusRequest, fakeResponse(), statusNext);
      expect(statusNext).toHaveBeenCalled();
    });

    it('does not treat /api/status?foo=bar as a non-status path', () => {
      const request = fakeRequest({
        ip: '10.2.0.4',
        originalUrl: '/api/status?foo=bar',
        url: '/api/status?foo=bar',
      });
      const response = fakeResponse();
      middleware.use(request, response, vi.fn());

      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    });
  });

  describe('bucket cleanup', () => {
    it('prunes expired buckets on the cleanup interval', () => {
      const request = fakeRequest({ ip: '10.3.0.1' });
      middleware.use(request, fakeResponse(), vi.fn());

      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);

      (middleware as any).pruneExpiredBuckets();

      expect((middleware as any).buckets.size).toBe(0);
      vi.restoreAllMocks();
    });

    it('preserves buckets that have not expired', () => {
      const request = fakeRequest({ ip: '10.3.0.2' });
      middleware.use(request, fakeResponse(), vi.fn());

      (middleware as any).pruneExpiredBuckets();

      expect((middleware as any).buckets.size).toBe(1);
    });
  });
});
