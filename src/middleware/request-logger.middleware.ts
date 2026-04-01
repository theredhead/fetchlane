import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { LoggerService } from '../service/logger.service';

@Injectable()
/**
 * Logs incoming HTTP requests for the public controllers.
 */
export class RequestLoggerMiddleware implements NestMiddleware {
  /**
   * Logs the incoming request line and, for POST requests, the request body.
   */
  public use(req: Request, res: Response, next: NextFunction): void {
    this.logger.log(`[${req.ip}] ${req.method} ${req.url}`);
    if (req.method.toUpperCase() == 'POST') {
      this.logger.log(req.body);
    }
    next();
  }

  /** Creates the middleware with the shared logger service. */
  public constructor(private readonly logger: LoggerService) {}
}
