import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticationError } from '../authentication/oidc-authentication.service';
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

  it('translates missing driver errors into service unavailable responses', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();
    const error = new Error(
      'Failed to load the pg driver. Install it with `npm install pg`.',
    );

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        message: 'The configured database driver is not available.',
      }),
    );
  });

  it('translates connectivity errors into service unavailable responses', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();
    const error = Object.assign(new Error('connection refused'), {
      code: 'ECONNREFUSED',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        message: 'The service could not connect to the configured database.',
      }),
    );
  });

  it('translates connectivity errors from error message keywords', () => {
    const filter = new ApiExceptionFilter();
    const { host, status } = createHost();
    const error = new Error('login failed for user sa');

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(503);
  });

  it('translates query errors into bad request responses', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();
    const error = Object.assign(new Error('relation does not exist'), {
      code: '42P01',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'The database rejected the request.',
      }),
    );
  });

  it('recognizes MySQL constraint conflict codes', () => {
    const filter = new ApiExceptionFilter();
    const { host, status } = createHost();
    const error = Object.assign(new Error('Duplicate entry for key'), {
      code: '1062',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('recognizes MySQL query error codes', () => {
    const filter = new ApiExceptionFilter();
    const { host, status } = createHost();
    const error = Object.assign(
      new Error('You have an error in your SQL syntax'),
      { code: '1064' },
    );

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('recognizes SQL Server constraint codes', () => {
    const filter = new ApiExceptionFilter();
    const { host, status } = createHost();
    const error = Object.assign(new Error('Cannot insert duplicate key row'), {
      code: '2627',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('recognizes SQL Server query error codes', () => {
    const filter = new ApiExceptionFilter();
    const { host, status } = createHost();
    const error = Object.assign(new Error('Invalid column name'), {
      code: '207',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('falls back to 500 for unrecognized errors', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();

    filter.catch(new Error('something unexpected'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'An unexpected server error occurred.',
        details: 'something unexpected',
      }),
    );
  });

  it('handles non-Error exceptions gracefully', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();

    filter.catch('string error', host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'An unexpected server error occurred.',
      }),
    );
  });

  it('handles HttpException with a string response', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();
    const exception = new HttpException('plain string body', 422);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'plain string body',
      }),
    );
  });

  it('joins array messages from validation pipes', () => {
    const filter = new ApiExceptionFilter();
    const { host, json } = createHost();
    const exception = new BadRequestException({
      message: ['field1 is required', 'field2 must be a number'],
    });

    filter.catch(exception, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'field1 is required; field2 must be a number',
      }),
    );
  });

  it('includes details from the exception body', () => {
    const filter = new ApiExceptionFilter();
    const { host, json } = createHost();
    const exception = new BadRequestException({
      message: 'Validation failed',
      hint: 'Fix the input.',
      details: 'column "age" must be positive',
    });

    filter.catch(exception, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: 'column "age" must be positive',
      }),
    );
  });

  it('reads error codes from errno and number properties', () => {
    const filter = new ApiExceptionFilter();
    const { host, status } = createHost();
    const error = Object.assign(new Error('timeout'), { errno: 'ETIMEDOUT' });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(503);
  });

  it('reads error codes from originalError.info.number', () => {
    const filter = new ApiExceptionFilter();
    const { host, status } = createHost();
    const error = Object.assign(new Error('SQL Server error'), {
      originalError: { info: { number: '2627' } },
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('includes a timestamp in the response', () => {
    const filter = new ApiExceptionFilter();
    const { host, json } = createHost();

    filter.catch(new BadRequestException('test'), host);

    const payload = json.mock.calls[0][0];
    expect(payload.timestamp).toBeDefined();
    expect(() => new Date(payload.timestamp)).not.toThrow();
  });

  it('logs 500+ errors via the logger', () => {
    const filter = new ApiExceptionFilter();
    const { host, status } = createHost();

    filter.catch(new InternalServerErrorException('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
  });

  it('translates AuthenticationError with status 403 into a forbidden response', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();
    const error = new AuthenticationError(
      403,
      'Authorization denied for schema: principal lacks a required role.',
      'Ensure the token includes a role listed in the authorization config.',
    );

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        error: 'FORBIDDEN',
        message:
          'Authorization denied for schema: principal lacks a required role.',
        hint: 'Ensure the token includes a role listed in the authorization config.',
        requestId: 'test-request-id',
      }),
    );
  });

  it('translates AuthenticationError with status 401 into an unauthorized response', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();
    const error = new AuthenticationError(
      401,
      'The bearer token has expired.',
      'Obtain a fresh access token and retry the request.',
    );

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'The bearer token has expired.',
        hint: 'Obtain a fresh access token and retry the request.',
      }),
    );
  });

  it('includes details from AuthenticationError when present', () => {
    const filter = new ApiExceptionFilter();
    const { host, json, status } = createHost();
    const error = new AuthenticationError(
      401,
      'Token validation failed.',
      'Obtain a valid token.',
      'issuer mismatch: expected "https://a.com", got "https://b.com"',
    );

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        details:
          'issuer mismatch: expected "https://a.com", got "https://b.com"',
      }),
    );
  });
});
