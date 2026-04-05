import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { errors } from 'jose';
import { RuntimeConfigService } from '../config/runtime-config';
import {
  AuthenticationError,
  OidcAuthenticationService,
} from './oidc-authentication.service';

async function createOidcServer() {
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const server = createServer((request, response) => {
    const address = server.address() as AddressInfo;
    const issuer = `http://127.0.0.1:${address.port}`;

    if (request.url === '/.well-known/openid-configuration') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          issuer,
          jwks_uri: `${issuer}/jwks`,
        }),
      );
      return;
    }

    if (request.url === '/jwks') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
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

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const issuer = `http://127.0.0.1:${address.port}`;

  return {
    issuer,
    jwksUrl: `${issuer}/jwks`,
    server,
    async signToken(
      overrides: {
        subject?: string;
        audience?: string;
        issuer?: string;
        expiresIn?: string;
        claims?: Record<string, unknown>;
      } = {},
    ): Promise<string> {
      return await new SignJWT({
        realm_access: {
          roles: ['reader', 'writer'],
        },
        ...(overrides.claims || {}),
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'fetchlane-test' })
        .setIssuedAt()
        .setIssuer(overrides.issuer || issuer)
        .setAudience(overrides.audience || 'fetchlane-api')
        .setSubject(overrides.subject || 'user-123')
        .setExpirationTime(overrides.expiresIn || '10m')
        .sign(privateKey);
    },
  };
}

function createRuntimeConfigService(
  authOverrides: Partial<ReturnType<RuntimeConfigService['getAuthentication']>>,
): RuntimeConfigService {
  return new RuntimeConfigService({
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
    limits: {
      requestBodyBytes: 1048576,
      fetchMaxPageSize: 1000,
      fetchMaxPredicates: 25,
      fetchMaxSortFields: 8,
      rateLimitWindowMs: 60000,
      rateLimitMax: 120,
    },
    authentication: {
      enabled: true,
      mode: 'oidc-jwt',
      issuerUrl: '',
      audience: 'fetchlane-api',
      jwksUrl: '',
      claimMappings: {
        subject: 'sub',
        roles: 'realm_access.roles',
      },
      authorization: undefined as any,
      ...authOverrides,
    },
    enableSchemaFeatures: false,
  });
}

