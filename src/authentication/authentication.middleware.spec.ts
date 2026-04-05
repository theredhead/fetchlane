import { AuthenticationMiddleware } from './authentication.middleware';
import { OidcAuthenticationService } from './oidc-authentication.service';

describe('AuthenticationMiddleware', () => {
  let middleware: AuthenticationMiddleware;
  const authenticationService = {
    isEnabled: vi.fn(),
    authenticateAuthorizationHeader: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    middleware = new AuthenticationMiddleware(
      authenticationService as unknown as OidcAuthenticationService,
    );
  });

  function fakeRequest(
    overrides: Record<string, any> = {},
  ): Record<string, any> {
    return {
      method: 'GET',
      originalUrl: '/api/data-access/table-names',
      url: '/api/data-access/table-names',
      header: vi.fn().mockReturnValue(undefined),
      ...overrides,
    };
  }

  function fakeResponse(): Record<string, any> {
    const response: Record<string, any> = {
      status: vi.fn(),
      json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    return response;
  }

  it('calls next immediately when authentication is disabled', async () => {
    authenticationService.isEnabled.mockReturnValue(false);
    const next = vi.fn();

    await middleware.use(fakeRequest() as any, fakeResponse() as any, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('calls next immediately for paths that do not require authentication', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    const next = vi.fn();

    await middleware.use(
      fakeRequest({ originalUrl: '/api/status' }) as any,
      fakeResponse() as any,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('skips authentication for OPTIONS requests', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    const next = vi.fn();

    await middleware.use(
      fakeRequest({ method: 'OPTIONS' }) as any,
      fakeResponse() as any,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('authenticates and attaches the principal on success', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    const principal = {
      subject: 'user-1',
      roles: ['admin'],
      claims: { sub: 'user-1' },
    };
    authenticationService.authenticateAuthorizationHeader.mockResolvedValue(
      principal,
    );

    const request = fakeRequest({
      header: vi.fn().mockReturnValue('Bearer token123'),
    });
    const next = vi.fn();

    await middleware.use(request as any, fakeResponse() as any, next);

    expect(
      authenticationService.authenticateAuthorizationHeader,
    ).toHaveBeenCalledWith('Bearer token123');
    expect(next).toHaveBeenCalledWith();
    expect(request.fetchlaneContext?.principal).toEqual(principal);
  });

  it('returns a 401 JSON response for structured authentication errors', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    const error = Object.assign(
      new Error('Missing or invalid Authorization header.'),
      {
        statusCode: 401,
        hint: 'Provide a valid bearer token.',
      },
    );
    authenticationService.authenticateAuthorizationHeader.mockRejectedValue(
      error,
    );

    const response = fakeResponse();
    const next = vi.fn();

    await middleware.use(fakeRequest() as any, response as any, next);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header.',
        hint: 'Provide a valid bearer token.',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a 403 JSON response for forbidden errors', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    const error = Object.assign(new Error('Access denied.'), {
      statusCode: 403,
      hint: 'Insufficient role.',
    });
    authenticationService.authenticateAuthorizationHeader.mockRejectedValue(
      error,
    );

    const response = fakeResponse();
    const next = vi.fn();

    await middleware.use(fakeRequest() as any, response as any, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        error: 'Forbidden',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns Service Unavailable for 503 structured errors', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    const error = Object.assign(new Error('OIDC provider unreachable.'), {
      statusCode: 503,
      hint: 'Try again later.',
    });
    authenticationService.authenticateAuthorizationHeader.mockRejectedValue(
      error,
    );

    const response = fakeResponse();
    const next = vi.fn();

    await middleware.use(fakeRequest() as any, response as any, next);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        error: 'Service Unavailable',
      }),
    );
  });

  it('forwards unknown errors to the next middleware', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    const error = new Error('unexpected');
    authenticationService.authenticateAuthorizationHeader.mockRejectedValue(
      error,
    );

    const next = vi.fn();
    const response = fakeResponse();

    await middleware.use(fakeRequest() as any, response as any, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('requires authentication for /api/docs paths', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    authenticationService.authenticateAuthorizationHeader.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), {
        statusCode: 401,
        hint: 'Token required.',
      }),
    );

    const response = fakeResponse();
    const next = vi.fn();

    await middleware.use(
      fakeRequest({ originalUrl: '/api/docs' }) as any,
      response as any,
      next,
    );

    expect(response.status).toHaveBeenCalledWith(401);
  });

  it('includes path and timestamp in the error response', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    authenticationService.authenticateAuthorizationHeader.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), {
        statusCode: 401,
        hint: 'Token required.',
        details: 'JWT expired',
      }),
    );

    const response = fakeResponse();

    await middleware.use(
      fakeRequest({ originalUrl: '/api/data-access/member' }) as any,
      response as any,
      vi.fn(),
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/data-access/member',
        timestamp: expect.any(String),
      }),
    );
  });

  it('falls back to request.url when originalUrl is absent', async () => {
    authenticationService.isEnabled.mockReturnValue(true);
    authenticationService.authenticateAuthorizationHeader.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), {
        statusCode: 401,
        hint: 'Token required.',
      }),
    );

    const response = fakeResponse();

    await middleware.use(
      fakeRequest({
        originalUrl: undefined,
        url: '/api/data-access/member',
      }) as any,
      response as any,
      vi.fn(),
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/data-access/member',
      }),
    );
  });
});
