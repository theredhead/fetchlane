import { HttpStatus, Injectable } from '@nestjs/common';
import { JWTPayload, createRemoteJWKSet, errors, jwtVerify } from 'jose';
import {
  RuntimeAuthenticationConfig,
  RuntimeConfigService,
} from '../config/runtime-config';
import { AuthenticatedPrincipal } from './request-context';

interface OidcDiscoveryDocument {
  issuer?: string;
  jwks_uri?: string;
}

/**
 * Structured authentication error used by middleware to return hint-rich responses.
 */
export class AuthenticationError extends Error {
  /**
   * HTTP status code returned to the caller.
   */
  public readonly statusCode: number;
  /**
   * Developer-facing hint explaining how to fix the authentication problem.
   */
  public readonly hint: string;
  /**
   * Optional low-level detail for logs or diagnostics.
   */
  public readonly details?: string;

  /**
   * Creates a structured authentication error.
   */
  public constructor(
    statusCode: number,
    message: string,
    hint: string,
    details?: string,
  ) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
    this.hint = hint;
    this.details = details;
  }
}

/**
 * Validates OIDC-compatible bearer JWTs and maps them into Fetchlane principals.
 */
@Injectable()
export class OidcAuthenticationService {
  private jwksResolverPromise: Promise<
    ReturnType<typeof createRemoteJWKSet>
  > | null = null;

  /**
   * Creates the authentication service from runtime config.
   */
  public constructor(private readonly runtimeConfig: RuntimeConfigService) {}

  /**
   * Returns whether authentication is enabled for the current runtime.
   */
  public isEnabled(): boolean {
    return this.runtimeConfig.getAuthentication().enabled;
  }

