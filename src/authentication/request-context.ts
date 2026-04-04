import { randomUUID } from 'crypto';
import { Request } from 'express';
import { JWTPayload } from 'jose';

/**
 * Authenticated caller information attached to the current request.
 */
export interface AuthenticatedPrincipal {
  /**
   * Stable subject identifier extracted from the configured subject claim.
   */
  subject: string;
  /**
   * Roles extracted from the configured roles claim, if present.
   */
  roles: string[];
  /**
   * Raw verified JWT claims for advanced downstream authorization logic.
   */
  claims: JWTPayload;
}

/**
 * Internal request context used to carry authentication state.
 */
export interface FetchlaneRequestContext {
  /**
   * Unique identifier for the current request, used for tracing and audit logging.
   */
  requestId: string;
  /**
   * Authenticated principal for the current request, or `null` when absent.
   */
  principal: AuthenticatedPrincipal | null;
}

/**
 * Express request shape extended with Fetchlane request context.
 */
export interface FetchlaneRequest extends Request {
  /**
   * Per-request auth context populated by Fetchlane middleware.
   */
  fetchlaneContext?: FetchlaneRequestContext;
}

/**
 * Returns the current request context, creating an empty one when needed.
 */
export function getRequestContext(request: Request): FetchlaneRequestContext {
  const target = request as FetchlaneRequest;
  if (!target.fetchlaneContext) {
    target.fetchlaneContext = {
      requestId: randomUUID(),
      principal: null,
    };
  }

  return target.fetchlaneContext;
}

/**
 * Returns the unique request identifier for the current request.
 */
export function getRequestId(request: Request): string {
  return getRequestContext(request).requestId;
}

/**
 * Stores the authenticated principal on the current request.
 */
export function setAuthenticatedPrincipal(
  request: Request,
  principal: AuthenticatedPrincipal,
): void {
  getRequestContext(request).principal = principal;
}

/**
 * Reads the authenticated principal from the current request, if any.
 */
export function getAuthenticatedPrincipal(
  request: Request,
): AuthenticatedPrincipal | null {
  return getRequestContext(request).principal;
}
