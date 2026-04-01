import { AppModule } from './app.module';
import { DataAccessController } from './controllers/data-access.controller';
import { GeocodeController } from './controllers/geocode.controller';
import { StatusController } from './controllers/status.controller';
import { StreetsController } from './controllers/streets.controller';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';

describe('AppModule', () => {
  it('applies the request logger middleware to the public controllers', () => {
    const apply = vi.fn().mockReturnThis();
    const forRoutes = vi.fn();
    const consumer = { apply, forRoutes };

    new AppModule().configure(consumer as any);

    expect(apply).toHaveBeenCalledWith(RequestLoggerMiddleware);
    expect(forRoutes).toHaveBeenCalledWith(
      DataAccessController,
      GeocodeController,
      StatusController,
      StreetsController,
    );
  });
});
