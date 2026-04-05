import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticationError } from '../authentication/oidc-authentication.service';
import { getRequestId } from '../authentication/request-context';
import {
  ApiErrorBody,
  createApiErrorBody,
  defaultHintForStatus,
} from '../errors/api-error';

interface NormalizedApiError extends ApiErrorBody {
  statusCode: number;
  error: string;
}

/**
 * Converts thrown exceptions into a consistent HTTP error payload with hints.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  /**
   * Normalizes known exceptions and writes the final JSON response.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const error = this.normalizeException(exception);

    if (error.statusCode >= 500) {
      const details = error.details ? ` (${error.details})` : '';
      this.logger.error(
        `${request.method} ${request.url} -> ${error.statusCode} ${error.error}: ${error.message}${details}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(error.statusCode).json({
      statusCode: error.statusCode,
      error: error.error,
      message: error.message,
      hint: error.hint,
      ...(error.details ? { details: error.details } : {}),
      requestId: getRequestId(request),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalizeException(exception: unknown): NormalizedApiError {
    if (exception instanceof HttpException) {
      return this.normalizeHttpException(exception);
    }

    if (exception instanceof AuthenticationError) {
      return this.normalizeAuthenticationError(exception);
    }

    return this.translateUnknownException(exception);
  }

  private normalizeAuthenticationError(
    exception: AuthenticationError,
  ): NormalizedApiError {
    const statusCode = exception.statusCode;
    const errorName = HttpStatus[statusCode] ?? 'Error';

    return {
      statusCode,
      error: errorName,
      message: exception.message,
      hint: exception.hint,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }

  private normalizeHttpException(exception: HttpException): NormalizedApiError {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const errorName = HttpStatus[statusCode] ?? 'Error';

    if (typeof response === 'string') {
      return {
        statusCode,
        error: errorName,
        ...createApiErrorBody(response, defaultHintForStatus(statusCode)),
      };
    }

    const body = (response ?? {}) as Record<string, unknown>;
    const rawMessage = body.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : exception.message;
    const hint =
      typeof body.hint === 'string' && body.hint.trim()
        ? body.hint
        : defaultHintForStatus(statusCode);
    const details =
      typeof body.details === 'string' && body.details.trim()
        ? body.details
        : undefined;

    return {
      statusCode,
      error:
        typeof body.error === 'string' && body.error.trim()
          ? body.error
          : errorName,
      message,
      hint,
      ...(details ? { details } : {}),
    };
  }

  private translateUnknownException(exception: unknown): NormalizedApiError {
    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    const code = this.readErrorCode(error);
    const details = error.message || undefined;

    if (this.isMissingDriverError(error)) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: HttpStatus[HttpStatus.SERVICE_UNAVAILABLE],
        ...createApiErrorBody(
          'The configured database driver is not available.',
          'Install the optional driver that matches the configured database URL engine, then restart the service.',
          details,
        ),
      };
    }

    if (this.isConnectivityError(code, error.message)) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: HttpStatus[HttpStatus.SERVICE_UNAVAILABLE],
        ...createApiErrorBody(
          'The service could not connect to the configured database.',
          'Verify the configured database URL, credentials, host, port, and that the database server is running.',
          details,
        ),
      };
    }

    if (this.isConstraintConflict(code)) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: HttpStatus[HttpStatus.CONFLICT],
        ...createApiErrorBody(
          'The database rejected the write because it violates a constraint.',
          'Check unique keys, foreign keys, and required column values before retrying the request.',
          details,
        ),
      };
    }

    if (this.isQueryError(code)) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: HttpStatus[HttpStatus.BAD_REQUEST],
        ...createApiErrorBody(
          'The database rejected the request.',
          'Verify the table name, column names, and generated SQL for the active engine.',
          details,
        ),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR],
      ...createApiErrorBody(
        'An unexpected server error occurred.',
        'Check the server logs for the stack trace and reproduce the request with the same input.',
        details,
      ),
    };
  }

  private readErrorCode(error: Error): string | number | undefined {
    const candidate = error as Error & {
      code?: string | number;
      errno?: string | number;
      number?: string | number;
      originalError?: { info?: { number?: string | number } };
    };

    return (
      candidate.code ??
      candidate.errno ??
      candidate.number ??
      candidate.originalError?.info?.number
    );
  }

  private isMissingDriverError(error: Error): boolean {
    return /optional dependency|Failed to load the .* driver|Install it with `npm install/i.test(
      error.message,
    );
  }

  private isConnectivityError(
    code: string | number | undefined,
    message: string,
  ): boolean {
    const normalizedCode = String(code ?? '').toUpperCase();
    return (
      ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ESOCKET', 'ELOGIN'].includes(
        normalizedCode,
      ) || /connect|connection|timeout|econnrefused|login failed/i.test(message)
    );
  }

  private isConstraintConflict(code: string | number | undefined): boolean {
    const normalizedCode = String(code ?? '').toUpperCase();
    return [
      '23505',
      '23503',
      '1062',
      '1451',
      '1452',
      '2627',
      '2601',
      '547',
    ].includes(normalizedCode);
  }

  private isQueryError(code: string | number | undefined): boolean {
    const normalizedCode = String(code ?? '').toUpperCase();
    return [
      '42601',
      '42P01',
      '42703',
      '1064',
      '1146',
      '1054',
      '102',
      '207',
      '208',
    ].includes(normalizedCode);
  }
}