describe('OidcAuthenticationService', () => {
  let oidcServer: Awaited<ReturnType<typeof createOidcServer>>;

  beforeEach(async () => {
    oidcServer = await createOidcServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      oidcServer.server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('validates a token through issuer discovery and maps claims', async () => {
    const service = new OidcAuthenticationService(
      createRuntimeConfigService({
        issuerUrl: oidcServer.issuer,
      }),
    );
    const token = await oidcServer.signToken();

    const principal = await service.authenticateAuthorizationHeader(
      `Bearer ${token}`,
    );

    expect(principal.subject).toBe('user-123');
    expect(principal.roles).toEqual(['reader', 'writer']);
  });

  it('supports a direct JWKS URL override', async () => {
    const service = new OidcAuthenticationService(
      createRuntimeConfigService({
        issuerUrl: oidcServer.issuer,
        jwksUrl: oidcServer.jwksUrl,
      }),
    );
    const token = await oidcServer.signToken();

    await expect(
      service.authenticateAuthorizationHeader(`Bearer ${token}`),
    ).resolves.toEqual(
      expect.objectContaining({
        subject: 'user-123',
      }),
    );
  });

  it('rejects expired tokens with a helpful hint', async () => {
    const service = new OidcAuthenticationService(
      createRuntimeConfigService({
        issuerUrl: oidcServer.issuer,
      }),
    );
    const token = await oidcServer.signToken({
      expiresIn: '1s',
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await expect(
      service.authenticateAuthorizationHeader(`Bearer ${token}`),
    ).rejects.toMatchObject({
      message: 'The access token has expired.',
      hint: 'Request a fresh access token from your OIDC provider, then retry the request.',
    });
  });

  it('rejects tokens with the wrong issuer', async () => {
    const service = new OidcAuthenticationService(
      createRuntimeConfigService({
        issuerUrl: oidcServer.issuer,
      }),
    );
    const token = await oidcServer.signToken({
      issuer: 'https://wrong-issuer.example.com',
    });

    await expect(
      service.authenticateAuthorizationHeader(`Bearer ${token}`),
    ).rejects.toMatchObject({
      message: 'The access token issuer does not match the configured issuer.',
    });
  });

  it('rejects tokens with the wrong audience', async () => {
    const service = new OidcAuthenticationService(
      createRuntimeConfigService({
        issuerUrl: oidcServer.issuer,
      }),
    );
    const token = await oidcServer.signToken({
      audience: 'another-audience',
    });

    await expect(
      service.authenticateAuthorizationHeader(`Bearer ${token}`),
    ).rejects.toMatchObject({
      message:
        'The access token audience does not match the configured audience.',
    });
  });

  it('rejects missing bearer headers', async () => {
    const service = new OidcAuthenticationService(
      createRuntimeConfigService({
        issuerUrl: oidcServer.issuer,
      }),
    );

    await expect(
      service.authenticateAuthorizationHeader(undefined),
    ).rejects.toMatchObject({
      message: 'Authentication is required for this route.',
      hint: 'Send an Authorization header in the form "Bearer <JWT>" issued by your configured OIDC provider.',
    });
  });

  it('rejects malformed tokens with a helpful hint', async () => {
    const service = new OidcAuthenticationService(
      createRuntimeConfigService({
        issuerUrl: oidcServer.issuer,
      }),
    );

    await expect(
      service.authenticateAuthorizationHeader('Bearer not-a-valid-jwt'),
    ).rejects.toMatchObject({
      message: 'The access token could not be verified.',
      hint: 'Use a valid JWT signed by the configured OIDC provider, and verify that the issuer and JWKS settings match.',
    });
  });

  describe('OIDC discovery error handling', () => {
    it('rejects when issuerUrl is empty and no jwksUrl is configured', async () => {
      const service = new OidcAuthenticationService(
        createRuntimeConfigService({
          issuerUrl: '  ',
          jwksUrl: '',
        }),
      );

      await expect(
        service.authenticateAuthorizationHeader('Bearer fake-token'),
      ).rejects.toMatchObject({
        statusCode: 503,
        message: expect.stringContaining(
          'no issuer metadata source is configured',
        ),
      });
    });

    it('rejects when the discovery endpoint is unreachable', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const service = new OidcAuthenticationService(
        createRuntimeConfigService({
          issuerUrl: 'https://unreachable.example.com',
          jwksUrl: '',
        }),
      );

      try {
        await expect(
          service.authenticateAuthorizationHeader('Bearer fake-token'),
        ).rejects.toMatchObject({
          statusCode: 503,
          message: expect.stringContaining(
            'could not reach the configured OIDC issuer',
          ),
          details: 'ECONNREFUSED',
        });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('rejects when the discovery endpoint returns a non-OK response', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('', { status: 500 }));

      const service = new OidcAuthenticationService(
        createRuntimeConfigService({
          issuerUrl: 'https://example.com',
          jwksUrl: '',
        }),
      );

      try {
        await expect(
          service.authenticateAuthorizationHeader('Bearer fake-token'),
        ).rejects.toMatchObject({
          statusCode: 503,
          message: expect.stringContaining(
            'could not load the OIDC discovery document',
          ),
          details: expect.stringContaining('HTTP 500'),
        });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('rejects when the discovery document does not expose jwks_uri', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ issuer: 'https://example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const service = new OidcAuthenticationService(
        createRuntimeConfigService({
          issuerUrl: 'https://example.com',
          jwksUrl: '',
        }),
      );

      try {
        await expect(
          service.authenticateAuthorizationHeader('Bearer fake-token'),
        ).rejects.toMatchObject({
          statusCode: 503,
          message: expect.stringContaining('does not expose a JWKS endpoint'),
        });
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('claim mapping', () => {
    it('returns empty roles when the roles claim path resolves to null', async () => {
      const service = new OidcAuthenticationService(
        createRuntimeConfigService({
          issuerUrl: oidcServer.issuer,
        }),
      );

      const token = await oidcServer.signToken({
        claims: { realm_access: undefined },
      });

      const principal = await service.authenticateAuthorizationHeader(
        `Bearer ${token}`,
      );

      expect(principal.roles).toEqual([]);
    });

    it('rejects when the configured subject claim path is missing', async () => {
      const service = new OidcAuthenticationService(
        createRuntimeConfigService({
          issuerUrl: oidcServer.issuer,
          claimMappings: {
            subject: 'custom.nonexistent',
            roles: 'realm_access.roles',
          },
        }),
      );

      const token = await oidcServer.signToken();

      await expect(
        service.authenticateAuthorizationHeader(`Bearer ${token}`),
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining(
          'missing the configured subject claim',
        ),
      });
    });

    it('rejects when the roles claim resolves to a non-array value', async () => {
      const service = new OidcAuthenticationService(
        createRuntimeConfigService({
          issuerUrl: oidcServer.issuer,
          claimMappings: {
            subject: 'sub',
            roles: 'sub',
          },
        }),
      );

      const token = await oidcServer.signToken();

      await expect(
        service.authenticateAuthorizationHeader(`Bearer ${token}`),
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('does not expose roles'),
      });
    });
  });

  describe('JWT error translation', () => {
    it('passes through AuthenticationError unchanged', () => {
      const service = new OidcAuthenticationService(
        createRuntimeConfigService({ issuerUrl: 'https://example.com' }),
      );

      const original = new AuthenticationError(401, 'test', 'hint');
      const translated = (service as any).translateJwtError(original);

      expect(translated).toBe(original);
    });

    it('translates JWSSignatureVerificationFailed with details', () => {
      const service = new OidcAuthenticationService(
        createRuntimeConfigService({ issuerUrl: 'https://example.com' }),
      );

      const joseError = new errors.JWSSignatureVerificationFailed();
      const translated = (service as any).translateJwtError(joseError);

      expect(translated.message).toBe(
        'The access token could not be verified.',
      );
      expect(translated.details).toBe(joseError.message);
    });

    it('returns a generic error for non-jose exceptions', () => {
      const service = new OidcAuthenticationService(
        createRuntimeConfigService({ issuerUrl: 'https://example.com' }),
      );

      const error = new TypeError('something unexpected');
      const translated = (service as any).translateJwtError(error);

      expect(translated.message).toBe('The access token is invalid.');
      expect(translated.details).toBe('something unexpected');
    });

    it('stringifies non-Error values thrown during verification', () => {
      const service = new OidcAuthenticationService(
        createRuntimeConfigService({ issuerUrl: 'https://example.com' }),
      );

      const translated = (service as any).translateJwtError('raw-string');

      expect(translated.message).toBe('The access token is invalid.');
      expect(translated.details).toBe('raw-string');
    });
  });
});
