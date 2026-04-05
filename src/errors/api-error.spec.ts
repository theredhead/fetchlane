import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  badRequest,
  conflict,
  createApiErrorBody,
  defaultHintForStatus,
  formatDeveloperError,
  internalServerError,
  notFound,
  notImplemented,
  serviceUnavailable,
} from './api-error';

describe('api-error', () => {
  describe('formatDeveloperError', () => {
    it('formats a message with a hint', () => {
      const result = formatDeveloperError('Something broke.', 'Fix it.');
      expect(result).toBe('Something broke. Hint: Fix it.');
    });

    it('appends details when provided', () => {
      const result = formatDeveloperError(
        'Something broke.',
        'Fix it.',
        'stack trace here',
      );
      expect(result).toBe(
        'Something broke. Hint: Fix it. Details: stack trace here',
      );
    });

    it('omits the details segment when details is undefined', () => {
      const result = formatDeveloperError('Error occurred.', 'Check logs.');
      expect(result).not.toContain('Details:');
    });

    it('omits the details segment when details is an empty string', () => {
      const result = formatDeveloperError('Error occurred.', 'Check logs.', '');
      expect(result).not.toContain('Details:');
    });
  });

  describe('createApiErrorBody', () => {
    it('returns message and hint without details', () => {
      const body = createApiErrorBody('Bad input.', 'Check your request.');
      expect(body).toEqual({
        message: 'Bad input.',
        hint: 'Check your request.',
      });
      expect(body).not.toHaveProperty('details');
    });

    it('includes details when provided', () => {
      const body = createApiErrorBody(
        'Bad input.',
        'Check your request.',
        'column "foo" not found',
      );
      expect(body).toEqual({
        message: 'Bad input.',
        hint: 'Check your request.',
        details: 'column "foo" not found',
      });
    });
  });

  describe('badRequest', () => {
    it('returns a BadRequestException', () => {
      const error = badRequest('Invalid payload.', 'Fix the JSON.');
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('embeds the error body in the response', () => {
      const error = badRequest('Invalid payload.', 'Fix the JSON.');
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.message).toBe('Invalid payload.');
      expect(response.hint).toBe('Fix the JSON.');
    });

    it('includes details when provided', () => {
      const error = badRequest(
        'Invalid payload.',
        'Fix the JSON.',
        'unexpected token at position 12',
      );
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.details).toBe('unexpected token at position 12');
    });
  });

  describe('notFound', () => {
    it('returns a NotFoundException', () => {
      const error = notFound('Record missing.', 'Check the ID.');
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('embeds the error body in the response', () => {
      const error = notFound('Record missing.', 'Check the ID.', 'id=99');
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.message).toBe('Record missing.');
      expect(response.hint).toBe('Check the ID.');
      expect(response.details).toBe('id=99');
    });
  });

  describe('conflict', () => {
    it('returns a ConflictException', () => {
      const error = conflict('Duplicate key.', 'Use a unique value.');
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('includes details when provided', () => {
      const error = conflict(
        'Duplicate key.',
        'Use a unique value.',
        'unique_violation on email',
      );
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.details).toBe('unique_violation on email');
    });
  });

  describe('notImplemented', () => {
    it('returns a NotImplementedException', () => {
      const error = notImplemented('Not supported.', 'Use another engine.');
      expect(error).toBeInstanceOf(NotImplementedException);
      expect(error.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
    });

    it('embeds the error body in the response', () => {
      const error = notImplemented('Not supported.', 'Use another engine.');
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.message).toBe('Not supported.');
      expect(response.hint).toBe('Use another engine.');
    });
  });

  describe('serviceUnavailable', () => {
    it('returns a ServiceUnavailableException', () => {
      const error = serviceUnavailable('DB down.', 'Check the connection.');
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('includes details when provided', () => {
      const error = serviceUnavailable(
        'DB down.',
        'Check the connection.',
        'ECONNREFUSED',
      );
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.details).toBe('ECONNREFUSED');
    });
  });

  describe('internalServerError', () => {
    it('returns an InternalServerErrorException', () => {
      const error = internalServerError('Unexpected.', 'Check logs.');
      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('includes details when provided', () => {
      const error = internalServerError(
        'Unexpected.',
        'Check logs.',
        'null pointer',
      );
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.details).toBe('null pointer');
    });
  });

  describe('defaultHintForStatus', () => {
    it('returns a hint for BAD_REQUEST', () => {
      expect(defaultHintForStatus(HttpStatus.BAD_REQUEST)).toContain(
        'request shape',
      );
    });

    it('returns a hint for NOT_FOUND', () => {
      expect(defaultHintForStatus(HttpStatus.NOT_FOUND)).toContain('exists');
    });

    it('returns a hint for CONFLICT', () => {
      expect(defaultHintForStatus(HttpStatus.CONFLICT)).toContain('duplicate');
    });

    it('returns a hint for NOT_IMPLEMENTED', () => {
      expect(defaultHintForStatus(HttpStatus.NOT_IMPLEMENTED)).toContain(
        'database engine',
      );
    });

    it('returns a hint for SERVICE_UNAVAILABLE', () => {
      expect(defaultHintForStatus(HttpStatus.SERVICE_UNAVAILABLE)).toContain(
        'database driver',
      );
    });

    it('returns a generic fallback hint for unrecognized status codes', () => {
      expect(defaultHintForStatus(418)).toContain('server logs');
    });
  });
});
