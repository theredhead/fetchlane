import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

function createHost(url = '/api/data-access/member'): {
  host: ArgumentsHost;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        url,
        fetchlaneContext: { requestId: 'test-request-id', principal: null },
      }),
      getResponse: () => ({ status }),
    }),
  } as ArgumentsHost;

  return { host, json, status };
}

describe('ApiExceptionFilter', () => {
  it('preserves explicit hints from HTTP exceptions', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();

    filter.catch(
      new NotFoundException({
        message: 'Record 7 was not found.',
        hint: 'Use a valid record id.',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Record 7 was not found.',
        hint: 'Use a valid record id.',
        requestId: 'test-request-id',
        path: '/api/data-access/member',
      }),
    );
  });

  it('adds a fallback hint when an HTTP exception does not provide one', () => {
    const filter = new ApiExceptionFilter();
    const { host, json } = createHost('/api/data-access/member/record/abc');

    filter.catch(new BadRequestException('Validation failed'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        hint: 'Check the request shape, route parameters, and JSON payload for invalid or missing values.',
        requestId: 'test-request-id',
      }),
    );
  });

  it('translates raw database constraint errors into conflict responses', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost('/api/data-access/member');
    const error = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      {
        code: '23505',
      },
    );

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message:
          'The database rejected the write because it violates a constraint.',
        hint: 'Check unique keys, foreign keys, and required column values before retrying the request.',
        requestId: 'test-request-id',
      }),
    );
  });
});
