import { HttpStatus, Injectable } from '@nestjs/common';
import { JWTPayload, createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { RuntimeAuthConfig, RuntimeConfigService } from '../config/runtime-config';
import { AuthenticatedPrincipal } from './request-context';

interface OidcDiscoveryDocument {
  issuer?: string;
  jwks_uri?: string;
}

/**
 * Structured auth error used by middleware to return hint-rich responses.
 */
export class AuthError extends Error {
  /** HTTP status code returned to the caller. */
  public readonly statusCode: number;
  /** Developer-facing hint explaining how to fix the auth problem. */
  public readonly hint: string;
  /** Optional low-level detail for logs or diagnostics. */
  public readonly details?: string;

  /**
   * Creates a structured auth error.
   */
  public constructor(
    statusCode: number,
    message: string,
    hint: string,
    details?: string,
  ) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.hint = hint;
    this.details = details;
  }
}

/**
 * Validates OIDC-compatible bearer JWTs and maps them into Fetchlane principals.
 */
@Injectable()
export class OidcAuthService {
  private jwksResolverPromise:
    | Promise<ReturnType<typeof createRemoteJWKSet>>
    | null = null;

  /**
   * Creates the auth service from runtime config.
   */
  public constructor(
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

  /**
   * Returns whether auth is enabled for the current runtime.
   */
  public isEnabled(): boolean {
    return this.runtimeConfig.getAuth().enabled;
  }

  /**
   * Authenticates the provided bearer authorization header.
   */
  public async authenticateAuthorizationHeader(
    authorizationHeader: string | undefined,
  ): Promise<AuthenticatedPrincipal> {
    const authConfig = this.runtimeConfig.getAuth();
    const token = this.readBearerToken(authorizationHeader);
    const jwks = await this.getJwksResolver(authConfig);

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: authConfig.issuer_url || undefined,
        audience: authConfig.audience,
      });

