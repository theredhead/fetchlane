import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  it('delegates log calls to the Nest logger instance', () => {
    const service = new LoggerService();
    service.logger = {
      log: vi.fn(),
    } as any;

    service.log('hello');

    expect(service.logger.log).toHaveBeenCalledWith('hello');
  });
});
