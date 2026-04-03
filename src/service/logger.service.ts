import { Injectable, Logger } from '@nestjs/common';

@Injectable()
/**
 * Small wrapper around Nest's logger so it can be injected consistently.
 */
export class LoggerService {
  /**
   * Backing Nest logger instance used by the service.
   */
  public logger: Logger = new Logger(this.constructor.name);

  /**
   * Writes a log message through the Nest logger.
   */
  public log(message: string): void {
    this.logger.log(message);
  }
}