      return this.mapPrincipal(payload, authConfig);
    } catch (error) {
      throw this.translateJwtError(error);
    }
  }

  /**
   * Ensures that the authenticated principal has one of the configured full-access roles.
   */
  public authorizePrincipal(principal: AuthenticatedPrincipal): void {
    const allowedRoles = this.runtimeConfig.getAuth().allowed_roles;
    if (allowedRoles.length === 0) {
      return;
    }

    if (principal.roles.some((role) => allowedRoles.includes(role))) {
      return;
    }

    throw new AuthError(
      HttpStatus.FORBIDDEN,
      'The authenticated principal does not have a role that is allowed to access Fetchlane.',
      `Grant one of the configured roles (${allowedRoles.join(', ')}) to the caller, or update config.auth.allowed_roles if access should be broader.`,
    );
  }

  private readBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      throw new AuthError(
        HttpStatus.UNAUTHORIZED,
        'Authentication is required for this route.',
        'Send an Authorization header in the form "Bearer <JWT>" issued by your configured OIDC provider.',
      );
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]?.trim()) {
      throw new AuthError(
        HttpStatus.UNAUTHORIZED,
        'The Authorization header is not a valid bearer token.',
        'Use the form "Authorization: Bearer <JWT>" with a non-empty access token.',
      );
    }

    return match[1].trim();
  }

  private async getJwksResolver(
    authConfig: RuntimeAuthConfig,
  ): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (!this.jwksResolverPromise) {
      this.jwksResolverPromise = this.createJwksResolver(authConfig);
    }

    return await this.jwksResolverPromise;
  }

  private async createJwksResolver(
    authConfig: RuntimeAuthConfig,
  ): Promise<ReturnType<typeof createRemoteJWKSet>> {
    const jwksUrl = authConfig.jwks_url || (await this.discoverJwksUrl(authConfig));

    try {
      return createRemoteJWKSet(new URL(jwksUrl));
    } catch (error) {
      throw new AuthError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Fetchlane could not initialize JWT key validation.',
        'Set config.auth.jwks_url to a valid JWKS endpoint, or configure a valid issuer_url for OIDC discovery.',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async discoverJwksUrl(authConfig: RuntimeAuthConfig): Promise<string> {
    const issuerUrl = authConfig.issuer_url.trim().replace(/\/+$/, '');
    if (!issuerUrl) {
      throw new AuthError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Fetchlane auth is enabled but no issuer metadata source is configured.',
        'Set config.auth.issuer_url for OIDC discovery, or configure config.auth.jwks_url directly.',
      );
    }

    const discoveryUrl = `${issuerUrl}/.well-known/openid-configuration`;
    let response: Response;

    try {
      response = await fetch(discoveryUrl);
    } catch (error) {
      throw new AuthError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Fetchlane could not reach the configured OIDC issuer discovery endpoint.',
        'Verify config.auth.issuer_url, network reachability, and TLS settings for your identity provider.',
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!response.ok) {
      throw new AuthError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Fetchlane could not load the OIDC discovery document.',
        'Verify that config.auth.issuer_url points to a valid OIDC issuer and that the discovery endpoint is reachable.',
        `Discovery endpoint returned HTTP ${response.status}.`,
      );
    }

    const discoveryDocument = (await response.json()) as OidcDiscoveryDocument;
    if (!discoveryDocument.jwks_uri) {
      throw new AuthError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'The OIDC discovery document does not expose a JWKS endpoint.',
        'Use an issuer that publishes jwks_uri, or configure config.auth.jwks_url explicitly.',
      );
    }

    return discoveryDocument.jwks_uri;
  }

  private mapPrincipal(
    payload: JWTPayload,
    authConfig: RuntimeAuthConfig,
  ): AuthenticatedPrincipal {
    const subject = this.readStringClaim(
      payload,
      authConfig.claim_mappings.subject,
      'subject',
    );
    const roles = this.readStringArrayClaim(
      payload,
      authConfig.claim_mappings.roles,
    );

    return {
      subject,
      roles,
      claims: payload,
    };
  }

  private readStringClaim(
    payload: JWTPayload,
    claimPath: string,
    claimLabel: string,
  ): string {
    const claimValue = this.readClaimPath(payload, claimPath);
    if (typeof claimValue === 'string' && claimValue.trim()) {
      return claimValue;
    }

    throw new AuthError(
      HttpStatus.UNAUTHORIZED,
      `The validated access token is missing the configured ${claimLabel} claim.`,
      `Set config.auth.claim_mappings.${claimLabel} to a claim path that resolves to a non-empty string in your provider's JWT.`,
    );
  }

  private readStringArrayClaim(
    payload: JWTPayload,
    claimPath: string,
  ): string[] {
    const claimValue = this.readClaimPath(payload, claimPath);
    if (claimValue == null) {
      return [];
    }

    if (
      Array.isArray(claimValue) &&
      claimValue.every((entry) => typeof entry === 'string')
    ) {
      return claimValue;
    }

    throw new AuthError(
      HttpStatus.UNAUTHORIZED,
      'The validated access token does not expose roles in the configured claim path.',
      'Set config.auth.claim_mappings.roles to a claim path that resolves to an array of strings, or remove role-based assumptions for this provider.',
    );
  }

  private readClaimPath(payload: JWTPayload, claimPath: string): unknown {
    return claimPath.split('.').reduce<unknown>((current, segment) => {
      if (
        current &&
        typeof current === 'object' &&
        segment in (current as Record<string, unknown>)
      ) {
        return (current as Record<string, unknown>)[segment];
      }

      return undefined;
    }, payload);
  }

  private translateJwtError(error: unknown): AuthError {
    if (error instanceof AuthError) {
      return error;
    }

    if (error instanceof errors.JWTExpired) {
      return new AuthError(
        HttpStatus.UNAUTHORIZED,
        'The access token has expired.',
        'Request a fresh access token from your OIDC provider, then retry the request.',
      );
    }

    if (error instanceof errors.JWTClaimValidationFailed) {
      if (error.claim === 'iss') {
        return new AuthError(
          HttpStatus.UNAUTHORIZED,
          'The access token issuer does not match the configured issuer.',
          'Check config.auth.issuer_url and ensure the token was issued by that provider.',
        );
      }

      if (error.claim === 'aud') {
        return new AuthError(
          HttpStatus.UNAUTHORIZED,
          'The access token audience does not match the configured audience.',
          'Check config.auth.audience and request a token intended for this Fetchlane deployment.',
        );
      }
    }

    if (
      error instanceof errors.JWSSignatureVerificationFailed ||
      error instanceof errors.JOSEError
    ) {
      return new AuthError(
        HttpStatus.UNAUTHORIZED,
        'The access token could not be verified.',
        'Use a valid JWT signed by the configured OIDC provider, and verify that the issuer and JWKS settings match.',
        error.message,
      );
    }

    return new AuthError(
      HttpStatus.UNAUTHORIZED,
      'The access token is invalid.',
      'Use a valid JWT issued by your configured OIDC provider and send it as a bearer token.',
      error instanceof Error ? error.message : String(error),
    );
  }
}
