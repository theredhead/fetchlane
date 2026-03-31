import { Test, TestingModule } from '@nestjs/testing';
import { StatusController } from './status.controller';
import { LoggerService } from '../service/logger.service';

describe('StatusController', () => {
  let controller: StatusController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatusController],
      providers: [
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(StatusController);
  });

  it('returns the running status payload', () => {
    expect(controller.index()).toEqual({
      status: 'Running',
    });
  });
});
