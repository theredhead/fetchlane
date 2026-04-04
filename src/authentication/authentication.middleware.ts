import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { createApiErrorBody } from '../errors/api-error';
import { OidcAuthenticationService } from './oidc-authentication.service';
import { setAuthenticatedPrincipal } from './request-context';

/**
 * Applies optional bearer authentication to protected Fetchlane routes.
 */
@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  /**
   * Creates the authentication middleware.
   */
  public constructor(
    private readonly authenticationService: OidcAuthenticationService,
  ) {}

  /**
   * Authenticates protected requests and attaches the verified principal.
   */
  public async use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    if (
      !this.authenticationService.isEnabled() ||
      !this.requiresAuthentication(request)
    ) {
      next();
      return;
    }

    try {
      const principal =
        await this.authenticationService.authenticateAuthorizationHeader(
          request.header('authorization'),
        );
      setAuthenticatedPrincipal(request, principal);
      next();
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error && 'hint' in error) {
        const authError = error as Error & {
          statusCode: number;
          hint: string;
          details?: string;
        };

        response.status(authError.statusCode).json({
          statusCode: authError.statusCode,
          error:
            authError.statusCode === 401
              ? 'Unauthorized'
              : authError.statusCode === 403
                ? 'Forbidden'
                : 'Service Unavailable',
          ...createApiErrorBody(
            authError.message,
            authError.hint,
            authError.details,
          ),
          path: request.originalUrl || request.url,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next(error);
    }
  }

  private requiresAuthentication(request: Request): boolean {
    if (request.method === 'OPTIONS') {
      return false;
    }

    const path = request.originalUrl || request.url;
    return path.startsWith('/api/data-access') || path.startsWith('/api/docs');
  }
}
