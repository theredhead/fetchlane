import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LoggerService {
  logger: Logger = new Logger(this.constructor.name);

  log(message: string) {
    this.logger.log(message);
  }
}
