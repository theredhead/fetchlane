import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getRequestId } from '../authentication/request-context';
import { LoggerService } from '../service/logger.service';

@Injectable()
/**
 * Logs incoming HTTP requests for the public controllers.
 */
export class RequestLoggerMiddleware implements NestMiddleware {
  /**
   * Creates the middleware with the shared logger service.
   */
  public constructor(private readonly logger: LoggerService) {}

  /**
   * Logs the incoming request line with its unique request identifier.
   */
  public use(req: Request, res: Response, next: NextFunction): void {
    const requestId = getRequestId(req);
    this.logger.log(`[${requestId}] [${req.ip}] ${req.method} ${req.url}`);
    next();
  }
}
