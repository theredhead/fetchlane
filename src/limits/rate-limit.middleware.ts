import { Injectable, NestMiddleware, OnModuleDestroy } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RuntimeConfigService } from '../config/runtime-config';
import { createApiErrorBody } from '../errors/api-error';
import { getAuthenticatedPrincipal } from '../authentication/request-context';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * Applies config-driven in-memory HTTP rate limiting.
 *
 * Emits standard `X-RateLimit-*` response headers on every request and
 * periodically prunes expired buckets to prevent unbounded memory growth.
 * The `/api/status` endpoint is rate-limited separately with a more relaxed
 * ceiling configured via `statusRateLimitMax`.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly cleanupIntervalHandle: ReturnType<typeof setInterval>;

  /**
   * Creates the rate-limit middleware and starts the bucket cleanup timer.
   */
  public constructor(private readonly runtimeConfig: RuntimeConfigService) {
    const windowMs = this.runtimeConfig.getLimits().rateLimitWindowMs;
    this.cleanupIntervalHandle = setInterval(
      () => this.pruneExpiredBuckets(),
      windowMs,
    );
    this.cleanupIntervalHandle.unref();
  }

  /**
   * Clears the bucket cleanup timer when the module is destroyed.
   */
  public onModuleDestroy(): void {
    clearInterval(this.cleanupIntervalHandle);
  }

  /**
   * Tracks request counts, emits rate-limit headers, and rejects callers that
   * exceed the configured limit.
   */
  public use(request: Request, response: Response, next: NextFunction): void {
    const limits = this.runtimeConfig.getLimits();
    const now = Date.now();
    const isStatusPath = this.isStatusRequest(request);
    const effectiveLimit = isStatusPath
      ? limits.statusRateLimitMax
      : limits.rateLimitMax;
    const key = this.buildRateLimitKey(request, isStatusPath);
    let bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 1, resetAt: now + limits.rateLimitWindowMs };
      this.buckets.set(key, bucket);
      this.setRateLimitHeaders(response, effectiveLimit, bucket);
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count <= effectiveLimit) {
      this.setRateLimitHeaders(response, effectiveLimit, bucket);
      next();
      return;
    }

    this.setRateLimitHeaders(response, effectiveLimit, bucket);
    response.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      ...createApiErrorBody(
        'The request rate limit has been exceeded.',
        `Reduce request frequency or increase limits.rateLimitMax / limits.rateLimitWindowMs in the runtime config. Current limit: ${effectiveLimit} requests per ${limits.rateLimitWindowMs}ms.`,
      ),
      path: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Sets the standard `X-RateLimit-*` response headers.
   */
  private setRateLimitHeaders(
    response: Response,
    limit: number,
    bucket: RateLimitBucket,
  ): void {
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, limit - bucket.count),
    );
    response.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));
  }

  /**
   * Returns `true` when the request targets the status endpoint.
   */
  private isStatusRequest(request: Request): boolean {
    const path = request.originalUrl || request.url;
    return path === '/api/status' || path.startsWith('/api/status?');
  }

  /**
   * Builds the rate-limit bucket key from the authenticated subject or client IP.
   *
   * Status requests are keyed separately so their relaxed ceiling does not
   * share a bucket with normal data-access requests.
   */
  private buildRateLimitKey(request: Request, isStatusPath: boolean): string {
    const principal = getAuthenticatedPrincipal(request);
    const identity = principal?.subject
      ? `subject:${principal.subject}`
      : `ip:${request.ip || request.socket.remoteAddress || 'unknown'}`;

    return isStatusPath ? `status:${identity}` : identity;
  }

  /**
   * Removes all buckets whose window has expired.
   */
  private pruneExpiredBuckets(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
