import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RuntimeConfigService } from '../config/runtime-config';
import { createApiErrorBody } from '../errors/api-error';
import { getAuthenticatedPrincipal } from '../auth/request-context';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * Applies config-driven in-memory HTTP rate limiting.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, RateLimitBucket>();

  /**
   * Creates the rate-limit middleware from runtime config.
   */
  public constructor(
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

  /**
   * Tracks request counts and rejects callers that exceed the configured limit.
   */
  public use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const limits = this.runtimeConfig.getLimits();
    const now = Date.now();
    const key = this.buildRateLimitKey(request);
    const currentBucket = this.buckets.get(key);

    if (!currentBucket || currentBucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + limits.rate_limit_window_ms,
      });
      next();
      return;
    }

    currentBucket.count += 1;
    if (currentBucket.count <= limits.rate_limit_max) {
      next();
      return;
    }

    response.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      ...createApiErrorBody(
        'The request rate limit has been exceeded.',
        `Reduce request frequency or increase limits.rate_limit_max / limits.rate_limit_window_ms in the runtime config. Current limit: ${limits.rate_limit_max} requests per ${limits.rate_limit_window_ms}ms.`,
      ),
      path: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private buildRateLimitKey(request: Request): string {
    const principal = getAuthenticatedPrincipal(request);
    if (principal?.subject) {
      return `subject:${principal.subject}`;
    }

    return `ip:${request.ip || request.socket.remoteAddress || 'unknown'}`;
  }
}