  /**
   * Authenticates the provided bearer authorization header.
   */
  public async authenticateAuthorizationHeader(
    authorizationHeader: string | undefined,
  ): Promise<AuthenticatedPrincipal> {
    const authenticationConfig = this.runtimeConfig.getAuthentication();
    const token = this.readBearerToken(authorizationHeader);
    const jwks = await this.getJwksResolver(authenticationConfig);

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: authenticationConfig.issuerUrl || undefined,
        audience: authenticationConfig.audience,
      });

      return this.mapPrincipal(payload, authenticationConfig);
    } catch (error) {
      throw this.translateJwtError(error);
    }
  }

  private readBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      throw new AuthenticationError(
        HttpStatus.UNAUTHORIZED,
        'Authentication is required for this route.',
        'Send an Authorization header in the form "Bearer <JWT>" issued by your configured OIDC provider.',
      );
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]?.trim()) {
      throw new AuthenticationError(
        HttpStatus.UNAUTHORIZED,
        'The Authorization header is not a valid bearer token.',
        'Use the form "Authorization: Bearer <JWT>" with a non-empty access token.',
      );
    }

    return match[1].trim();
  }

  private async getJwksResolver(
    authenticationConfig: RuntimeAuthenticationConfig,
  ): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (!this.jwksResolverPromise) {
      this.jwksResolverPromise = this.createJwksResolver(authenticationConfig);
    }

    return await this.jwksResolverPromise;
  }

  private async createJwksResolver(
    authenticationConfig: RuntimeAuthenticationConfig,
  ): Promise<ReturnType<typeof createRemoteJWKSet>> {
    const jwksUrl =
      authenticationConfig.jwksUrl ||
      (await this.discoverJwksUrl(authenticationConfig));

    try {
      return createRemoteJWKSet(new URL(jwksUrl));
    } catch (error) {
      throw new AuthenticationError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Fetchlane could not initialize JWT key validation.',
        'Set config.authentication.jwksUrl to a valid JWKS endpoint, or configure a valid issuerUrl for OIDC discovery.',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async discoverJwksUrl(
    authenticationConfig: RuntimeAuthenticationConfig,
  ): Promise<string> {
    const issuerUrl = authenticationConfig.issuerUrl.trim().replace(/\/+$/, '');
    if (!issuerUrl) {
      throw new AuthenticationError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Fetchlane authentication is enabled but no issuer metadata source is configured.',
        'Set config.authentication.issuerUrl for OIDC discovery, or configure config.authentication.jwksUrl directly.',
      );
    }

    const discoveryUrl = `${issuerUrl}/.well-known/openid-configuration`;
    let response: Response;

    try {
      response = await fetch(discoveryUrl);
    } catch (error) {
      throw new AuthenticationError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Fetchlane could not reach the configured OIDC issuer discovery endpoint.',
        'Verify config.authentication.issuerUrl, network reachability, and TLS settings for your identity provider.',
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!response.ok) {
      throw new AuthenticationError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Fetchlane could not load the OIDC discovery document.',
        'Verify that config.authentication.issuerUrl points to a valid OIDC issuer and that the discovery endpoint is reachable.',
        `Discovery endpoint returned HTTP ${response.status}.`,
      );
    }

    const discoveryDocument = (await response.json()) as OidcDiscoveryDocument;
    if (!discoveryDocument.jwks_uri) {
      throw new AuthenticationError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'The OIDC discovery document does not expose a JWKS endpoint.',
        'Use an issuer that publishes jwks_uri, or configure config.authentication.jwksUrl explicitly.',
      );
    }

    return discoveryDocument.jwks_uri;
  }

  private mapPrincipal(
    payload: JWTPayload,
    authenticationConfig: RuntimeAuthenticationConfig,
  ): AuthenticatedPrincipal {
    const subject = this.readStringClaim(
      payload,
      authenticationConfig.claimMappings.subject,
      'subject',
    );
    const roles = this.readStringArrayClaim(
      payload,
      authenticationConfig.claimMappings.roles,
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

    throw new AuthenticationError(
      HttpStatus.UNAUTHORIZED,
      `The validated access token is missing the configured ${claimLabel} claim.`,
      `Set config.authentication.claimMappings.${claimLabel} to a claim path that resolves to a non-empty string in your provider's JWT.`,
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

    throw new AuthenticationError(
      HttpStatus.UNAUTHORIZED,
      'The validated access token does not expose roles in the configured claim path.',
      'Set config.authentication.claimMappings.roles to a claim path that resolves to an array of strings, or remove role-based assumptions for this provider.',
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

  private translateJwtError(error: unknown): AuthenticationError {
    if (error instanceof AuthenticationError) {
      return error;
    }

    if (error instanceof errors.JWTExpired) {
      return new AuthenticationError(
        HttpStatus.UNAUTHORIZED,
        'The access token has expired.',
        'Request a fresh access token from your OIDC provider, then retry the request.',
      );
    }

    if (error instanceof errors.JWTClaimValidationFailed) {
      if (error.claim === 'iss') {
        return new AuthenticationError(
          HttpStatus.UNAUTHORIZED,
          'The access token issuer does not match the configured issuer.',
          'Check config.authentication.issuerUrl and ensure the token was issued by that provider.',
        );
      }

      if (error.claim === 'aud') {
        return new AuthenticationError(
          HttpStatus.UNAUTHORIZED,
          'The access token audience does not match the configured audience.',
          'Check config.authentication.audience and request a token intended for this Fetchlane deployment.',
        );
      }
    }

    if (
      error instanceof errors.JWSSignatureVerificationFailed ||
      error instanceof errors.JOSEError
    ) {
      return new AuthenticationError(
        HttpStatus.UNAUTHORIZED,
        'The access token could not be verified.',
        'Use a valid JWT signed by the configured OIDC provider, and verify that the issuer and JWKS settings match.',
        error.message,
      );
    }

    return new AuthenticationError(
      HttpStatus.UNAUTHORIZED,
      'The access token is invalid.',
      'Use a valid JWT issued by your configured OIDC provider and send it as a bearer token.',
      error instanceof Error ? error.message : String(error),
    );
  }
}
