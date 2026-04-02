import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { RuntimeConfigService } from '../config/runtime-config';
import { OidcAuthService } from './oidc-auth.service';

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
    async signToken(overrides: {
      subject?: string;
      audience?: string;
      issuer?: string;
      expiresIn?: string;
      claims?: Record<string, unknown>;
    } = {}): Promise<string> {
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
  authOverrides: Partial<ReturnType<RuntimeConfigService['getAuth']>>,
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
      request_body_bytes: 1048576,
      fetch_max_page_size: 1000,
      fetch_max_predicates: 25,
      fetch_max_sort_fields: 8,
      rate_limit_window_ms: 60000,
      rate_limit_max: 120,
    },
    auth: {
      enabled: true,
      mode: 'oidc-jwt',
      issuer_url: '',
      audience: 'fetchlane-api',
      jwks_url: '',
      allowed_roles: ['reader'],
      claim_mappings: {
        subject: 'sub',
        roles: 'realm_access.roles',
      },
      ...authOverrides,
    },
  });
}

describe('OidcAuthService', () => {
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
    const service = new OidcAuthService(
      createRuntimeConfigService({
        issuer_url: oidcServer.issuer,
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
    const service = new OidcAuthService(
      createRuntimeConfigService({
        issuer_url: oidcServer.issuer,
        jwks_url: oidcServer.jwksUrl,
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
    const service = new OidcAuthService(
      createRuntimeConfigService({
        issuer_url: oidcServer.issuer,
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
      hint:
        'Request a fresh access token from your OIDC provider, then retry the request.',
    });
  });

  it('rejects tokens with the wrong issuer', async () => {
    const service = new OidcAuthService(
      createRuntimeConfigService({
        issuer_url: oidcServer.issuer,
      }),
    );
    const token = await oidcServer.signToken({
      issuer: 'https://wrong-issuer.example.com',
    });

    await expect(
      service.authenticateAuthorizationHeader(`Bearer ${token}`),
    ).rejects.toMatchObject({
      message:
        'The access token issuer does not match the configured issuer.',
    });
  });

  it('rejects tokens with the wrong audience', async () => {
    const service = new OidcAuthService(
      createRuntimeConfigService({
        issuer_url: oidcServer.issuer,
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
    const service = new OidcAuthService(
      createRuntimeConfigService({
        issuer_url: oidcServer.issuer,
      }),
    );

    await expect(
      service.authenticateAuthorizationHeader(undefined),
    ).rejects.toMatchObject({
      message: 'Authentication is required for this route.',
      hint:
        'Send an Authorization header in the form "Bearer <JWT>" issued by your configured OIDC provider.',
    });
  });

  it('rejects malformed tokens with a helpful hint', async () => {
    const service = new OidcAuthService(
      createRuntimeConfigService({
        issuer_url: oidcServer.issuer,
      }),
    );

    await expect(
      service.authenticateAuthorizationHeader('Bearer not-a-valid-jwt'),
    ).rejects.toMatchObject({
      message: 'The access token could not be verified.',
      hint:
        'Use a valid JWT signed by the configured OIDC provider, and verify that the issuer and JWKS settings match.',
    });
  });

  it('authorizes principals with a configured full-access role', () => {
    const service = new OidcAuthService(
      createRuntimeConfigService({
        allowed_roles: ['writer', 'admin'],
      }),
    );

    expect(() =>
      service.authorizePrincipal({
        subject: 'user-123',
        roles: ['reader', 'writer'],
        claims: {},
      }),
    ).not.toThrow();
  });

  it('rejects principals that do not have a configured full-access role', () => {
    const service = new OidcAuthService(
      createRuntimeConfigService({
        allowed_roles: ['admin'],
      }),
    );

    let thrownError: unknown;
    try {
      service.authorizePrincipal({
        subject: 'user-123',
        roles: ['reader', 'writer'],
        claims: {},
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({
      statusCode: 403,
      message:
        'The authenticated principal does not have a role that is allowed to access Fetchlane.',
      hint:
        'Grant one of the configured roles (admin) to the caller, or update config.auth.allowed_roles if access should be broader.',
    });
  });
});
