import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { LoggerService } from '../service/logger.service';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    this.logger.log(`[${req.ip}] ${req.method} ${req.url}`);
    if (req.method.toUpperCase() == 'POST') {
      this.logger.log(req.body);
    }
    next();
  }
  constructor(private logger: LoggerService) {}
}
